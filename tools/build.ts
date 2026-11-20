/** Bootstrap only: Node strips this file's types; all application/test scripts are emitted JS. */
import ts from 'typescript';
import { mkdir, readdir, readFile, writeFile, copyFile, rm, symlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.build');
const roots = ['.github/scripts', 'tools', 'tests', 'packages/contracts', 'apps/web/lib'];
async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(e => !['node_modules', 'dist', 'out', '.next', '__pycache__'].includes(e.name))
    .map(async e => e.isDirectory() ? walk(join(directory, e.name)) : [join(directory, e.name)]))).flat();
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(join(output, 'package.json'), '{"type":"module"}\n');
for (const base of roots) {
  for (const file of await walk(join(root, base))) {
    const name = relative(root, file);
    // Only code and explicit test assets are copied; no env files or credentials.
    if (!/\.(ts|json|html)$/.test(name) || name.endsWith('.d.ts') || /client_secret|\.clasp|\.env/.test(name)) continue;
    const destination = join(output, name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file, destination);
    if (file.endsWith('.ts')) {
      let source = await readFile(file, 'utf8');
      if (name === 'tools/auth-probe/app.ts') source = source.replace('../../apps/web/lib/sheets-transport/client.ts', '/client.js');
      const result = ts.transpileModule(source, {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true },
        reportDiagnostics: true,
      });
      const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
      if (errors.length) throw Error(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCurrentDirectory: () => root, getCanonicalFileName: p => p, getNewLine: () => '\n',
      }));
      await writeFile(destination.replace(/\.ts$/, '.js'), result.outputText);
    }
  }
}
// Resolve workspace imports to the emitted package during Node tests.
const contractPackage = join(output, 'packages/contracts/package.json');
const contractConfig = JSON.parse(await readFile(contractPackage, 'utf8'));
for (const key of Object.keys(contractConfig.exports)) contractConfig.exports[key] = contractConfig.exports[key].replace(/\.ts$/, '.js');
await writeFile(contractPackage, JSON.stringify(contractConfig, null, 2));
await mkdir(join(output, 'node_modules/@udm'), { recursive: true });
await symlink('../../packages/contracts', join(output, 'node_modules/@udm/contracts'), 'dir');

for (const project of ['apps/apps-script', 'tools/sheets-transport/apps-script']) {
  const source = join(root, project, 'src');
  const directory = project.startsWith('apps/') ? source : join(root, project);
  const dist = join(root, project, 'dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const file of await walk(directory)) {
    if (!/\.(ts|html|json)$/.test(file)) continue;
    let name = relative(directory, file);
    let text = await readFile(file, 'utf8');
    if (file.endsWith('.ts')) {
      if (file.endsWith('.d.ts')) continue;
      name = name.replace(/\.ts$/, '.gs');
      text = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
    }
    await writeFile(join(dist, name), text);
    const target = join(output, project, 'dist', name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  }
}
// Runtime files consumed directly by Next/PostCSS and the browser are generated.
for (const [source, target] of [
  ['apps/web/postcss.config.source.ts', 'apps/web/postcss.config.js'],
  ['apps/web/workers/push-sw.ts', 'apps/web/public/afetiria-extra/push-sw.js'],
]) {
  const text = ts.transpileModule(await readFile(join(root, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  await writeFile(join(root, target), text);
  const dest = join(output, target);
  await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, text);
}
console.log('Compiled TypeScript tools, tests, Apps Script and browser runtime assets.');
