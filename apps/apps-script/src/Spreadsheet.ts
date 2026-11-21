/**
 * コンテナバインドされたスプレッドシートを取得する。
 * 同一実行内の複数操作で SpreadsheetApp.openById() を繰り返さない。
 */
let cachedSpreadsheet_: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

function ss_(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  if (typeof AF.spreadsheetId !== 'string' || !AF.spreadsheetId.trim()) {
    throw new Error(
      'スクリプトプロパティ「AF_SPREADSHEET_ID」が未設定です。元のスプレッドシートのIDを設定して保存してください。',
    );
  }
  const spreadsheetId = AF.spreadsheetId.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
    throw new Error(
      'AF_SPREADSHEET_IDにはURL全体ではなく、スプレッドシートのIDだけを設定してください。',
    );
  }
  if (cachedSpreadsheet_ === null) {
    const bound = SpreadsheetApp.getActiveSpreadsheet();
    if (bound && bound.getId() === spreadsheetId) {
      cachedSpreadsheet_ = bound;
    } else {
      try {
        cachedSpreadsheet_ = SpreadsheetApp.openById(spreadsheetId);
      } catch (error) {
        throw new Error(
          'スプレッドシートを開けません。AF_SPREADSHEET_IDがスクリプトIDではなく、元のスプレッドシートのIDになっているか確認してください。',
        );
      }
    }
  }
  return cachedSpreadsheet_;
}

function sheet_(name: string): GoogleAppsScript.Spreadsheet.Sheet {
  const s = ss_().getSheetByName(name);
  if (!s) throw Error('シートがありません: ' + name);
  return s;
}

/** Preserve an interrupted rollover marker when moving from document to script scope. */
function rolloverProperties_(): GoogleAppsScript.Properties.Properties {
  const properties = PropertiesService.getScriptProperties();
  const documentProperties = PropertiesService.getDocumentProperties();
  const legacy = documentProperties && documentProperties.getProperty('pendingRolloverWeek');
  if (legacy) {
    const current = properties.getProperty('pendingRolloverWeek');
    if (current && current !== legacy) throw new Error('週更新の状態を確認してください');
    properties.setProperty('pendingRolloverWeek', legacy);
    documentProperties.deleteProperty('pendingRolloverWeek');
  }
  return properties;
}

function listMembers_(): AfSheetMember[] {
  return sheet_(AF.members)
    .getRange(AF.firstMemberRow, 1, AF.memberCapacity, 3)
    .getValues()
    .map(afSheetMember_)
    .filter((x) => x.name && x.active);
}

function listSlots_(): AfSheetSlot[] {
  const vals = sheet_(AF.main)
    .getRange(AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 2)
    .getValues();
  return afSheetSlots_(vals);
}

function weekId_(): string {
  return fmtDate_(sheet_(AF.members).getRange('B3').getValue());
}

function snapshotResponses_(): any[][] {
  const s = sheet_(AF.responses);
  return s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, 5).getValues();
}

/**
 * 回答管理シートを唯一の回答保存先として利用する。
 *
 * 行: 日程調整の候補行 + 2（7行目 → 回答管理の5行目）
 * 列: メンバー登録順（C～N）
 *
 * 1回の範囲取得で全候補・全メンバーの回答を取得する。
 */
function adminAnswers_(): any[][] {
  return sheet_(AF.admin)
    .getRange(5, 3, AF.lastSlotRow - AF.firstSlotRow + 1, AF.memberCapacity)
    .getValues();
}

function snapshotAdminResponses_(): any[][] {
  const slots = listSlots_();
  const members = listMembers_();
  const grid = adminAnswers_();
  const week = weekId_();
  const responses = [];

  for (const slot of slots) {
    const values = grid[slot.row - AF.firstSlotRow];
    for (const member of members) {
      const answer = values[member.index];
      if (['○', '△', '×'].includes(answer)) {
        responses.push([slot.key, member.name, week, answer]);
      }
    }
  }
  return responses;
}

function afSheetMember_(row: any[], index: number): AfSheetMember {
  return {
    name: String(row[0] || '').trim(),
    required: row[1] === true,
    active: row[2] === true,
    index,
  };
}

function afSheetSlots_(rows: any[][]): AfSheetSlot[] {
  return rows
    .map((row, index) => {
      if (!(row[0] instanceof Date) || !(row[1] instanceof Date)) return null;
      const date = fmtDate_(row[0]);
      const time = fmtTime_(row[1]);
      return { row: AF.firstSlotRow + index, date, time, key: slotKey_(date, time) };
    })
    .filter((slot): slot is AfSheetSlot => slot !== null);
}
