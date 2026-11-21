function fmtDate_(date: Date): string {
  return Utilities.formatDate(date, AF.timezone, 'yyyy-MM-dd');
}

function fmtTime_(date: Date): string {
  return Utilities.formatDate(date, AF.timezone, 'HH:mm');
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
