import { jwtVerify, importX509 } from "jose";
import { BffError, Coordinator, route } from "./core.mjs";
const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certificates = null,
  loadingCertificates = null;
async function firebaseKey(header) {
  if (header.alg !== "RS256" || typeof header.kid !== "string")
    throw Error("bad key");
  if (!certificates || certificates.until <= Date.now()) {
    if (!loadingCertificates)
      loadingCertificates = (async () => {
        const response = await fetch(CERT_URL);
        if (!response.ok) throw Error("keys unavailable");
        const certs = await response.json();
        const seconds = Math.min(
          86400,
          Number(
            /max-age=(\d+)/.exec(
              response.headers.get("cache-control") || "",
            )?.[1] || 300,
          ),
        );
        const keys = new Map();
        for (const [k, cert] of Object.entries(certs))
          keys.set(k, await importX509(cert, "RS256"));
        certificates = { keys, until: Date.now() + seconds * 1000 };
      })().finally(() => {
        loadingCertificates = null;
      });
    await loadingCertificates;
  }
  const key = certificates.keys.get(header.kid);
  if (!key) throw Error("unknown key");
  return key;
}
export async function verifyToken(token, project, keyResolver = firebaseKey) {
  if (!project) throw new BffError("CONFIG_REQUIRED", 503);
  try {
    const verified = await jwtVerify(token, keyResolver, {
      algorithms: ["RS256"],
      audience: project,
      issuer: "https://securetoken.google.com/" + project,
      requiredClaims: ["sub", "exp", "iat", "auth_time"],
      clockTolerance: 5,
    });
    const p = verified.payload;
    if (
      verified.protectedHeader.alg !== "RS256" ||
      typeof verified.protectedHeader.kid !== "string" ||
      !verified.protectedHeader.kid ||
      typeof p.sub !== "string" ||
      !p.sub ||
      p.sub.length > 128 ||
      p.iat > Date.now() / 1000 + 5 ||
      !Number.isFinite(p.auth_time) ||
      p.auth_time > Date.now() / 1000 + 5
    )
      throw Error("claims");
    return p.sub;
  } catch (error) {
    if (error instanceof BffError) throw error;
    throw new BffError("AUTH_REQUIRED", 401);
  }
}
function response(data, status = 200, origin = "") {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Origin",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    },
  });
}
function errorResult(error, id, origin) {
  const safe =
    error instanceof BffError ? error : new BffError("INTERNAL_ERROR", 500);
  return response(
    {
      version: 1,
      requestId: id,
      ok: false,
      error: { code: safe.code, outcomeUnknown: safe.uncertain },
    },
    safe.status,
    origin,
  );
}
const anonymous = new Set([
  "af.push.status",
  "af.push.subscribe",
  "af.push.unsubscribe",
  "udm.links.resolve",
]);
async function boundedBody(request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64000) {
        await reader.cancel();
        throw new BffError("INVALID_REQUEST", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
export function createWorker({ verify = verifyToken } = {}) {
  return {
    async fetch(request, env) {
      const id = request.headers.get("X-Request-Id") || crypto.randomUUID();
      let origin = "";
      try {
        const origins = String(env.UDM_ALLOWED_ORIGINS || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        const supplied = request.headers.get("Origin");
        if (supplied && !origins.includes(supplied))
          throw new BffError("FORBIDDEN", 403);
        origin = supplied || "";
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(id))
          throw new BffError("INVALID_REQUEST");
        if (request.method === "OPTIONS")
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": origin,
              "Access-Control-Allow-Methods":
                "GET, POST, PATCH, DELETE, OPTIONS",
              "Access-Control-Allow-Headers":
                "Authorization, Content-Type, X-Request-Id",
              "Access-Control-Max-Age": "600",
              Vary: "Origin",
            },
          });
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health")
          return response({ ok: true }, 200, origin);
        let body = {};
        if (request.method !== "GET") {
          if (Number(request.headers.get("Content-Length") || 0) > 64000)
            throw new BffError("INVALID_REQUEST", 413);
          const text = await boundedBody(request);
          try {
            body = JSON.parse(text || "{}");
          } catch {
            throw new BffError("INVALID_REQUEST");
          }
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new BffError("INVALID_REQUEST");
        }
        const operation = route(request.method, url, body);
        let token = "",
          uid = "";
        if (!anonymous.has(operation.action)) {
          token =
            /^Bearer (.+)$/.exec(
              request.headers.get("Authorization") || "",
            )?.[1] || "";
          if (!token || token.length > 16000)
            throw new BffError("AUTH_REQUIRED", 401);
          uid = await verify(token, env.UDM_FIREBASE_PROJECT_ID);
        }
        const stub = env.SERVICE_CACHE.get(
          env.SERVICE_CACHE.idFromName("afetiria-extra"),
        );
        const result = await stub.fetch(
          new Request("https://internal/operation", {
            method: "POST",
            body: JSON.stringify({ ...operation, token, uid, requestId: id }),
          }),
        );
        const value = await result.json();
        if (!value.ok)
          throw new BffError(
            value.error.code,
            result.status,
            value.error.outcomeUnknown,
          );
        return response(
          {
            version: 1,
            requestId: id,
            ok: true,
            data: value.data,
            ...(value.meta ? { meta: value.meta } : {}),
          },
          200,
          origin,
        );
      } catch (error) {
        return errorResult(error, id, origin);
      }
    },
  };
}
export class ScheduleCoordinator {
  constructor(_state, env) {
    this.core = new Coordinator(env);
  }
  async fetch(request) {
    let id = "";
    try {
      const input = await request.json();
      id = input.requestId;
      const result = await this.core.handle(input);
      return response({ ok: true, ...result });
    } catch (error) {
      return errorResult(error, id, "");
    }
  }
}
export default createWorker();
