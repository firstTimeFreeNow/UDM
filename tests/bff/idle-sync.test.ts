import test from "node:test";
import assert from "node:assert/strict";
import { createIdleSync, SYNC_IDLE_MS } from "../../apps/web/lib/afetiria/idle-sync.ts";

test("sync stops at thirty idle minutes, even if the browser delayed its timer", () => {
  let now = 0;
  const idle = createIdleSync(() => now);
  now = SYNC_IDLE_MS - 1;
  assert.equal(idle.isPaused(), false);
  now += 1;
  assert.equal(idle.isPaused(), true);
  now += SYNC_IDLE_MS;
  idle.activity();
  assert.equal(idle.isPaused(), true);
});

test("activity extends the deadline, but cannot restart sync after the deadline", () => {
  let now = 0;
  const idle = createIdleSync(() => now);
  now = SYNC_IDLE_MS - 1;
  idle.activity();
  assert.equal(idle.remaining(), SYNC_IDLE_MS);
  now += SYNC_IDLE_MS - 1;
  assert.equal(idle.isPaused(), false);
  now += 1;
  idle.activity();
  assert.equal(idle.isPaused(), true);
  // A full page reload creates a new controller.
  assert.equal(createIdleSync(() => now).isPaused(), false);
});
