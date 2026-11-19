import { validateEndpoint } from "@/lib/sheets-transport/client.mjs";
export type Action = "af.push.test" | "af.push.status" | "af.push.subscribe" | "af.push.unsubscribe" | "af.session" | "af.read" | "af.answers.save" | "af.history" |
  "af.members.add" | "af.members.required" | "af.candidates.add" | "af.candidates.remove" | "af.confirm" |
  "udm.links.share" | "udm.links.resolve" | "udm.links.list" | "udm.links.create" | "udm.links.update";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "ログインし直してください。", FORBIDDEN: "この操作の権限がありません。",
  CONFIG_REQUIRED: "サービスの準備が完了していません。管理者に確認してください。",
  INVALID_REQUEST: "入力内容を確認してください。", WEEK_CHANGED: "対象週が切り替わりました。最新の予定を取得してください。",
  CONFLICT: "同じ項目が更新されています。最新の予定を取得し、入力内容と比較してください。",
  BUSY: "ほかの更新処理が実行中です。少し待ってから取得してください。",
  CAPACITY: "登録できる件数の上限に達しています。", HAS_ANSWERS: "回答が残っている候補は変更できません。",
  INELIGIBLE: "開催条件または確定済みの予定を確認してください。", DUPLICATE: "同じ名前または日時が登録されています。",
  INTERNAL_ERROR: "処理結果を確認できませんでした。",
  NOT_FOUND: "この共有URLは見つからないか、無効になっています。",
};
export class ApiError extends Error {
  constructor(public code: string, public outcomeUnknown = false) {
    super(messages[code] || "通信結果を確認できませんでした。");
  }
}
export async function callApi<T>(action: Action, payload: object, getIdToken: () => Promise<string>, validate: (data: unknown) => data is T): Promise<T> {
  const endpoint = process.env.NEXT_PUBLIC_AF_API_URL;
  if (!endpoint) throw new ApiError("CONFIG_REQUIRED");
  const url = validateEndpoint(endpoint);
  const requestId = crypto.randomUUID();
  const idToken = await getIdToken();
  const writing = !["af.push.status", "af.session", "af.read", "af.history", "udm.links.resolve", "udm.links.list"].includes(action);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { method: "POST", mode: "cors", credentials: "omit", redirect: "follow", cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=UTF-8" }, signal: controller.signal,
      body: JSON.stringify({ version: 1, requestId, action, payload, idToken }) });
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new ApiError("INVALID_RESPONSE", writing);
    const result = await response.json();
    if (!result || result.version !== 1 || result.requestId !== requestId || typeof result.ok !== "boolean") throw new ApiError("INVALID_RESPONSE", writing);
    if (!result.ok) {
      if (!Object.hasOwn(messages, result.error?.code)) throw new ApiError("INVALID_RESPONSE", writing);
      throw new ApiError(result.error.code, writing && result.error.code === "INTERNAL_ERROR");
    }
    if (!validate(result.data)) throw new ApiError("INVALID_RESPONSE", writing);
    return result.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("NETWORK_ERROR", writing);
  } finally { clearTimeout(timeout); }
}
