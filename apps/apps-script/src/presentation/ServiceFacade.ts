/** Existing internal callbacks used by triggers and setup commands. */
function afCheckPush_() {
  return afPushService_().check();
}
function afCheckPushSafe_() {
  return afPushService_().checkSafe();
}
function afCheckScheduleRollover_() {
  return afRolloverService_().check();
}
function afGetLoginInfoQuestion_() {
  return afLoginInfoService_().question();
}
function afGetLoginInfoWithAnswer_(answer: unknown) {
  return afLoginInfoService_().reveal(answer);
}

function afInitializeWebApp_() {
  return afWithLock_(() => afSetupService_().web());
}
function afInitializePushNotifications_() {
  return afWithLock_(() => afSetupService_().notifications());
}
