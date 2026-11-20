import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createProbeClient, validateEndpoint } from '../../apps/web/lib/sheets-transport/client.ts';

const endpoint = 'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
const token = 'synthetic-token';
const options = { requestId: 'request_0001' };
const response = (data, extra = {}) => new Response(JSON.stringify({ version: 1,
  requestId: options.requestId, ok: true, data, ...extra }), { headers: { 'content-type': 'application/json' } });
const client = (fetchImpl, extra = {}) => createProbeClient({ endpoint, getIdToken: async () => token, fetchImpl, ...extra });

test('only Google exec endpoints are allowed outside the loopback test mode', () => {
  assert.equal(validateEndpoint(endpoint), endpoint);
  for (const url of ['https://script.google.com.evil.test/macros/s/ID/exec',
    'https://script.google.com/macros/s/ID/dev', endpoint + '?token=secret',
    'https://name:secret@script.google.com/macros/s/ID/exec', endpoint + '#secret',
    'http://127.0.0.1:1234/exec', 'https://evil.test/exec', 'javascript:alert(1)']) {
    assert.throws(() => validateEndpoint(url), { code: 'INVALID_ENDPOINT' });
  }
  assert.equal(validateEndpoint('http://127.0.0.1:1234/exec', true), 'http://127.0.0.1:1234/exec');
});

test('token travels only in a readable CORS POST body, never in the URL or Authorization header', async () => {
  let captured;
  const result = await client(async (url, init) => {
    captured = { url, init };
    return response({ revision: 0, value: 'no' });
  }).read(options);
  assert.equal(result.value, 'no');
  assert.equal(captured.url, endpoint);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.mode, 'cors');
  assert.equal(captured.init.credentials, 'omit');
  assert.equal(captured.init.headers.Authorization, undefined);
  assert.equal(captured.init.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.equal(JSON.parse(captured.init.body).idToken, token);
});

test('no token means no network request and provider errors are not exposed', async () => {
  let calls = 0;
  await assert.rejects(client(async () => { calls++; }, { getIdToken: async () => { throw Error(token); } }).read(),
    error => error.code === 'AUTH_REQUIRED' && !error.message.includes(token));
  assert.equal(calls, 0);
});

test('login HTML is rejected and a write is marked as having an unknown outcome', async () => {
  const api = client(async () => new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(api.write({ expectedRevision: 0, value: 'yes' }, options),
    error => error.code === 'INVALID_RESPONSE' && error.outcomeUnknown);
});

test('mismatched request IDs and malformed success data cannot acknowledge a save', async () => {
  for (const reply of [response({ revision: 1, value: 'yes', saved: true }, { requestId: 'another_0001' }),
    response({ revision: 1, value: 'yes' }), response({ revision: 1, value: 'no', saved: true, replayed: false }),
    response({ revision: 99, value: 'yes', saved: true, replayed: false })]) {
    await assert.rejects(client(async () => reply).write({ expectedRevision: 0, value: 'yes' }, options),
      error => error.code === 'INVALID_RESPONSE' && error.outcomeUnknown);
  }
});

test('a verified acknowledgement carries the expected revision and value', async () => {
  const data = await client(async () => response({ revision: 1, value: 'yes', saved: true, replayed: false }))
    .write({ expectedRevision: 0, value: 'yes' }, options);
  assert.equal(data.saved, true);
});

test('definitive business errors stay distinct from ambiguous communication failures', async () => {
  await assert.rejects(client(async () => response(null, { ok: false,
    error: { code: 'CONFLICT', message: token } })).write({ expectedRevision: 0, value: 'yes' }, options),
  error => error.code === 'CONFLICT' && !error.outcomeUnknown && !error.message.includes(token));
});

test('network failures and HTTP errors do not automatically resend writes', async () => {
  let calls = 0;
  await assert.rejects(client(async () => { calls++; throw Error(token); })
    .write({ expectedRevision: 0, value: 'yes' }, options),
  error => error.code === 'NETWORK_ERROR' && error.outcomeUnknown && !error.message.includes(token));
  assert.equal(calls, 1);
  await assert.rejects(client(async () => new Response('upstream', { status: 503 }))
    .write({ expectedRevision: 0, value: 'yes' }, options), { code: 'HTTP_ERROR', outcomeUnknown: true });
});

test('timeouts abort the request without claiming that the write did not happen', async () => {
  const api = client((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), { timeoutMs: 5 });
  await assert.rejects(api.write({ expectedRevision: 0, value: 'yes' }, options),
    { code: 'TIMEOUT', outcomeUnknown: true });
});

const source = readFileSync(new URL('../../tools/sheets-transport/apps-script/dist/Code.gs', import.meta.url), 'utf8');
function fixture({ authStatus = 200, uid = 'test-participant', disabled = false, busy = false,
  marker = 'UDM_TRANSPORT_PROBE_V1', failFlush = false } = {}) {
  let cells = [[marker, 0, ''], ['demo-slot', 'no', '']];
  let writes = 0;
  let releases = 0;
  let sheetReads = 0;
  const properties = { PROBE_FIREBASE_WEB_API_KEY: 'synthetic-api-key',
    PROBE_ALLOWED_UIDS_JSON: JSON.stringify({ 'test-participant': 'participant', 'test-admin': 'admin' }),
    PROBE_SPREADSHEET_ID: 'SYNTHETIC_FIXTURE_ID' };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || null }) },
    UrlFetchApp: { fetch: (url, init) => {
      assert.ok(url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='));
      assert.equal(JSON.parse(init.payload).idToken, token);
      return { getResponseCode: () => authStatus, getContentText: () => JSON.stringify({ users: [{ localId: uid, disabled }] }) };
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => !busy, releaseLock: () => { releases++; } }) },
    SpreadsheetApp: { openById: id => {
      assert.equal(id, 'SYNTHETIC_FIXTURE_ID');
      sheetReads++;
      return { getSheetByName: name => {
        assert.equal(name, 'transport_probe');
        return { getRange: range => ({
          getValues: () => { assert.equal(range, 'A1:C2'); return structuredClone(cells); },
          setValues: values => { assert.equal(range, 'B1:C2'); writes++;
            cells = [[cells[0][0], values[0][0], values[0][1]], [cells[1][0], values[1][0], values[1][1]]]; },
        }) };
      } };
    }, flush: () => { if (failFlush) throw Error('private internal content'); } },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(source, context);
  function post(action, payload = {}, extra = {}) {
    return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({
      version: 1, requestId: options.requestId, idToken: token, action, payload, ...extra,
    }) } }).text);
  }
  return { post, context, properties, state: () => ({ cells, writes, releases, sheetReads }) };
}

test('backend rejects invalid/disabled/unregistered identities before touching Sheets', () => {
  for (const params of [{ authStatus: 400 }, { disabled: true }, { uid: 'unregistered-user' }]) {
    const f = fixture(params);
    assert.equal(f.post('probe.read').ok, false);
    assert.equal(f.state().sheetReads, 0);
  }
});

test('client-supplied UID or role cannot grant admin access', () => {
  const f = fixture();
  assert.equal(f.post('probe.admin', {}, { uid: 'test-admin', role: 'admin' }).error.code, 'FORBIDDEN');
  assert.equal(fixture({ uid: 'test-admin' }).post('probe.admin').data.role, 'admin');
});

test('read/save/read works against only the marked anonymous fixture', () => {
  const f = fixture();
  assert.equal(f.post('probe.read').data.value, 'no');
  assert.equal(f.post('probe.write', { expectedRevision: 0, value: 'yes' }).data.revision, 1);
  assert.equal(f.post('probe.read').data.value, 'yes');
  assert.equal(f.state().writes, 1);
  assert.equal(f.state().releases, 3);
});

test('replayed writes do not increment revisions or perform a second write', () => {
  const f = fixture();
  f.post('probe.write', { expectedRevision: 0, value: 'yes' });
  const replay = f.post('probe.write', { expectedRevision: 0, value: 'yes' });
  assert.equal(replay.data.replayed, true);
  assert.equal(f.state().writes, 1);
  assert.equal(f.post('probe.write', { expectedRevision: 0, value: 'no' }).error.code, 'CONFLICT');
});

test('stale edits, arbitrary input and unknown actions are rejected', () => {
  const f = fixture();
  assert.equal(f.post('probe.write', { expectedRevision: 9, value: 'yes' }).error.code, 'CONFLICT');
  assert.equal(f.post('probe.write', { expectedRevision: 0, value: 'unsafe' }).error.code, 'INVALID_REQUEST');
  assert.equal(f.post('probe.write', { expectedRevision: 0, value: 'yes', range: 'A1:Z100' }).error.code, 'INVALID_REQUEST');
  assert.equal(f.post('arbitrary.sheet.write').error.code, 'INVALID_REQUEST');
  assert.equal(f.state().writes, 0);
});

test('wrong fixture, missing configuration and lock contention fail closed', () => {
  assert.equal(fixture({ marker: 'SOME_OTHER_SHEET' }).post('probe.read').error.code, 'FIXTURE_REQUIRED');
  const f = fixture();
  delete f.properties.PROBE_SPREADSHEET_ID;
  assert.equal(f.post('probe.read').error.code, 'CONFIG_REQUIRED');
  assert.equal(fixture({ busy: true }).post('probe.read').error.code, 'BUSY');
});

test('a post-write failure is not reported as success and the script lock is released', () => {
  const f = fixture({ failFlush: true });
  const result = f.post('probe.write', { expectedRevision: 0, value: 'yes' });
  assert.equal(result.error.code, 'INTERNAL_ERROR');
  assert.equal(f.state().writes, 1);
  assert.equal(f.state().releases, 1);
  assert.ok(!JSON.stringify(result).includes('private internal content'));
});

test('malformed and null request bodies never expose backend errors', () => {
  const f = fixture();
  for (const contents of ['null', '{broken']) {
    const result = JSON.parse(f.context.doPost({ postData: { contents } }).text);
    assert.equal(result.error.code, 'INVALID_REQUEST');
  }
});
