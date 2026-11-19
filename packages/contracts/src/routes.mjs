export function bffRoute(action, payload = {}) {
  const paths = {
    "af.session": ["GET", "/v1/session"],
    "af.answers.save": ["POST", "/v1/afetiria-extra/answers"],
    "af.members.add": ["POST", "/v1/afetiria-extra/members"],
    "af.members.required": ["PATCH", "/v1/afetiria-extra/members/required"],
    "af.candidates.add": ["POST", "/v1/afetiria-extra/candidates"],
    "af.candidates.remove": ["DELETE", "/v1/afetiria-extra/candidates"],
    "af.confirm": ["POST", "/v1/afetiria-extra/confirmation"],
    "af.push.status": ["POST", "/v1/afetiria-extra/push/status"],
    "af.push.subscribe": ["POST", "/v1/afetiria-extra/push/subscription"],
    "af.push.unsubscribe": ["DELETE", "/v1/afetiria-extra/push/subscription"],
    "af.push.test": ["POST", "/v1/afetiria-extra/push/test"],
    "udm.links.resolve": ["POST", "/v1/links/resolve"],
    "udm.links.share": ["POST", "/v1/links/share"],
    "udm.links.list": ["GET", "/v1/links"],
    "udm.links.create": ["POST", "/v1/links"],
    "udm.links.update": ["PATCH", "/v1/links"],
  };
  if (action === "af.read") {
    const view = ["schedule", "answer", "admin"].includes(payload.view)
      ? payload.view
      : "schedule";
    const query = new URLSearchParams();
    if (view === "answer" && payload.memberId)
      query.set("memberId", payload.memberId);
    if (payload.fresh) query.set("fresh", "1");
    return [
      "GET",
      "/v1/afetiria-extra/" +
        { schedule: "overview", answer: "answers", admin: "admin" }[view] +
        (query.size ? "?" + query : ""),
    ];
  }
  if (action === "af.history")
    return [
      "GET",
      "/v1/afetiria-extra/history?offset=" +
        encodeURIComponent(payload.offset || 0),
    ];
  if (!paths[action]) throw Error("Unknown API action");
  return paths[action];
}
export function bffEndpoint(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Invalid BFF origin");
  return url.origin;
}
