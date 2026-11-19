/** ISOLATED TEST PROJECT ONLY. No existing scheduling code or real data belongs here. */
function doPost(event) {
  var requestId = '';
  var action = '';
  var result;
  try {
    var body = event && event.postData && event.postData.contents;
    if (typeof body !== 'string' || body.length > 32000) throw probeError_('INVALID_REQUEST');
    var request;
    try { request = JSON.parse(body); } catch (error) { throw probeError_('INVALID_REQUEST'); }
    requestId = request && request.requestId;
    action = request && request.action;
    if (!request || request.version !== 1 || typeof requestId !== 'string' ||
        !/^[A-Za-z0-9_-]{8,80}$/.test(requestId) ||
        ['probe.read', 'probe.write', 'probe.admin'].indexOf(action) < 0 ||
        !request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
      throw probeError_('INVALID_REQUEST');
    }
    var properties = PropertiesService.getScriptProperties();
    var identity = probeIdentity_(request.idToken, properties);
    if (action === 'probe.admin') {
      if (identity.role !== 'admin') throw probeError_('FORBIDDEN');
      result = { role: 'admin' };
    } else {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) throw probeError_('BUSY');
      try { result = probeData_(request, properties); }
      finally { lock.releaseLock(); }
    }
    return probeOutput_({ version: 1, requestId: requestId, ok: true, data: result });
  } catch (error) {
    // Do not return/log raw errors, request bodies, tokens, account data, or sheet IDs.
    var known = ['AUTH_REQUIRED', 'FORBIDDEN', 'INVALID_REQUEST', 'CONFLICT', 'BUSY',
      'CONFIG_REQUIRED', 'FIXTURE_REQUIRED'];
    var code = known.indexOf(error && error.code) >= 0 ? error.code : 'INTERNAL_ERROR';
    return probeOutput_({ version: 1, requestId: typeof requestId === 'string' ? requestId : '',
      ok: false, error: { code: code } });
  }
}

function probeIdentity_(idToken, properties) {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 16000) throw probeError_('AUTH_REQUIRED');
  var key = properties.getProperty('PROBE_FIREBASE_WEB_API_KEY');
  var allowedJson = properties.getProperty('PROBE_ALLOWED_UIDS_JSON');
  if (!key || !allowedJson) throw probeError_('CONFIG_REQUIRED');
  var allowed;
  try { allowed = JSON.parse(allowedJson); } catch (error) { throw probeError_('CONFIG_REQUIRED'); }
  if (!allowed || typeof allowed !== 'object' || Array.isArray(allowed)) throw probeError_('CONFIG_REQUIRED');
  // accounts:lookup validates the Firebase ID token in the configured project's API context.
  // Live project mismatch/expiry/revocation checks are required before production use.
  var response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true,
    });
  if (response.getResponseCode() !== 200) throw probeError_('AUTH_REQUIRED');
  var account;
  try { account = JSON.parse(response.getContentText()).users; } catch (error) { throw probeError_('AUTH_REQUIRED'); }
  if (!Array.isArray(account) || account.length !== 1 || !account[0].localId || account[0].disabled) {
    throw probeError_('AUTH_REQUIRED');
  }
  var uid = account[0].localId;
  if (!Object.prototype.hasOwnProperty.call(allowed, uid)) throw probeError_('FORBIDDEN');
  var role = allowed[uid];
  if (role !== 'participant' && role !== 'admin') throw probeError_('FORBIDDEN');
  return { role: role };
}

function probeData_(request, properties) {
  var spreadsheetId = properties.getProperty('PROBE_SPREADSHEET_ID');
  if (!spreadsheetId) throw probeError_('CONFIG_REQUIRED');
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('transport_probe');
  if (!sheet) throw probeError_('FIXTURE_REQUIRED');
  var values = sheet.getRange('A1:C2').getValues();
  if (values[0][0] !== 'UDM_TRANSPORT_PROBE_V1' || values[1][0] !== 'demo-slot' ||
      !Number.isSafeInteger(values[0][1]) || values[0][1] < 0 ||
      ['', 'yes', 'maybe', 'no'].indexOf(values[1][1]) < 0) throw probeError_('FIXTURE_REQUIRED');
  var revision = values[0][1];
  if (request.action === 'probe.read') return { revision: revision, value: values[1][1] };
  var payload = request.payload;
  if (Object.keys(payload).sort().join(',') !== 'expectedRevision,value' ||
      !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 ||
      ['', 'yes', 'maybe', 'no'].indexOf(payload.value) < 0) throw probeError_('INVALID_REQUEST');
  var receipt = null;
  try { receipt = JSON.parse(values[0][2] || 'null'); } catch (error) { throw probeError_('FIXTURE_REQUIRED'); }
  if (receipt && receipt.requestId === request.requestId) {
    if (receipt.value !== payload.value || receipt.expectedRevision !== payload.expectedRevision) {
      throw probeError_('CONFLICT');
    }
    return { revision: receipt.revision, value: receipt.value, saved: true, replayed: true };
  }
  if (revision !== payload.expectedRevision) throw probeError_('CONFLICT');
  var next = revision + 1;
  if (!Number.isSafeInteger(next)) throw probeError_('FIXTURE_REQUIRED');
  var ack = { requestId: request.requestId, expectedRevision: payload.expectedRevision,
    revision: next, value: payload.value };
  // One range write, still not a transaction against direct human edits to the sheet.
  sheet.getRange('B1:C2').setValues([[next, JSON.stringify(ack)], [payload.value, '']]);
  SpreadsheetApp.flush();
  return { revision: next, value: payload.value, saved: true, replayed: false };
}

function probeOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function probeError_(code) { var error = new Error(code); error.code = code; return error; }
