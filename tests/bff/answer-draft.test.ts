import test from "node:test";
import assert from "node:assert/strict";
import { weekDays, changeDraft } from "../../apps/web/lib/afetiria/answer-draft.ts";
test("day navigation spans a full week even across month and year boundaries", () => {
  assert.deepEqual(weekDays("2026-12-28"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
});
test("answers from different day panels survive navigation; reverting one day preserves the other day", () => {
  let draft = changeDraft({}, "2026-11-16 21:30", "○", "");
  draft = changeDraft(draft, "2026-11-17 21:30", "×", "△");
  draft = changeDraft(draft, "2026-11-16 21:30", "△", "");
  assert.equal(Object.keys(draft).length, 2);
  assert.equal(draft["2026-11-17 21:30"].before, "△");
  draft = changeDraft(draft, "2026-11-16 21:30", "", "");
  assert.equal(Object.keys(draft).length, 1);
  assert.equal(draft["2026-11-17 21:30"].answer, "×");
});
test("background updates do not replace the original before value of an edited answer", () => {
  let draft = changeDraft({}, "slot", "○", "");
  draft = changeDraft(draft, "slot", "×", "△");
  assert.equal(draft.slot.before, "");
  assert.equal(draft.slot.answer, "×");
});
