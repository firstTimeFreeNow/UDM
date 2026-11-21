/** Business rules operate on values only, independent of Sheets, locks and caches. */
function afJudgeSlot_(
  requiredPresent: boolean,
  count: number,
  min: number,
  max: number,
): AfModels['Slot']['judgment'] {
  if (!requiredPresent) return '必須未達';
  if (count < min) return '人数不足';
  if (count > max) return '人数調整';
  return '開催可能';
}

function afDecorateAnswers_(context: AfAnswerContext, max: number): Omit<AfAnswerData, 'metrics'> {
  const { weekId, members, slots, minParticipants } = context;
  const answers: AfAnswerData['answers'] = Object.create(null);
  for (const member of members) answers[member.name] = {};
  return {
    weekId,
    members: members.map((member) => ({ name: member.name, required: member.required })),
    slots: slots.map((slot) => {
      let count = 0;
      let requiredPresent = true;
      for (const member of members) {
        const answer = context.answers[member.name][slot.key];
        if (answer === '○' || answer === '△' || answer === '×')
          answers[member.name][slot.key] = answer;
        if (answer === '○') count++;
        else if (member.required) requiredPresent = false;
      }
      return {
        ...slot,
        count,
        judgment: afJudgeSlot_(requiredPresent, count, minParticipants, max),
      };
    }),
    answers,
  };
}

function afValidateWebAnswers_(
  payload: AfModels['SaveAnswersRequest'],
  state: AfModels['Schedule'],
): AfModels['Member'] {
  const member = state.members.find((item) => item.id === payload.memberId);
  afAssert_(
    member && Array.isArray(payload.changes) && payload.changes.length <= 54,
    'INVALID_REQUEST',
  );
  const keys = new Set<string>();
  for (const change of payload.changes) {
    afAssert_(
      change &&
        typeof change.slot === 'string' &&
        !keys.has(change.slot) &&
        state.slots.some((slot) => slot.key === change.slot) &&
        ['○', '△', '×', ''].includes(change.before) &&
        ['○', '△', '×', ''].includes(change.answer),
      'INVALID_REQUEST',
    );
    keys.add(change.slot);
    const current = state.answers[member.id][change.slot] || '';
    afAssert_(current === change.before || current === change.answer, 'CONFLICT');
  }
  return member;
}

function afValidateMemberName_(payload: AfModels['AddMemberRequest']): string {
  afAssert_(
    typeof payload.name === 'string' &&
      payload.name.trim().length > 0 &&
      payload.name.trim().length <= 80 &&
      !/^[=+\-@]/.test(payload.name.trim()) &&
      !/[\x00-\x1f]/.test(payload.name) &&
      typeof payload.required === 'boolean',
    'INVALID_REQUEST',
  );
  return payload.name.trim();
}

function afValidateCandidate_(
  payload: AfModels['AddCandidateRequest'],
  state: AfModels['Schedule'],
  end: string,
): void {
  afAssert_(
    typeof payload.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.date) &&
      typeof payload.time === 'string' &&
      /^([01]\d|2[0-3]):(00|30)$/.test(payload.time),
    'INVALID_REQUEST',
  );
  date_(payload.date);
  afAssert_(payload.date >= state.weekId && payload.date <= end, 'INVALID_REQUEST');
  afAssert_(
    !state.slots.some((slot) => slot.key === slotKey_(payload.date, payload.time)),
    'DUPLICATE',
  );
}

function afConfirmableSlot_(
  payload: AfModels['ConfirmRequest'],
  state: AfModels['Schedule'],
): AfModels['Slot'] {
  afAssert_(payload.before === state.confirmed, 'CONFLICT');
  const slot = state.slots.find((item) => item.key === payload.slot);
  afAssert_(slot && slot.judgment === '開催可能', 'INELIGIBLE');
  return slot;
}

function afAnswerUpdates_(
  changes: AfSheetSaveRequest['changes'],
  slotKeys: ReadonlySet<string>,
): Map<string, AfModels['Answer']> {
  const updates = new Map<string, AfModels['Answer']>();
  for (const change of changes) {
    if (!change || !slotKeys.has(change.slot))
      throw new Error('候補日時が変更されました。再読み込みしてください');
    if (!['○', '△', '×', ''].includes(change.answer))
      throw new Error('回答に不正な値が含まれています');
    if (updates.has(change.slot)) throw new Error('同一候補が重複しています');
    updates.set(change.slot, change.answer);
  }
  return updates;
}
