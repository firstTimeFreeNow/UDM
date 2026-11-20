import { bffRoute, bffEndpoint } from "@udm/contracts/routes";
import { validateEndpoint } from "../sheets-transport/client.ts";
export type { Action } from "@udm/contracts/routes";
import type { Action } from "@udm/contracts/routes";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "ログインし直してください。",
  FORBIDDEN: "この操作の権限がありません。",
  CONFIG_REQUIRED:
    "サービスの準備が完了していません。管理者に確認してください。",
  INVALID_REQUEST: "入力内容を確認してください。",
  WEEK_CHANGED: "対象週が切り替わりました。最新の予定を取得してください。",
  CONFLICT:
    "同じ項目が更新されています。最新の予定を取得し、入力内容と比較してください。",
  BUSY: "ほかの更新処理が実行中です。少し待ってから取得してください。",
  CAPACITY: "登録できる件数の上限に達しています。",
  HAS_ANSWERS: "回答が残っている候補は変更できません。",
  INELIGIBLE: "開催条件または確定済みの予定を確認してください。",
  DUPLICATE: "同じ名前または日時が登録されています。",
  INTERNAL_ERROR: "処理結果を確認できませんでした。",
  UPSTREAM_UNAVAILABLE:
    "スプレッドシートに接続できませんでした。時間をおいて更新してください。",
  NOT_FOUND: "この共有URLは見つからないか、無効になっています。",
};
export class ApiError extends Error {
  constructor(
    public code: string,
    public outcomeUnknown = false,
  ) {
    super(messages[code] || "通信結果を確認できませんでした。");
  }
}
export type ApiMeta = import("@udm/contracts/models").Models["Meta"];
export type ApiResult<T> = { data: T; meta?: ApiMeta; receivedAt: number };
export function remainingTtl(result: ApiResult<unknown> | undefined) {
  return result
    ? Math.max(
        0,
        (result.meta?.remainingTtlMs ?? 300000) -
          (performance.now() - result.receivedAt),
      )
    : 0;
}
export async function callApi<T>(
  action: Action,
  payload: object,
  getIdToken: () => Promise<string>,
  validate: (data: unknown) => data is T,
): Promise<T> {
  return (await callApiResult(action, payload, getIdToken, validate)).data;
}
export async function callApiResult<T>(
  action: Action,
  payload: object,
  getIdToken: () => Promise<string>,
  validate: (data: unknown) => data is T,
): Promise<ApiResult<T>> {
  const bff = process.env.NEXT_PUBLIC_UDM_API_URL;
  const endpoint = process.env.NEXT_PUBLIC_AF_API_URL;
  if (!endpoint && !bff) throw new ApiError("CONFIG_REQUIRED");
  const [method, path] = bff ? bffRoute(action, payload) : ["POST", ""];
  const url = bff ? bffEndpoint(bff, process.env.NODE_ENV === "development") + path : validateEndpoint(endpoint!);
  const requestId = crypto.randomUUID();
  const idToken = await getIdToken();
  const writing = ![
    "af.push.status",
    "af.session",
    "af.read",
    "af.history",
    "udm.links.resolve",
    "udm.links.list",
  ].includes(action);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method,
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "no-store",
      headers: bff
        ? {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          }
        : { "Content-Type": "text/plain;charset=UTF-8" },
      signal: controller.signal,
      body:
        method === "GET"
          ? undefined
          : JSON.stringify(
              bff
                ? payload
                : { version: 1, requestId, action, payload, idToken },
            ),
    });
    if (
      !/^application\/json(?:;|$)/i.test(
        response.headers.get("content-type") || "",
      )
    )
      throw new ApiError("INVALID_RESPONSE", writing);
    const result = await response.json();
    if (
      !result ||
      result.version !== 1 ||
      result.requestId !== requestId ||
      typeof result.ok !== "boolean"
    )
      throw new ApiError("INVALID_RESPONSE", writing);
    if (!result.ok) {
      if (!Object.hasOwn(messages, result.error?.code))
        throw new ApiError("INVALID_RESPONSE", writing);
      throw new ApiError(
        result.error.code,
        writing &&
          (result.error.outcomeUnknown === true ||
            result.error.code === "INTERNAL_ERROR"),
      );
    }
    if (!validate(result.data)) throw new ApiError("INVALID_RESPONSE", writing);
    if (!response.ok) throw new ApiError("INVALID_RESPONSE", writing);
    const meta = result.meta;
    if (
      meta &&
      (!Number.isFinite(meta.sourceFetchedAt) ||
        !Number.isFinite(meta.expiresAt) ||
        !Number.isFinite(meta.remainingTtlMs) ||
        meta.remainingTtlMs < 0 ||
        meta.remainingTtlMs > 300000 ||
        typeof meta.revision !== "string")
    )
      throw new ApiError("INVALID_RESPONSE", writing);
    return {
      data: result.data,
      meta: meta
        ? {
            ...meta,
            remainingTtlMs: Math.max(
              0,
              meta.remainingTtlMs - (performance.now() - startedAt),
            ),
          }
        : undefined,
      receivedAt: performance.now(),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("NETWORK_ERROR", writing);
  } finally {
    clearTimeout(timeout);
  }
}
