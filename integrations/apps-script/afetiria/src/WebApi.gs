/** Web entry point; never expose generic sheet/range operations. */
function doPost(event) {
  let requestId = '';
  try {
    const body = event && event.postData && event.postData.contents;
    afAssert_(typeof body === 'string' && body.length <= 64000, 'INVALID_REQUEST');
    let request;
    try { request = JSON.parse(body); } catch (error) { throw afError_('INVALID_REQUEST'); }
    requestId = request && request.requestId;
    afAssert_(request && request.version === 1 && typeof requestId === 'string' &&
      /^[A-Za-z0-9_-]{8,80}$/.test(requestId) && request.payload &&
      typeof request.payload === 'object' && !Array.isArray(request.payload), 'INVALID_REQUEST');
    const actions = ['af.session', 'af.read', 'af.answers.save', 'af.history',
      'af.members.add', 'af.members.required', 'af.candidates.add', 'af.candidates.remove', 'af.confirm',
      'af.push.status', 'af.push.subscribe', 'af.push.unsubscribe', 'af.push.test',
      'udm.links.share', 'udm.links.resolve', 'udm.links.list', 'udm.links.create', 'udm.links.update'];
    afAssert_(actions.indexOf(request.action) >= 0, 'INVALID_REQUEST');
    if (request.action === 'udm.links.resolve') {
      return afOutput_({ version: 1, requestId: requestId, ok: true, data: afWithLock_(function () { return udmLinkResolve_(request.payload); }) });
    }
    // Browser opt-in needs no account; token possession permits only that destination's settings.
    if (['af.push.status', 'af.push.subscribe', 'af.push.unsubscribe'].indexOf(request.action) >= 0) {
      const data = afWithLock_(function () {
        if (request.action === 'af.push.status') return afPushStatus_(request.payload);
        if (request.action === 'af.push.subscribe') return afPushSubscribe_(request.payload);
        return afPushUnsubscribe_(request.payload);
      });
      return afOutput_({ version: 1, requestId: requestId, ok: true, data: data });
    }
    const role = afIdentity_(request.idToken);
    if (['af.session', 'af.read', 'af.answers.save', 'af.history', 'udm.links.share'].indexOf(request.action) < 0) {
      afAssert_(role === 'admin', 'FORBIDDEN');
    }
    const data = request.action === 'af.session' ? { role: role } : afWithLock_(function () {
      if (request.action === 'af.push.test') return afPushTest_(request.payload, requestId);
      if (request.action === 'udm.links.share') return udmLinkShare_(request.payload);
      if (request.action === 'udm.links.list') return udmLinkList_();
      if (request.action === 'udm.links.create') return udmLinkCreate_(request.payload);
      if (request.action === 'udm.links.update') return udmLinkUpdate_(request.payload);
      afAssert_(!rolloverProperties_().getProperty('pendingRolloverWeek'), 'BUSY');
      if (request.action === 'af.history') return afHistory_(request.payload);
      const state = afState_();
      if (request.action === 'af.read') return state;
      afAssert_(request.payload.weekId === state.weekId, 'WEEK_CHANGED');
      switch (request.action) {
        case 'af.answers.save': return afSave_(request.payload, state);
        case 'af.members.add': afAddMember_(request.payload); break;
        case 'af.members.required': afRequired_(request.payload, state); break;
        case 'af.candidates.add': afAddSlot_(request.payload, state); break;
        case 'af.candidates.remove': afRemoveSlot_(request.payload, state); break;
        case 'af.confirm': afConfirm_(request.payload, state); break;
      }
      SpreadsheetApp.flush();
      invalidateAnswerCache_();
      return afState_();
    });
    return afOutput_({ version: 1, requestId: requestId, ok: true, data: data });
  } catch (error) {
    const codes = ['INVALID_REQUEST', 'AUTH_REQUIRED', 'FORBIDDEN', 'CONFIG_REQUIRED', 'BUSY',
      'CONFLICT', 'WEEK_CHANGED', 'CAPACITY', 'HAS_ANSWERS', 'INELIGIBLE', 'DUPLICATE', 'NOT_FOUND'];
    const code = codes.indexOf(error && error.code) >= 0 ? error.code : 'INTERNAL_ERROR';
    return afOutput_({ version: 1, requestId: typeof requestId === 'string' ? requestId : '',
      ok: false, error: { code: code } });
  }
}
function afIdentity_(idToken) {
  afAssert_(typeof idToken === 'string' && idToken.length > 0 && idToken.length <= 16000, 'AUTH_REQUIRED');
  const properties = PropertiesService.getScriptProperties();
  const key = properties.getProperty('UDM_FIREBASE_WEB_API_KEY');
  const projectId = properties.getProperty('UDM_FIREBASE_PROJECT_ID');
  let allowed;
  try { allowed = JSON.parse(properties.getProperty('UDM_ALLOWED_UIDS_JSON')); } catch (error) { /* handled below */ }
  afAssert_(key && projectId && allowed && typeof allowed === 'object' && !Array.isArray(allowed), 'CONFIG_REQUIRED');
  let claims;
  try {
    const parts = idToken.split('.');
    afAssert_(parts.length === 3, 'AUTH_REQUIRED');
    claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
  } catch (error) { throw afError_('AUTH_REQUIRED'); }
  const now = Date.now() / 1000;
  afAssert_(claims && claims.aud === projectId && claims.iss === 'https://securetoken.google.com/' + projectId &&
    typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 128 &&
    Number.isFinite(claims.exp) && claims.exp > now && Number.isFinite(claims.iat) && claims.iat <= now + 30, 'AUTH_REQUIRED');
  // Claims alone are untrusted; Google's lookup must still validate the actual token.
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true,
  });
  afAssert_(response.getResponseCode() === 200, 'AUTH_REQUIRED');
  let users;
  try { users = JSON.parse(response.getContentText()).users; } catch (error) { throw afError_('AUTH_REQUIRED'); }
  afAssert_(Array.isArray(users) && users.length === 1 && users[0].localId && !users[0].disabled, 'AUTH_REQUIRED');
  const uid = users[0].localId;
  afAssert_(uid === claims.sub, 'AUTH_REQUIRED');
  afAssert_(Object.prototype.hasOwnProperty.call(allowed, uid) &&
    ['participant', 'admin'].indexOf(allowed[uid]) >= 0, 'FORBIDDEN');
  return allowed[uid];
}
function afWithLock_(operation) {
  const lock = LockService.getScriptLock();
  afAssert_(lock.tryLock(10000), 'BUSY');
  try { return operation(); } finally { lock.releaseLock(); }
}

/** Run once from the editor as the sheet owner, before enabling Web access. */
function initializeWebApp() {
  afWithLock_(function () {
    afAssert_(!rolloverProperties_().getProperty('pendingRolloverWeek'), 'BUSY');
    const settings = sheet_(AF.members);
    const header = settings.getRange('D13').getValue();
    afAssert_(header === '' || header === 'UDMメンバーID', 'CONFIG_REQUIRED');
    const rows = settings.getRange(14, 1, AF.memberCapacity, 4).getValues();
    const ids = new Set();
    rows.forEach(function (row) {
      if (row[3] !== '') afAssert_(typeof row[3] === 'string' && /^m_[a-f0-9-]{36}$/.test(row[3]), 'CONFIG_REQUIRED');
      if (row[0] && !row[3]) row[3] = 'm_' + Utilities.getUuid();
      if (row[3]) { afAssert_(!ids.has(row[3]), 'CONFIG_REQUIRED'); ids.add(row[3]); }
    });
    settings.getRange('D13').setValue('UDMメンバーID');
    settings.getRange(14, 4, AF.memberCapacity, 1).setValues(rows.map(function (row) { return [row[3]]; }));
    initializeSharedLinks_();
    SpreadsheetApp.flush();
    invalidateAnswerCache_();
  });
}
function afState_() {
  afAssert_(AF.spreadsheetId, 'CONFIG_REQUIRED');
  const data = computeAnswerData_(); // Bypass the display cache to pick up sheet edits.
  const rows = sheet_(AF.members).getRange(14, 1, AF.memberCapacity, 4).getValues();
  const members = rows.map(function (row, index) {
    return { id: row[3], name: String(row[0] || '').trim(), required: row[1] === true, active: row[2] === true, index: index };
  }).filter(function (member) { return member.name && member.active; });
  const ids = new Set(); const names = new Set();
  members.forEach(function (member) {
    afAssert_(typeof member.id === 'string' && /^m_[a-f0-9-]{36}$/.test(member.id) &&
      !ids.has(member.id) && !names.has(member.name), 'CONFIG_REQUIRED');
    ids.add(member.id); names.add(member.name);
  });
  const selected = sheet_(AF.summary).getRange('B3').getValue();
  const confirmed = selected instanceof Date ? slotKey_(fmtDate_(selected), fmtTime_(selected)) : null;
  const answers = {};
  members.forEach(function (member) { answers[member.id] = data.answers[member.name] || {}; });
  const min = Number(sheet_(AF.members).getRange('B5').getValue());
  afAssert_(Number.isInteger(min) && min >= 1 && min <= AF.maxParticipants, 'CONFIG_REQUIRED');
  return { weekId: data.weekId, members: members.map(function (member) {
    return { id: member.id, name: member.name, required: member.required };
  }), slots: data.slots.map(function (slot) {
    return { key: slot.key, date: slot.date, time: slot.time, count: slot.count, judgment: slot.judgment };
  }), answers: answers, confirmed: confirmed, minParticipants: min, maxParticipants: AF.maxParticipants };
}
function afSave_(payload, state) {
  const member = state.members.find(function (item) { return item.id === payload.memberId; });
  afAssert_(member && Array.isArray(payload.changes) && payload.changes.length <= 54, 'INVALID_REQUEST');
  const keys = new Set();
  payload.changes.forEach(function (change) {
    afAssert_(change && typeof change.slot === 'string' && !keys.has(change.slot) &&
      state.slots.some(function (slot) { return slot.key === change.slot; }) &&
      ['○', '△', '×', ''].indexOf(change.before) >= 0 && ['○', '△', '×', ''].indexOf(change.answer) >= 0, 'INVALID_REQUEST');
    keys.add(change.slot);
    const current = state.answers[member.id][change.slot] || '';
    // Repeated identical saves are harmless; a later different edit conflicts.
    afAssert_(current === change.before || current === change.answer, 'CONFLICT');
  });
  const result = setAnswersBatchUnlocked_({ weekId: state.weekId, member: member.name, changes: payload.changes });
  SpreadsheetApp.flush();
  return { saved: true, savedCount: result.savedCount, state: afState_() };
}
function afMemberRow_(memberId) {
  const rows = sheet_(AF.members).getRange(14, 1, AF.memberCapacity, 4).getValues();
  const index = rows.findIndex(function (row) { return row[3] === memberId && row[0] && row[2] === true; });
  afAssert_(index >= 0, 'INVALID_REQUEST');
  return 14 + index;
}
function afAddMember_(payload) {
  afAssert_(typeof payload.name === 'string' && payload.name.trim().length > 0 && payload.name.trim().length <= 80 &&
    !/^[=+\-@]/.test(payload.name.trim()) && !/[\x00-\x1f]/.test(payload.name) && typeof payload.required === 'boolean', 'INVALID_REQUEST');
  const name = payload.name.trim();
  const settings = sheet_(AF.members);
  const rows = settings.getRange(14, 1, AF.memberCapacity, 4).getValues();
  afAssert_(!rows.some(function (row) { return String(row[0] || '').trim() === name; }), 'DUPLICATE');
  const grid = adminAnswers_();
  const index = rows.findIndex(function (row, column) { return !row[0] && !row[3] && grid.every(function (answers) { return answers[column] === ''; }); });
  afAssert_(index >= 0, 'CAPACITY');
  settings.getRange(14 + index, 1, 1, 4).setValues([[name, payload.required, true, 'm_' + Utilities.getUuid()]]);
}
function afRequired_(payload, state) {
  const member = state.members.find(function (item) { return item.id === payload.memberId; });
  afAssert_(member && typeof payload.required === 'boolean' && typeof payload.before === 'boolean', 'INVALID_REQUEST');
  afAssert_(member.required === payload.before || member.required === payload.required, 'CONFLICT');
  sheet_(AF.members).getRange(afMemberRow_(member.id), 2).setValue(payload.required);
}
function afAddSlot_(payload, state) {
  afAssert_(typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date) &&
    typeof payload.time === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(payload.time), 'INVALID_REQUEST');
  const day = date_(payload.date);
  const end = date_(state.weekId); end.setDate(end.getDate() + 6);
  afAssert_(payload.date >= state.weekId && payload.date <= fmtDate_(end), 'INVALID_REQUEST');
  const key = slotKey_(payload.date, payload.time);
  afAssert_(!state.slots.some(function (slot) { return slot.key === key; }), 'DUPLICATE');
  const used = new Set(listSlots_().map(function (slot) { return slot.row; }));
  let row = AF.firstSlotRow;
  while (used.has(row) && row <= AF.lastSlotRow) row++;
  afAssert_(row <= AF.lastSlotRow, 'CAPACITY');
  // Empty date cells must not silently reattach orphaned answers.
  afAssert_(adminAnswers_()[row - AF.firstSlotRow].every(function (answer) { return answer === ''; }), 'HAS_ANSWERS');
  sheet_(AF.main).getRange(row, 1, 1, 2).setValues([[day, time_(payload.time)]]);
  sheet_(AF.main).getRange(row, 1).setNumberFormat('m/d(ddd)');
  sheet_(AF.main).getRange(row, 2).setNumberFormat('hh:mm');
}
function afRemoveSlot_(payload, state) {
  const slot = listSlots_().find(function (item) { return item.key === payload.slot; });
  afAssert_(slot, 'INVALID_REQUEST');
  afAssert_(state.confirmed !== payload.slot, 'INELIGIBLE');
  afAssert_(adminAnswers_()[slot.row - AF.firstSlotRow].every(function (answer) { return answer === ''; }), 'HAS_ANSWERS');
  sheet_(AF.main).getRange(slot.row, 1, 1, 2).clearContent();
}
function afConfirm_(payload, state) {
  afAssert_(payload.before === state.confirmed, 'CONFLICT');
  const slot = state.slots.find(function (item) { return item.key === payload.slot; });
  afAssert_(slot && slot.judgment === '開催可能', 'INELIGIBLE');
  sheet_(AF.summary).getRange('B3').setValue(new Date(slot.date + 'T' + slot.time + ':00+09:00'));
  SpreadsheetApp.flush();
  afCheckPushSafe_();
}
function afHistory_(payload) {
  const offset = payload.offset === undefined ? 0 : payload.offset;
  afAssert_(Number.isSafeInteger(offset) && offset >= 0 && offset <= 10000, 'INVALID_REQUEST');
  const history = sheet_(AF.history);
  const total = Math.max(0, history.getLastRow() - 3);
  const count = Math.min(12, Math.max(0, total - offset));
  const rows = count ? history.getRange(4 + total - offset - count, 1, count, 6).getValues().reverse() : [];
  return { items: rows.map(function (row) {
    return { weekId: responseWeekId_(row[0]), confirmed: row[3] instanceof Date ?
      slotKey_(fmtDate_(row[3]), fmtTime_(row[3])) : null, status: String(row[4] || '') };
  }), nextOffset: total > offset + count ? offset + count : null };
}
function afAssert_(condition, code) { if (!condition) throw afError_(code); }
function afError_(code) { const error = new Error(code); error.code = code; return error; }
function afOutput_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
