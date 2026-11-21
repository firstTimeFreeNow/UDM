/** Admin-only immediate broadcast. Never changes schedule or automatic notification markers. */
function afPushTest_(
  payload: AfModels['PushTestRequest'],
  requestId: string,
): AfModels['PushTestResult'] {
  afAssert_(
    typeof payload.title === 'string' && typeof payload.body === 'string',
    'INVALID_REQUEST',
  );
  const title = payload.title.trim();
  const body = payload.body.trim();
  afAssert_(
    title.length > 0 &&
      title.length <= 80 &&
      body.length > 0 &&
      body.length <= 500 &&
      !/[\x00-\x1f\x7f]/.test(title) &&
      !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body),
    'INVALID_REQUEST',
  );
  afAssert_(afPushReady_(), 'CONFIG_REQUIRED');
  const properties = PropertiesService.getScriptProperties();
  const memoKey = 'AF_PUSH_TEST_RESULT';
  const fingerprint = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify([title, body]),
    Utilities.Charset.UTF_8,
  ).join(',');
  const previous = afPushStored_<AfPushMemo>(memoKey);
  if (previous && previous.requestId === requestId) {
    afAssert_(previous.fingerprint === fingerprint, 'INVALID_REQUEST');
    afAssert_(previous.result, 'CONFLICT');
    return previous.result;
  }
  const devices = afPushDevices_();
  const record: AfPushMemo = { requestId, fingerprint };
  // Mark the request before sending; an interrupted request must not be silently replayed.
  properties.setProperty(memoKey, JSON.stringify(record));
  const result = { total: devices.length, accepted: 0, failed: 0, removed: 0 };
  if (devices.length) {
    const requests = devices.map(function (device) {
      return afPushRequest_(
        {
          token: device.token,
          data: {
            type: 'afetiria-confirmed',
            test: 'true',
            title: title,
            body: body,
            eventId: 'test-' + requestId,
          },
          webpush: { headers: { TTL: '300', Urgency: 'high' } },
        },
        false,
      );
    });
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function (response, index) {
      const outcome = afPushResponse_(response, requests[index]);
      if (outcome.accepted) {
        result.accepted++;
        return;
      }
      if (outcome.expired) {
        properties.deleteProperty(devices[index].key);
        result.removed++;
      } else result.failed++;
    });
  }
  record.result = result;
  properties.setProperty(memoKey, JSON.stringify(record));
  return result;
}
