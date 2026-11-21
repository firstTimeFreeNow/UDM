import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = new URL('../../../apps/apps-script/src/', import.meta.url);
const config = fileURLToPath(new URL('../tsconfig.json', source));
const googleNames = new Set([
  'SpreadsheetApp',
  'PropertiesService',
  'CacheService',
  'LockService',
  'UrlFetchApp',
  'Utilities',
  'ScriptApp',
  'HtmlService',
  'ContentService',
  'GoogleAppsScript',
]);

test('domain and application cannot depend on Google adapters; infrastructure cannot call use cases or RPCs', () => {
  const options = ts.readConfigFile(config, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    options.config,
    ts.sys,
    fileURLToPath(new URL('../', source)),
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const root = fileURLToPath(source);
  const violations: string[] = [];
  const inspected = new Set<string>();
  for (const file of program.getSourceFiles().filter((file) => file.fileName.startsWith(root))) {
    const layer = file.fileName.slice(root.length).split('/')[0];
    if (!['domain', 'application', 'infrastructure'].includes(layer)) continue;
    inspected.add(layer);
    function visit(node: ts.Node) {
      if (ts.isIdentifier(node)) {
        if (layer !== 'infrastructure' && googleNames.has(node.text))
          violations.push(`${file.fileName}: ${node.text}`);
        const declarations = checker.getSymbolAtLocation(node)?.getDeclarations() ?? [];
        for (const declaration of declarations) {
          const target = declaration.getSourceFile().fileName;
          if (!target.startsWith(root)) continue;
          const targetLayer = target.slice(root.length).split('/')[0];
          const allowed =
            layer === 'domain'
              ? ['domain', 'models.d.ts']
              : layer === 'application'
                ? ['domain', 'application', 'models.d.ts']
                : ['domain', 'infrastructure', 'models.d.ts'];
          if (
            !allowed.includes(targetLayer) &&
            !(layer === 'infrastructure' && target.endsWith('/application/Ports.d.ts'))
          )
            violations.push(`${file.fileName}: ${node.text} -> ${target}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  assert.deepEqual([...inspected].sort(), ['application', 'domain', 'infrastructure']);
  assert.deepEqual([...new Set(violations)], []);
});

// These use cases run without loading any infrastructure, facade, or composition root.
async function application() {
  const files: string[] = [];
  for (const directory of ['domain', 'application']) {
    for (const name of await readdir(new URL(directory + '/', source))) {
      if (name.endsWith('.ts') && !name.endsWith('.d.ts')) files.push(directory + '/' + name);
    }
  }
  const context = vm.createContext({ Date, Map, Set, Number, JSON, Object });
  for (const name of files) {
    const contents = await readFile(new URL(name, source), 'utf8');
    vm.runInContext(
      ts.transpileModule(contents, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
      }).outputText,
      context,
    );
  }
  return context;
}
const day = '2026-11-16';
const slot = day + ' 21:30';
function schedule(context) {
  const events: string[] = [];
  let answer = '○';
  const state = () => ({
    weekId: day,
    members: [{ id: 'm_1', name: 'Member', required: true }],
    slots: [{ key: slot, date: day, time: '21:30', count: 1, judgment: '開催可能' }],
    answers: { m_1: { [slot]: answer } },
    confirmed: null,
    minParticipants: 1,
    maxParticipants: 8,
  });
  const repository = {
    read: () => {
      events.push('read');
      return state();
    },
    answerSettings: () => ({
      weekId: day,
      members: [{ name: 'Member', required: true, active: true, index: 0 }],
    }),
    slots: () => [{ key: slot, date: day, time: '21:30', row: 7 }],
    writeAnswers(_column, _slots, updates) {
      events.push('write');
      answer = updates.get(slot);
      return 1;
    },
    refreshSelection() {
      events.push('selection');
    },
    flush() {
      events.push('flush');
    },
  };
  const service = context.afCreateScheduleService_({
    repository,
    cache: {
      invalidate() {
        events.push('cache');
      },
    },
    week: { pending: () => false },
    clock: { now: () => 0 },
    ids: {
      uuid: () => {
        throw Error('Unexpected UUID');
      },
    },
    effects: { confirmed() {} },
    limits: { firstSlotRow: 7, lastSlotRow: 60, maxParticipants: 8 },
  });
  return { service, events, state, repository };
}

test('answer use case rejects conflicting edits without persistence and coordinates successful effects through ports', async () => {
  const context = await application();
  const f = schedule(context);
  const payload = { weekId: day, memberId: 'm_1', changes: [{ slot, before: '×', answer: '△' }] };
  assert.throws(
    () => f.service.save(payload, f.state()),
    (error) => error.code === 'CONFLICT',
  );
  assert.deepEqual(f.events, []);
  payload.changes[0].before = '○';
  assert.equal(f.service.save(payload, f.state()).state.answers.m_1[slot], '△');
  assert.deepEqual(f.events, ['write', 'cache', 'selection', 'flush', 'read']);
});

test('candidate removal rules reject confirmed or answered slots before the repository can delete them', async () => {
  const f = schedule(await application());
  f.repository.candidateAnswers = () => ['○'];
  f.repository.removeCandidate = () => {
    throw Error('Must not delete');
  };
  assert.throws(
    () => f.service.removeCandidate({ slot }, { ...f.state(), confirmed: slot }),
    (error) => error.code === 'INELIGIBLE',
  );
  assert.throws(
    () => f.service.removeCandidate({ slot }, f.state()),
    (error) => error.code === 'HAS_ANSWERS',
  );
  assert.deepEqual(f.events, []);
});

test('notification policy runs without FCM, retains an event ID, and distinguishes a changed schedule', async () => {
  const context = await application();
  let sequence = 0;
  const current = { key: day + '|' + slot, weekId: day, slot, upcoming: true };
  const event = context.afNextPushEvent_(null, current, () => String(++sequence));
  assert.equal(event.id, '1');
  assert.equal(
    context.afNextPushEvent_(event, current, () => {
      throw Error('No new event');
    }),
    event,
  );
  const changed = context.afNextPushEvent_(
    event,
    { ...current, key: 'next', slot: day + ' 22:00' },
    () => String(++sequence),
  );
  assert.equal(changed.changed, true);
  assert.equal(
    context.afNotificationMessage_(changed, 'test-token', 0).data.body,
    day + ' 22:00 の開催が変更されました',
  );
});

test('interrupted rollover resumes the saved archive and never takes a second snapshot', async () => {
  const context = await application();
  const events: string[] = [];
  const snapshot = { weekId: day, candidates: [] };
  const state = {
    week: '2026-11-23',
    pending: day,
    selection: 'empty',
    selected: '',
    selectedAt: null,
    deadline: 0,
    validCandidate: false,
  };
  const service = context.afCreateRolloverService_({
    repository: {
      state: () => state,
      archive: () => ({ snapshot: () => snapshot }),
      snapshot() {
        throw Error('Do not snapshot twice');
      },
      mark(week) {
        events.push('mark:' + week);
      },
      finish() {
        events.push('finish');
      },
      advance() {
        throw Error('Do not advance twice');
      },
    },
    execution: { run: (fn) => fn() },
    clock: { now: () => 0 },
    notifications: { checkSafe() {} },
    selection: { refresh() {} },
    cache: {
      invalidate() {
        events.push('cache');
      },
    },
    delayMinutes: 120,
  });
  service.check();
  assert.deepEqual(events, ['mark:' + day, 'finish']);
});

test('rollover archives before clearing and retains its recovery marker after a failed advance', async () => {
  const context = await application();
  const events: string[] = [];
  const service = context.afCreateRolloverService_({
    repository: {
      state: () => ({
        week: day,
        pending: null,
        selection: 'empty',
        selected: '',
        selectedAt: null,
        deadline: 0,
        validCandidate: false,
      }),
      archive: () => null,
      snapshot: () => ({ weekId: day, candidates: [] }),
      mark() {
        events.push('mark');
      },
      append(_state, snapshot) {
        events.push('archive');
        return { snapshot: () => snapshot };
      },
      advance() {
        events.push('advance');
        throw Error('Storage unavailable');
      },
      finish() {
        events.push('finish');
      },
    },
    execution: { run: (fn) => fn() },
    clock: { now: () => 0 },
    notifications: { checkSafe() {} },
    selection: { refresh() {} },
    cache: {
      invalidate() {
        events.push('cache');
      },
    },
    delayMinutes: 120,
  });
  assert.throws(() => service.check(), /Storage unavailable/);
  assert.deepEqual(events, ['mark', 'archive', 'mark', 'advance']);
});

test('test broadcast persists its replay guard before delivery and refuses replay after an interrupted send', async () => {
  const context = await application();
  const events: string[] = [];
  let memo;
  const service = context.afCreatePushService_({
    repository: {
      ready: () => true,
      fingerprint: () => 'fixture-fingerprint',
      memo: () => memo,
      devices: () => [{ key: 'device', token: 'fixture-token' }],
      saveMemo(value) {
        events.push('memo');
        memo = JSON.parse(JSON.stringify(value));
      },
    },
    delivery: {
      send() {
        events.push('send');
        throw Error('Interrupted');
      },
    },
    clock: { now: () => 0 },
    ids: { uuid: () => 'id' },
    policy: { maxAge: 90, maxDevices: 100 },
  });
  const payload = { title: 'Test', body: 'Body' };
  assert.throws(() => service.test(payload, 'same-request'), /Interrupted/);
  assert.throws(
    () => service.test(payload, 'same-request'),
    (error) => error.code === 'CONFLICT',
  );
  assert.deepEqual(events, ['memo', 'send']);
});

test('link sharing reuses its repository result and rejects stale updates without writing', async () => {
  const context = await application();
  const links = [
    {
      row: 2,
      code: 'code1234',
      path: '/UDM/afetiria-extra/answer/',
      active: true,
      updatedAt: 'fixed',
    },
  ];
  const service = context.afCreateLinkService_({
    repository: {
      all: () => links,
      insert() {
        throw Error('Do not insert');
      },
      update() {
        throw Error('Do not overwrite');
      },
    },
    clock: { iso: () => 'new' },
    ids: {
      uuid() {
        throw Error('Do not generate');
      },
    },
  });
  assert.equal(service.share({ path: links[0].path }).code, 'code1234');
  assert.throws(
    () =>
      service.update({
        code: 'code1234',
        path: '/UDM/',
        active: true,
        beforePath: '/UDM/',
        beforeActive: true,
      }),
    (error) => error.code === 'CONFLICT',
  );
});

test('request handler applies authorization before locks or repositories and lets session avoid a schedule read', async () => {
  const context = await application();
  const events: string[] = [];
  const handler = context.afCreateRequestHandler_({
    identity: {
      role() {
        events.push('identity');
        return 'participant';
      },
    },
    execution: {
      web() {
        throw Error('Must not acquire lock');
      },
    },
    schedule: {
      read() {
        throw Error('Must not read schedule');
      },
    },
    links: {},
    push: {},
    history() {
      throw Error('Must not read history');
    },
  });
  assert.throws(
    () => handler.handle({ action: 'af.members.add', payload: {} }),
    (error) => error.code === 'FORBIDDEN',
  );
  assert.equal(handler.handle({ action: 'af.session', payload: {} }).role, 'participant');
  assert.deepEqual(events, ['identity', 'identity']);
});
