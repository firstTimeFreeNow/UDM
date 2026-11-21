/** Login details are returned only after checking the answer in the bound Sheet. */
function afLoginInfoProperties_(): GoogleAppsScript.Properties.Properties {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet || spreadsheet.getId() !== AF.spreadsheetId) {
    throw new Error('元のスプレッドシートから開いてください。');
  }
  return PropertiesService.getScriptProperties();
}

function afLoginInfoValue_(
  properties: GoogleAppsScript.Properties.Properties,
  key: string,
): string {
  const value = properties.getProperty(key);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('ログイン情報の確認は未設定です。管理者に確認してください。');
  }
  return value;
}

function afPropertiesLoginInfoRepository_(): AfLoginInfoRepository {
  return {
    checkBoundSheet() {
      afLoginInfoProperties_();
    },
    value(key) {
      return afLoginInfoValue_(PropertiesService.getScriptProperties(), key);
    },
  };
}
