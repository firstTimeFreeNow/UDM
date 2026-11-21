import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, access, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  deploy,
  deploymentConfig,
  validateSource,
  SOURCE,
} from '../../tools/apps-script/deploy.ts';

const SCRIPT_ID = 'script_00000000000000000000000000';
const DEPLOYMENT_ID = 'deployment_000000000000000000000';
const env = {
  AF_SCRIPT_ID: SCRIPT_ID,
  AF_DEPLOYMENT_ID: DEPLOYMENT_ID,
  CLASPRC_JSON: JSON.stringify({ tokens: { default: { refresh_token: 'private-test-token' } } }),
};
const credentialPaths = [];
function fixture({
  extra = false,
  failPush = false,
  failDeploy = false,
  wrongDeployment = false,
} = {}) {
  const calls = [];
  const run = async (args) => {
    const command = args[5];
    calls.push({ command, args });
    const config = JSON.parse(await readFile(args[3], 'utf8'));
    const auth = args[1];
    credentialPaths.push(auth);
    assert.ok((await readFile(auth, 'utf8')).includes('private-test-token'));
    if (command === 'list-deployments')
      return JSON.stringify([
        { deploymentId: wrongDeployment ? 'wrong' : DEPLOYMENT_ID, versionNumber: 1 },
      ]);
    if (command === 'pull') {
      for (const file of await readdir(SOURCE))
        await writeFile(join(config.rootDir, file), await readFile(join(SOURCE, file)));
      if (extra) await writeFile(join(config.rootDir, 'Untracked.gs'), 'function untracked() {}');
      return '{}';
    }
    if (command === 'push') {
      assert.ok((await readdir(config.rootDir)).includes('AnswerDialog.html'));
      assert.ok(!(await readdir(config.rootDir)).includes('auth.json'));
      if (failPush) throw Error('private-test-token raw API output');
      return '{}';
    }
    if (command === 'create-deployment') {
      assert.equal(args[args.indexOf('--deploymentId') + 1], DEPLOYMENT_ID);
      if (failDeploy) throw Error('private-test-token');
      return JSON.stringify({ deploymentId: DEPLOYMENT_ID, versionNumber: 2 });
    }
    throw Error('Unexpected command: ' + command);
  };
  return { run, calls };
}

test('source has complete dialogs and valid V8 syntax', async () => {
  assert.deepEqual(await validateSource(), [
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
  ]);
});
test('invalid config is rejected before calling Google', () => {
  for (const entry of [
    { ...env, AF_SCRIPT_ID: '' },
    { ...env, AF_DEPLOYMENT_ID: '' },
    { ...env, CLASPRC_JSON: 'no' },
    { ...env, GITHUB_SHA: 'bad;command' },
  ]) {
    assert.throws(() => deploymentConfig(entry, 'deploy'));
  }
  assert.throws(() => deploymentConfig(env, 'unknown'));
});
test('deployment checks remote then pushes and updates the same ID', async () => {
  const mock = fixture();
  assert.deepEqual(await deploy({ mode: 'deploy', env, run: mock.run }), {
    pushed: true,
    deployed: true,
    version: 2,
  });
  assert.deepEqual(
    mock.calls.map((x) => x.command),
    ['list-deployments', 'pull', 'push', 'create-deployment'],
  );
});
test('push mode never creates a public deployment and requires no deployment ID', async () => {
  const mock = fixture();
  assert.deepEqual(
    await deploy({ mode: 'push', env: { ...env, AF_DEPLOYMENT_ID: '' }, run: mock.run }),
    { pushed: true, deployed: false },
  );
  assert.deepEqual(
    mock.calls.map((x) => x.command),
    ['pull', 'push'],
  );
});
test('unknown remote file prevents deleting it during push', async () => {
  const mock = fixture({ extra: true });
  await assert.rejects(deploy({ mode: 'deploy', env, run: mock.run }), /事前確認/);
  assert.ok(!mock.calls.some((x) => x.command === 'push'));
});
test('wrong deployment target is rejected before code changes', async () => {
  const mock = fixture({ wrongDeployment: true });
  await assert.rejects(deploy({ mode: 'deploy', env, run: mock.run }), /事前確認/);
  assert.deepEqual(
    mock.calls.map((x) => x.command),
    ['list-deployments'],
  );
});
test('failed push does not deploy or echo raw credentials', async () => {
  const mock = fixture({ failPush: true });
  await assert.rejects(deploy({ mode: 'deploy', env, run: mock.run }), (error) => {
    assert.ok(!error.message.includes('private-test-token'));
    return /反映の結果/.test(error.message);
  });
  assert.ok(!mock.calls.some((x) => x.command === 'create-deployment'));
});
test('failed deployment reports source already pushed and cleans credentials', async () => {
  const mock = fixture({ failDeploy: true });
  await assert.rejects(deploy({ mode: 'deploy', env, run: mock.run }), /コード反映済み/);
  for (const path of credentialPaths) await assert.rejects(access(dirname(path)));
});

test('missing or restricted Web app settings stop deployment before any Google call', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'udm-manifest-test-'));
  try {
    await cp(SOURCE, temporary, { recursive: true });
    const file = join(temporary, 'appsscript.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    for (const webapp of [
      undefined,
      { access: 'MYSELF', executeAs: 'USER_DEPLOYING' },
      { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_ACCESSING' },
    ]) {
      await writeFile(file, JSON.stringify({ ...manifest, webapp }));
      const mock = fixture();
      await assert.rejects(
        deploy({ mode: 'deploy', env, source: temporary, run: mock.run }),
        /Webアプリの公開設定/,
      );
      assert.equal(mock.calls.length, 0);
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('missing split service files stop deployment before any Google call', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'udm-split-service-test-'));
  try {
    await cp(SOURCE, temporary, { recursive: true });
    await rm(join(temporary, 'AnswerSave.gs'));
    const mock = fixture();
    await assert.rejects(
      deploy({ mode: 'deploy', env, source: temporary, run: mock.run }),
      /ソースが不足/,
    );
    assert.equal(mock.calls.length, 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
