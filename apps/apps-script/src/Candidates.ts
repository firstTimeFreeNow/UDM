function afGetCandidateData_(): { weekId: string; slots: AfSheetSlot[] } {
  return { weekId: weekId_(), slots: listSlots_() };
}

function afAddCandidate_(payload: Pick<AfModels['AddCandidateRequest'], 'date' | 'time'>) {
  if (!payload) throw Error('日時を指定してください');
  const d = date_(payload.date),
    t = time_(payload.time);
  return afWithSheetLock_(() => {
    if (rolloverProperties_().getProperty('pendingRolloverWeek')) throw new Error('週の更新中です');
    const settings = sheet_(AF.members),
      start = fmtDate_(settings.getRange('B3').getValue()),
      end = fmtDate_(settings.getRange('B4').getValue());
    if (payload.date < start || payload.date > end) throw Error('対象週内の日付を指定してください');
    const key = slotKey_(payload.date, payload.time);
    const slots = listSlots_();
    if (slots.some((s) => s.key === key)) throw Error('同じ日時が登録済みです');
    const used = new Set(slots.map((s) => s.row));
    let row = AF.firstSlotRow;
    while (used.has(row) && row <= AF.lastSlotRow) row++;
    if (row > AF.lastSlotRow) throw Error('候補上限に達しました');
    sheet_(AF.main)
      .getRange(row, 1, 1, 2)
      .setValues([[d, t]]);
    sheet_(AF.main).getRange(row, 1).setNumberFormat('m/d(ddd)');
    sheet_(AF.main).getRange(row, 2).setNumberFormat('hh:mm');
    SpreadsheetApp.flush();
    invalidateAnswerCache_();
    return getCandidateData();
  }, 'ほかの処理が実行中です');
}

function afRemoveCandidate_(key: string) {
  return afWithSheetLock_(() => {
    if (rolloverProperties_().getProperty('pendingRolloverWeek')) throw new Error('週の更新中です');
    const slot = listSlots_().find((s) => s.key === key);
    if (!slot) throw Error('候補日時が見つかりません');
    const answers = adminAnswers_()[slot.row - AF.firstSlotRow];
    if (answers.some((value) => ['○', '△', '×'].includes(value)))
      throw Error('回答済みの候補は削除できません。先に回答を確認してください');
    sheet_(AF.main).getRange(slot.row, 1, 1, 2).clearContent();
    SpreadsheetApp.flush();
    invalidateAnswerCache_();
    return getCandidateData();
  }, 'ほかの処理が実行中です');
}

function afAddSlot_(payload: AfModels['AddCandidateRequest'], state: AfModels['Schedule']) {
  afAssert_(
    typeof payload.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.date) &&
      typeof payload.time === 'string' &&
      /^([01]\d|2[0-3]):(00|30)$/.test(payload.time),
    'INVALID_REQUEST',
  );
  const day = date_(payload.date);
  const end = date_(state.weekId);
  end.setDate(end.getDate() + 6);
  afAssert_(payload.date >= state.weekId && payload.date <= fmtDate_(end), 'INVALID_REQUEST');
  const key = slotKey_(payload.date, payload.time);
  afAssert_(
    !state.slots.some(function (slot) {
      return slot.key === key;
    }),
    'DUPLICATE',
  );
  const used = new Set(
    listSlots_().map(function (slot) {
      return slot.row;
    }),
  );
  let row = AF.firstSlotRow;
  while (used.has(row) && row <= AF.lastSlotRow) row++;
  afAssert_(row <= AF.lastSlotRow, 'CAPACITY');
  // Empty date cells must not silently reattach orphaned answers.
  afAssert_(
    adminAnswers_()[row - AF.firstSlotRow].every(function (answer) {
      return answer === '';
    }),
    'HAS_ANSWERS',
  );
  sheet_(AF.main)
    .getRange(row, 1, 1, 2)
    .setValues([[day, time_(payload.time)]]);
  sheet_(AF.main).getRange(row, 1).setNumberFormat('m/d(ddd)');
  sheet_(AF.main).getRange(row, 2).setNumberFormat('hh:mm');
}

function afRemoveSlot_(payload: AfModels['RemoveCandidateRequest'], state: AfModels['Schedule']) {
  const slot = listSlots_().find(function (item) {
    return item.key === payload.slot;
  });
  afAssert_(slot, 'INVALID_REQUEST');
  afAssert_(state.confirmed !== payload.slot, 'INELIGIBLE');
  afAssert_(
    adminAnswers_()[slot.row - AF.firstSlotRow].every(function (answer) {
      return answer === '';
    }),
    'HAS_ANSWERS',
  );
  sheet_(AF.main).getRange(slot.row, 1, 1, 2).clearContent();
}
