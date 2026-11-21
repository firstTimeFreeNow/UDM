/** Accept both the original date value and the detailed scheduling dropdown label. */
function afSelectedDate_(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const match =
    /^(\d{4})\/(\d{2})\/(\d{2})\([日月火水木金土]\) ([01]\d|2[0-3]):(00|30)｜○\d{1,2}人・△\d{1,2}人｜必須メンバー[○△×]$/.exec(
      value,
    );
  if (!match) return value;
  const day = match[1] + '-' + match[2] + '-' + match[3];
  const clock = match[4] + ':' + match[5];
  const selected = new Date(day + 'T' + clock + ':00+09:00');
  // Do not silently normalize an impossible date into another month.
  return !isNaN(selected.getTime()) && fmtDate_(selected) === day && fmtTime_(selected) === clock
    ? selected
    : value;
}

function afSelectedOption_(selected: Date): string | undefined {
  return sheet_(AF.summary)
    .getRange('J9:J62')
    .getValues()
    .map(function (row) {
      return row[0];
    })
    .find(function (value) {
      const candidate = afSelectedDate_(value);
      return (
        typeof value === 'string' &&
        candidate instanceof Date &&
        candidate.getTime() === selected.getTime()
      );
    });
}

/** Caller holds the script lock. Refresh counts without changing the selected date. */
function afRefreshSelectedOption_() {
  const cell = sheet_(AF.summary).getRange('B3');
  const value = cell.getValue();
  const selected = afSelectedDate_(value);
  if (typeof value !== 'string' || !(selected instanceof Date)) return;
  SpreadsheetApp.flush();
  const option = afSelectedOption_(selected);
  if (option && option !== value) cell.setValue(option);
}

/** Keep the dropdown label intact, while showing only the confirmed date in B3. */
function afFormatSelectedDate_() {
  const cell = sheet_(AF.summary).getRange('B3');
  const value = cell.getValue();
  const selected = afSelectedDate_(value);
  const base = 'yyyy/mm/dd(ddd) hh:mm';
  let pattern = base;
  if (typeof value === 'string' && selected instanceof Date) {
    const day = fmtDate_(selected);
    const weekday = '日月火水木金土'[new Date(day + 'T00:00:00Z').getUTCDay()];
    const display = day.replace(/-/g, '/') + '(' + weekday + ') ' + fmtTime_(selected);
    // The fourth section is the text display. Numeric dates keep their original format.
    pattern = base + ';' + base + ';' + base + ';"' + display + '"';
  }
  if (cell.getNumberFormat() !== pattern) cell.setNumberFormat(pattern);
}
