/**
 * 単件回答は、一括保存と同じ処理を使用する。
 * 文字列形式・重複防止のルールを一箇所にまとめる。
 */
function afSetAnswer_(payload: {
  weekId: string;
  member: string;
  slot: string;
  answer: AfModels['Answer'];
}): AfSheetSaveResult {
  if (!payload) {
    throw new Error('回答データが不正です');
  }
  return setAnswersBatch({
    weekId: payload.weekId,
    member: payload.member,
    changes: [{ slot: payload.slot, answer: payload.answer }],
  });
}

/**
 * 回答の一括保存。
 * payload = {
 *   weekId: '2026-11-16',
 *   member: 'DemoMember',
 *   changes: [{slot: '2026-11-16 20:30', answer: '×'}]
 * };
 *
 * 変更された候補だけを更新し、ほかの回答を保持する。
 * 日時キーと週IDはプレーンテキストとして書き込む。
 */
/**
 * 回答をまとめて保存する。
 * 変更した候補が少数の場合は連続行だけを書き、変更が分散して多い場合は
 * 1列を一括更新する。ほかのメンバー列は変更しない。
 *
 * 成功時は保存結果のみ返却する。ダイアログ側で再取得せず閉じる。
 */
function afSetAnswersBatch_(payload: AfSheetSaveRequest): AfSheetSaveResult {
  return afWithSheetLock_(() => {
    return setAnswersBatchUnlocked_(payload);
  }, 'ほかの保存処理が実行中です');
}

function setAnswersBatchUnlocked_(payload: AfSheetSaveRequest): AfSheetSaveResult {
  const startedAt = Date.now();
  if (rolloverProperties_().getProperty('pendingRolloverWeek')) throw new Error('週の更新中です');
  if (!payload || !Array.isArray(payload.changes)) throw new Error('回答データが不正です');
  const settings = sheet_(AF.members)
    .getRange(3, 1, AF.firstMemberRow + AF.memberCapacity - 3, 3)
    .getValues();
  const weekStart = settings[0][1];
  if (!(weekStart instanceof Date) || payload.weekId !== fmtDate_(weekStart)) {
    throw new Error('対象週が切り替わりました。再読み込みしてください');
  }
  const memberIndex = settings
    .slice(AF.firstMemberRow - 3, AF.firstMemberRow - 3 + AF.memberCapacity)
    .findIndex((row) => String(row[0] || '').trim() === payload.member && row[2] === true);
  if (memberIndex < 0) throw new Error('メンバーが見つかりません');
  const slotRows = new Map(listSlots_().map((slot) => [slot.key, slot.row]));
  const updates = afAnswerUpdates_(payload.changes, slotRows);
  if (updates.size === 0) return { success: true, savedCount: 0, serverMs: Date.now() - startedAt };
  const savedCount = afWriteMemberAnswers_(memberIndex + 3, slotRows, updates);
  if (savedCount > 0) {
    invalidateAnswerCache_();
    afRefreshSelectedOption_();
  }
  const durationMs = Date.now() - startedAt;
  console.log('setAnswersBatch.serverMs=' + durationMs + ', changed=' + savedCount);
  return { success: true, savedCount, serverMs: durationMs };
}

function afAnswerUpdates_(
  changes: AfSheetSaveRequest['changes'],
  slotRows: Map<string, number>,
): Map<string, AfModels['Answer']> {
  const updates = new Map<string, AfModels['Answer']>();
  for (const change of changes) {
    if (!change || !slotRows.has(change.slot))
      throw new Error('候補日時が変更されました。再読み込みしてください');
    if (!['○', '△', '×', ''].includes(change.answer))
      throw new Error('回答に不正な値が含まれています');
    if (updates.has(change.slot)) throw new Error('同一候補が重複しています');
    updates.set(change.slot, change.answer);
  }
  return updates;
}

function afWriteMemberAnswers_(
  column: number,
  slotRows: Map<string, number>,
  updates: Map<string, AfModels['Answer']>,
): number {
  const sheet = sheet_(AF.admin);
  const range = sheet.getRange(5, column, AF.lastSlotRow - AF.firstSlotRow + 1, 1);
  const values = range.getValues();
  const changedIndexes: number[] = [];
  for (const [key, answer] of updates) {
    const index = Number(slotRows.get(key)) - AF.firstSlotRow;
    if (values[index][0] !== answer) {
      values[index][0] = answer;
      changedIndexes.push(index);
    }
  }
  if (changedIndexes.length) {
    changedIndexes.sort((a, b) => a - b);
    const runs = afAnswerRowRuns_(changedIndexes);
    // Keep sparse edits small; batch the column when many separate writes cost more.
    if (runs.length > 3 || changedIndexes.length > 14) range.setValues(values);
    else
      for (const [start, end] of runs) {
        sheet
          .getRange(5 + start, column, end - start + 1, 1)
          .setValues(values.slice(start, end + 1));
      }
  }
  return changedIndexes.length;
}

function afAnswerRowRuns_(indexes: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  let first = indexes[0];
  let last = first;
  for (const index of indexes.slice(1)) {
    if (index === last + 1) last = index;
    else {
      runs.push([first, last]);
      first = index;
      last = index;
    }
  }
  runs.push([first, last]);
  return runs;
}

function afSave_(
  payload: AfModels['SaveAnswersRequest'],
  state: AfModels['Schedule'],
): AfModels['SaveResult'] {
  const member = state.members.find(function (item) {
    return item.id === payload.memberId;
  });
  afAssert_(
    member && Array.isArray(payload.changes) && payload.changes.length <= 54,
    'INVALID_REQUEST',
  );
  const keys = new Set();
  payload.changes.forEach(function (change) {
    afAssert_(
      change &&
        typeof change.slot === 'string' &&
        !keys.has(change.slot) &&
        state.slots.some(function (slot) {
          return slot.key === change.slot;
        }) &&
        ['○', '△', '×', ''].indexOf(change.before) >= 0 &&
        ['○', '△', '×', ''].indexOf(change.answer) >= 0,
      'INVALID_REQUEST',
    );
    keys.add(change.slot);
    const current = state.answers[member.id][change.slot] || '';
    // Repeated identical saves are harmless; a later different edit conflicts.
    afAssert_(current === change.before || current === change.answer, 'CONFLICT');
  });
  const result = setAnswersBatchUnlocked_({
    weekId: state.weekId,
    member: member.name,
    changes: payload.changes,
  });
  SpreadsheetApp.flush();
  return { saved: true, savedCount: result.savedCount, state: afState_() };
}
