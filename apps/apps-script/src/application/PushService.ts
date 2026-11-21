/** Notifications are coordinated independently of FCM and Script Properties. */
function afCreatePushService_(dependencies: {
  repository: AfPushRepository;
  delivery: AfPushDelivery;
  clock: AfClock;
  ids: AfIds;
  policy: { maxAge: number; maxDevices: number };
}) {
  const { repository: repo, delivery, clock, ids, policy } = dependencies;
  function status(payload: AfPayloads['af.push.status']): AfModels['PushStatus'] {
    const token = payload.token ? afPushToken_(payload.token) : null;
    const device = token ? repo.device(token) : null;
    return {
      ready: repo.ready(),
      enabled: !!device && clock.now() - device.updatedAt < policy.maxAge,
      deliveryIssue: repo.issue(),
    };
  }
  function check() {
    if (!repo.ready()) return;
    const available = repo.devices();
    const current = repo.current();
    const previous = repo.event();
    const event = afNextPushEvent_(previous, current, ids.uuid);
    if (event !== previous) repo.saveEvent(event);
    if (!event.id || !current.upcoming) return;
    const devices = available
      .filter(
        (device) =>
          device.lastEvent !== event.id &&
          (device.attemptEvent !== event.id || device.attempts < 5),
      )
      .slice(0, 20);
    if (!devices.length) return;
    const outcomes = delivery.send(
      devices.map((device) => afNotificationMessage_(event, device.token, clock.now())),
    );
    let failed = false;
    outcomes.forEach((outcome, index) => {
      const device = devices[index];
      if (outcome.expired) {
        repo.removeDevice(device.key);
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
      repo.saveDevice(device.key, record);
    });
    repo.error(failed);
  }
  return {
    status,
    check,
    checkSafe() {
      try {
        check();
      } catch {
        repo.error(true);
      }
    },
    subscribe(payload: AfPayloads['af.push.subscribe']): AfModels['PushStatus'] {
      afAssert_(repo.ready(), 'CONFIG_REQUIRED');
      const token = afPushToken_(payload.token);
      const previousToken = payload.previousToken ? afPushToken_(payload.previousToken) : '';
      const previous = repo.device(token);
      const devices = repo.devices();
      afAssert_(previous || devices.length < policy.maxDevices, 'CAPACITY');
      if (!previous) afAssert_(delivery.validate(token), 'INVALID_REQUEST');
      const event = repo.event();
      repo.saveDevice(repo.deviceKey(token), {
        token,
        updatedAt: clock.now(),
        lastEvent: previous ? previous.lastEvent || '' : event?.id || '',
        attempts: previous?.attempts || 0,
        attemptEvent: previous?.attemptEvent || '',
      });
      if (previousToken && previousToken !== token)
        repo.removeDevice(repo.deviceKey(previousToken));
      return status({ token });
    },
    unsubscribe(payload: AfPayloads['af.push.unsubscribe']): AfModels['PushStatus'] {
      repo.removeDevice(repo.deviceKey(afPushToken_(payload.token)));
      return { ready: repo.ready(), enabled: false, deliveryIssue: false };
    },
    test(payload: AfModels['PushTestRequest'], requestId: string): AfModels['PushTestResult'] {
      const { title, body } = afTestNotification_(payload);
      afAssert_(repo.ready(), 'CONFIG_REQUIRED');
      const fingerprint = repo.fingerprint(title, body);
      const previous = repo.memo();
      if (previous && previous.requestId === requestId) {
        afAssert_(previous.fingerprint === fingerprint, 'INVALID_REQUEST');
        afAssert_(previous.result, 'CONFLICT');
        return previous.result;
      }
      const devices = repo.devices();
      const record: AfPushMemo = { requestId, fingerprint };
      // Persist before delivery: a crashed broadcast must not be silently replayed.
      repo.saveMemo(record);
      const result = { total: devices.length, accepted: 0, failed: 0, removed: 0 };
      if (devices.length) {
        const outcomes = delivery.send(
          devices.map((device) => ({
            token: device.token,
            data: {
              type: 'afetiria-confirmed',
              test: 'true',
              title,
              body,
              eventId: 'test-' + requestId,
            },
            webpush: { headers: { TTL: '300', Urgency: 'high' } },
          })),
        );
        outcomes.forEach((outcome, index) => {
          if (outcome.accepted) result.accepted++;
          else if (outcome.expired) {
            repo.removeDevice(devices[index].key);
            result.removed++;
          } else result.failed++;
        });
      }
      record.result = result;
      repo.saveMemo(record);
      return result;
    },
  };
}
