function fmtDate_(date: Date): string {
  return Utilities.formatDate(date, AF.timezone, 'yyyy-MM-dd');
}

function fmtTime_(date: Date): string {
  return Utilities.formatDate(date, AF.timezone, 'HH:mm');
}

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

/**
 * 既存データの日時キーを文字列へ正規化する。
 * 旧実装が Google Sheets によって日付へ自動変換された場合にも対応する。
 */
function responseSlotKey_(value: unknown): string {
  if (value instanceof Date) {
    return Utilities.formatDate(value, AF.timezone, 'yyyy-MM-dd HH:mm');
  }
  return String(value || '').trim();
}

/** 既存データの週IDを文字列へ正規化する。 */
function responseWeekId_(value: unknown): string {
  if (value instanceof Date) {
    return Utilities.formatDate(value, AF.timezone, 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}
