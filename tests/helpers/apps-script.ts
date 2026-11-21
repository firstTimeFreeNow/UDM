import { readFile, readdir } from 'node:fs/promises';
const directory = new URL('../../apps/apps-script/dist/', import.meta.url);
export async function loadAppsScript() {
  const names = (await readdir(directory)).filter(name => name.endsWith('.gs')).sort();
  return (await Promise.all(names.map(name => readFile(new URL(name, directory), 'utf8')))).join('\n');
}
