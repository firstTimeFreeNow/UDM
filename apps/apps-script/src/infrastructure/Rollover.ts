function afInstallRolloverTrigger_() {
  const existing = ScriptApp.getProjectTriggers().filter(
    (t) => t.getHandlerFunction() === 'checkScheduleRollover',
  );
  existing.forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkScheduleRollover').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('5分間隔の自動更新チェックを設定しました');
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

/** Storage adapter for the existing recoverable archive protocol. */
function afSheetsRolloverRepository_(): AfRolloverRepository {
  return {
    state() {
      const week = weekId_();
      const selected = afSelectedDate_(sheet_(AF.summary).getRange('B3').getValue());
      const confirmed = selected instanceof Date;
      return {
        week,
        pending: rolloverProperties_().getProperty('pendingRolloverWeek'),
        selection: confirmed ? 'confirmed' : selected === '' ? 'empty' : 'invalid',
        selected,
        selectedAt: confirmed ? selected.getTime() : null,
        deadline: date_(afAddDays_(week, 7)).getTime(),
        validCandidate:
          confirmed &&
          listSlots_().some(
            (slot) => slot.key === slotKey_(fmtDate_(selected), fmtTime_(selected)),
          ),
      };
    },
    archive(archiveWeek) {
      const history = sheet_(AF.history);
      const rows =
        history.getLastRow() > 3
          ? history.getRange(4, 1, history.getLastRow() - 3, 8).getValues()
          : [];
      const row = rows.find((value) => responseWeekId_(value[0]) === archiveWeek);
      return row ? { snapshot: () => JSON.parse(row[6]) } : null;
    },
    snapshot(state) {
      return {
        weekId: state.week,
        candidates: listSlots_(),
        members: sheet_(AF.members)
          .getRange(AF.firstMemberRow, 1, AF.memberCapacity, 3)
          .getValues(),
        responses: snapshotAdminResponses_(),
        confirmedDateTime:
          state.selected instanceof Date
            ? Utilities.formatDate(state.selected, AF.timezone, 'yyyy-MM-dd HH:mm')
            : null,
      };
    },
    mark(week) {
      rolloverProperties_().setProperty('pendingRolloverWeek', week);
    },
    append(state, snapshot) {
      const settings = sheet_(AF.members);
      sheet_(AF.history).appendRow([
        state.week,
        settings.getRange('B3').getValue(),
        settings.getRange('B4').getValue(),
        state.selected,
        state.selection === 'confirmed' ? '確定' : '未開催',
        new Date(),
        JSON.stringify(snapshot),
        'ARCHIVED',
      ]);
      SpreadsheetApp.flush();
      return { snapshot: () => snapshot };
    },
    advance(candidates, nextWeek) {
      afAdvanceCandidateDates_(candidates);
      sheet_(AF.admin)
        .getRange(5, 3, AF.lastSlotRow - AF.firstSlotRow + 1, AF.memberCapacity)
        .clearContent();
      sheet_(AF.members).getRange('B3').setValue(date_(nextWeek));
      sheet_(AF.summary).getRange('B3').clearContent();
      SpreadsheetApp.flush();
    },
    finish() {
      rolloverProperties_().deleteProperty('pendingRolloverWeek');
    },
  };
}
