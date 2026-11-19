import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import {
  Coordinator,
  BffError,
  project,
  upstream,
  route,
} from "../../apps/bff/src/core.mjs";
import { createWorker, verifyToken } from "../../apps/bff/src/index.mjs";
import { bffRoute, bffEndpoint } from "../../packages/contracts/src/routes.mjs";
import { signRequest } from "../../packages/contracts/src/signature.mjs";
const state = () => ({
  weekId: "2026-11-16",
  confirmed: null,
  minParticipants: 6,
  maxParticipants: 8,
  members: [
    { id: "m_00000000-0000-0000-0000-000000000001", name: "A", required: true },
    { id: "m_00000000-0000-0000-0000-000000000002", name: "B", required: false },
  ],
  slots: [
    {
      key: "2026-11-16 21:30",
      date: "2026-11-16",
      time: "21:30",
      count: 1,
      judgment: "人数不足",
    },
  ],
  answers: {
    "m_00000000-0000-0000-0000-000000000001": { "2026-11-16 21:30": "○" },
    "m_00000000-0000-0000-0000-000000000002": { "2026-11-16 21:30": "×" },
  },
});
const input = (action = "af.read", payload = { view: "schedule" }) => ({
  action,
  payload,
  uid: "participant",
  token: "token",
  requestId: crypto.randomUUID(),
});
function fixture() {
  let time = 1000000,
    current = state();
  const calls = [];
  const send = async (_env, action, payload, token) => {
    calls.push({ action, payload, token });
    if (action === "af.session")
      return { role: token === "admin" ? "admin" : "participant" };
    if (action === "af.read") return structuredClone(current);
    if (action === "af.answers.save") {
      current.confirmed = "2026-11-16 21:30";
      return { saved: true, state: structuredClone(current) };
    }
    if (action === "af.history") return { items: [], nextOffset: null };
    return {};
  };
  return {
    core: new Coordinator({}, { send, now: () => time }),
    calls,
    send,
    advance: (n) => {
      time += n;
    },
  };
}
test("concurrent views coalesce one sheet read and preserve expiry instead of extending it on hits", async () => {
  const f = fixture();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => f.core.handle(input())),
  );
  assert.equal(f.calls.filter((c) => c.action === "af.read").length, 1);
  assert.equal(f.calls.filter((c) => c.action === "af.session").length, 1);
  assert.equal(results[0].meta.remainingTtlMs, 300000);
  f.advance(250000);
  const next = await f.core.handle(input());
  assert.equal(next.meta.remainingTtlMs, 50000);
  f.advance(50001);
  await f.core.handle(input());
  assert.equal(f.calls.filter((c) => c.action === "af.read").length, 2);
});
test("authorization is checked before cached data; admin data cannot be read by participants", async () => {
  const f = fixture();
  await f.core.handle(input());
  await assert.rejects(
    f.core.handle(input("af.read", { view: "admin" })),
    (e) => e.code === "FORBIDDEN",
  );
  await assert.rejects(
    f.core.handle(input("af.confirm", {})),
    (e) => e.code === "FORBIDDEN",
  );
  assert.equal(f.calls.filter((c) => c.action === "af.read").length, 1);
});
test("projections remove other members answers; admin receives deletion flags rather than answer contents", () => {
  const s = state();
  assert.deepEqual(project(s, "schedule").members, []);
  assert.deepEqual(project(s, "schedule").answers, {});
  const a = project(s, "answer", "m_00000000-0000-0000-0000-000000000001");
  assert.equal(a.answers["m_00000000-0000-0000-0000-000000000001"]["2026-11-16 21:30"], "○");
  assert.deepEqual(a.answers["m_00000000-0000-0000-0000-000000000002"], {});
  const admin = project(s, "admin");
  assert.equal(admin.slots[0].hasAnswers, true);
  assert.deepEqual(admin.answers["m_00000000-0000-0000-0000-000000000001"], {});
  assert.throws(
    () => project(s, "answer", "missing"),
    (e) => e.code === "INVALID_REQUEST",
  );
});
test("write results populate shared cache without a read and explicit refresh reaches the sheet", async () => {
  const f = fixture();
  await f.core.handle(input());
  const result = await f.core.handle(
    input("af.answers.save", { memberId: "m_00000000-0000-0000-0000-000000000001" }),
  );
  assert.equal(result.data.saved, true);
  assert.equal(
    (await f.core.handle(input())).data.confirmed,
    "2026-11-16 21:30",
  );
  assert.equal(f.calls.filter((c) => c.action === "af.read").length, 1);
  await f.core.handle({ ...input(), fresh: true });
  assert.equal(f.calls.filter((c) => c.action === "af.read").length, 2);
});
test("a slow earlier read cannot overwrite a later save, and uncertain writes are not retried", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let reads = 0,
    writes = 0;
  const original = state();
  const core = new Coordinator(
    {},
    {
      send: async (_env, action) => {
        if (action === "af.session") return { role: "participant" };
        if (action === "af.read") {
          reads++;
          await gate;
          return original;
        }
        if (action === "af.answers.save") {
          writes++;
          return { saved: true, state: { ...state(), confirmed: "2026-11-16 21:30" } };
        }
      },
    },
  );
  const read = core.handle(input());
  await new Promise((resolve) => setTimeout(resolve, 0));
  const save = core.handle(input("af.answers.save", { memberId: "m_00000000-0000-0000-0000-000000000001" }));
  release();
  await Promise.all([read, save]);
  assert.equal(core.snapshot.state.confirmed, "2026-11-16 21:30");
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  core.send = async () => {
    throw new BffError("UPSTREAM_UNAVAILABLE", 502, true);
  };
  await assert.rejects(
    core.handle(input("af.answers.save", { memberId: "m_00000000-0000-0000-0000-000000000001" })),
    (e) => e.uncertain,
  );
  assert.equal(core.snapshot, null);
});
test("signature is attached to fixed upstream URL, invalid responses cannot acknowledge writes, and errors exclude bodies", async () => {
  const env = {
    AF_EXEC_URL:
      "https://script.google.com/macros/s/fixture_12345678901234567890/exec",
    UDM_BFF_SHARED_SECRET: "fixture-secret-with-at-least-32-characters",
  };
  await upstream(
    env,
    "af.read",
    {},
    "private-token",
    "request_12345678",
    async (url, options) => {
      assert.equal(url, env.AF_EXEC_URL);
      const request = JSON.parse(options.body);
      assert.equal(
        request.bff.signature,
        await signRequest(request, env.UDM_BFF_SHARED_SECRET),
      );
      return Response.json({
        version: 1,
        requestId: request.requestId,
        ok: true,
        data: state(),
      });
    },
  );
  await assert.rejects(
    upstream(
      env,
      "af.answers.save",
      {},
      "private-token",
      "request_12345678",
      async () =>
        new Response("private-token", {
          headers: { "Content-Type": "text/html" },
        }),
    ),
    (e) => e.uncertain && !e.message.includes("private-token"),
  );
  await assert.rejects(
    upstream(
      { ...env, AF_EXEC_URL: "https://external.invalid/" },
      "af.read",
      {},
      "x",
      "id",
    ),
    (e) => e.code === "CONFIG_REQUIRED",
  );
});
test("all frontend routes agree with BFF; tokens and write bodies never enter URLs", () => {
  const actions = [
    "af.session",
    "af.read",
    "af.answers.save",
    "af.history",
    "af.members.add",
    "af.members.required",
    "af.candidates.add",
    "af.candidates.remove",
    "af.confirm",
    "af.push.status",
    "af.push.subscribe",
    "af.push.unsubscribe",
    "af.push.test",
    "udm.links.share",
    "udm.links.resolve",
    "udm.links.list",
    "udm.links.create",
    "udm.links.update",
  ];
  for (const action of actions) {
    const payload = {
      view: "answer",
      memberId: "m_00000000-0000-0000-0000-000000000001",
      offset: 12,
      token: "secret-token",
    };
    const [method, path] = bffRoute(action, payload);
    assert.equal(
      route(method, new URL(path, "https://bff.invalid"), payload).action,
      action,
    );
    assert.equal(path.includes("secret-token"), false);
  }
  assert.equal(bffEndpoint("https://bff.invalid"), "https://bff.invalid");
  for (const url of [
    "http://bff.invalid",
    "https://user:pass@bff.invalid",
    "https://bff.invalid/?token=x",
  ])
    assert.throws(() => bffEndpoint(url));
});
test("Worker rejects missing auth and disallowed origins before reaching the cache; anonymous notification settings remain allowed", async () => {
  let reached = 0;
  const worker = createWorker({
    verify: async (token) => {
      if (token !== "valid") throw new BffError("AUTH_REQUIRED", 401);
      return "uid";
    },
  });
  const env = {
    UDM_ALLOWED_ORIGINS: "https://firsttimefreenow.github.io",
    UDM_FIREBASE_PROJECT_ID: "fixture",
    SERVICE_CACHE: {
      idFromName: () => 1,
      get: () => ({
        fetch: async () => {
          reached++;
          return Response.json({
            ok: true,
            data: { ready: true, enabled: false, deliveryIssue: false },
          });
        },
      }),
    },
  };
  const req = (path, headers = {}, method = "GET") =>
    new Request("https://bff.invalid" + path, {
      method,
      headers,
      ...(method === "POST" ? { body: "{}" } : {}),
    });
  assert.equal(
    (await worker.fetch(req("/v1/afetiria-extra/overview"), env)).status,
    401,
  );
  assert.equal(reached, 0);
  assert.equal(
    (
      await worker.fetch(
        req("/v1/afetiria-extra/overview", {
          Origin: "https://evil.invalid",
          Authorization: "Bearer valid",
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(reached, 0);
  const result = await worker.fetch(
    req(
      "/v1/afetiria-extra/push/status",
      { Origin: "https://firsttimefreenow.github.io" },
      "POST",
    ),
    env,
  );
  assert.equal(result.status, 200);
  assert.equal(
    result.headers.get("Access-Control-Allow-Origin"),
    "https://firsttimefreenow.github.io",
  );
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  assert.equal(reached, 1);
});
test("real RSA signatures, audience, expiration, issuer and auth_time are verified", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const now = Math.floor(Date.now() / 1000);
  const token = async (claims = {}, aud = "fixture") =>
    new SignJWT({ sub: "uid", iat: now, auth_time: now, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer("https://securetoken.google.com/fixture")
      .setAudience(aud)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  assert.equal(
    await verifyToken(await token(), "fixture", () => publicKey),
    "uid",
  );
  await assert.rejects(
    verifyToken(await token({}, "other"), "fixture", () => publicKey),
    (e) => e.code === "AUTH_REQUIRED",
  );
  await assert.rejects(
    verifyToken(
      await token({ auth_time: now + 500 }),
      "fixture",
      () => publicKey,
    ),
    (e) => e.code === "AUTH_REQUIRED",
  );
  const bad = (await token()).split(".");
  bad[2] = "invalid";
  await assert.rejects(
    verifyToken(bad.join("."), "fixture", () => publicKey),
    (e) => e.code === "AUTH_REQUIRED",
  );
});
