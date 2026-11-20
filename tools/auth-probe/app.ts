import { createProbeClient } from '../../apps/web/lib/sheets-transport/client.ts';
const $ = (id: string) => document.getElementById(id) as HTMLElement & {value: string; disabled: boolean};
let auth;
let sdk;
let busy = false;
let lastState = null;
let lastEndpoint = '';

function note(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
function render() {
  const loggedIn = Boolean(auth?.currentUser);
  $('login-section').hidden = loggedIn;
  $('session-section').hidden = !loggedIn;
  $('probe-section').hidden = !loggedIn;
  for (const element of document.querySelectorAll('button,input,select')) (element as HTMLInputElement).disabled = !auth || busy;
  $('write').disabled = !loggedIn || busy || !lastState || lastEndpoint !== $('endpoint').value.trim();
}
function errorText(error) {
  const messages = {
    'auth/invalid-credential': 'メールアドレスとパスワードを確認してください。',
    'auth/invalid-login-credentials': 'メールアドレスとパスワードを確認してください。',
    'auth/invalid-email': 'メールアドレスを確認してください。',
    'auth/too-many-requests': '試行回数が多いため、しばらく待ってから再試行してください。',
    'auth/unauthorized-domain': 'Firebaseの承認済みドメインにlocalhostを追加してください。',
    'auth/popup-blocked': 'ブラウザーでポップアップを許可してください。',
    'auth/popup-closed-by-user': 'Googleログインをキャンセルしました。',
    'auth/network-request-failed': '認証サービスとの通信を確認してください。',
    'auth/user-disabled': 'このアカウントは利用できません。',
    'auth/operation-not-allowed': 'Firebaseのログイン方法の設定を確認してください。',
  };
  const code = typeof error?.code === 'string' && /^auth\/[a-z0-9-]+$/.test(error.code) ? error.code : '';
  const text = messages[code] || '処理を完了できませんでした。接続と設定を確認してください。';
  return code ? text + '（' + code + '）' : text;
}
async function run(operation) {
  if (busy) return;
  busy = true; render(); note('処理中…');
  try { await operation(); }
  catch (error) { note(errorText(error), true); }
  finally { $('password').value = ''; busy = false; render(); }
}
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!auth) return;
  const email = $('email').value.trim();
  const password = $('password').value;
  run(async () => { await sdk.signInWithEmailAndPassword(auth, email, password); note('共通アカウントのログインを確認しました。'); });
});
$('google-login').addEventListener('click', () => run(async () => {
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await sdk.signInWithPopup(auth, provider);
  note('Googleログインを確認しました。管理権限はバックエンドで別途確認します。');
}));
$('logout').addEventListener('click', () => run(async () => {
  await sdk.signOut(auth); $('email').value = ''; note('ログアウトしました。');
}));
$('reload').addEventListener('click', () => location.reload());
$('endpoint').addEventListener('input', () => { lastState = null; lastEndpoint = ''; render(); });
function client() {
  return createProbeClient({ endpoint: $('endpoint').value.trim(),
    getIdToken: () => { if (!auth.currentUser) throw Error('No active session'); return auth.currentUser.getIdToken(); } });
}
async function probe(operation) {
  await run(async () => {
    try { await operation(); note('通信の確認が完了しました。'); }
    catch (error) {
      lastState = null;
      $('probe-status').textContent = error.outcomeUnknown ?
        '保存できたか確認できません。再送せず、読み取りで状態を確認してください。' :
        (error.code === 'FORBIDDEN' ? 'このアカウントには操作の権限がありません。' : '通信または接続設定を確認してください。');
      note('通信の確認を完了できませんでした。', true);
    }
  });
}
$('read').addEventListener('click', () => probe(async () => {
  lastState = await client().read(); lastEndpoint = $('endpoint').value.trim();
  $('probe-status').textContent = '読取成功：更新番号 ' + lastState.revision;
}));
$('write').addEventListener('click', () => probe(async () => {
  if (!lastState) throw Error('Read first');
  const result = await client().write({ expectedRevision: lastState.revision, value: $('answer').value });
  lastState = result;
  $('probe-status').textContent = '保存完了：更新番号 ' + result.revision;
}));
$('admin').addEventListener('click', () => probe(async () => {
  await client().checkAdmin(); $('probe-status').textContent = '管理権限を確認しました。';
}));

try {
  const configResponse = await fetch('/config.json', { cache: 'no-store' });
  if (!configResponse.ok) throw Error('Config unavailable');
  const config = await configResponse.json();
  const [appSdk, authSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js' as string),
    import('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js' as string),
  ]);
  sdk = authSdk;
  const candidate = sdk.getAuth(appSdk.initializeApp(config, 'udm-auth-probe'));
  await sdk.setPersistence(candidate, sdk.browserLocalPersistence);
  auth = candidate;
  sdk.onAuthStateChanged(auth, user => {
    lastState = null; lastEndpoint = ''; $('probe-status').textContent = '未接続';
    $('status').textContent = user ? 'ログイン済み（認証状態を保持しています）' : 'ログインしていません';
    render();
  }, error => { note(errorText(error), true); });
} catch (error) { note('認証の準備に失敗しました。接続とローカル設定を確認してください。', true); }
