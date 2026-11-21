function loadAnswerContext_(): AfAnswerContext {
  const settings = sheet_(AF.members)
    .getRange(3, 1, AF.firstMemberRow + AF.memberCapacity - 3, 3)
    .getValues();
  const start = settings[0][1];
  if (!(start instanceof Date)) {
    throw new Error('対象週の開始日が不正です');
  }

  const members = settings
    .slice(AF.firstMemberRow - 3, AF.firstMemberRow - 3 + AF.memberCapacity)
    .map(afSheetMember_)
    .filter((member) => member.name && member.active);

  const slotValues = sheet_(AF.main)
    .getRange(AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 2)
    .getValues();
  const slots = afSheetSlots_(slotValues);

  const grid = adminAnswers_();
  const answers: AfAnswerContext['answers'] = Object.create(null);
  for (const member of members) {
    answers[member.name] = Object.create(null);
    for (const slot of slots)
      answers[member.name][slot.key] = grid[slot.row - AF.firstSlotRow][member.index];
  }
  return {
    weekId: fmtDate_(start),
    members,
    slots,
    answers,
    minParticipants: Number(settings[2][1]) || AF.minParticipants,
  };
}
