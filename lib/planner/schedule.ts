import { japanToday } from "./calendar.ts";
import type { Operation, ScheduleSettings } from "./types.ts";
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function weekForDate(start: string, date: string): number {
  return Math.max(
    0,
    Math.ceil(
      (Date.parse(date + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
        (7 * 86400000),
    ),
  );
}
export function validSchedule(value: unknown): value is ScheduleSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as ScheduleSettings;
  return (
    Array.isArray(v.order) &&
    v.order.length <= 32 &&
    new Set(v.order).size === v.order.length &&
    v.order.every(
      (s) => typeof s === "string" && s.length > 0 && s.length <= 80,
    ) &&
    !!v.startDates &&
    typeof v.startDates === "object" &&
    !Array.isArray(v.startDates) &&
    Object.entries(v.startDates).length <= 32 &&
    Object.entries(v.startDates).every(
      ([slot, date]) => slot.length > 0 && slot.length <= 80 && validDate(date),
    )
  );
}
export function arrangeOperations(
  operations: Operation[],
  settings: ScheduleSettings | undefined,
  today = japanToday(),
): Operation[] {
  if (!settings) return operations;
  const slots = [...new Set(operations.map((op) => op.slot))];
  const rank = (slot: string) => {
    const n = settings.order.indexOf(slot);
    return n < 0 ? settings.order.length + slots.indexOf(slot) : n;
  };
  const earliest = (slot: string) =>
    settings.startDates[slot]
      ? weekForDate(today, settings.startDates[slot])
      : 0;
  return [...slots]
    .sort((a, b) => earliest(a) - earliest(b) || rank(a) - rank(b))
    .flatMap((slot) =>
      operations
        .filter((op) => op.slot === slot)
        .map((op) => ({ ...op, notBeforeWeek: earliest(slot) })),
    );
}
