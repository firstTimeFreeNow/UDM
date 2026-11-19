import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

/** Uses supplied Playwright chromium; does not require new project dependencies. */
export async function runBrowserChecks(chromium, launchOptions = {}) {
  const clientSource = await readFile(new URL('../../apps/web/lib/sheets-transport/client.mjs', import.meta.url), 'utf8');
  const seen = [];
  const pending = new Map();
  let browser;
  let revision = 0;
  let value = 'no';
  let frontendOrigin;
  const api = createServer(async (req, res) => {
    seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization,
      contentType: req.headers['content-type'] });
    if (req.url === '/slow') { setTimeout(() => { if (!res.destroyed) res.end(); }, 100); return; }
    if (req.url === '/denied') { res.end('no CORS'); return; }
    res.setHeader('Access-Control-Allow-Origin', frontendOrigin);
    if (req.url === '/login') { res.setHeader('Content-Type', 'text/html'); res.end('<html>Login</html>'); return; }
    if (req.method === 'POST' && req.url === '/exec') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const request = JSON.parse(raw);
      let result;
      if (request.idToken !== 'local-test-token') result = { ok: false, error: { code: 'AUTH_REQUIRED' } };
      else if (request.action === 'probe.admin') result = { ok: false, error: { code: 'FORBIDDEN' } };
      else if (request.action === 'probe.read') result = { ok: true, data: { revision, value } };
      else if (request.payload.expectedRevision !== revision) result = { ok: false, error: { code: 'CONFLICT' } };
      else { revision++; value = request.payload.value;
        result = { ok: true, data: { revision, value, saved: true, replayed: false } }; }
      pending.set(request.requestId, { version: 1, requestId: request.requestId, ...result });
      res.writeHead(303, { Location: '/content/' + request.requestId }); res.end(); return;
    }
    if (req.url.startsWith('/content/')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(pending.get(req.url.slice('/content/'.length)))); return;
    }
    res.writeHead(404); res.end();
  });
  const frontend = createServer((req, res) => {
    if (req.url === '/client.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(clientSource); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Local transport check</title>'); }
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await listen(frontend);
    frontendOrigin = 'http://127.0.0.1:' + frontend.address().port;
    await listen(api);
    const apiOrigin = 'http://127.0.0.1:' + api.address().port;
    browser = await chromium.launch({ ...launchOptions, headless: true });
    const page = await browser.newPage();
    await page.goto(frontendOrigin);
    const result = await page.evaluate(async ({ apiOrigin }) => {
      const { createProbeClient } = await import('/client.mjs');
      const make = (path, timeoutMs = 3000) => createProbeClient({ endpoint: apiOrigin + path,
        getIdToken: async () => 'local-test-token', timeoutMs, allowLocalEndpoint: true });
      const api = make('/exec');
      const before = await api.read();
      const saved = await api.write({ expectedRevision: before.revision, value: 'yes' });
      const after = await api.read();
      const failure = async operation => { try { await operation(); return null; }
        catch (error) { return { code: error.code, unknown: error.outcomeUnknown }; } };
      return { before, saved, after, admin: await failure(() => api.checkAdmin()),
        conflict: await failure(() => api.write({ expectedRevision: 0, value: 'no' })),
        cors: await failure(() => make('/denied').write({ expectedRevision: 1, value: 'no' })),
        html: await failure(() => make('/login').read()),
        timeout: await failure(() => make('/slow', 10).write({ expectedRevision: 1, value: 'no' })) };
    }, { apiOrigin });
    assert.equal(result.before.value, 'no');
    assert.equal(result.saved.saved, true);
    assert.equal(result.after.value, 'yes');
    assert.equal(result.after.revision, 1);
    assert.equal(result.admin.code, 'FORBIDDEN');
    assert.equal(result.conflict.code, 'CONFLICT');
    assert.deepEqual(result.cors, { code: 'NETWORK_ERROR', unknown: true });
    assert.equal(result.html.code, 'INVALID_RESPONSE');
    assert.deepEqual(result.timeout, { code: 'TIMEOUT', unknown: true });
    assert.equal(seen.filter(x => x.method === 'OPTIONS').length, 0);
    assert.ok(seen.some(x => x.method === 'POST' && x.url === '/exec'));
    assert.ok(seen.some(x => x.method === 'GET' && x.url.startsWith('/content/')));
    assert.ok(seen.every(x => !x.authorization && !x.url.includes('token')));
    return { environment: 'Local cross-origin HTTP fixture, not Google Apps Script',
      checks: ['read/write/read', 'redirect response', 'no preflight', 'token absent from URL',
        'admin rejection', 'stale write rejection', 'CORS failure', 'HTML response rejection', 'timeout'] };
  } finally {
    if (browser) await browser.close();
    await Promise.all([frontend, api].map(server => new Promise(resolve => {
      server.close(resolve); server.closeAllConnections();
    })));
  }
}
