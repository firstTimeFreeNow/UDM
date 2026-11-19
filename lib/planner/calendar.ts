export function japanToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function completionDate(start: string, weeks: number): Date {
  const date = new Date(start + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date;
}
export function calendarDate(start: string, weeks: number): string {
  const date = completionDate(start, weeks);
  return Number.isFinite(date.getTime())
    ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
    : "";
}
export function calendarDuration(start: string, weeks: number): string {
  if (weeks === 0) return "現在の資金で対応可能";
  const months = Math.round((weeks * 7) / 30.436875);
  if (months < 1) return `約${weeks * 7}日`;
  const years = Math.floor(months / 12),
    rest = months % 12;
  return `約${years ? `${years}年` : ""}${rest ? `${rest}か月` : ""}`;
}
