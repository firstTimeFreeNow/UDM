function afPushRequest_(message: AfFcmMessage, validateOnly: boolean): AfFcmRequest {
  const project = PropertiesService.getScriptProperties().getProperty('UDM_FIREBASE_PROJECT_ID');
  afAssert_(typeof project === 'string' && /^[a-z0-9-]+$/.test(project), 'CONFIG_REQUIRED');
  return {
    url: 'https://fcm.googleapis.com/v1/projects/' + project + '/messages:send',
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ validate_only: !!validateOnly, message: message }),
    muteHttpExceptions: true,
  };
}

/** Keep only the latest response evidence; never store request tokens or response bodies. */
function afPushResponse_(
  response: GoogleAppsScript.URL_Fetch.HTTPResponse,
  request: AfFcmRequest,
): { accepted: boolean; expired: boolean } {
  const project = request.url.split('/projects/')[1].split('/')[0];
  const status = response.getResponseCode();
  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    data = {};
  }
  const prefix = 'projects/' + project + '/messages/';
  const name = data && data.name;
  const validName =
    typeof name === 'string' &&
    name.startsWith(prefix) &&
    /^[A-Za-z0-9%:_.~-]{1,256}$/.test(name.slice(prefix.length));
  const errorCode = data && data.error && data.error.status;
  const details = data && data.error && data.error.details;
  const attempt = {
    at: new Date().toISOString(),
    project: project,
    httpStatus: status,
    validateOnly: JSON.parse(request.payload).validate_only === true,
    messageId: validName ? name : null,
    accepted: status === 200 && validName,
    errorCode: typeof errorCode === 'string' && /^[A-Z_]{1,80}$/.test(errorCode) ? errorCode : null,
  };
  PropertiesService.getScriptProperties().setProperty(
    'AF_PUSH_LAST_ATTEMPT',
    JSON.stringify(attempt),
  );
  console.log(JSON.stringify({ event: 'af.fcm.response', ...attempt }));
  return {
    accepted: attempt.accepted,
    expired:
      status === 404 &&
      Array.isArray(details) &&
      details.some(function (detail) {
        return detail && detail.errorCode === 'UNREGISTERED';
      }),
  };
}
