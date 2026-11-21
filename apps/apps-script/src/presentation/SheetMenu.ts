function afOpenSheet_() {
  SpreadsheetApp.getUi()
    .createMenu('日程調整')
    .addItem('回答する', 'showAnswerDialog')
    .addItem('候補日時を管理', 'showCandidateDialog')
    .addItem('ログイン情報の確認', 'showLoginInfoDialog')
    .addSeparator()
    .addItem('自動更新を設定（管理者）', 'installRolloverTrigger')
    .addToUi();
  preloadAnswerData();
}

/** 管理者による直接編集の反映。Apps Scriptによる変更では発火しない。 */
function afEditSheet_(event?: GoogleAppsScript.Events.SheetsOnEdit): void {
  if (!event || !event.range) return;
  const name = event.range.getSheet().getName();
  if (
    name === AF.summary &&
    event.range.getRow() <= 3 &&
    event.range.getLastRow() >= 3 &&
    event.range.getColumn() <= 2 &&
    event.range.getLastColumn() >= 2
  ) {
    afFormatSelectedDate_();
  }
  if (([AF.admin, AF.members, AF.main] as readonly string[]).includes(name)) {
    invalidateAnswerCache_();
    const lock = LockService.getScriptLock();
    if (lock.tryLock(1000)) {
      try {
        afRefreshSelectedOption_();
      } finally {
        lock.releaseLock();
      }
    }
  }
}

/**
 * HTMLを先に開く。キャッシュがあれば初期JSONを埋め込み、
 * HTMLからのgetAnswerData()初回通信を不要にする。
 */
function afShowAnswerDialog_() {
  const template = HtmlService.createTemplateFromFile('AnswerDialog');
  const cached = cachedAnswerData_();
  template.initialPayload = cached ? JSON.stringify(cached).replace(/</g, '\\u003c') : 'null';
  const html = template.evaluate().setWidth(620).setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'アフェティリアハード｜参加回答');
}

function afShowCandidateDialog_() {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutputFromFile('CandidateDialog').setWidth(500).setHeight(540),
    '候補日時の管理',
  );
}

function afShowLoginInfoDialog_() {
  afLoginInfoProperties_();
  const html = HtmlService.createHtmlOutputFromFile('LoginInfoDialog').setWidth(480).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'ログイン情報の確認');
}
