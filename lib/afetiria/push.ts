import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirebaseConfig } from "./firebase";
import { PushSetupError, pushFailureCode, waitForPushWorker } from "./push-registration";
export const PUSH_TOKEN_KEY = "udm:afetiria:push-token";
export type PushStatus = {ready: boolean; enabled: boolean; deliveryIssue: boolean};
export function isPushStatus(value: unknown): value is PushStatus {
  const item = value as PushStatus | null;
  return !!item && typeof item.ready === "boolean" && typeof item.enabled === "boolean" && typeof item.deliveryIssue === "boolean";
}
function getPushApp() {
  // Keep messaging configuration independent of an Auth instance initialized before a config update.
  const config = getFirebaseConfig();
  if (![config.apiKey, config.projectId, config.appId, config.messagingSenderId].every(Boolean)) throw new PushSetupError("CONFIGURATION", "MISSING_VALUE");
  const name="udm-afetiria-push";
  return getApps().some(app => app.name === name) ? getApp(name) : initializeApp(config,name);
}
export async function getDevicePushToken() {
  const {getMessaging, getToken, isSupported} = await import("firebase/messaging");
  if (!await isSupported()) throw new PushSetupError("UNSUPPORTED", "UNSUPPORTED");
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new PushSetupError("CONFIGURATION", "MISSING_VAPID_KEY");
  const app=getPushApp();
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("/UDM/afetiria-extra/push-sw.js", {scope:"/UDM/afetiria-extra/"});
    await waitForPushWorker(registration);
  } catch (error) {throw error instanceof PushSetupError ? error : new PushSetupError("WORKER",pushFailureCode(error));}
  try {return await getToken(getMessaging(app), {vapidKey, serviceWorkerRegistration:registration});}
  catch (error) {throw new PushSetupError("REGISTRATION",pushFailureCode(error));}
}
export async function deleteDevicePushToken() {
  const {deleteToken, getMessaging} = await import("firebase/messaging");
  await deleteToken(getMessaging(getPushApp()));
}

export type PushTestResult = {total: number; accepted: number; failed: number; removed: number};
export function isPushTestResult(value: unknown): value is PushTestResult {
  const item=value as PushTestResult | null;
  return !!item && [item.total,item.accepted,item.failed,item.removed].every(count => Number.isSafeInteger(count) && count >= 0 && count <= 100) && item.total === item.accepted + item.failed + item.removed;
}
