/** Login details are returned only after checking the answer in the bound Sheet. */
function afLoginInfoProperties_() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet || spreadsheet.getId() !== AF.spreadsheetId) {
        throw new Error('元のスプレッドシートから開いてください。');
    }
    return PropertiesService.getScriptProperties();
}

function afLoginInfoValue_(properties, key) {
    const value = properties.getProperty(key);
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('ログイン情報の確認は未設定です。管理者に確認してください。');
    }
    return value;
}

function showLoginInfoDialog() {
    afLoginInfoProperties_();
    const html = HtmlService.createHtmlOutputFromFile('LoginInfoDialog')
        .setWidth(480).setHeight(420);
    SpreadsheetApp.getUi().showModalDialog(html, 'ログイン情報の確認');
}

function getLoginInfoQuestion() {
    const properties = afLoginInfoProperties_();
    return { question: afLoginInfoValue_(properties, 'AF_LOGIN_INFO_QUESTION') };
}

function getLoginInfoWithAnswer(answer) {
    const properties = afLoginInfoProperties_();
    const expected = afLoginInfoValue_(properties, 'AF_LOGIN_INFO_ANSWER');
    // Do not trim or normalize answers: compare exactly as configured.
    if (typeof answer !== 'string' || answer !== expected) {
        throw new Error('答えが違います。');
    }
    return {
        email: afLoginInfoValue_(properties, 'AF_LOGIN_INFO_EMAIL'),
        password: afLoginInfoValue_(properties, 'AF_LOGIN_INFO_PASSWORD'),
    };
}
