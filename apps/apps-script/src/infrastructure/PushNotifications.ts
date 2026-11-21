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

function afFcmSetup_(): AfPushSetup {
  return {
    validate() {
      const request = afPushRequest_(
        { topic: 'udm-afetiria-configuration-check', data: { type: 'configuration-check' } },
        true,
      );
      // Configuration errors must retain their codes; only fetch failures become connection errors.
      let response;
      try {
        response = UrlFetchApp.fetch(request.url, request);
      } catch {
        throw new Error(
          'FCMに接続できません。Apps Scriptの通知送信権限を承認し、Firebase Cloud Messaging APIの有効化を確認してください。',
        );
      }
      return {
        accepted: afPushResponse_(response, request).accepted,
        httpStatus: response.getResponseCode(),
      };
    },
    activate() {
      PropertiesService.getScriptProperties().setProperty(AF_PUSH_READY, 'true');
    },
  };
}
