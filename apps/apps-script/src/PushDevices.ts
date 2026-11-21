function afPushToken_(token: unknown): string {
  afAssert_(
    typeof token === 'string' && /^[A-Za-z0-9:_.-]{20,2048}$/.test(token),
    'INVALID_REQUEST',
  );
  return token;
}

function afPushKey_(token: string): string {
  return (
    AF_PUSH_PREFIX +
    afHex_(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8),
    )
  );
}

function afPushStored_<T>(key: string): T | null {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || 'null');
  } catch (error) {
    return null;
  }
}

function afPushReady_(): boolean {
  return PropertiesService.getScriptProperties().getProperty(AF_PUSH_READY) === 'true';
}

function afPushStatus_(payload: AfPayloads['af.push.status']): AfModels['PushStatus'] {
  const token = payload.token ? afPushToken_(payload.token) : null;
  const device = token ? afPushStored_<AfStoredDevice>(afPushKey_(token)) : null;
  return {
    ready: afPushReady_(),
    enabled: !!device && Date.now() - device.updatedAt < AF_PUSH_MAX_AGE,
    deliveryIssue: !!PropertiesService.getScriptProperties().getProperty(AF_PUSH_ERROR),
  };
}

function afPushDevices_(): AfPushDevice[] {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  return Object.keys(all)
    .filter(function (key) {
      return key.startsWith(AF_PUSH_PREFIX);
    })
    .map(function (key) {
      const device = afPushStored_<AfStoredDevice>(key);
      if (
        !device ||
        typeof device.token !== 'string' ||
        !Number.isFinite(device.updatedAt) ||
        Date.now() - device.updatedAt >= AF_PUSH_MAX_AGE
      ) {
        properties.deleteProperty(key);
        return null;
      }
      return {
        key: key,
        token: device.token,
        updatedAt: device.updatedAt,
        lastEvent: device.lastEvent || '',
        attempts: device.attempts || 0,
        attemptEvent: device.attemptEvent || '',
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}

function afPushSubscribe_(payload: AfPayloads['af.push.subscribe']): AfModels['PushStatus'] {
  afAssert_(afPushReady_(), 'CONFIG_REQUIRED');
  const token = afPushToken_(payload.token);
  const previousToken = payload.previousToken ? afPushToken_(payload.previousToken) : '';
  const properties = PropertiesService.getScriptProperties();
  const key = afPushKey_(token);
  const previous = afPushStored_<AfStoredDevice>(key);
  const devices = afPushDevices_();
  afAssert_(previous || devices.length < AF_PUSH_MAX_DEVICES, 'CAPACITY');
  if (!previous) {
    // Public opt-in must prove this is an FCM destination for our project before consuming a slot.
    const request = afPushRequest_({ token: token, data: { type: 'registration-check' } }, true);
    const response = UrlFetchApp.fetch(request.url, request);
    afAssert_(afPushResponse_(response, request).accepted, 'INVALID_REQUEST');
  }
  const event = afPushStored_<AfPushEvent>(AF_PUSH_EVENT);
  properties.setProperty(
    key,
    JSON.stringify({
      token: token,
      updatedAt: Date.now(),
      lastEvent: previous ? previous.lastEvent || '' : (event && event.id) || '',
      attempts: (previous && previous.attempts) || 0,
      attemptEvent: (previous && previous.attemptEvent) || '',
    }),
  );
  if (previousToken && previousToken !== token) {
    properties.deleteProperty(afPushKey_(previousToken));
  }
  return afPushStatus_({ token: token });
}

function afPushUnsubscribe_(payload: AfPayloads['af.push.unsubscribe']): AfModels['PushStatus'] {
  PropertiesService.getScriptProperties().deleteProperty(afPushKey_(afPushToken_(payload.token)));
  return { ready: afPushReady_(), enabled: false, deliveryIssue: false };
}
