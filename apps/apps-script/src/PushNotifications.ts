/** Run main.gs > diagnosePushNotifications after sending a test. No notification is sent. */
function afDiagnosePushNotifications_() {
  const properties = PropertiesService.getScriptProperties();
  const project = properties.getProperty('UDM_FIREBASE_PROJECT_ID');
  const result = {
    project: project,
    expectedProject: 'udm-2319d',
    projectMatches: project === 'udm-2319d',
    ready: afPushReady_(),
    lastAttempt: afPushStored_<AfPushAttempt>('AF_PUSH_LAST_ATTEMPT'),
  };
  console.log(JSON.stringify(result));
  return result;
}

/** Run in the editor as the owner. Validation sends no notification. */
function afInitializePushNotifications_() {
  return afWithLock_(function () {
    const request = afPushRequest_(
      { topic: 'udm-afetiria-configuration-check', data: { type: 'configuration-check' } },
      true,
    );
    let response;
    try {
      response = UrlFetchApp.fetch(request.url, request);
    } catch (error) {
      throw new Error(
        'FCMに接続できません。Apps Scriptの通知送信権限を承認し、Firebase Cloud Messaging APIの有効化を確認してください。',
      );
    }
    if (!afPushResponse_(response, request).accepted) {
      throw new Error(
        'FCMの送信権限を確認できません（HTTP ' +
          response.getResponseCode() +
          '）。Firebase Cloud Messaging APIと、実行アカウントのFirebaseプロジェクト権限を確認してください。',
      );
    }
    const properties = PropertiesService.getScriptProperties();
    // Preserve any pending event when setup is rerun; do not notify historical confirmations.
    if (!afPushReady_()) {
      const current = afPushCurrent_();
      properties.setProperty(
        AF_PUSH_EVENT,
        JSON.stringify({ key: current.key, id: '', weekId: current.weekId, slot: current.slot }),
      );
    }
    properties.setProperty(AF_PUSH_READY, 'true');
    properties.deleteProperty(AF_PUSH_ERROR);
    return { ready: true };
  });
}
