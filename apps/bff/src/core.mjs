import {isSchedule} from "@udm/contracts/afetiria";
import { signRequest } from "@udm/contracts/signature";
export class BffError extends Error {
  constructor(code, status = 400, uncertain = false) {
    super(code);
    this.code = code;
    this.status = status;
    this.uncertain = uncertain;
  }
}
export const TTL = 300000;
const publicActions = new Set([
  "af.push.status",
  "af.push.subscribe",
  "af.push.unsubscribe",
  "udm.links.resolve",
]);
const reads = new Set([
  "af.session",
  "af.read",
  "af.history",
  "af.push.status",
  "udm.links.resolve",
  "udm.links.list",
]);
const members = new Set([
  "af.session",
  "af.read",
  "af.answers.save",
  "af.history",
  "udm.links.share",
]);
const mutations = new Set([
  "af.answers.save",
  "af.members.add",
  "af.members.required",
  "af.candidates.add",
  "af.candidates.remove",
  "af.confirm",
]);
export function route(method, url, body = {}) {
  const path = url.pathname.replace(/\/$/, "");
  if (method === "GET") {
    if (path === "/v1/session") return { action: "af.session", payload: {} };
    const view = {
      "/v1/afetiria-extra/overview": "schedule",
      "/v1/afetiria-extra/answers": "answer",
      "/v1/afetiria-extra/admin": "admin",
    }[path];
    if (view)
      return {
        action: "af.read",
        payload: { view, memberId: url.searchParams.get("memberId") || "" },
        fresh: url.searchParams.get("fresh") === "1",
      };
    if (path === "/v1/afetiria-extra/history") {
      const offset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new BffError("INVALID_REQUEST");
      return { action: "af.history", payload: { offset } };
    }
    if (path === "/v1/links") return { action: "udm.links.list", payload: {} };
  }
  const paths = {
    "POST /v1/afetiria-extra/answers": "af.answers.save",
    "POST /v1/afetiria-extra/members": "af.members.add",
    "PATCH /v1/afetiria-extra/members/required": "af.members.required",
    "POST /v1/afetiria-extra/candidates": "af.candidates.add",
    "DELETE /v1/afetiria-extra/candidates": "af.candidates.remove",
    "POST /v1/afetiria-extra/confirmation": "af.confirm",
    "POST /v1/afetiria-extra/push/status": "af.push.status",
    "POST /v1/afetiria-extra/push/subscription": "af.push.subscribe",
    "DELETE /v1/afetiria-extra/push/subscription": "af.push.unsubscribe",
    "POST /v1/afetiria-extra/push/test": "af.push.test",
    "POST /v1/links/resolve": "udm.links.resolve",
    "POST /v1/links/share": "udm.links.share",
    "POST /v1/links": "udm.links.create",
    "PATCH /v1/links": "udm.links.update",
  };
  const action = paths[method + " " + path];
  if (!action) throw new BffError("NOT_FOUND", 404);
  return { action, payload: body };
}
export function project(state, view, memberId = "") {
  if (!isSchedule(state)) throw new BffError("INVALID_RESPONSE",502);
  const answers = {};
  if (
    view === "answer" &&
    memberId &&
    !state.members.some((m) => m.id === memberId)
  )
    throw new BffError("INVALID_REQUEST");
  for (const member of view === "schedule" ? [] : state.members)
    answers[member.id] =
      view === "answer" && member.id === memberId
        ? state.answers[member.id] || {}
        : {};
  return {
    weekId: state.weekId,
    confirmed: state.confirmed,
    minParticipants: state.minParticipants,
    maxParticipants: state.maxParticipants,
    members: view === "schedule" ? [] : state.members,
    answers,
    slots: state.slots.map((slot) => ({
      ...slot,
      ...(view === "admin"
        ? {
            hasAnswers: Object.values(state.answers).some(
              (entries) => !!entries[slot.key],
            ),
          }
        : {}),
    })),
  };
}
export async function upstream(
  env,
  action,
  payload,
  token,
  requestId,
  fetcher = fetch,
) {
  if (!env.UDM_BFF_SHARED_SECRET || env.UDM_BFF_SHARED_SECRET.length < 32)
    throw new BffError("CONFIG_REQUIRED", 503);
  let url;
  try {
    url = new URL(env.AF_EXEC_URL);
  } catch {
    throw new BffError("CONFIG_REQUIRED", 503);
  }
  if (
    url.origin !== "https://script.google.com" ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new BffError("CONFIG_REQUIRED", 503);
  const request = {
    version: 1,
    requestId,
    action,
    payload,
    idToken: token,
    bff: { issuedAt: Date.now(), nonce: crypto.randomUUID() },
  };
  request.bff.signature = await signRequest(request, env.UDM_BFF_SHARED_SECRET);
  const writing = !reads.has(action);
  try {
    const response = await fetcher(url.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (
      !response.ok ||
      !/^application\/json(?:;|$)/i.test(
        response.headers.get("content-type") || "",
      )
    )
      throw new BffError("INVALID_RESPONSE", 502, writing);
    const result = await response.json();
    if (
      result?.version !== 1 ||
      result.requestId !== requestId ||
      typeof result.ok !== "boolean"
    )
      throw new BffError("INVALID_RESPONSE", 502, writing);
    if (!result.ok) {
      const codes = [
        "INVALID_REQUEST",
        "AUTH_REQUIRED",
        "FORBIDDEN",
        "CONFIG_REQUIRED",
        "BUSY",
        "CONFLICT",
        "WEEK_CHANGED",
        "CAPACITY",
        "HAS_ANSWERS",
        "INELIGIBLE",
        "DUPLICATE",
        "NOT_FOUND",
        "INTERNAL_ERROR",
      ];
      const code = codes.includes(result.error?.code)
        ? result.error.code
        : "INVALID_RESPONSE";
      throw new BffError(
        code,
        code === "AUTH_REQUIRED"
          ? 401
          : code === "FORBIDDEN"
            ? 403
            : code === "BUSY"
              ? 503
              : 400,
        writing && ["INTERNAL_ERROR", "INVALID_RESPONSE"].includes(code),
      );
    }
    return result.data;
  } catch (error) {
    if (error instanceof BffError) throw error;
    throw new BffError("UPSTREAM_UNAVAILABLE", 502, writing);
  }
}
/** One instance per service; no user data is written into persistent Object storage. */
export class Coordinator {
  constructor(env, { send = upstream, now = Date.now } = {}) {
    this.env = env;
    this.send = send;
    this.now = now;
    this.snapshot = null;
    this.sessions = new Map();
    this.history = new Map();
    this.queue = Promise.resolve();
    this.pendingRead = null;
    this.sessionLoads = new Map();
    this.rates = new Map();
  }
  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }
  async authorize(uid, token, id, action, view) {
    if (publicActions.has(action)) return null;
    let session = this.sessions.get(uid);
    if (!session || session.until <= this.now()) {
      let pending = this.sessionLoads.get(uid);
      if (!pending) {
        pending = this.send(this.env, "af.session", {}, token, id)
          .then((value) => {
            if (!["admin", "participant"].includes(value?.role))
              throw new BffError("FORBIDDEN", 403);
            const s = { role: value.role, until: this.now() + 60000 };
            this.sessions.set(uid, s);
            return s;
          })
          .finally(() => this.sessionLoads.delete(uid));
        this.sessionLoads.set(uid, pending);
      }
      session = await pending;
    }
    if ((!members.has(action) || view === "admin") && session.role !== "admin")
      throw new BffError("FORBIDDEN", 403);
    return session.role;
  }
  limit(key, max = 60) {
    const time = this.now();
    let rate = this.rates.get(key);
    if (!rate || time - rate.start >= 60000) {
      rate = { start: time, count: 0 };
      this.rates.set(key, rate);
    }
    if (++rate.count > max) throw new BffError("BUSY", 429);
    if (this.rates.size > 1024)
      for (const [k, v] of this.rates)
        if (time - v.start >= 60000) this.rates.delete(k);
  }
  meta(snapshot) {
    const end = snapshot.at + TTL;
    return {
      sourceFetchedAt: snapshot.at,
      expiresAt: end,
      remainingTtlMs: Math.max(0, end - this.now()),
      revision: snapshot.revision,
    };
  }
  async handle({
    action,
    payload = {},
    fresh = false,
    uid = "",
    token = "",
    requestId,
  }) {
    this.limit(
      publicActions.has(action) ? "public:" + action : "user:" + uid,
      publicActions.has(action) ? 30 : 90,
    );
    const role = await this.authorize(
      uid,
      token,
      requestId,
      action,
      payload.view,
    );
    if (action === "af.session") return { data: { role } };
    if (action === "af.read") {
      if (!this.snapshot || this.snapshot.at + TTL <= this.now() || fresh) {
        if (!this.pendingRead) {
          this.pendingRead = this.enqueue(async () => {
            // A save queued before this read may already have refreshed the snapshot.
            if (!fresh && this.snapshot && this.snapshot.at + TTL > this.now())
              return;
            const at = this.now();
            const state = await this.send(
              this.env,
              "af.read",
              {},
              token,
              requestId,
            );
            if (this.snapshot?.state.weekId !== state.weekId)
              this.history.clear();
            if (!isSchedule(state)) throw new BffError("INVALID_RESPONSE",502);
          this.snapshot = { state, at, revision: crypto.randomUUID() };
          }).finally(() => {
            this.pendingRead = null;
          });
        }
        await this.pendingRead;
      }
      // Do not serve cached reads while an earlier write is in flight.
      await this.queue;
      if (!this.snapshot) throw new BffError("BUSY", 503);
      return {
        data: project(
          this.snapshot.state,
          payload.view || "schedule",
          payload.memberId,
        ),
        meta: this.meta(this.snapshot),
      };
    }
    if (mutations.has(action))
      return this.enqueue(async () => {
        try {
          const at = this.now();
          const data = await this.send(
            this.env,
            action,
            payload,
            token,
            requestId,
          );
          const state = action === "af.answers.save" ? data.state : data;
          if (!isSchedule(state)) throw new BffError("INVALID_RESPONSE",502);
          this.snapshot = { state, at, revision: crypto.randomUUID() };
          this.history.clear();
          const result = project(
            state,
            action === "af.answers.save" ? "answer" : "admin",
            payload.memberId,
          );
          return {
            data:
              action === "af.answers.save"
                ? { ...data, state: result }
                : result,
            meta: this.meta(this.snapshot),
          };
        } catch (error) {
          this.snapshot = null;
          this.history.clear();
          if (error.code === "FORBIDDEN" || error.code === "AUTH_REQUIRED")
            this.sessions.delete(uid);
          if (!(error instanceof BffError) || error.code === "INVALID_RESPONSE") throw new BffError("INVALID_RESPONSE",502,true);
          throw error;
        }
      });
    if (action === "af.history") {
      const key = payload.offset || 0;
      let cached = this.history.get(key);
      if (!cached || cached.at + TTL <= this.now())
        return this.enqueue(async () => {
          cached = this.history.get(key);
          if (!cached || cached.at + TTL <= this.now()) {
            if (key === 0) this.history.clear();
            const at = this.now();
            cached = {
              data: await this.send(
                this.env,
                action,
                payload,
                token,
                requestId,
              ),
              at,
              revision: crypto.randomUUID(),
            };
            this.history.set(key, cached);
            if (this.history.size > 50)
              this.history.delete(this.history.keys().next().value);
          }
          return { data: cached.data, meta: this.meta(cached) };
        });
      return { data: cached.data, meta: this.meta(cached) };
    }
    return {
      data: await this.send(this.env, action, payload, token, requestId),
    };
  }
}
