export function canonicalJson(value) {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function signingInput(request) {
  return canonicalJson({
    version: request.version,
    requestId: request.requestId,
    action: request.action,
    payload: request.payload,
    idToken: request.idToken || "",
    issuedAt: request.bff.issuedAt,
    nonce: request.bff.nonce,
  });
}
export async function signRequest(request, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signingInput(request)),
      ),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
