/** Canonical JSON matches tests/helpers/signature.ts and the Go BFF. */
function afBffCanonical_(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(afBffCanonical_).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(function (key) {
          return JSON.stringify(key) + ':' + afBffCanonical_(value[key]);
        })
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

function afBffVerify_(request: AfRequest): void {
  const properties = PropertiesService.getScriptProperties();
  if (!request.bff && properties.getProperty('UDM_BFF_REQUIRED') !== 'true') return;
  const secret = properties.getProperty('UDM_BFF_SHARED_SECRET');
  afAssert_(typeof secret === 'string' && secret.length >= 32, 'CONFIG_REQUIRED');
  const bff = request.bff;
  afAssert_(
    bff &&
      Number.isSafeInteger(bff.issuedAt) &&
      Math.abs(Date.now() - bff.issuedAt) <= 60000 &&
      typeof bff.nonce === 'string' &&
      /^[a-f0-9-]{36}$/.test(bff.nonce) &&
      typeof bff.signature === 'string' &&
      /^[a-f0-9]{64}$/.test(bff.signature),
    'AUTH_REQUIRED',
  );
  const input = afBffCanonical_({
    version: request.version,
    requestId: request.requestId,
    action: request.action,
    payload: request.payload,
    idToken: request.idToken || '',
    issuedAt: bff.issuedAt,
    nonce: bff.nonce,
  });
  const signature = afHex_(
    Utilities.computeHmacSha256Signature(input, secret, Utilities.Charset.UTF_8),
  );
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= signature.charCodeAt(i) ^ bff.signature.charCodeAt(i);
  afAssert_(difference === 0, 'AUTH_REQUIRED');
  afWithLock_(function () {
    const now = Date.now();
    let nonces;
    try {
      nonces = JSON.parse(properties.getProperty('UDM_BFF_NONCES') || '[]');
    } catch (error) {
      throw afError_('CONFIG_REQUIRED');
    }
    afAssert_(Array.isArray(nonces), 'CONFIG_REQUIRED');
    nonces = nonces.filter(function (item) {
      return item.until > now;
    });
    afAssert_(
      !nonces.some(function (item) {
        return item.nonce === bff.nonce;
      }),
      'AUTH_REQUIRED',
    );
    // Keep the single ScriptProperty below its size limit; valid callers can retry a read later.
    afAssert_(nonces.length < 100, 'BUSY');
    nonces.push({ nonce: bff.nonce, until: bff.issuedAt + 60001 });
    properties.setProperty('UDM_BFF_NONCES', JSON.stringify(nonces));
  });
}
