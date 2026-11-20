/** アフェティリアハード追加便 / bound Google Apps Script */
const AF = Object.freeze({
    spreadsheetId: PropertiesService.getScriptProperties().getProperty('AF_SPREADSHEET_ID'),
    main: '日程調整', members: '設定・メンバー', summary: '開催日程',
    responses: '回答データ', admin: '（管理者用）回答管理', history: '開催履歴', timezone: 'Asia/Tokyo',
    firstSlotRow: 7, lastSlotRow: 60, firstMemberRow: 14, memberCapacity: 12,
    minParticipants: 6, maxParticipants: 8, rolloverDelayMinutes: 120,
    cacheTtlSeconds: 90
});
/**
 * コンテナバインドされたスプレッドシートを取得する。
 * 同一実行内の複数操作で SpreadsheetApp.openById() を繰り返さない。
 */
let cachedSpreadsheet_ = null;

function ss_() {
    if (typeof AF.spreadsheetId !== 'string' || !AF.spreadsheetId.trim()) {
        throw new Error('スクリプトプロパティ「AF_SPREADSHEET_ID」が未設定です。元のスプレッドシートのIDを設定して保存してください。');
    }
    const spreadsheetId = AF.spreadsheetId.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
        throw new Error('AF_SPREADSHEET_IDにはURL全体ではなく、スプレッドシートのIDだけを設定してください。');
    }
    if (cachedSpreadsheet_ === null) {
        const bound = SpreadsheetApp.getActiveSpreadsheet();
        if (bound && bound.getId() === spreadsheetId) {
            cachedSpreadsheet_ = bound;
        } else {
            try { cachedSpreadsheet_ = SpreadsheetApp.openById(spreadsheetId); }
            catch (error) {
                throw new Error('スプレッドシートを開けません。AF_SPREADSHEET_IDがスクリプトIDではなく、元のスプレッドシートのIDになっているか確認してください。');
            }
        }
    }
    return cachedSpreadsheet_;
}
function sheet_(name) {
    const s = ss_().getSheetByName(name);
    if (!s)
        throw Error('シートがありません: ' + name);
    return s;
}
/** Preserve an interrupted rollover marker when moving from document to script scope. */
function rolloverProperties_() {
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
function fmtDate_(date) { return Utilities.formatDate(date, AF.timezone, 'yyyy-MM-dd'); }
function fmtTime_(date) { return Utilities.formatDate(date, AF.timezone, 'HH:mm'); }
function date_(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        throw Error('日付の形式が不正です');
    const [y, m, d] = s.split('-').map(Number);
    const x = new Date(y, m - 1, d);
    if (x.getFullYear() !== y || x.getMonth() !== m - 1 || x.getDate() !== d)
        throw Error('日付が不正です');
    return x;
}
function time_(s) {
    if (!/^([01]\d|2[0-3]):(00|30)$/.test(s))
        throw Error('開始時刻は30分単位で指定してください');
    const [h, m] = s.split(':').map(Number);
    return (h * 60 + m) / 1440;
}
function slotKey_(d, t) { return d + ' ' + t; }
/** Accept both the original date value and the detailed scheduling dropdown label. */
function afSelectedDate_(value) {
    if (typeof value !== 'string') return value;
    const match = /^(\d{4})\/(\d{2})\/(\d{2})\([日月火水木金土]\) ([01]\d|2[0-3]):(00|30)｜○\d{1,2}人・△\d{1,2}人｜必須メンバー[○△×]$/.exec(value);
    if (!match) return value;
    const day = match[1] + '-' + match[2] + '-' + match[3];
    const clock = match[4] + ':' + match[5];
    const selected = new Date(day + 'T' + clock + ':00+09:00');
    // Do not silently normalize an impossible date into another month.
    return !isNaN(selected.getTime()) && fmtDate_(selected) === day && fmtTime_(selected) === clock ? selected : value;
}
function afSelectedOption_(selected) {
    return sheet_(AF.summary).getRange('J9:J62').getValues().map(function (row) { return row[0]; }).find(function (value) {
        const candidate = afSelectedDate_(value);
        return typeof value === 'string' && candidate instanceof Date && candidate.getTime() === selected.getTime();
    });
}
/** Caller holds the script lock. Refresh counts without changing the selected date. */
function afRefreshSelectedOption_() {
    const cell = sheet_(AF.summary).getRange('B3');
    const value = cell.getValue();
    const selected = afSelectedDate_(value);
    if (typeof value !== 'string' || !(selected instanceof Date)) return;
    SpreadsheetApp.flush();
    const option = afSelectedOption_(selected);
    if (option && option !== value) cell.setValue(option);
}
/** Keep the dropdown label intact, while showing only the confirmed date in B3. */
function afFormatSelectedDate_() {
    const cell = sheet_(AF.summary).getRange('B3');
    const value = cell.getValue();
    const selected = afSelectedDate_(value);
    const base = 'yyyy/mm/dd(ddd) hh:mm';
    let pattern = base;
    if (typeof value === 'string' && selected instanceof Date) {
        const day = fmtDate_(selected);
        const weekday = '日月火水木金土'[new Date(day + 'T00:00:00Z').getUTCDay()];
        const display = day.replace(/-/g, '/') + '(' + weekday + ') ' + fmtTime_(selected);
        // The fourth section is the text display. Numeric dates keep their original format.
        pattern = base + ';' + base + ';' + base + ';"' + display + '"';
    }
    if (cell.getNumberFormat() !== pattern) cell.setNumberFormat(pattern);
}
/**
 * キャッシュは表示高速化専用。保存時の正本は常に回答管理シート。
 * シートとWeb実行の両方で同じScriptCacheを参照する。
 */
function answerCache_() {
    return CacheService.getScriptCache();
}
function answerCacheKey_() {
    return 'af-answer-dialog-v8';
}
function cachedAnswerData_() {
    try {
        const json = answerCache_().get(answerCacheKey_());
        return json ? JSON.parse(json) : null;
    } catch (error) {
        console.warn('回答キャッシュの読み取りに失敗: ' + error);
        return null;
    }
}
function cacheAnswerData_(data) {
    try {
        answerCache_().put(
            answerCacheKey_(),
            JSON.stringify(data),
            AF.cacheTtlSeconds
        );
    } catch (error) {
        // CacheServiceの上限や一時障害で、回答画面を止めない。
        console.warn('回答キャッシュの保存に失敗: ' + error);
    }
}
function invalidateAnswerCache_() {
    try {
        answerCache_().remove(answerCacheKey_());
    } catch (error) {
        console.warn('回答キャッシュの破棄に失敗: ' + error);
    }
}

/**
 * スプレッドシートを開いた時点で先読みする。
 * 他ユーザーの編集中に差分が発生したときは短いTTLと無効化で対処する。
 * トリガー失敗時も手動の回答画面から通常取得できる。
 */
function preloadAnswerData() {
    if (cachedAnswerData_()) return;
    const start = Date.now();
    try {
        const data = computeAnswerData_();
        cacheAnswerData_(data);
        console.log('preloadAnswerData.serverMs=' + (Date.now() - start));
    } catch (error) {
        console.warn('プリロードに失敗: ' + error);
    }
}

function onOpen() {
    SpreadsheetApp.getUi().createMenu('日程調整')
        .addItem('回答する', 'showAnswerDialog')
        .addItem('候補日時を管理', 'showCandidateDialog')
        .addItem('ログイン情報の確認', 'showLoginInfoDialog')
        .addSeparator()
        .addItem('自動更新を設定（管理者）', 'installRolloverTrigger')
        .addToUi();
    preloadAnswerData();
}

/** 管理者による直接編集の反映。Apps Scriptによる変更では発火しない。 */
function onEdit(event) {
    if (!event || !event.range) return;
    const name = event.range.getSheet().getName();
    if (name === AF.summary && event.range.getRow() <= 3 && event.range.getLastRow() >= 3 &&
        event.range.getColumn() <= 2 && event.range.getLastColumn() >= 2) {
        afFormatSelectedDate_();
    }
    if ([AF.admin, AF.members, AF.main].includes(name)) {
        invalidateAnswerCache_();
        const lock = LockService.getScriptLock();
        if (lock.tryLock(1000)) {
            try { afRefreshSelectedOption_(); }
            finally { lock.releaseLock(); }
        }
    }
}

/**
 * HTMLを先に開く。キャッシュがあれば初期JSONを埋め込み、
 * HTMLからのgetAnswerData()初回通信を不要にする。
 */
function showAnswerDialog() {
    const template = HtmlService.createTemplateFromFile('AnswerDialog');
    const cached = cachedAnswerData_();
    template.initialPayload = cached
        ? JSON.stringify(cached).replace(/</g, '\\u003c')
        : 'null';
    const html = template.evaluate().setWidth(620).setHeight(650);
    SpreadsheetApp.getUi().showModalDialog(html, 'アフェティリアハード｜参加回答');
}
function showCandidateDialog() { SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('CandidateDialog').setWidth(500).setHeight(540), '候補日時の管理'); }
function listMembers_() {
    return sheet_(AF.members).getRange(AF.firstMemberRow, 1, AF.memberCapacity, 3).getValues()
        .map((v, i) => ({ name: String(v[0] || '').trim(), required: v[1] === true, active: v[2] === true, index: i }))
        .filter(x => x.name && x.active);
}
function listSlots_() {
    const vals = sheet_(AF.main).getRange(AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 2).getValues();
    return vals.map((v, i) => v[0] instanceof Date && v[1] instanceof Date ? { row: AF.firstSlotRow + i, date: fmtDate_(v[0]), time: fmtTime_(v[1]) } : null).filter(Boolean)
        .map(x => ({ ...x, key: slotKey_(x.date, x.time) }));
}
function weekId_() { return fmtDate_(sheet_(AF.members).getRange('B3').getValue()); }
function snapshotResponses_() { const s = sheet_(AF.responses); return s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, 5).getValues(); }
/**
 * 回答管理シートを唯一の回答保存先として利用する。
 *
 * 行: 日程調整の候補行 + 2（7行目 → 回答管理の5行目）
 * 列: メンバー登録順（C～N）
 *
 * 1回の範囲取得で全候補・全メンバーの回答を取得する。
 */
function adminAnswers_() {
    return sheet_(AF.admin)
        .getRange(5, 3, AF.lastSlotRow - AF.firstSlotRow + 1, AF.memberCapacity)
        .getValues();
}

function snapshotAdminResponses_() {
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

/**
 * メンバー設定・候補日時・回答表を計3回の範囲取得で読み出す。
 * 必要以上の再計算や Spreadsheet サービスへの往復を避ける。
 */
function loadAnswerContext_() {
    const settings = sheet_(AF.members)
        .getRange(3, 1, AF.firstMemberRow + AF.memberCapacity - 3, 3)
        .getValues();
    const start = settings[0][1];
    if (!(start instanceof Date)) {
        throw new Error('対象週の開始日が不正です');
    }

    const members = settings
        .slice(AF.firstMemberRow - 3, AF.firstMemberRow - 3 + AF.memberCapacity)
        .map((row, index) => ({
            name: String(row[0] || '').trim(),
            required: row[1] === true,
            active: row[2] === true,
            index
        }))
        .filter(member => member.name && member.active);

    const slotValues = sheet_(AF.main)
        .getRange(AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 2)
        .getValues();
    const slots = slotValues
        .map((row, index) => {
            if (!(row[0] instanceof Date) || !(row[1] instanceof Date)) {
                return null;
            }
            const date = fmtDate_(row[0]);
            const time = fmtTime_(row[1]);
            return {
                row: AF.firstSlotRow + index,
                date,
                time,
                key: slotKey_(date, time)
            };
        })
        .filter(Boolean);

    return {
        weekId: fmtDate_(start),
        members,
        slots,
        grid: adminAnswers_(),
        minParticipants: Number(settings[2][1]) || AF.minParticipants
    };
}

function computeAnswerData_() {
    const startedAt = Date.now();
    const context = loadAnswerContext_();
    const { weekId, members, slots, grid, minParticipants } = context;
    const answers = Object.create(null);

    members.forEach(member => {
        answers[member.name] = {};
    });

    const decoratedSlots = slots.map(slot => {
        const values = grid[slot.row - AF.firstSlotRow];
        let count = 0;
        let requiredPresent = true;

        members.forEach(member => {
            const answer = values[member.index];
            if (['○', '△', '×'].includes(answer)) {
                answers[member.name][slot.key] = answer;
            }
            if (answer === '○') {
                count++;
            } else if (member.required) {
                requiredPresent = false;
            }
        });

        let judgment = '開催可能';
        if (!requiredPresent) {
            judgment = '必須未達';
        } else if (count < minParticipants) {
            judgment = '人数不足';
        } else if (count > AF.maxParticipants) {
            judgment = '人数調整';
        }
        return { ...slot, count, judgment };
    });

    const durationMs = Date.now() - startedAt;
    console.log('getAnswerData.serverMs=' + durationMs);

    return {
        weekId,
        members: members.map(member => ({ name: member.name, required: member.required })),
        slots: decoratedSlots,
        answers,
        metrics: { serverMs: durationMs }
    };
}

/**
 * 通常はキャッシュを優先し、強制更新では管理用シートから取得する。
 * 計測時はforceRefresh=trueにしてキャッシュによる測定誤差を避ける。
 */
function getAnswerData(forceRefresh) {
    const startedAt = Date.now();
    if (!forceRefresh) {
        const cached = cachedAnswerData_();
        if (cached) {
            console.log('getAnswerData.cacheHitMs=' + (Date.now() - startedAt));
            return cached;
        }
    }
    const data = computeAnswerData_();
    cacheAnswerData_(data);
    return data;
}

/**
 * 単件回答は、一括保存と同じ処理を使用する。
 * 文字列形式・重複防止のルールを一箇所にまとめる。
 */
function setAnswer(payload) {
    if (!payload) {
        throw new Error('回答データが不正です');
    }
    return setAnswersBatch({
        weekId: payload.weekId,
        member: payload.member,
        changes: [{ slot: payload.slot, answer: payload.answer }]
    });
}
/**
 * 既存データの日時キーを文字列へ正規化する。
 * 旧実装が Google Sheets によって日付へ自動変換された場合にも対応する。
 */
function responseSlotKey_(value) {
    if (value instanceof Date) {
        return Utilities.formatDate(value, AF.timezone, 'yyyy-MM-dd HH:mm');
    }
    return String(value || '').trim();
}
/** 既存データの週IDを文字列へ正規化する。 */
function responseWeekId_(value) {
    if (value instanceof Date) {
        return Utilities.formatDate(value, AF.timezone, 'yyyy-MM-dd');
    }
    return String(value || '').trim();
}
/**
 * 回答の一括保存。
 * payload = {
 *   weekId: '2026-11-16',
 *   member: 'DemoMember',
 *   changes: [{slot: '2026-11-16 20:30', answer: '×'}]
 * };
 *
 * 変更された候補だけを更新し、ほかの回答を保持する。
 * 日時キーと週IDはプレーンテキストとして書き込む。
 */
/**
 * 回答をまとめて保存する。
 * 変更した候補が少数の場合は連続行だけを書き、変更が分散して多い場合は
 * 1列を一括更新する。ほかのメンバー列は変更しない。
 *
 * 成功時は保存結果のみ返却する。ダイアログ側で再取得せず閉じる。
 */
function setAnswersBatch(payload) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) throw new Error('ほかの保存処理が実行中です');
    try { return setAnswersBatchUnlocked_(payload); }
    finally { lock.releaseLock(); }
}
function setAnswersBatchUnlocked_(payload) {
    const startedAt = Date.now();
    if (rolloverProperties_().getProperty('pendingRolloverWeek')) {
        throw new Error('週の更新中です');
    }
    if (!payload || !Array.isArray(payload.changes)) throw new Error('回答データが不正です');
        // 設定値とメンバー一覧は一括取得する。
        const settings = sheet_(AF.members)
            .getRange(3, 1, AF.firstMemberRow + AF.memberCapacity - 3, 3)
            .getValues();
        const weekStart = settings[0][1];
        if (!(weekStart instanceof Date) || payload.weekId !== fmtDate_(weekStart)) {
            throw new Error('対象週が切り替わりました。再読み込みしてください');
        }

        const memberIndex = settings
            .slice(AF.firstMemberRow - 3, AF.firstMemberRow - 3 + AF.memberCapacity)
            .findIndex(row => String(row[0] || '').trim() === payload.member && row[2] === true);
        if (memberIndex < 0) {
            throw new Error('メンバーが見つかりません');
        }

        // 現在の候補だけを許可する（週切り替え後の古い画面からの書き込みを防止）。
        const slotRows = new Map(listSlots_().map(slot => [slot.key, slot.row]));
        const updates = new Map();
        for (const change of payload.changes) {
            if (!change || !slotRows.has(change.slot)) {
                throw new Error('候補日時が変更されました。再読み込みしてください');
            }
            if (!['○', '△', '×', ''].includes(change.answer)) {
                throw new Error('回答に不正な値が含まれています');
            }
            if (updates.has(change.slot)) {
                throw new Error('同一候補が重複しています');
            }
            updates.set(change.slot, change.answer);
        }

        if (updates.size === 0) {
            return { success: true, savedCount: 0, serverMs: Date.now() - startedAt };
        }

        const column = memberIndex + 3;
        const rowCount = AF.lastSlotRow - AF.firstSlotRow + 1;
        const sheet = sheet_(AF.admin);
        const range = sheet.getRange(5, column, rowCount, 1);
        const values = range.getValues();
        const changedIndexes = [];

        for (const [key, answer] of updates) {
            const index = slotRows.get(key) - AF.firstSlotRow;
            if (values[index][0] !== answer) {
                values[index][0] = answer;
                changedIndexes.push(index);
            }
        }

        if (changedIndexes.length > 0) {
            changedIndexes.sort((a, b) => a - b);
            const runs = [];
            let first = changedIndexes[0];
            let last = first;
            for (const index of changedIndexes.slice(1)) {
                if (index === last + 1) {
                    last = index;
                } else {
                    runs.push([first, last]);
                    first = index;
                    last = index;
                }
            }
            runs.push([first, last]);

            // 複数箇所への細かいアクセスより、1回の一括書き込みが安い場合。
            if (runs.length > 3 || changedIndexes.length > 14) {
                range.setValues(values);
            } else {
                for (const [start, end] of runs) {
                    sheet.getRange(5 + start, column, end - start + 1, 1)
                        .setValues(values.slice(start, end + 1));
                }
            }
        }

        if (changedIndexes.length > 0) {
            invalidateAnswerCache_();
            afRefreshSelectedOption_();
        }
        const durationMs = Date.now() - startedAt;
        console.log('setAnswersBatch.serverMs=' + durationMs + ', changed=' + changedIndexes.length);
        return {
            success: true,
            savedCount: changedIndexes.length,
            serverMs: durationMs
        };

}

function getCandidateData() { return { weekId: weekId_(), slots: listSlots_() }; }
function addCandidate(payload) {
    if (!payload)
        throw Error('日時を指定してください');
    const d = date_(payload.date), t = time_(payload.time);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000))
        throw Error('ほかの処理が実行中です');
    try {
        if (rolloverProperties_().getProperty('pendingRolloverWeek')) throw new Error('週の更新中です');
        const settings = sheet_(AF.members), start = fmtDate_(settings.getRange('B3').getValue()), end = fmtDate_(settings.getRange('B4').getValue());
        if (payload.date < start || payload.date > end)
            throw Error('対象週内の日付を指定してください');
        const key = slotKey_(payload.date, payload.time);
        if (listSlots_().some(s => s.key === key))
            throw Error('同じ日時が登録済みです');
        const slots = listSlots_(), used = new Set(slots.map(s => s.row));
        let row = AF.firstSlotRow;
        while (used.has(row) && row <= AF.lastSlotRow)
            row++;
        if (row > AF.lastSlotRow)
            throw Error('候補上限に達しました');
        sheet_(AF.main).getRange(row, 1, 1, 2).setValues([[d, t]]);
        sheet_(AF.main).getRange(row, 1).setNumberFormat('m/d(ddd)');
        sheet_(AF.main).getRange(row, 2).setNumberFormat('hh:mm');
        SpreadsheetApp.flush();
        invalidateAnswerCache_();
        return getCandidateData();
    }
    finally {
        lock.releaseLock();
    }
}
function removeCandidate(key) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(15000))
        throw Error('ほかの処理が実行中です');
    try {
        if (rolloverProperties_().getProperty('pendingRolloverWeek')) throw new Error('週の更新中です');
        const slot = listSlots_().find(s => s.key === key);
        if (!slot)
            throw Error('候補日時が見つかりません');
        const answers = adminAnswers_()[slot.row - AF.firstSlotRow];
        if (answers.some(value => ['○', '△', '×'].includes(value)))
            throw Error('回答済みの候補は削除できません。先に回答を確認してください');
        sheet_(AF.main).getRange(slot.row, 1, 1, 2).clearContent();
        SpreadsheetApp.flush();
        invalidateAnswerCache_();
        return getCandidateData();
    }
    finally {
        lock.releaseLock();
    }
}
function installRolloverTrigger() {
    const existing = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkScheduleRollover');
    existing.forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('checkScheduleRollover').timeBased().everyMinutes(5).create();
    SpreadsheetApp.getUi().alert('5分間隔の自動更新チェックを設定しました');
}
/**
 * 開催日時の選択から確定を判断する。
 * 「開催日程」B3は日時または人数付きの選択肢を保存する単一セル。
 * 人数付きの値は日時へ変換し、表示は従来どおり日時のみとする。
 * 別の開催状態セルは使用しない。
 *
 * 対象日時から2時間経過した場合に履歴を記録し、
 * 対象週を翌週へ繰り越す。
 */
function checkScheduleRollover() {
    const lock = LockService.getScriptLock();
    if (!lock || !lock.tryLock(15000)) {
        return;
    }
    try {
        afCheckPushSafe_();
        afRefreshSelectedOption_();
        const settings = sheet_(AF.members);
        const summary = sheet_(AF.summary);
        const history = sheet_(AF.history);
        const props = rolloverProperties_();
        const week = weekId_();
        const pending = props.getProperty('pendingRolloverWeek');
        const selected = afSelectedDate_(summary.getRange('B3').getValue());
        // 処理再開中でなければ、選択された日時が現行候補に含まれるかを確認する。
        if (!pending) {
            if (!(selected instanceof Date)) {
                const deadline = date_(week);
                deadline.setDate(deadline.getDate() + 7);
                if (selected !== '' || Date.now() < deadline.getTime()) return;
            }
            if (selected instanceof Date) {
            const selectedKey = slotKey_(fmtDate_(selected), fmtTime_(selected));
            const exists = listSlots_().some(slot => slot.key === selectedKey);
            if (!exists) {
                return;
            }
            const rolloverAt = selected.getTime() + AF.rolloverDelayMinutes * 60 * 1000;
            if (Date.now() < rolloverAt) {
                return;
            }
            }
        }
        const archiveWeek = pending || week;
        const savedHistory = history.getLastRow() > 3
            ? history.getRange(4, 1, history.getLastRow() - 3, 8).getValues()
            : [];
        let existingHistory = savedHistory.find(row => responseWeekId_(row[0]) === archiveWeek);
        if (!existingHistory) {
            if (pending && week !== archiveWeek) {
                throw new Error('未完了処理の履歴が見つかりません');
            }
            const snapshot = {
                weekId: week,
                candidates: listSlots_(),
                members: settings.getRange(14, 1, 12, 3).getValues(),
                responses: snapshotAdminResponses_(),
                confirmedDateTime: selected instanceof Date ? Utilities.formatDate(selected, AF.timezone, 'yyyy-MM-dd HH:mm') : null
            };
            props.setProperty('pendingRolloverWeek', archiveWeek);
            history.appendRow([
                week,
                settings.getRange('B3').getValue(),
                settings.getRange('B4').getValue(),
                selected,
                selected instanceof Date ? '確定' : '未開催',
                new Date(),
                JSON.stringify(snapshot),
                'ARCHIVED'
            ]);
            SpreadsheetApp.flush();
            existingHistory = [
                week, null, null, null, null, null,
                JSON.stringify(snapshot), 'ARCHIVED'
            ];
        }
        props.setProperty('pendingRolloverWeek', archiveWeek);
        const previous = date_(archiveWeek);
        const nextWeekStart = new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 7);
        const nextWeekId = fmtDate_(nextWeekStart);
        // 前回の処理が完了済みなら、二重繰り越しを防いで終了する。
        if (weekId_() === nextWeekId && summary.getRange('B3').isBlank()) {
            props.deleteProperty('pendingRolloverWeek');
            return;
        }
        const snapshot = JSON.parse(existingHistory[6]);
        const mainSheet = sheet_(AF.main);
        const dateRange = mainSheet.getRange(
            AF.firstSlotRow, 1, AF.lastSlotRow - AF.firstSlotRow + 1, 1
        );
        const formulas = dateRange.getFormulas();
        const dates = dateRange.getValues();
        const nextDates = new Map();

        for (const slot of snapshot.candidates) {
            const nextDate = date_(slot.date);
            nextDate.setDate(nextDate.getDate() + 7);
            nextDates.set(slot.row, nextDate);
        }

        // 数式で週開始日を参照する候補は数式のまま保持する。
        // 手動登録された日付だけを7日進め、全行を一括で書き込む。
        const nextValues = dates.map((row, index) => {
            const rowNumber = AF.firstSlotRow + index;
            if (formulas[index][0]) {
                return [formulas[index][0]];
            }
            return [nextDates.get(rowNumber) || row[0]];
        });
        dateRange.setValues(nextValues);
        // 履歴保存後、翌週の回答を全件未回答に戻す。
        sheet_(AF.admin)
            .getRange(5, 3, AF.lastSlotRow - AF.firstSlotRow + 1, AF.memberCapacity)
            .clearContent();
        settings.getRange('B3').setValue(nextWeekStart);
        summary.getRange('B3').clearContent();
        SpreadsheetApp.flush();
        props.deleteProperty('pendingRolloverWeek');
        invalidateAnswerCache_();
    }
    finally {
        lock.releaseLock();
    }
}

/**
 * サーバー側の回答取得時間を測定する。
 * HTML起動・ネットワーク・ブラウザ描画時間は含まない。
 */
function benchmarkAnswerData() {
    const durations = [];
    for (let index = 0; index < 10; index++) {
        const startedAt = Date.now();
        getAnswerData(true);
        durations.push(Date.now() - startedAt);
    }
    const sorted = durations.slice().sort((a, b) => a - b);
    const median = (sorted[4] + sorted[5]) / 2;
    const p95 = sorted[9];
    console.log(JSON.stringify({ durations, median, p95 }));
}

/** キャッシュの先読み・命中・強制更新を分けて測定する。 */
function benchmarkPreload() {
    invalidateAnswerCache_();
    const t0 = Date.now();
    preloadAnswerData();
    const warmMs = Date.now() - t0;
    const t1 = Date.now();
    getAnswerData();
    const cacheHitMs = Date.now() - t1;
    const t2 = Date.now();
    getAnswerData(true);
    const forceRefreshMs = Date.now() - t2;
    console.log(JSON.stringify({ warmMs, cacheHitMs, forceRefreshMs }));
}
