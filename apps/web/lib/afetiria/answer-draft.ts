import type { Answer, Change } from "@udm/contracts/afetiria";
export function weekDays(weekId: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekId + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
export function changeDraft(
  previous: Record<string, Change>,
  slot: string,
  answer: Answer,
  current: Answer,
) {
  const before = previous[slot]?.before ?? current;
  const next = { ...previous };
  if (before === answer) delete next[slot];
  else next[slot] = { slot, before, answer };
  return next;
}
