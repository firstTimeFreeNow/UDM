/** Run once from the editor as the sheet owner, before enabling Web access. */
function afInitializeWebApp_() {
  afWithLock_(function () {
    afAssert_(!rolloverProperties_().getProperty('pendingRolloverWeek'), 'BUSY');
    const settings = sheet_(AF.members);
    const header = settings.getRange('D13').getValue();
    afAssert_(header === '' || header === 'UDMメンバーID', 'CONFIG_REQUIRED');
    const rows = settings.getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4).getValues();
    const ids = new Set();
    rows.forEach(function (row) {
      if (row[3] !== '')
        afAssert_(
          typeof row[3] === 'string' && /^m_[a-f0-9-]{36}$/.test(row[3]),
          'CONFIG_REQUIRED',
        );
      if (row[0] && !row[3]) row[3] = 'm_' + Utilities.getUuid();
      if (row[3]) {
        afAssert_(!ids.has(row[3]), 'CONFIG_REQUIRED');
        ids.add(row[3]);
      }
    });
    settings.getRange('D13').setValue('UDMメンバーID');
    settings.getRange(AF.firstMemberRow, 4, AF.memberCapacity, 1).setValues(
      rows.map(function (row) {
        return [row[3]];
      }),
    );
    initializeSharedLinks_();
    SpreadsheetApp.flush();
    invalidateAnswerCache_();
  });
}

function afMemberRow_(memberId: string): number {
  const rows = sheet_(AF.members).getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4).getValues();
  const index = rows.findIndex(function (row) {
    return row[3] === memberId && row[0] && row[2] === true;
  });
  afAssert_(index >= 0, 'INVALID_REQUEST');
  return AF.firstMemberRow + index;
}

function afAddMember_(payload: AfModels['AddMemberRequest']) {
  afAssert_(
    typeof payload.name === 'string' &&
      payload.name.trim().length > 0 &&
      payload.name.trim().length <= 80 &&
      !/^[=+\-@]/.test(payload.name.trim()) &&
      !/[\x00-\x1f]/.test(payload.name) &&
      typeof payload.required === 'boolean',
    'INVALID_REQUEST',
  );
  const name = payload.name.trim();
  const settings = sheet_(AF.members);
  const rows = settings.getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4).getValues();
  afAssert_(
    !rows.some(function (row) {
      return String(row[0] || '').trim() === name;
    }),
    'DUPLICATE',
  );
  const grid = adminAnswers_();
  const index = rows.findIndex(function (row, column) {
    return (
      !row[0] &&
      !row[3] &&
      grid.every(function (answers) {
        return answers[column] === '';
      })
    );
  });
  afAssert_(index >= 0, 'CAPACITY');
  settings
    .getRange(AF.firstMemberRow + index, 1, 1, 4)
    .setValues([[name, payload.required, true, 'm_' + Utilities.getUuid()]]);
}

function afRequired_(payload: AfModels['RequiredMemberRequest'], state: AfModels['Schedule']) {
  const member = state.members.find(function (item) {
    return item.id === payload.memberId;
  });
  afAssert_(
    member && typeof payload.required === 'boolean' && typeof payload.before === 'boolean',
    'INVALID_REQUEST',
  );
  afAssert_(member.required === payload.before || member.required === payload.required, 'CONFLICT');
  sheet_(AF.members).getRange(afMemberRow_(member.id), 2).setValue(payload.required);
}
