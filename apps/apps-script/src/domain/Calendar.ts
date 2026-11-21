function date_(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('日付の形式が不正です');
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  if (x.getFullYear() !== y || x.getMonth() !== m - 1 || x.getDate() !== d)
    throw Error('日付が不正です');
  return x;
}

function time_(s: string): number {
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(s)) throw Error('開始時刻は30分単位で指定してください');
  const [h, m] = s.split(':').map(Number);
  return (h * 60 + m) / 1440;
}

function slotKey_(d: string, t: string): string {
  return d + ' ' + t;
}

function afAddDays_(day: string, days: number): string {
  const value = new Date(day + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
