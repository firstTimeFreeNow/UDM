/** UDM-wide aliases; no user identifiers or visit tracking are stored. */
const UDM_LINKS_SHEET = 'UDM共有リンク';
const UDM_LINKS_HEADER = ['code', 'path', 'active', 'updatedAt'];
function initializeSharedLinks_(): GoogleAppsScript.Spreadsheet.Sheet {
  let sheet = ss_().getSheetByName(UDM_LINKS_SHEET);
  if (!sheet) {
    sheet = ss_().insertSheet(UDM_LINKS_SHEET);
    sheet.getRange(1, 1, 1, 4).setValues([UDM_LINKS_HEADER]);
  }
  afAssert_(
    sheet.getRange(1, 1, 1, 4).getValues()[0].join('|') === UDM_LINKS_HEADER.join('|'),
    'CONFIG_REQUIRED',
  );
  return sheet;
}
function udmLinks_(): {
  sheet: GoogleAppsScript.Spreadsheet.Sheet;
  links: (AfModels['SharedLink'] & { row: number })[];
} {
  const sheet = ss_().getSheetByName(UDM_LINKS_SHEET);
  afAssert_(
    sheet && sheet.getRange(1, 1, 1, 4).getValues()[0].join('|') === UDM_LINKS_HEADER.join('|'),
    'CONFIG_REQUIRED',
  );
  const count = Math.max(0, sheet.getLastRow() - 1);
  afAssert_(count <= 200, 'CAPACITY');
  const rows = count ? sheet.getRange(2, 1, count, 4).getValues() : [];
  const codes = new Set();
  const links = rows.map(function (row, index) {
    afAssert_(
      typeof row[0] === 'string' &&
        /^[A-Za-z0-9_-]{4,32}$/.test(row[0]) &&
        !codes.has(row[0]) &&
        udmPath_(row[1]) &&
        typeof row[2] === 'boolean',
      'CONFIG_REQUIRED',
    );
    codes.add(row[0]);
    return {
      code: row[0],
      path: row[1],
      active: row[2],
      updatedAt: row[3] instanceof Date ? row[3].toISOString() : String(row[3] || ''),
      row: index + 2,
    };
  });
  return { sheet: sheet, links: links };
}

function afSheetsLinkRepository_(): AfLinkRepository {
  function target() {
    const sheet = ss_().getSheetByName(UDM_LINKS_SHEET);
    afAssert_(sheet, 'CONFIG_REQUIRED');
    return sheet;
  }
  return {
    all: () => udmLinks_().links,
    insert(link, index) {
      target()
        .getRange(index + 2, 1, 1, 4)
        .setValues([[link.code, link.path, link.active, link.updatedAt]]);
      SpreadsheetApp.flush();
    },
    update(row, link) {
      target()
        .getRange(row, 2, 1, 3)
        .setValues([[link.path, link.active, link.updatedAt]]);
      SpreadsheetApp.flush();
    },
  };
}
