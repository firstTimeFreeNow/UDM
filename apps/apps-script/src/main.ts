/** Apps Scriptのメニュー・トリガー・ダイアログから呼び出す関数。 */
function preloadAnswerData() {
  return afPreloadAnswers_();
}

function onOpen() {
  return afOpenSheet_();
}

function onEdit(event?: GoogleAppsScript.Events.SheetsOnEdit) {
  return afEditSheet_(event);
}

function showAnswerDialog() {
  return afShowAnswerDialog_();
}

function showCandidateDialog() {
  return afShowCandidateDialog_();
}

function getAnswerData(forceRefresh = false) {
  return afGetAnswerData_(forceRefresh);
}

function setAnswer(payload: {
  weekId: string;
  member: string;
  slot: string;
  answer: AfModels['Answer'];
}) {
  return afSetAnswer_(payload);
}

function setAnswersBatch(payload: AfSheetSaveRequest) {
  return afSetAnswersBatch_(payload);
}

function getCandidateData() {
  return afGetCandidateData_();
}

function addCandidate(payload: Pick<AfModels['AddCandidateRequest'], 'date' | 'time'>) {
  return afAddCandidate_(payload);
}

function removeCandidate(key: string) {
  return afRemoveCandidate_(key);
}

function installRolloverTrigger() {
  return afInstallRolloverTrigger_();
}

function checkScheduleRollover() {
  return afCheckScheduleRollover_();
}

function benchmarkAnswerData() {
  return afBenchmarkAnswerData_();
}

function benchmarkPreload() {
  return afBenchmarkPreload_();
}

function doPost(event: GoogleAppsScript.Events.DoPost) {
  return afHandleWebRequest_(event);
}

function initializeWebApp() {
  return afInitializeWebApp_();
}

function diagnosePushNotifications() {
  return afDiagnosePushNotifications_();
}

function initializePushNotifications() {
  return afInitializePushNotifications_();
}

function showLoginInfoDialog() {
  return afShowLoginInfoDialog_();
}

function getLoginInfoQuestion() {
  return afGetLoginInfoQuestion_();
}

function getLoginInfoWithAnswer(answer: unknown) {
  return afGetLoginInfoWithAnswer_(answer);
}
