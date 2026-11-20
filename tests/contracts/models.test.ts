import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isSchedule } from '../../packages/contracts/src/afetiria.ts';
import { operations } from '../../packages/contracts/generated/operations.ts';
import { bffRoute } from '../../packages/contracts/src/routes.ts';
const cases = JSON.parse(await readFile(new URL('../../packages/contracts/fixtures/schedules.json', import.meta.url),'utf8'));
for (const fixture of cases) test(`shared Go/TypeScript schedule contract: ${fixture.name}`, () => {
  assert.equal(isSchedule(fixture.value), fixture.valid);
});
test('every API operation resolves to the schema method and path', () => {
  for (const operation of operations) {
    if (!operation.action) continue;
    const [method, path] = bffRoute(operation.action, {view:operation.view ?? undefined});
    assert.equal(method,operation.method);
    assert.equal(path.split('?')[0],operation.path);
  }
});
