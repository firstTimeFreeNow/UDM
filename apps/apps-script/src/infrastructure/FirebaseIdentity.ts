function afIdentity_(idToken: unknown): AfModels['Role'] {
  afAssert_(
    typeof idToken === 'string' && idToken.length > 0 && idToken.length <= 16000,
    'AUTH_REQUIRED',
  );
  const properties = PropertiesService.getScriptProperties();
  const key = properties.getProperty('UDM_FIREBASE_WEB_API_KEY');
  const projectId = properties.getProperty('UDM_FIREBASE_PROJECT_ID');
  let allowed;
  try {
    allowed = JSON.parse(properties.getProperty('UDM_ALLOWED_UIDS_JSON') as string);
  } catch (error) {
    /* handled below */
  }
  afAssert_(
    key && projectId && allowed && typeof allowed === 'object' && !Array.isArray(allowed),
    'CONFIG_REQUIRED',
  );
  let claims;
  try {
    const parts = idToken.split('.');
    afAssert_(parts.length === 3, 'AUTH_REQUIRED');
    claims = JSON.parse(
      Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString(),
    );
  } catch (error) {
    throw afError_('AUTH_REQUIRED');
  }
  const now = Date.now() / 1000;
  afAssert_(
    claims &&
      claims.aud === projectId &&
      claims.iss === 'https://securetoken.google.com/' + projectId &&
      typeof claims.sub === 'string' &&
      claims.sub.length > 0 &&
      claims.sub.length <= 128 &&
      Number.isFinite(claims.exp) &&
      claims.exp > now &&
      Number.isFinite(claims.iat) &&
      claims.iat <= now + 30,
    'AUTH_REQUIRED',
  );
  // Claims alone are untrusted; Google's lookup must still validate the actual token.
  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: idToken }),
      muteHttpExceptions: true,
    },
  );
  afAssert_(response.getResponseCode() === 200, 'AUTH_REQUIRED');
  let users;
  try {
    users = JSON.parse(response.getContentText()).users;
  } catch (error) {
    throw afError_('AUTH_REQUIRED');
  }
  afAssert_(
    Array.isArray(users) && users.length === 1 && users[0].localId && !users[0].disabled,
    'AUTH_REQUIRED',
  );
  const uid = users[0].localId;
  afAssert_(uid === claims.sub, 'AUTH_REQUIRED');
  afAssert_(
    Object.prototype.hasOwnProperty.call(allowed, uid) &&
      ['participant', 'admin'].indexOf(allowed[uid]) >= 0,
    'FORBIDDEN',
  );
  return allowed[uid];
}
