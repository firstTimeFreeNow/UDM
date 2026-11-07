import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASE_TYPES, bumpVersion, parseVersion, validateBump } from './release-version.mjs';
import { prepareRelease, validateReleasePR, publishRelease } from './release.mjs';

const REPO = 'firstTimeFreeNow/UDM';
const file = version => ({ content: Buffer.from(`${version}\n`).toString('base64'), sha: 'blob' });
function mock(routes) {
  const calls = [];
  const api = async (path, method = 'GET', body) => {
    calls.push({ path, method, body });
    const key = `${method} ${path}`;
    if (!(key in routes)) { const error = new Error(`Not found: ${key}`); error.status = 404; throw error; }
    const value = routes[key];
    if (typeof value === 'function') return value(body);
    return value;
  };
  return { api, calls, writes: () => calls.filter(call => call.method !== 'GET') };
}
function prepareRoutes() {
  return {
    'GET /git/ref/heads/main': { object: { sha: 'base' } },
    'GET /contents/RELEASE?ref=base': file('1.2.3'),
    'GET /pulls?state=open&base=main&per_page=100&page=1': [],
    'POST /git/refs': {},
    'PUT /contents/RELEASE': {},
    'POST /pulls': { html_url: 'https://github.com/firstTimeFreeNow/UDM/pull/1' },
  };
}
function mergedRoutes() {
  return {
    'GET /pulls/1': { merged: true, base: { ref: 'main' }, head: { ref: 'release/v1.2.4', repo: { full_name: REPO } }, merge_commit_sha: 'merged' },
    'GET /pulls/1/files?per_page=100&page=1': [{ filename: 'RELEASE', status: 'modified' }],
    'GET /git/commits/merged': { parents: [{ sha: 'previous' }] },
    'GET /contents/RELEASE?ref=previous': file('1.2.3'),
    'GET /contents/RELEASE?ref=merged': file('1.2.4'),
  };
}

for (const [type, expected] of [['major', '2.0.0'], ['minor', '1.3.0'], ['patch', '1.2.4'], ['hotfix', '1.2.3-hotfix.3']]) {
  test(`bump ${type} resets lower components`, () => assert.equal(bumpVersion('1.2.3-hotfix.2', type), expected));
}
test('first hotfix uses suffix .1', () => assert.equal(bumpVersion('0.1.0', 'hotfix'), '0.1.0-hotfix.1'));
test('invalid versions, inputs and overflow fail', () => {
  for (const value of ['v1.2.3', '1.2', '01.2.3', '1.2.3.4', '1.2.3-hotfix.0', '1.2.3-beta.1', '1.2.3\nmalicious', '9007199254740992.0.0']) assert.throws(() => parseVersion(value));
  assert.throws(() => bumpVersion('1.2.3', 'miner'));
  assert.throws(() => bumpVersion('9007199254740991.0.0', 'major'));
});
test('validate only a single increment, including consecutive hotfixes', () => {
  for (const type of RELEASE_TYPES) assert.equal(validateBump('1.2.3', bumpVersion('1.2.3', type)), type);
  assert.equal(validateBump('1.2.3-hotfix.1', '1.2.3-hotfix.2'), 'hotfix');
  for (const value of ['1.2.3', '1.2.5', '1.1.0', '2.0.1']) assert.throws(() => validateBump('1.2.3', value));
});
test('prepare creates one commit changing RELEASE and opens PR without publishing', async () => {
  const m = mock(prepareRoutes());
  const result = await prepareRelease(m.api, REPO, 'patch');
  assert.equal(result.version, '1.2.4');
  assert.deepEqual(m.writes().map(call => call.path), ['/git/refs', '/contents/RELEASE', '/pulls']);
  const commit = m.writes()[1].body;
  assert.equal(Buffer.from(commit.content, 'base64').toString(), '1.2.4\n');
  assert.equal(commit.author.name, 'firstTimeFreeNow');
  assert.equal(m.writes()[0].body.sha, 'base');
});
test('invalid type cannot make writes', async () => {
  const m = mock({}); await assert.rejects(prepareRelease(m.api, REPO, 'invalid')); assert.equal(m.calls.length, 0);
});
test('rerun returns existing unchanged release PR', async () => {
  const routes = prepareRoutes();
  routes['GET /pulls?state=open&base=main&per_page=100&page=1'] = [{ number: 1, head: { repo: { full_name: REPO }, ref: 'release/v1.2.4', sha: 'head' }, html_url: 'existing' }];
  routes['GET /pulls/1/files?per_page=100&page=1'] = [{ filename: 'RELEASE' }];
  routes['GET /contents/RELEASE?ref=head'] = file('1.2.4');
  const m = mock(routes); assert.equal((await prepareRelease(m.api, REPO, 'patch')).url, 'existing'); assert.equal(m.writes().length, 0);
});
test('different open release PR blocks a second release', async () => {
  const routes = prepareRoutes(); routes['GET /pulls?state=open&base=main&per_page=100&page=1'] = [{ head: { repo: { full_name: REPO }, ref: 'release/v2.0.0' }, html_url: 'existing' }];
  const m = mock(routes); await assert.rejects(prepareRelease(m.api, REPO, 'patch'), /already exists/); assert.equal(m.writes().length, 0);
});
test('recover a run interrupted immediately after branch creation', async () => {
  const routes = prepareRoutes(); routes['GET /git/ref/heads/release/v1.2.4'] = { object: { sha: 'base' } }; routes['GET /compare/base...base'] = { status: 'identical', files: [] };
  const m = mock(routes); await prepareRelease(m.api, REPO, 'patch'); assert.deepEqual(m.writes().map(call => call.path), ['/contents/RELEASE', '/pulls']);
});
test('recover a branch committed before PR creation failed', async () => {
  const routes = prepareRoutes(); routes['GET /git/ref/heads/release/v1.2.4'] = { object: { sha: 'head' } }; routes['GET /compare/base...head'] = { status: 'ahead', ahead_by: 1, files: [{ filename: 'RELEASE' }] }; routes['GET /contents/RELEASE?ref=head'] = file('1.2.4');
  const m = mock(routes); await prepareRelease(m.api, REPO, 'patch'); assert.deepEqual(m.writes().map(call => call.path), ['/pulls']);
});
test('validate uses the actual merge commit and its first parent', async () => {
  const m = mock(mergedRoutes()); assert.deepEqual(await validateReleasePR(m.api, REPO, 1), { version: '1.2.4', sha: 'merged', type: 'patch' }); assert.equal(m.writes().length, 0);
});
test('unmerged, foreign, or non-release PR cannot publish', async () => {
  for (const modify of [pr => pr.merged = false, pr => pr.head.repo.full_name = 'other/repo', pr => pr.head.ref = 'feature', pr => pr.base.ref = 'other']) {
    const routes = mergedRoutes(); modify(routes['GET /pulls/1']); const m = mock(routes); await assert.rejects(validateReleasePR(m.api, REPO, 1)); assert.equal(m.writes().length, 0);
  }
});
test('extra changes, stale or mismatched versions cannot release', async () => {
  for (const modify of [r => r['GET /pulls/1/files?per_page=100&page=1'].push({ filename: 'app/page.tsx' }), r => r['GET /contents/RELEASE?ref=previous'] = file('1.2.4'), r => r['GET /pulls/1'].head.ref = 'release/v1.3.0']) {
    const routes = mergedRoutes(); modify(routes); await assert.rejects(validateReleasePR(mock(routes).api, REPO, 1));
  }
});
test('publish targets the verified SHA and reruns are idempotent', async () => {
  const routes = { 'GET /contents/RELEASE?ref=merged': file('1.2.4'), 'POST /releases': body => ({ html_url: body.tag_name }) };
  const first = mock(routes); assert.equal(await publishRelease(first.api, '1.2.4', 'merged'), 'v1.2.4'); assert.equal(first.writes()[0].body.target_commitish, 'merged');
  routes['GET /git/ref/tags/v1.2.4'] = { object: { type: 'commit', sha: 'merged' } }; routes['GET /releases/tags/v1.2.4'] = { draft: false, prerelease: false, html_url: 'existing' };
  const rerun = mock(routes); assert.equal(await publishRelease(rerun.api, '1.2.4', 'merged'), 'existing'); assert.equal(rerun.writes().length, 0);
});
test('a tag pointing to another commit or a mismatched RELEASE prevents publishing', async () => {
  const routes = { 'GET /contents/RELEASE?ref=merged': file('1.2.4'), 'GET /git/ref/tags/v1.2.4': { object: { type: 'commit', sha: 'other' } } };
  const m = mock(routes); await assert.rejects(publishRelease(m.api, '1.2.4', 'merged'), /different commit/); assert.equal(m.writes().length, 0);
  await assert.rejects(publishRelease(m.api, '1.2.5', 'merged'), /does not match/);
});
