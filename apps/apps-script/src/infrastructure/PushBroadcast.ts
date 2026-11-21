/** Preserve the existing persisted broadcast fingerprint encoding. */
function afPushFingerprint_(title: string, body: string): string {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify([title, body]),
    Utilities.Charset.UTF_8,
  ).join(',');
}
