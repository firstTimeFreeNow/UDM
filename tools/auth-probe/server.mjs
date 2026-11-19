import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const fields = { apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY', authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', appId: 'NEXT_PUBLIC_FIREBASE_APP_ID' };

export function selectWebConfig(environment) {
  const result = {};
  for (const [field, key] of Object.entries(fields)) {
    const value = environment[key];
    if (typeof value !== 'string' || !value.trim()) throw Error('Firebase web configuration is incomplete');
    result[field] = value.trim();
  }
  return result;
}

/** Loopback-only, explicit routes: never serve repository files or credentials. */
export async function createAuthProbeServer(config, { port = 0 } = {}) {
  const allowed = { apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, appId: config.appId };
  if (Object.values(allowed).some(value => typeof value !== 'string' || !value)) throw Error('Invalid config');
  const routes = new Map([
    ['/', [await readFile(new URL('./index.html', import.meta.url)), 'text/html;charset=UTF-8']],
    ['/app.mjs', [await readFile(new URL('./app.mjs', import.meta.url)), 'text/javascript;charset=UTF-8']],
    ['/client.mjs', [await readFile(new URL('../../apps/web/lib/sheets-transport/client.mjs', import.meta.url)), 'text/javascript;charset=UTF-8']],
    ['/config.json', [JSON.stringify(allowed), 'application/json;charset=UTF-8']],
  ]);
  const server = createServer((req, res) => {
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1):[0-9]+$/.test(host)) { res.writeHead(403); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://script.google.com https://script.googleusercontent.com https://*.googleusercontent.com; frame-src https://*.firebaseapp.com https://accounts.google.com; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const route = routes.get(req.url);
    if (!route) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', route[1]);
    res.end(req.method === 'HEAD' ? '' : route[0]);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, url: 'http://localhost:' + server.address().port };
}

async function main() {
  let environment;
  if (process.argv.includes('--config-stdin')) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    environment = JSON.parse(input);
  } else {
    const text = await readFile(new URL('../../apps/web/.env.local', import.meta.url), 'utf8');
    environment = Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  }
  const portArgument = process.argv.find(arg => arg.startsWith('--port='));
  const port = portArgument ? Number(portArgument.slice(7)) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  const { server, url } = await createAuthProbeServer(selectWebConfig(environment), { port });
  console.log('Authentication check: ' + url);
  const close = () => server.close(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Unable to start authentication check; inspect local configuration.'); process.exitCode = 1; });
}
