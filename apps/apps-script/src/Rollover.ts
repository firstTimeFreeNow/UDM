function afInstallRolloverTrigger_() {
  const existing = ScriptApp.getProjectTriggers().filter(
    (t) => t.getHandlerFunction() === 'checkScheduleRollover',
  );
  existing.forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkScheduleRollover').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('5分間隔の自動更新チェックを設定しました');
}

/**
 * 開催日時の選択から確定を判断する。
 * 「開催日程」B3は日時または人数付きの選択肢を保存する単一セル。
 * 人数付きの値は日時へ変換し、表示は従来どおり日時のみとする。
 * 別の開催状態セルは使用しない。
 *
 * 対象日時から2時間経過した場合に履歴を記録し、
 * 対象週を翌週へ繰り越す。
 */
function afCheckScheduleRollover_() {
  const lock = LockService.getScriptLock();
  if (!lock || !lock.tryLock(15000)) {
    return;
  }
  try {
    afCheckPushSafe_();
    afRefreshSelectedOption_();
    const settings = sheet_(AF.members);
    const summary = sheet_(AF.summary);
    const history = sheet_(AF.history);
    const props = rolloverProperties_();
    const week = weekId_();
    const pending = props.getProperty('pendingRolloverWeek');
    const selected = afSelectedDate_(summary.getRange('B3').getValue());
    if (!afRolloverIsDue_(selected, week, pending)) return;
    const archiveWeek = pending || week;
    const existingHistory = afEnsureWeekArchive_({
      settings,
      history,
      props,
      week,
      pending,
      selected,
      archiveWeek,
    });
    props.setProperty('pendingRolloverWeek', archiveWeek);
    const previous = date_(archiveWeek);
    const nextWeekStart = new Date(
      previous.getFullYear(),
      previous.getMonth(),
      previous.getDate() + 7,
    );
    const nextWeekId = fmtDate_(nextWeekStart);
    // 前回の処理が完了済みなら、二重繰り越しを防いで終了する。
    if (weekId_() === nextWeekId && summary.getRange('B3').isBlank()) {
      props.deleteProperty('pendingRolloverWeek');
      return;
    }
    const snapshot: AfRolloverSnapshot = JSON.parse(existingHistory[6]);
    afAdvanceCandidateDates_(snapshot.candidates);
    // 履歴保存後、翌週の回答を全件未回答に戻す。
    sheet_(AF.admin)
      .getRange(5, 3, AF.lastSlotRow - AF.firstSlotRow + 1, AF.memberCapacity)
      .clearContent();
    settings.getRange('B3').setValue(nextWeekStart);
    summary.getRange('B3').clearContent();
    SpreadsheetApp.flush();
    props.deleteProperty('pendingRolloverWeek');
    invalidateAnswerCache_();
  } finally {
    lock.releaseLock();
  }
}

function afRolloverIsDue_(selected: unknown, week: string, pending: string | null): boolean {
  if (pending) return true;
  if (!(selected instanceof Date)) {
    const deadline = date_(week);
    deadline.setDate(deadline.getDate() + 7);
    if (selected !== '' || Date.now() < deadline.getTime()) return false;
  }
  if (selected instanceof Date) {
    const selectedKey = slotKey_(fmtDate_(selected), fmtTime_(selected));
    if (!listSlots_().some((slot) => slot.key === selectedKey)) return false;
    if (Date.now() < selected.getTime() + AF.rolloverDelayMinutes * 60 * 1000) return false;
  }
  return true;
}

function afEnsureWeekArchive_(context: {
  settings: GoogleAppsScript.Spreadsheet.Sheet;
  history: GoogleAppsScript.Spreadsheet.Sheet;
  props: GoogleAppsScript.Properties.Properties;
  week: string;
  pending: string | null;
  selected: unknown;
  archiveWeek: string;
}): any[] {
  const { settings, history, props, week, pending, selected, archiveWeek } = context;
  const savedHistory =
    history.getLastRow() > 3 ? history.getRange(4, 1, history.getLastRow() - 3, 8).getValues() : [];
  let existingHistory = savedHistory.find((row) => responseWeekId_(row[0]) === archiveWeek);
  if (!existingHistory) {
    if (pending && week !== archiveWeek) {
      throw new Error('未完了処理の履歴が見つかりません');
    }
    const snapshot: AfRolloverSnapshot = {
      weekId: week,
      candidates: listSlots_(),
      members: settings.getRange(AF.firstMemberRow, 1, AF.memberCapacity, 3).getValues(),
      responses: snapshotAdminResponses_(),
      confirmedDateTime:
        selected instanceof Date
          ? Utilities.formatDate(selected, AF.timezone, 'yyyy-MM-dd HH:mm')
          : null,
    };
    props.setProperty('pendingRolloverWeek', archiveWeek);
    history.appendRow([
      week,
      settings.getRange('B3').getValue(),
      settings.getRange('B4').getValue(),
      selected,
      selected instanceof Date ? '確定' : '未開催',
      new Date(),
      JSON.stringify(snapshot),
      'ARCHIVED',
    ]);
    SpreadsheetApp.flush();
    existingHistory = [week, null, null, null, null, null, JSON.stringify(snapshot), 'ARCHIVED'];
  }
  return existingHistory!;
}

function afAdvanceCandidateDates_(candidates: AfSheetSlot[]): void {
  const mainSheet = sheet_(AF.main);
  const dateRange = mainSheet.getRange(AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 1);
  const formulas = dateRange.getFormulas();
  const dates = dateRange.getValues();
  const nextDates = new Map();

  for (const slot of candidates) {
    const nextDate = date_(slot.date);
    nextDate.setDate(nextDate.getDate() + 7);
    nextDates.set(slot.row, nextDate);
  }

  // 数式で週開始日を参照する候補は数式のまま保持する。
  // 手動登録された日付だけを7日進め、全行を一括で書き込む。
  const nextValues = dates.map((row, index) => {
    const rowNumber = AF.firstSlotRow + index;
    if (formulas[index][0]) {
      return [formulas[index][0]];
    }
    return [nextDates.get(rowNumber) || row[0]];
  });
  dateRange.setValues(nextValues);
}
