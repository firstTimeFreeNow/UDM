function afState_(): AfModels['Schedule'] {
  afAssert_(AF.spreadsheetId, 'CONFIG_REQUIRED');
  const data = afDecorateAnswers_(loadAnswerContext_(), AF.maxParticipants); // Always read the source of truth.
  const rows = sheet_(AF.members).getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4).getValues();
  const members = rows
    .map(function (row, index) {
      return { ...afSheetMember_(row, index), id: row[3] };
    })
    .filter(function (member) {
      return member.name && member.active;
    });
  const ids = new Set();
  const names = new Set();
  members.forEach(function (member) {
    afAssert_(
      typeof member.id === 'string' &&
        /^m_[a-f0-9-]{36}$/.test(member.id) &&
        !ids.has(member.id) &&
        !names.has(member.name),
      'CONFIG_REQUIRED',
    );
    ids.add(member.id);
    names.add(member.name);
  });
  const selected = afSelectedDate_(sheet_(AF.summary).getRange('B3').getValue());
  const confirmed =
    selected instanceof Date ? slotKey_(fmtDate_(selected), fmtTime_(selected)) : null;
  const answers: AfModels['Schedule']['answers'] = {};
  members.forEach(function (member) {
    answers[member.id] = data.answers[member.name] || {};
  });
  const min = Number(sheet_(AF.members).getRange('B5').getValue());
  afAssert_(Number.isInteger(min) && min >= 1 && min <= AF.maxParticipants, 'CONFIG_REQUIRED');
  return {
    weekId: data.weekId,
    members: members.map(function (member) {
      return { id: member.id, name: member.name, required: member.required };
    }),
    slots: data.slots.map(function (slot) {
      return {
        key: slot.key,
        date: slot.date,
        time: slot.time,
        count: slot.count,
        judgment: slot.judgment,
      };
    }),
    answers: answers,
    confirmed: confirmed,
    minParticipants: min,
    maxParticipants: AF.maxParticipants,
  };
}
