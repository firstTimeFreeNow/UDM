/** Legacy RPC adapters translate calls and acquire the original lock once. */
function computeAnswerData_(): AfAnswerData {
  return afScheduleService_().computeAnswers();
}
function afGetAnswerData_(forceRefresh = false): AfAnswerData {
  return afScheduleService_().answers(forceRefresh);
}
function afSetAnswer_(payload: {
  weekId: string;
  member: string;
  slot: string;
  answer: AfModels['Answer'];
}): AfSheetSaveResult {
  if (!payload) throw new Error('回答データが不正です');
  return afSetAnswersBatch_({
    weekId: payload.weekId,
    member: payload.member,
    changes: [{ slot: payload.slot, answer: payload.answer }],
  });
}
function afSetAnswersBatch_(payload: AfSheetSaveRequest): AfSheetSaveResult {
  return afWithSheetLock_(
    () => afScheduleService_().saveSheet(payload),
    'ほかの保存処理が実行中です',
  );
}
function afGetCandidateData_() {
  return afScheduleService_().candidateData();
}
function afAddCandidate_(payload: Pick<AfModels['AddCandidateRequest'], 'date' | 'time'>) {
  // Preserve malformed-date validation before lock acquisition on the Sheet RPC path.
  if (!payload) throw new Error('日時を指定してください');
  date_(payload.date);
  time_(payload.time);
  return afWithSheetLock_(
    () => afScheduleService_().addCandidateSheet(payload),
    'ほかの処理が実行中です',
  );
}
function afRemoveCandidate_(key: string) {
  return afWithSheetLock_(
    () => afScheduleService_().removeCandidateSheet(key),
    'ほかの処理が実行中です',
  );
}

/**
 * スプレッドシートを開いた時点で先読みする。
 * 他ユーザーの編集中に差分が発生したときは短いTTLと無効化で対処する。
 * トリガー失敗時も手動の回答画面から通常取得できる。
 */
function afPreloadAnswers_() {
  const start = Date.now();
  try {
    afScheduleService_().preload();
    console.log('preloadAnswerData.serverMs=' + (Date.now() - start));
  } catch (error) {
    console.warn('プリロードに失敗: ' + error);
  }
}
