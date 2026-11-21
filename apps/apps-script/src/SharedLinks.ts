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
function udmPath_(path: unknown): path is string {
  // Canonical internal paths only. Excludes schemes, queries, encoded characters and alias loops.
  return (
    typeof path === 'string' &&
    path.length <= 240 &&
    /^\/UDM\/(?:[a-zA-Z0-9_-]+\/)*$/.test(path) &&
    !path.startsWith('/UDM/s/')
  );
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
function udmLinkList_(): AfModels['LinkList'] {
  return {
    links: udmLinks_().links.map(function (link) {
      return { code: link.code, path: link.path, active: link.active, updatedAt: link.updatedAt };
    }),
  };
}
function udmLinkResolve_(payload: AfModels['ResolveLinkRequest']) {
  afAssert_(
    typeof payload.code === 'string' && /^[A-Za-z0-9_-]{4,32}$/.test(payload.code),
    'INVALID_REQUEST',
  );
  const link = udmLinks_().links.find(function (link) {
    return link.code === payload.code && link.active;
  });
  afAssert_(link, 'NOT_FOUND');
  return { path: link.path };
}
function udmLinkCreate_(payload: AfModels['CreateLinkRequest']) {
  afAssert_(udmPath_(payload.path), 'INVALID_REQUEST');
  const state = udmLinks_();
  const code = payload.code || Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  afAssert_(typeof code === 'string' && /^[A-Za-z0-9_-]{4,32}$/.test(code), 'INVALID_REQUEST');
  afAssert_(state.links.length < 200, 'CAPACITY');
  afAssert_(
    !state.links.some(function (link) {
      return link.code === code;
    }),
    'DUPLICATE',
  );
  state.sheet
    .getRange(state.links.length + 2, 1, 1, 4)
    .setValues([[code, payload.path, true, new Date().toISOString()]]);
  SpreadsheetApp.flush();
  return udmLinkList_();
}
function udmLinkUpdate_(payload: AfModels['UpdateLinkRequest']) {
  afAssert_(
    typeof payload.code === 'string' &&
      udmPath_(payload.path) &&
      typeof payload.active === 'boolean',
    'INVALID_REQUEST',
  );
  const state = udmLinks_();
  const link = state.links.find(function (link) {
    return link.code === payload.code;
  });
  afAssert_(link, 'NOT_FOUND');
  afAssert_(link.path === payload.beforePath && link.active === payload.beforeActive, 'CONFLICT');
  state.sheet
    .getRange(link.row, 2, 1, 3)
    .setValues([[payload.path, payload.active, new Date().toISOString()]]);
  SpreadsheetApp.flush();
  return udmLinkList_();
}

/** Reuse the active alias for a screen; retries never create duplicates. */
function udmLinkShare_(payload: AfModels['ShareLinkRequest']) {
  afAssert_(udmPath_(payload.path), 'INVALID_REQUEST');
  const state = udmLinks_();
  let link: AfModels['SharedLink'] | undefined = state.links.find(function (item) {
    return item.active && item.path === payload.path;
  });
  if (!link) {
    const result = udmLinkCreate_({ path: payload.path });
    link = result.links.find(function (item) {
      return item.active && item.path === payload.path;
    });
  }
  return { code: link!.code, path: link!.path };
}
