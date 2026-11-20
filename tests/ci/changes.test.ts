import test from 'node:test';
import assert from 'node:assert/strict';
import { affectedTargets } from '../../tools/ci/changes.ts';
const none = { web: false, bff: false, apps_script: false, tooling: false };
test('component changes run their own checks without unrelated product builds', () => {
  assert.deepEqual(affectedTargets(['apps/web/components/afetiria/answer.tsx']), {...none, web:true});
  assert.deepEqual(affectedTargets(['apps/bff/internal/domain/schedule.go']), {...none, bff:true});
  assert.deepEqual(affectedTargets(['apps/apps-script/src/main.ts']), {...none, apps_script:true});
});
test('shared schemas, dependencies and build infrastructure run all checks', () => {
  for (const path of ['packages/contracts/openapi.json','pnpm-lock.yaml','tools/build.ts','.github/workflows/ci.yml'])
    assert.deepEqual(affectedTargets([path]), {web:true,bff:true,apps_script:true,tooling:true});
});
test('automation and cross-language test helpers are included', () => {
  assert.equal(affectedTargets(['.github/scripts/release.ts']).tooling,true);
  assert.equal(affectedTargets(['tools/apps-script/deploy.ts']).apps_script,true);
  assert.deepEqual(affectedTargets(['tests/helpers/signature.ts']), {...none,web:true,bff:true,apps_script:true});
  assert.deepEqual(affectedTargets(['README.md']),none);
});
test('combined and removed paths retain all affected targets', () => {
  assert.deepEqual(affectedTargets(['apps/web/old.ts','apps/bff/old.go','tests/apps-script/old.test.ts']), {...none,web:true,bff:true,apps_script:true});
});

test('new uncategorized source and root container configuration cannot bypass CI', () => {
  assert.deepEqual(affectedTargets(['tests/new-feature.test.ts']),{web:true,bff:true,apps_script:true,tooling:true});
  assert.equal(affectedTargets(['.dockerignore']).bff,true);
});
