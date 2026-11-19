/** Opt-in device destinations; no member names, emails or UID associations. */
const AF_PUSH_PREFIX = 'AF_PUSH_DEVICE_';
const AF_PUSH_READY = 'AF_PUSH_READY';
const AF_PUSH_EVENT = 'AF_PUSH_EVENT';
const AF_PUSH_ERROR = 'AF_PUSH_LAST_ERROR';
const AF_PUSH_MAX_DEVICES = 100;
const AF_PUSH_MAX_AGE = 90 * 24 * 60 * 60 * 1000;
function afPushToken_(token) {
  afAssert_(typeof token === 'string' && /^[A-Za-z0-9:_.-]{20,2048}$/.test(token), 'INVALID_REQUEST');
  return token;
}
function afPushKey_(token) {
  return AF_PUSH_PREFIX + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}
function afPushStored_(key) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || 'null'); }
  catch (error) { return null; }
}
function afPushReady_() {
  return PropertiesService.getScriptProperties().getProperty(AF_PUSH_READY) === 'true';
}
function afPushStatus_(payload) {
  const token = payload.token ? afPushToken_(payload.token) : null;
  const device = token ? afPushStored_(afPushKey_(token)) : null;
  return { ready: afPushReady_(), enabled: !!device && Date.now() - device.updatedAt < AF_PUSH_MAX_AGE,
    deliveryIssue: !!PropertiesService.getScriptProperties().getProperty(AF_PUSH_ERROR) };
}
function afPushDevices_() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  return Object.keys(all).filter(function (key) { return key.startsWith(AF_PUSH_PREFIX); }).map(function (key) {
    const device = afPushStored_(key);
    if (!device || typeof device.token !== 'string' || !Number.isFinite(device.updatedAt) || Date.now() - device.updatedAt >= AF_PUSH_MAX_AGE) {
      properties.deleteProperty(key); return null;
    }
    return { key: key, token: device.token, updatedAt: device.updatedAt, lastEvent: device.lastEvent || '', attempts: device.attempts || 0, attemptEvent: device.attemptEvent || '' };
  }).filter(Boolean);
}
function afPushSubscribe_(payload) {
  afAssert_(afPushReady_(), 'CONFIG_REQUIRED');
  const token = afPushToken_(payload.token);
  const previousToken = payload.previousToken ? afPushToken_(payload.previousToken) : '';
  const properties = PropertiesService.getScriptProperties();
  const key = afPushKey_(token);
  const previous = afPushStored_(key);
  const devices = afPushDevices_();
  afAssert_(previous || devices.length < AF_PUSH_MAX_DEVICES, 'CAPACITY');
  const event = afPushStored_(AF_PUSH_EVENT);
  properties.setProperty(key, JSON.stringify({ token: token, updatedAt: Date.now(),
    lastEvent: previous ? previous.lastEvent || '' : event && event.id || '', attempts: previous && previous.attempts || 0, attemptEvent: previous && previous.attemptEvent || '' }));
  if (previousToken && previousToken !== token) {
    properties.deleteProperty(afPushKey_(previousToken));
  }
  return afPushStatus_({token: token});
}
function afPushUnsubscribe_(payload) {
  PropertiesService.getScriptProperties().deleteProperty(afPushKey_(afPushToken_(payload.token)));
  return { ready: afPushReady_(), enabled: false, deliveryIssue: false };
}
function afPushCurrent_() {
  const week = weekId_();
  const selected = sheet_(AF.summary).getRange('B3').getValue();
  if (!(selected instanceof Date)) return { key: '', weekId: week, slot: '', upcoming: false };
  const slot = slotKey_(fmtDate_(selected), fmtTime_(selected));
  const valid = listSlots_().some(function (candidate) { return candidate.key === slot; });
  return { key: valid ? week + '|' + slot : '', weekId: week, slot: valid ? slot : '', upcoming: valid && selected.getTime() > Date.now() };
}
function afPushRequest_(message, validateOnly) {
  const project = PropertiesService.getScriptProperties().getProperty('UDM_FIREBASE_PROJECT_ID');
  afAssert_(typeof project === 'string' && /^[a-z0-9-]+$/.test(project), 'CONFIG_REQUIRED');
  return { url: 'https://fcm.googleapis.com/v1/projects/' + project + '/messages:send', method: 'post',
    contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ validate_only: !!validateOnly, message: message }), muteHttpExceptions: true };
}
/** Keep only the latest response evidence; never store request tokens or response bodies. */
function afPushResponse_(response, request) {
  const project = request.url.split('/projects/')[1].split('/')[0];
  const status = response.getResponseCode();
  let data;
  try { data = JSON.parse(response.getContentText()); } catch (error) { data = {}; }
  const prefix = 'projects/' + project + '/messages/';
  const name = data && data.name;
  const validName = typeof name === 'string' && name.startsWith(prefix) &&
    /^[A-Za-z0-9%:_.~-]{1,256}$/.test(name.slice(prefix.length));
  const errorCode = data && data.error && data.error.status;
  const details = data && data.error && data.error.details;
  const attempt = { at: new Date().toISOString(), project: project, httpStatus: status,
    validateOnly: JSON.parse(request.payload).validate_only === true,
    messageId: validName ? name : null, accepted: status === 200 && validName,
    errorCode: typeof errorCode === 'string' && /^[A-Z_]{1,80}$/.test(errorCode) ? errorCode : null };
  PropertiesService.getScriptProperties().setProperty('AF_PUSH_LAST_ATTEMPT', JSON.stringify(attempt));
  console.log(JSON.stringify({ event: 'af.fcm.response', ...attempt }));
  return { accepted: attempt.accepted,
    expired: status === 404 && Array.isArray(details) && details.some(function (detail) { return detail && detail.errorCode === 'UNREGISTERED'; }) };
}
/** Run PushNotifications.gs > diagnosePushNotifications after sending a test. No notification is sent. */
function diagnosePushNotifications() {
  const properties = PropertiesService.getScriptProperties();
  const project = properties.getProperty('UDM_FIREBASE_PROJECT_ID');
  const result = { project: project, expectedProject: 'udm-2319d', projectMatches: project === 'udm-2319d',
    ready: afPushReady_(), lastAttempt: afPushStored_('AF_PUSH_LAST_ATTEMPT') };
  console.log(JSON.stringify(result));
  return result;
}
/** Run in the editor as the owner. Validation sends no notification. */
function initializePushNotifications() {
  return afWithLock_(function () {
    const request = afPushRequest_({ topic: 'udm-afetiria-configuration-check', data: { type: 'configuration-check' } }, true);
    let response;
    try { response = UrlFetchApp.fetch(request.url, request); }
    catch (error) { throw new Error('FCMに接続できません。Apps Scriptの通知送信権限を承認し、Firebase Cloud Messaging APIの有効化を確認してください。'); }
    if (!afPushResponse_(response, request).accepted) {
      throw new Error('FCMの送信権限を確認できません（HTTP ' + response.getResponseCode() + '）。Firebase Cloud Messaging APIと、実行アカウントのFirebaseプロジェクト権限を確認してください。');
    }
    const properties = PropertiesService.getScriptProperties();
    // Preserve any pending event when setup is rerun; do not notify historical confirmations.
    if (!afPushReady_()) {
      const current = afPushCurrent_();
      properties.setProperty(AF_PUSH_EVENT, JSON.stringify({ key: current.key, id: '', weekId: current.weekId, slot: current.slot }));
    }
    properties.setProperty(AF_PUSH_READY, 'true');
    properties.deleteProperty(AF_PUSH_ERROR);
    return { ready: true };
  });
}
/** Called while holding the shared ScriptLock, immediately on Web confirmation and by the existing 5-minute trigger. */
function afCheckPush_() {
  if (!afPushReady_()) return;
  const properties = PropertiesService.getScriptProperties();
  const availableDevices = afPushDevices_();
  const current = afPushCurrent_();
  let event = afPushStored_(AF_PUSH_EVENT);
  if (!event || event.key !== current.key) {
    const changed = !!event && !!event.key && event.weekId === current.weekId && event.slot !== current.slot;
    event = { key: current.key, id: current.upcoming ? Utilities.getUuid() : '', weekId: current.weekId, slot: current.slot, changed: changed };
    properties.setProperty(AF_PUSH_EVENT, JSON.stringify(event));
  }
  if (!event.id || !current.upcoming) return;
  const devices = availableDevices.filter(function (device) { return device.lastEvent !== event.id && (device.attemptEvent !== event.id || device.attempts < 5); }).slice(0,20);
  if (!devices.length) return;
  const expiresAt = new Date(event.slot.replace(' ', 'T') + ':00+09:00').getTime();
  const ttl = String(Math.max(0, Math.min(3600, Math.floor((expiresAt - Date.now()) / 1000))));
  const requests = devices.map(function (device) {
    return afPushRequest_({ token: device.token, data: { type: 'afetiria-confirmed', title: 'アフェティリアハード追加便',
      body: event.slot + (event.changed ? ' の開催が変更されました' : ' の開催が決まりました。'), eventId: event.id },
      webpush: { headers: { TTL: ttl, Urgency: 'high' } } }, false);
  });
  const responses = UrlFetchApp.fetchAll(requests);
  let failed = false;
  responses.forEach(function (response, index) {
    const device = devices[index];
    const outcome = afPushResponse_(response, requests[index]);
    if (outcome.expired) { properties.deleteProperty(device.key); return; }
    const record = { token: device.token, updatedAt: device.updatedAt, lastEvent: device.lastEvent, attempts: device.attemptEvent === event.id ? device.attempts : 0, attemptEvent: event.id };
    if (outcome.accepted) { record.lastEvent = event.id; record.attempts = 0; }
    else { record.attempts++; failed = true; }
    properties.setProperty(device.key, JSON.stringify(record));
  });
  if (failed) properties.setProperty(AF_PUSH_ERROR, 'DELIVERY_FAILED');
  else properties.deleteProperty(AF_PUSH_ERROR);
}
function afCheckPushSafe_() {
  try { afCheckPush_(); }
  catch (error) {
    PropertiesService.getScriptProperties().setProperty(AF_PUSH_ERROR, 'DELIVERY_FAILED');
    console.warn('開催通知の配信を完了できませんでした。次回の定期処理で確認します。');
  }
}

/** Admin-only immediate broadcast. Never changes schedule or automatic notification markers. */
function afPushTest_(payload, requestId) {
  afAssert_(typeof payload.title === 'string' && typeof payload.body === 'string', 'INVALID_REQUEST');
  const title = payload.title.trim();
  const body = payload.body.trim();
  afAssert_(title.length > 0 && title.length <= 80 && body.length > 0 && body.length <= 500 &&
    !/[\x00-\x1f\x7f]/.test(title) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body), 'INVALID_REQUEST');
  afAssert_(afPushReady_(), 'CONFIG_REQUIRED');
  const properties = PropertiesService.getScriptProperties();
  const memoKey = 'AF_PUSH_TEST_RESULT';
  const fingerprint = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([title,body]), Utilities.Charset.UTF_8).join(',');
  const previous = afPushStored_(memoKey);
  if (previous && previous.requestId === requestId) {
    afAssert_(previous.fingerprint === fingerprint, 'INVALID_REQUEST');
    afAssert_(previous.result, 'CONFLICT');
    return previous.result;
  }
  const devices = afPushDevices_();
  const record = { requestId: requestId, fingerprint: fingerprint };
  // Mark the request before sending; an interrupted request must not be silently replayed.
  properties.setProperty(memoKey, JSON.stringify(record));
  const result = { total: devices.length, accepted: 0, failed: 0, removed: 0 };
  if (devices.length) {
    const requests = devices.map(function (device) {
      return afPushRequest_({ token: device.token, data: { type: 'afetiria-confirmed', test: 'true',
        title: title, body: body, eventId: 'test-' + requestId }, webpush: { headers: { TTL: '300', Urgency: 'high' } } }, false);
    });
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function (response, index) {
      const outcome = afPushResponse_(response, requests[index]);
      if (outcome.accepted) { result.accepted++; return; }
      if (outcome.expired) {
        properties.deleteProperty(devices[index].key); result.removed++;
      } else result.failed++;
    });
  }
  record.result = result;
  properties.setProperty(memoKey, JSON.stringify(record));
  return result;
}
