import assert from 'node:assert/strict';
export async function runAuthBrowserChecks(chromium, baseUrl, launchOptions = {}) {
const browser = await chromium.launch({ ...launchOptions, headless: true });
try {
  const actual = await browser.newPage();
  await actual.goto(baseUrl);
  await actual.waitForFunction(() => document.querySelector('#status').textContent === 'ログインしていません', null, { timeout: 30000 });
  assert.equal(await actual.locator('#email-login').isEnabled(), true);
  assert.equal(await actual.locator('#google-login').isEnabled(), true);
  console.log('Actual Firebase SDK initialization: passed (no sign-in attempted).');
  await actual.close();

  const context = await browser.newContext();
  const appMock = 'export function initializeApp(config,name){return {name};}';
  const authMock = `
    let listeners=[];
    let saved=localStorage.getItem('synthetic-auth-session');
    const auth={currentUser:saved ? user(saved) : null};
    function user(provider){return {providerData:[{providerId:provider}],getIdToken:async()=>'synthetic-auth-token'};}
    function emit(){for(const listener of listeners) listener(auth.currentUser);}
    export function getAuth(){return auth;}
    export const browserLocalPersistence={kind:'local'};
    export async function setPersistence(a,p){if(p.kind!=='local') throw Error('persistence required');}
    export function onAuthStateChanged(a,fn){listeners.push(fn);queueMicrotask(()=>fn(a.currentUser));}
    export async function signInWithEmailAndPassword(a,email,password){
      if(email!=='probe@example.invalid'||password!=='synthetic-password')throw {code:'auth/invalid-credential'};
      a.currentUser=user('password');localStorage.setItem('synthetic-auth-session','password');emit();
    }
    export class GoogleAuthProvider{setCustomParameters(){}}
    export async function signInWithPopup(a,p){a.currentUser=user('google.com');localStorage.setItem('synthetic-auth-session','google.com');emit();}
    export async function signOut(a){a.currentUser=null;localStorage.removeItem('synthetic-auth-session');emit();}
  `;
  await context.route('https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js',route=>route.fulfill({body:appMock,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}}));
  await context.route('https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js',route=>route.fulfill({body:authMock,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}}));
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForFunction(()=>document.querySelector('#email-login').disabled===false);
  await page.locator('#email').fill('probe@example.invalid');
  await page.locator('#password').fill('wrong-password');
  await page.locator('#email-login').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('確認してください'));
  assert.equal(await page.locator('#password').inputValue(),'');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#email-login').click();
  await page.waitForFunction(()=>!document.querySelector('#session-section').hidden);
  assert.equal(await page.locator('#password').inputValue(),'');
  const text=await page.locator('body').innerText();
  assert.ok(!text.includes('probe@example.invalid')&&!text.includes('synthetic-password')&&!text.includes('synthetic-auth-token'));
  await page.reload();
  await page.waitForFunction(()=>!document.querySelector('#session-section').hidden);
  await page.locator('#logout').click();
  await page.waitForFunction(()=>!document.querySelector('#login-section').hidden);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#status').textContent==='ログインしていません');
  await page.locator('#google-login').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Googleログインを確認'));
  assert.equal(await page.locator('#session-section').isVisible(),true);
  const exposed=await page.request.get(baseUrl + '/.env.local');
  assert.equal(exposed.status(),404);
  assert.equal((await page.request.post(baseUrl + '/config.json',{data:'test'})).status(),405);
  const denied=await page.request.get(baseUrl + '/config.json',{headers:{host:'untrusted.example:60171'}});
  assert.equal(denied.status(),403);
  console.log('Browser UI checks: invalid credentials, shared login, password clearing, restored session, logout, Google login, no secret display: passed with synthetic SDK.');
  console.log('Server checks: no env-file serving, POST denied, foreign Host denied: passed.');
  await context.close();
} finally {await browser.close();}
}
