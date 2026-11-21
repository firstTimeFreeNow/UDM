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

function afPropertiesPushRepository_(): AfPushRepository {
  const properties = PropertiesService.getScriptProperties();
  return {
    ready: afPushReady_,
    issue: () => !!properties.getProperty(AF_PUSH_ERROR),
    event: () => afPushStored_<AfPushEvent>(AF_PUSH_EVENT),
    saveEvent: (event) => {
      properties.setProperty(AF_PUSH_EVENT, JSON.stringify(event));
    },
    memo: () => afPushStored_<AfPushMemo>('AF_PUSH_TEST_RESULT'),
    saveMemo: (memo) => {
      properties.setProperty('AF_PUSH_TEST_RESULT', JSON.stringify(memo));
    },
    device: (token) => afPushStored_<AfStoredDevice>(afPushKey_(token)),
    saveDevice: (key, device) => {
      properties.setProperty(key, JSON.stringify(device));
    },
    removeDevice: (key) => {
      properties.deleteProperty(key);
    },
    devices: afPushDevices_,
    deviceKey: afPushKey_,
    fingerprint: afPushFingerprint_,
    current: afPushCurrent_,
    error(failed) {
      if (failed) properties.setProperty(AF_PUSH_ERROR, 'DELIVERY_FAILED');
      else properties.deleteProperty(AF_PUSH_ERROR);
    },
  };
}
