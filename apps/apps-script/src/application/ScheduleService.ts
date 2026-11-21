/** Application Service: coordinates a use case through ports; owns no Sheet ranges. */
function afCreateScheduleService_(dependencies: {
  repository: AfScheduleRepository;
  cache: AfAnswerCache;
  week: AfWeekStatus;
  clock: AfClock;
  ids: AfIds;
  effects: AfScheduleEffects;
  limits: { maxParticipants: number };
}) {
  const { repository: repo, cache, week, clock, ids, effects, limits } = dependencies;
  function checkSheetWeek() {
    if (week.pending()) throw new Error('週の更新中です');
  }
  function saveSheet(payload: AfSheetSaveRequest): AfSheetSaveResult {
    const startedAt = clock.now();
    checkSheetWeek();
    if (!payload || !Array.isArray(payload.changes)) throw new Error('回答データが不正です');
    const settings = repo.answerSettings();
    if (!settings.weekId || payload.weekId !== settings.weekId)
      throw new Error('対象週が切り替わりました。再読み込みしてください');
    const member = settings.members.find((item) => item.name === payload.member && item.active);
    if (!member) throw new Error('メンバーが見つかりません');
    const slots = repo.slots();
    const updates = afAnswerUpdates_(payload.changes, new Set(slots.map((slot) => slot.key)));
    if (!updates.size) return { success: true, savedCount: 0, serverMs: clock.now() - startedAt };
    const savedCount = repo.writeAnswers(member.index, slots, updates);
    if (savedCount > 0) {
      cache.invalidate();
      repo.refreshSelection();
    }
    return { success: true, savedCount, serverMs: clock.now() - startedAt };
  }
  function commit() {
    repo.flush();
    repo.refreshSelection();
    cache.invalidate();
    return repo.read();
  }
  function candidateData() {
    return { weekId: repo.currentWeek(), slots: repo.slots() };
  }
  function computeAnswers(): AfAnswerData {
    const start = clock.now();
    return {
      ...afDecorateAnswers_(repo.answerContext(), limits.maxParticipants),
      metrics: { serverMs: clock.now() - start },
    };
  }
  return {
    read: () => repo.read(),
    pending: () => week.pending(),
    computeAnswers,
    answers(forceRefresh = false): AfAnswerData {
      if (!forceRefresh) {
        const cached = cache.get();
        if (cached) return cached;
      }
      const data = computeAnswers();
      cache.put(data);
      return data;
    },
    preload() {
      if (!cache.get()) cache.put(computeAnswers());
    },
    saveSheet,
    save(
      payload: AfModels['SaveAnswersRequest'],
      state: AfModels['Schedule'],
    ): AfModels['SaveResult'] {
      const member = afValidateWebAnswers_(payload, state);
      const result = saveSheet({
        weekId: state.weekId,
        member: member.name,
        changes: payload.changes,
      });
      repo.flush();
      return { saved: true, savedCount: result.savedCount, state: repo.read() };
    },
    addMember(payload: AfModels['AddMemberRequest']) {
      const name = afValidateMemberName_(payload);
      const rows = repo.memberRows();
      afAssert_(!rows.some((row) => row.name === name), 'DUPLICATE');
      const index = rows.findIndex((row) => !row.name && !row.id && !row.hasAnswers);
      afAssert_(index >= 0, 'CAPACITY');
      repo.insertMember(index, {
        name,
        required: payload.required,
        active: true,
        id: 'm_' + ids.uuid(),
        index,
      });
      return commit();
    },
    required(payload: AfModels['RequiredMemberRequest'], state: AfModels['Schedule']) {
      const member = state.members.find((item) => item.id === payload.memberId);
      afAssert_(
        member && typeof payload.required === 'boolean' && typeof payload.before === 'boolean',
        'INVALID_REQUEST',
      );
      afAssert_(
        member.required === payload.before || member.required === payload.required,
        'CONFLICT',
      );
      repo.setRequired(member.id, payload.required);
      return commit();
    },
    candidateData,
    addCandidateSheet(payload: Pick<AfModels['AddCandidateRequest'], 'date' | 'time'>) {
      if (!payload) throw new Error('日時を指定してください');
      date_(payload.date);
      time_(payload.time);
      checkSheetWeek();
      const window = repo.candidateWindow();
      if (payload.date < window.weekId || payload.date > window.end)
        throw new Error('対象週内の日付を指定してください');
      const slots = repo.slots();
      if (slots.some((slot) => slot.key === slotKey_(payload.date, payload.time)))
        throw new Error('同じ日時が登録済みです');
      const row = repo.unusedCandidate(slots);
      if (row === null) throw new Error('候補上限に達しました');
      repo.insertCandidate(row, payload.date, payload.time);
      repo.flush();
      cache.invalidate();
      return candidateData();
    },
    removeCandidateSheet(key: string) {
      checkSheetWeek();
      const slot = repo.slots().find((item) => item.key === key);
      if (!slot) throw new Error('候補日時が見つかりません');
      if (
        repo.candidateAnswers(slot.row).some((value) => ['○', '△', '×'].includes(value as string))
      )
        throw new Error('回答済みの候補は削除できません。先に回答を確認してください');
      repo.removeCandidate(slot.row);
      repo.flush();
      cache.invalidate();
      return candidateData();
    },
    addCandidate(payload: AfModels['AddCandidateRequest'], state: AfModels['Schedule']) {
      afValidateCandidate_(payload, state, afAddDays_(state.weekId, 6));
      const row = repo.unusedCandidate();
      afAssert_(row !== null, 'CAPACITY');
      afAssert_(
        repo.candidateAnswers(row).every((answer) => answer === ''),
        'HAS_ANSWERS',
      );
      repo.insertCandidate(row, payload.date, payload.time);
      return commit();
    },
    removeCandidate(payload: AfModels['RemoveCandidateRequest'], state: AfModels['Schedule']) {
      const slot = repo.slots().find((item) => item.key === payload.slot);
      afAssert_(slot, 'INVALID_REQUEST');
      afAssert_(state.confirmed !== payload.slot, 'INELIGIBLE');
      afAssert_(
        repo.candidateAnswers(slot.row).every((answer) => answer === ''),
        'HAS_ANSWERS',
      );
      repo.removeCandidate(slot.row);
      return commit();
    },
    confirm(payload: AfModels['ConfirmRequest'], state: AfModels['Schedule']) {
      repo.confirm(afConfirmableSlot_(payload, state));
      repo.flush();
      effects.confirmed();
      return commit();
    },
  };
}
