import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type Targets = { web: boolean; bff: boolean; apps_script: boolean; tooling: boolean };
export function affectedTargets(paths: string[]): Targets {
  const targets: Targets = { web: false, bff: false, apps_script: false, tooling: false };
  const all = () => { for (const key of Object.keys(targets) as (keyof Targets)[]) targets[key] = true; };
  for (const path of paths) {
    if (/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*\.json)$/.test(path) ||
        /^(packages\/contracts\/|tests\/contracts\/|tools\/build\.ts|tools\/contracts\/|\.github\/actions\/|\.github\/workflows\/ci\.yml|tools\/ci\/)/.test(path)) { all(); continue; }
    if (/^(apps\/web\/|tests\/planner|tests\/bff\/|tools\/afetiria\/|tools\/auth-probe\/)/.test(path)) targets.web = true;
    if (/^(\.dockerignore$|apps\/bff\/|tools\/cloud-run\/|tests\/cloud-run\/|\.github\/workflows\/bff\.yml)/.test(path)) targets.bff = true;
    if (/^(apps\/apps-script\/|tools\/apps-script\/|tests\/apps-script\/|tests\/sheets-transport\/|tools\/sheets-transport\/|tests\/helpers\/|\.github\/workflows\/apps-script\.yml)/.test(path)) targets.apps_script = true;
    if (/^(\.github\/scripts\/|\.github\/workflows\/|RELEASE$|tests\/ci\/)/.test(path)) targets.tooling = true;
    // Shared browser/Apps Script signing fixtures and transport helpers cross boundaries.
    if (/^(tests\/helpers\/|tests\/bff\/signature-parity|apps\/web\/lib\/sheets-transport\/)/.test(path)) { targets.bff = true; targets.apps_script = true; targets.web = true; }
    // New code outside the known components must never silently skip validation.
    const known = /^(apps\/(web|bff|apps-script)\/|packages\/contracts\/|tools\/|tests\/(planner|bff\/|apps-script\/|sheets-transport\/|helpers\/|contracts\/|ci\/|cloud-run\/)|\.github\/|RELEASE$|\.dockerignore$)/.test(path);
    if (!known && /(?:\.(?:ts|tsx|js|mjs|gs|go|json|ya?ml|sh|py)$|(?:^|\/)Dockerfile$)/.test(path)) all();
    // Every maintained tool is type-checked even when no product component is affected.
    if (/^tools\//.test(path)) targets.tooling = true;
  }
  return targets;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.CI_BASE_SHA;
  const head = process.env.CI_HEAD_SHA;
  if (!head || !/^[a-f0-9]{40,64}$/.test(head)) throw Error('Invalid CI head commit');
  const previous = base && !/^0+$/.test(base) ? base : execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { input: '', encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40,64}$/.test(previous)) throw Error('Invalid CI base commit');
  const paths = execFileSync('git', ['diff', '--name-only', '-z', previous, head], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const targets = affectedTargets(paths);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(targets).map(([k,v]) => `${k}=${v}\n`).join(''));
  console.log(JSON.stringify(targets));
}
