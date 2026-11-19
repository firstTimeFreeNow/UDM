export type PushStage = "UNSUPPORTED" | "CONFIGURATION" | "WORKER" | "REGISTRATION";
export class PushSetupError extends Error {
  readonly stage: PushStage;
  readonly code: string;
  constructor(stage: PushStage, code: string) {super(stage); this.stage=stage; this.code=code;}
}
export function pushFailureCode(error: unknown): string {
  const candidate = (error as {code?: unknown})?.code;
  if (typeof candidate === "string" && /^(messaging|installations)\/[a-z-]{1,70}$/.test(candidate)) return candidate;
  const name = (error as {name?: string})?.name;
  return ["AbortError", "InvalidStateError", "NotAllowedError", "InvalidAccessError", "NotSupportedError", "SecurityError", "TypeError"].includes(name || "") ? name! : "UNKNOWN";
}
export function pushSetupMessage(error: unknown): string {
  if (!(error instanceof PushSetupError)) return "通知を有効にできませんでした。もう一度お試しください。";
  if (error.stage === "UNSUPPORTED") return "このブラウザーではプッシュ通知を利用できません。";
  if (error.stage === "CONFIGURATION") return "通知設定を読み込めませんでした。画面を再読み込みしてください。";
  if (error.code === "NotAllowedError" || error.code === "messaging/permission-blocked") return "通知が許可されていません。ブラウザーのサイト設定を確認してください。";
  if (error.stage === "WORKER") return `通知の受信準備に失敗しました。もう一度お試しください。（WORKER/${error.code}）`;
  return `通知サービスへの端末登録に失敗しました。（${error.code}）`;
}
/** A custom registration is not awaited by the Firebase SDK, unlike its default worker. */
export function waitForPushWorker(registration: ServiceWorkerRegistration, timeoutMs = 15000): Promise<void> {
  if (registration.active?.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const workers = new Set<ServiceWorker>();
    function cleanup() {
      clearTimeout(timer);
      registration.removeEventListener("updatefound", watch);
      workers.forEach(worker => worker.removeEventListener("statechange", check));
    }
    function check() {
      if (registration.active?.state === "activated" || [...workers].some(worker => worker.state === "activated")) {cleanup(); resolve();}
      else if (workers.size && [...workers].every(worker => worker.state === "redundant")) {cleanup(); reject(new PushSetupError("WORKER", "REDUNDANT"));}
    }
    function watch() {
      [registration.installing, registration.waiting, registration.active].forEach(worker => {
        if (worker && !workers.has(worker)) {workers.add(worker); worker.addEventListener("statechange", check);}
      });
      check();
    }
    const timer = setTimeout(() => {cleanup(); reject(new PushSetupError("WORKER", "TIMEOUT"));}, timeoutMs);
    registration.addEventListener("updatefound", watch);
    watch();
  });
}
