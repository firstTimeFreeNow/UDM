function afMemberRow_(memberId: string): number {
  const rows = sheet_(AF.members).getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4).getValues();
  const index = rows.findIndex(function (row) {
    return row[3] === memberId && row[0] && row[2] === true;
  });
  afAssert_(index >= 0, 'INVALID_REQUEST');
  return AF.firstMemberRow + index;
}

function afSheetsSetupRepository_(): AfSetupRepository {
  return {
    identities() {
      const settings = sheet_(AF.members);
      const header = settings.getRange('D13').getValue();
      afAssert_(header === '' || header === 'UDMメンバーID', 'CONFIG_REQUIRED');
      return settings
        .getRange(AF.firstMemberRow, 1, AF.memberCapacity, 4)
        .getValues()
        .map((row) => ({ name: row[0], id: row[3] }));
    },
    saveIdentities(ids) {
      const settings = sheet_(AF.members);
      settings.getRange('D13').setValue('UDMメンバーID');
      settings
        .getRange(AF.firstMemberRow, 4, AF.memberCapacity, 1)
        .setValues(ids.map((id) => [id]));
    },
    initializeLinks() {
      initializeSharedLinks_();
    },
    flush() {
      SpreadsheetApp.flush();
    },
  };
}
