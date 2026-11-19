"use client";
import { useEffect, useState } from "react";
import { pushSetupMessage } from "@/lib/afetiria/push-registration";
import { ApiError, callApi } from "@/lib/udm-api/client";
import { deleteDevicePushToken, getDevicePushToken, isPushStatus, PUSH_TOKEN_KEY, type PushStatus } from "@/lib/afetiria/push";
import { useSession } from "./service-provider";
import styles from "./service.module.css";
export function NotificationSettings() {
  const {user} = useSession();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [supported, setSupported] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const configured = !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY && !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  useEffect(() => {
    let active = true;
    const capable = window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(capable); setDenied("Notification" in window && Notification.permission === "denied");
    let token = "";
    try {token = localStorage.getItem(PUSH_TOKEN_KEY) || "";} catch { /* Optional local cache. */ }
    callApi("af.push.status", token ? {token} : {}, () => user.getIdToken(), isPushStatus).then(async result => {
      if (active) setStatus(result);
      // Renew only an already opted-in browser; never prompt during page load.
      if (active && capable && configured && result.ready && token && Notification.permission === "granted") {
        const fresh = await getDevicePushToken();
        const renewed = await callApi("af.push.subscribe", {token:fresh, previousToken:token}, () => user.getIdToken(), isPushStatus);
        if (active) {localStorage.setItem(PUSH_TOKEN_KEY,fresh); setStatus(renewed);}
      }
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.code === "INVALID_REQUEST") setStatus({ready:false,enabled:false,deliveryIssue:false});
      else setError(error instanceof ApiError ? error.message : "通知設定を取得できませんでした。");
    })
      .finally(() => {if (active) setBusy(false);});
    return () => {active=false;};
  }, [user, configured]);
  async function enable() {
    if (busy || !supported) return;
    // Keep the browser permission request directly inside the user gesture (Safari).
    setBusy(true); setError(""); setNotice("");
    try {
      const permission = Notification.requestPermission();
      if (await permission !== "granted") {setDenied(Notification.permission === "denied"); setNotice("通知は有効になっていません。"); return;}
      const token = await getDevicePushToken();
      let previousToken = "";
      try {previousToken=localStorage.getItem(PUSH_TOKEN_KEY)||""; localStorage.setItem(PUSH_TOKEN_KEY,token);} catch { /* No cached device identifier. */ }
      const result = await callApi("af.push.subscribe", {token, previousToken}, () => user.getIdToken(), isPushStatus);
      setStatus(result); setNotice("このブラウザーで開催通知を有効にしました。");
    } catch (error) {setError(error instanceof ApiError ? error.message : pushSetupMessage(error));}
    finally {setBusy(false);}
  }
  async function disable() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const token=localStorage.getItem(PUSH_TOKEN_KEY);
      if (token) setStatus(await callApi("af.push.unsubscribe", {token}, () => user.getIdToken(), isPushStatus));
      else setStatus(previous => previous ? {...previous,enabled:false} : previous);
      localStorage.removeItem(PUSH_TOKEN_KEY);
      try {await deleteDevicePushToken();} catch { /* Server destination was already removed. */ }
      setNotice("このブラウザーで開催通知を停止しました。");
    } catch (error) {setError(error instanceof ApiError ? error.message : "通知を停止できませんでした。もう一度お試しください。");}
    finally {setBusy(false);}
  }
  return <section className={styles.card} aria-labelledby="af-notifications"><h2 id="af-notifications">開催通知</h2>
    <p>開催日時が決まったとき、この端末に通知します。通知を有効にすると、画面を閉じている間も受信できます。</p>
    <p>受信する端末・ブラウザーごとに設定し、ブラウザーとOSの通知を許可してください。iPhone・iPad（iOS／iPadOS 16.4以降）は、Safariの共有メニューから「ホーム画面に追加」し、追加したアイコンから開いて設定してください。</p>
    {(!configured || status && !status.ready) && <p>通知機能は準備中です。準備が完了すると、ここから有効にできます。</p>}
    {!supported && <p>このブラウザーでは通知を利用できません。対応ブラウザーで開いてください。iPhone・iPadはホーム画面への追加を先に行ってください。</p>}
    {denied && <p>通知がブロックされています。ブラウザーのサイト設定から通知を許可してください。</p>}
    {status?.deliveryIssue && <p role="alert">通知の配信に問題が発生しています。管理者に確認してください。</p>}
    {status?.enabled ? <><p>このブラウザーの通知：有効</p><button type="button" disabled={busy} onClick={() => void disable()}>通知を停止</button></> :
      <button type="button" disabled={busy || !supported || denied || !configured || !status?.ready} onClick={() => void enable()}>{busy ? "通知設定を確認中…" : "通知を有効にする"}</button>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
