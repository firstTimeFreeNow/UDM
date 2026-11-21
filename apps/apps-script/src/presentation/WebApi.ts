/** Web entry point; never expose generic sheet/range operations. */
function afHandleWebRequest_(
  event: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
  let requestId = '';
  try {
    const body = event && event.postData && event.postData.contents;
    afAssert_(typeof body === 'string' && body.length <= 64000, 'INVALID_REQUEST');
    let request;
    try {
      request = JSON.parse(body);
    } catch (error) {
      throw afError_('INVALID_REQUEST');
    }
    requestId = request && request.requestId;
    afAssert_(
      request &&
        request.version === 1 &&
        typeof requestId === 'string' &&
        /^[A-Za-z0-9_-]{8,80}$/.test(requestId) &&
        request.payload &&
        typeof request.payload === 'object' &&
        !Array.isArray(request.payload),
      'INVALID_REQUEST',
    );
    afBffVerify_(request);
    const data = afDispatchRequest_(request);
    return afOutput_({ version: 1, requestId: requestId, ok: true, data: data });
  } catch (error) {
    const code = afPublicErrorCode_(error);
    return afOutput_({
      version: 1,
      requestId: typeof requestId === 'string' ? requestId : '',
      ok: false,
      error: { code: code },
    });
  }
}
function afOutput_(value: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
