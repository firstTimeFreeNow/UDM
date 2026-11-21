import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';

const execute = promisify(execFile);
export const SOURCE = fileURLToPath(new URL('../../apps/apps-script/dist/', import.meta.url));
const CLASP = createRequire(import.meta.url).resolve('@google/clasp');
const REQUIRED = [
  'AnswerCache.gs',
  'AnswerData.gs',
  'AnswerDialog.html',
  'AnswerSave.gs',
  'BffSignature.gs',
  'Calendar.gs',
  'CandidateDialog.html',
  'Candidates.gs',
  'CompositionRoot.gs',
  'Config.gs',
  'DateTime.gs',
  'Diagnostics.gs',
  'Errors.gs',
  'Execution.gs',
  'FirebaseIdentity.gs',
  'History.gs',
  'HistoryService.gs',
  'LinkRules.gs',
  'LinkService.gs',
  'LoginInfo.gs',
  'LoginInfoDialog.html',
  'LoginInfoService.gs',
  'Members.gs',
  'NotificationRules.gs',
  'PushBroadcast.gs',
  'PushDevices.gs',
  'PushNotifications.gs',
  'PushSchedule.gs',
  'PushService.gs',
  'PushTransport.gs',
  'RequestDispatch.gs',
  'RequestHandler.gs',
  'Rollover.gs',
  'RolloverRules.gs',
  'RolloverService.gs',
  'ScheduleFacade.gs',
  'ScheduleRepository.gs',
  'ScheduleRules.gs',
  'ScheduleService.gs',
  'ScheduleState.gs',
  'SelectedSchedule.gs',
  'ServiceFacade.gs',
  'SetupService.gs',
  'SharedLinks.gs',
  'SheetMenu.gs',
  'Spreadsheet.gs',
  'WebApi.gs',
  'appsscript.json',
  'main.gs',
];

export async function inventory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile() || !/^(?:[A-Za-z][A-Za-z0-9_-]*\.(?:gs|html)|appsscript\.json)$/.test(entry.name))) {
    throw Error('Apps Scriptのsrcにはgs、html、appsscript.jsonだけを置いてください。');
  }
  return entries.map(entry => entry.name).sort();
}

export async function validateSource(directory = SOURCE) {
  const files = await inventory(directory);
  if (REQUIRED.some(file => !files.includes(file))) throw Error('Apps Scriptのソースが不足しています。');
  const manifest = JSON.parse(await readFile(join(directory, 'appsscript.json'), 'utf8'));
  if (manifest.runtimeVersion !== 'V8' || manifest.timeZone !== 'Asia/Tokyo') throw Error('マニフェストの実行環境が不正です。');
  if (manifest.webapp?.access !== 'ANYONE_ANONYMOUS' || manifest.webapp?.executeAs !== 'USER_DEPLOYING') {
    throw Error('Webアプリの公開設定が不足しています。webapp.access=ANYONE_ANONYMOUS、executeAs=USER_DEPLOYINGが必要です。');
  }
  for (const file of files) {
    const source = await readFile(join(directory, file), 'utf8');
    if (file.endsWith('.gs')) new Script(source, { filename: file });
    if (file.endsWith('.html')) {
      for (const [, script] of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        new Script(script.replace(/<\?[\s\S]*?\?>/g, 'null'), { filename: file });
      }
    }
  }
  const scripts = await Promise.all(files.filter(file => file.endsWith('.gs')).map(file => readFile(join(directory, file), 'utf8')));
  new Script(scripts.join('\n'), { filename: 'apps-script-bundle.gs' });
  const code = await readFile(join(directory, 'Config.gs'), 'utf8');
  if (!code.includes("getProperty('AF_SPREADSHEET_ID')")) throw Error('シートIDはスクリプトプロパティから取得してください。');
  return files;
}

export function deploymentConfig(env, mode) {
  if (!['push', 'deploy'].includes(mode)) throw Error('modeにはpushまたはdeployを指定してください。');
  const scriptId = env.AF_SCRIPT_ID || '';
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(scriptId)) throw Error('AF_SCRIPT_IDにApps ScriptのスクリプトIDを設定してください。');
  const deploymentId = env.AF_DEPLOYMENT_ID || '';
  if (mode === 'deploy' && !/^[A-Za-z0-9_-]{20,200}$/.test(deploymentId)) {
    throw Error('AF_DEPLOYMENT_IDに既存のデプロイIDを設定してください。');
  }
  let credentials;
  try { credentials = JSON.parse(env.CLASPRC_JSON); } catch { throw Error('CLASPRC_JSONにclaspの認証設定が必要です。'); }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) throw Error('CLASPRC_JSONが不正です。');
  const sha = env.GITHUB_SHA || 'local';
  if (!/^(?:[a-f0-9]{40,64}|local)$/.test(sha)) throw Error('コミットIDが不正です。');
  return { scriptId, deploymentId, credentials, description: `UDM afetiria ${sha}` };
}

async function runClasp(args) {
  const { stdout } = await execute(process.execPath, [CLASP, ...args], {
    timeout: 120000, maxBuffer: 2 * 1024 * 1024,
    // Do not pass the credentials secret or debug logging environment to clasp.
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !['CLASPRC_JSON', 'DEBUG', 'NODE_DEBUG'].includes(key))),
  });
  return stdout;
}

/** Reads remote inventory first. No untracked remote file is silently deleted. */
export async function deploy({ mode, env = process.env, source = SOURCE, run = runClasp }: { mode?: string; env?: Record<string, string>; source?: string; run?: typeof runClasp } = {}) {
  const files = await validateSource(source);
  const config = deploymentConfig(env, mode);
  const temporary = await mkdtemp(join(tmpdir(), 'udm-apps-script-'));
  let phase = 'preflight';
  let pushed = false;
  try {
    const auth = join(temporary, 'auth.json');
    const remote = join(temporary, 'remote');
    const local = join(temporary, 'source');
    await mkdir(remote); await mkdir(local);
    await writeFile(auth, JSON.stringify(config.credentials), { mode: 0o600, flag: 'wx' });
    const project = rootDir => ({ scriptId: config.scriptId, rootDir, scriptExtensions: ['gs'], htmlExtensions: ['html'], jsonExtensions: ['json'] });
    const remoteConfig = join(temporary, 'remote.clasp.json');
    const localConfig = join(temporary, 'local.clasp.json');
    await writeFile(remoteConfig, JSON.stringify(project(remote)), { mode: 0o600 });
    await writeFile(localConfig, JSON.stringify(project(local)), { mode: 0o600 });
    const argumentsFor = projectFile => ['--auth', auth, '--project', projectFile, '--json'];
    if (mode === 'deploy') {
      const deployments = JSON.parse(await run([...argumentsFor(remoteConfig), 'list-deployments']));
      if (!Array.isArray(deployments) || !deployments.some(item => item.deploymentId === config.deploymentId && Number.isInteger(item.versionNumber))) {
        throw Error('target');
      }
    }
    await run([...argumentsFor(remoteConfig), 'pull']);
    const remoteFiles = await inventory(remote);
    if (!remoteFiles.includes('appsscript.json') || remoteFiles.some(file => !files.includes(file))) throw Error('inventory');
    for (const file of files) await copyFile(join(source, file), join(local, file));
    phase = 'push';
    await run([...argumentsFor(localConfig), 'push', '--force']);
    pushed = true;
    if (mode === 'push') return { pushed: true, deployed: false };
    phase = 'deploy';
    const result = JSON.parse(await run([...argumentsFor(localConfig), 'create-deployment',
      '--deploymentId', config.deploymentId, '--description', config.description]));
    if (result.deploymentId !== config.deploymentId || !Number.isSafeInteger(result.versionNumber) || result.versionNumber < 1) throw Error('response');
    return { pushed: true, deployed: true, version: result.versionNumber };
  } catch {
    // Raw CLI errors can include credentials, paths or remote source; never echo them.
    const message = pushed ? 'コード反映済みですが、公開デプロイの更新を確認できません。既存デプロイを確認してください。' :
      phase === 'preflight' ? '事前確認に失敗しました。Google認可、対象ID、Gitにないリモートファイルを確認してください。コード反映は行っていません。' :
      'コード反映の結果を確認できません。Apps Script側を確認してから再実行してください。';
    throw Error(message);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2] || 'validate';
  try {
    if (mode === 'validate') { await validateSource(); console.log('Apps Script source validated.'); }
    else console.log(JSON.stringify(await deploy({ mode })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
