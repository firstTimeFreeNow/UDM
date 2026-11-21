/** The only place application services are wired to Google adapters. All wiring is lazy. */
function afScheduleService_() {
  return afCreateScheduleService_({
    repository: afSheetsScheduleRepository_(),
    cache: { get: cachedAnswerData_, put: cacheAnswerData_, invalidate: invalidateAnswerCache_ },
    week: { pending: () => !!rolloverProperties_().getProperty('pendingRolloverWeek') },
    clock: { now: () => Date.now(), iso: () => new Date().toISOString() },
    ids: { uuid: () => Utilities.getUuid() },
    effects: { confirmed: afCheckPushSafe_ },
    limits: { maxParticipants: AF.maxParticipants },
  });
}
function afClock_(): AfClock {
  return { now: () => Date.now(), iso: () => new Date().toISOString() };
}
function afLinkService_() {
  return afCreateLinkService_({
    repository: afSheetsLinkRepository_(),
    clock: afClock_(),
    ids: { uuid: () => Utilities.getUuid() },
  });
}
function afPushService_() {
  return afCreatePushService_({
    repository: afPropertiesPushRepository_(),
    delivery: afFcmDelivery_(),
    clock: afClock_(),
    ids: { uuid: () => Utilities.getUuid() },
    policy: { maxAge: AF_PUSH_MAX_AGE, maxDevices: AF_PUSH_MAX_DEVICES },
  });
}
function afRolloverService_() {
  return afCreateRolloverService_({
    repository: afSheetsRolloverRepository_(),
    execution: {
      run(operation) {
        const lock = LockService.getScriptLock();
        if (!lock || !lock.tryLock(15000)) return;
        try {
          operation();
        } finally {
          lock.releaseLock();
        }
      },
    },
    clock: afClock_(),
    notifications: { checkSafe: afCheckPushSafe_ },
    selection: { refresh: afRefreshSelectedOption_ },
    cache: { invalidate: invalidateAnswerCache_ },
    delayMinutes: AF.rolloverDelayMinutes,
  });
}
function afLoginInfoService_() {
  return afCreateLoginInfoService_(afPropertiesLoginInfoRepository_());
}
function afRequestHandler_() {
  return afCreateRequestHandler_({
    identity: { role: afIdentity_ },
    execution: { web: afWithLock_ },
    schedule: afScheduleService_(),
    links: afLinkService_(),
    push: afPushService_(),
    history: afCreateHistoryService_(afSheetsHistoryRepository_()).read,
  });
}

function afSetupService_() {
  return afCreateSetupService_({
    repository: afSheetsSetupRepository_(),
    push: afPropertiesPushRepository_(),
    delivery: afFcmSetup_(),
    week: { pending: () => !!rolloverProperties_().getProperty('pendingRolloverWeek') },
    ids: { uuid: () => Utilities.getUuid() },
    cache: { invalidate: invalidateAnswerCache_ },
  });
}
