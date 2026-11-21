/** Repository adapter. Domain-facing methods never return Google service handles. */
function afSheetsScheduleRepository_(): AfScheduleRepository {
  return {
    read: afState_,
    answerContext: loadAnswerContext_,
    answerSettings() {
      const settings = sheet_(AF.members)
        .getRange(3, 1, AF.firstMemberRow + AF.memberCapacity - 3, 3)
        .getValues();
      return {
        weekId: settings[0][1] instanceof Date ? fmtDate_(settings[0][1]) : null,
        members: settings
          .slice(AF.firstMemberRow - 3, AF.firstMemberRow - 3 + AF.memberCapacity)
          .map(afSheetMember_),
      };
    },
    slots: listSlots_,
    currentWeek: weekId_,
    candidateWindow() {
      const settings = sheet_(AF.members);
      return {
        weekId: fmtDate_(settings.getRange('B3').getValue()),
        end: fmtDate_(settings.getRange('B4').getValue()),
      };
    },
    candidateAnswers: (row) => adminAnswers_()[row - AF.firstSlotRow],
    unusedCandidate(slots = listSlots_()) {
      const row = afFreeCandidateRow_(slots, AF.firstSlotRow, AF.lastSlotRow);
      return row > AF.lastSlotRow ? null : row;
    },
    writeAnswers: (memberIndex, slots, updates) =>
      afWriteMemberAnswers_(
        memberIndex + 3,
        new Map(slots.map((slot) => [slot.key, slot.row])),
        updates,
      ),
    memberRows() {
      const rows = sheet_(AF.members)
        .getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4)
        .getValues();
      const answers = adminAnswers_();
      return rows.map((row, index) => ({
        ...afSheetMember_(row, index),
        id: row[3],
        hasAnswers: answers.some((values) => values[index] !== ''),
      }));
    },
    insertMember(index, member) {
      sheet_(AF.members)
        .getRange(AF.firstMemberRow + index, 1, 1, 4)
        .setValues([[member.name, member.required, member.active, member.id]]);
    },
    setRequired(memberId, required) {
      sheet_(AF.members).getRange(afMemberRow_(memberId), 2).setValue(required);
    },
    insertCandidate: afInsertCandidate_,
    removeCandidate(row) {
      sheet_(AF.main).getRange(row, 1, 1, 2).clearContent();
    },
    confirm(slot) {
      const selected = new Date(slot.date + 'T' + slot.time + ':00+09:00');
      sheet_(AF.summary)
        .getRange('B3')
        .setValue(afSelectedOption_(selected) || selected);
      afFormatSelectedDate_();
    },
    refreshSelection: afRefreshSelectedOption_,
    flush: () => SpreadsheetApp.flush(),
  };
}
