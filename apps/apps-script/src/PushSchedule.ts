function afPushCurrent_(): { key: string; weekId: string; slot: string; upcoming: boolean } {
  const week = weekId_();
  const selected = afSelectedDate_(sheet_(AF.summary).getRange('B3').getValue());
  if (!(selected instanceof Date)) return { key: '', weekId: week, slot: '', upcoming: false };
  const slot = slotKey_(fmtDate_(selected), fmtTime_(selected));
  const valid = listSlots_().some(function (candidate) {
    return candidate.key === slot;
  });
  return {
    key: valid ? week + '|' + slot : '',
    weekId: week,
    slot: valid ? slot : '',
    upcoming: valid && selected.getTime() > Date.now(),
  };
}

/** Called while holding the shared ScriptLock, immediately on Web confirmation and by the existing 5-minute trigger. */
function afCheckPush_() {
  if (!afPushReady_()) return;
  const properties = PropertiesService.getScriptProperties();
  const availableDevices = afPushDevices_();
  const current = afPushCurrent_();
  let event = afPushStored_<AfPushEvent>(AF_PUSH_EVENT);
  if (!event || event.key !== current.key) {
    const changed =
      !!event && !!event.key && event.weekId === current.weekId && event.slot !== current.slot;
    event = {
      key: current.key,
      id: current.upcoming ? Utilities.getUuid() : '',
      weekId: current.weekId,
      slot: current.slot,
      changed: changed,
    };
    properties.setProperty(AF_PUSH_EVENT, JSON.stringify(event));
  }
  if (!event.id || !current.upcoming) return;
  const devices = availableDevices
    .filter(function (device) {
      return (
        device.lastEvent !== event.id && (device.attemptEvent !== event.id || device.attempts < 5)
      );
    })
    .slice(0, 20);
  if (!devices.length) return;
  const expiresAt = new Date(event.slot.replace(' ', 'T') + ':00+09:00').getTime();
  const ttl = String(Math.max(0, Math.min(3600, Math.floor((expiresAt - Date.now()) / 1000))));
  const requests = devices.map(function (device) {
    return afPushRequest_(
      {
        token: device.token,
        data: {
          type: 'afetiria-confirmed',
          title: 'アフェティリアハード追加便',
          body:
            event.slot + (event.changed ? ' の開催が変更されました' : ' の開催が決まりました。'),
          eventId: event.id,
        },
        webpush: { headers: { TTL: ttl, Urgency: 'high' } },
      },
      false,
    );
  });
  const responses = UrlFetchApp.fetchAll(requests);
  let failed = false;
  responses.forEach(function (response, index) {
    const device = devices[index];
    const outcome = afPushResponse_(response, requests[index]);
    if (outcome.expired) {
      properties.deleteProperty(device.key);
      return;
    }
    const record = {
      token: device.token,
      updatedAt: device.updatedAt,
      lastEvent: device.lastEvent,
      attempts: device.attemptEvent === event.id ? device.attempts : 0,
      attemptEvent: event.id,
    };
    if (outcome.accepted) {
      record.lastEvent = event.id;
      record.attempts = 0;
    } else {
      record.attempts++;
      failed = true;
    }
    properties.setProperty(device.key, JSON.stringify(record));
  });
  if (failed) properties.setProperty(AF_PUSH_ERROR, 'DELIVERY_FAILED');
  else properties.deleteProperty(AF_PUSH_ERROR);
}

function afCheckPushSafe_() {
  try {
    afCheckPush_();
  } catch (error) {
    PropertiesService.getScriptProperties().setProperty(AF_PUSH_ERROR, 'DELIVERY_FAILED');
    console.warn('開催通知の配信を完了できませんでした。次回の定期処理で確認します。');
  }
}
