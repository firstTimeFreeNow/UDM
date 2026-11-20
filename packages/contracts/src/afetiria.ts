import type { Answer, Role, Member, Slot, Schedule, Change, History } from "./models.ts";
export type { Answer, Role, Member, Slot, Schedule, Change, History } from "./models.ts";

export const answers: Answer[] = ["○", "△", "×", ""];
export function isSchedule(value: unknown): value is Schedule {
  if (!value || typeof value !== "object") return false;
  const s = value as Schedule;
  return typeof s.weekId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.weekId) &&
    Array.isArray(s.members) && s.members.length <= 12 && s.members.every(m => m &&
      typeof m.id === "string" && /^m_[a-f0-9-]{36}$/.test(m.id) && typeof m.name === "string" && typeof m.required === "boolean") &&
    new Set(s.members.map(m => m.id)).size === s.members.length &&
    Array.isArray(s.slots) && s.slots.length <= 54 && s.slots.every(slot => slot &&
      typeof slot.key === "string" && typeof slot.date === "string" && typeof slot.time === "string" &&
      slot.key === `${slot.date} ${slot.time}` && /^\d{4}-\d{2}-\d{2}$/.test(slot.date) &&
      /^([01]\d|2[0-3]):(00|30)$/.test(slot.time) && Number.isInteger(slot.count) && slot.count >= 0 &&
      ["開催可能", "必須未達", "人数不足", "人数調整"].includes(slot.judgment)) &&
    new Set(s.slots.map(slot => slot.key)).size === s.slots.length &&
    (s.confirmed === null || (typeof s.confirmed === "string" && /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):(00|30)$/.test(s.confirmed))) &&
    Number.isInteger(s.minParticipants) && s.minParticipants >= 1 && s.minParticipants <= 8 && s.maxParticipants === 8 &&
    !!s.answers && typeof s.answers === "object" && s.members.every(m => {
      const entries = s.answers[m.id];
      return entries && typeof entries === "object" && !Array.isArray(entries) &&
        Object.entries(entries).every(([key, answer]) => s.slots.some(slot => slot.key === key) && answers.includes(answer));
    });
}
export function isHistory(value: unknown): value is History {
  const h = value as History;
  return !!h && Array.isArray(h.items) && h.items.length <= 12 && h.items.every(item => item &&
    typeof item.weekId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.weekId) && typeof item.status === "string" &&
    (item.confirmed === null || (typeof item.confirmed === "string" && /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):(00|30)$/.test(item.confirmed)))) &&
    (h.nextOffset === null || (Number.isSafeInteger(h.nextOffset) && h.nextOffset >= 0));
}
