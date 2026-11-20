"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {LoadingProgress} from "./loading-progress";
import { pushSetupMessage } from "@/lib/afetiria/push-registration";
import { ApiError, callApi } from "@/lib/udm-api/client";
import { deleteDevicePushToken, getDevicePushToken, isPushStatus, PUSH_TOKEN_KEY, type PushStatus } from "@/lib/afetiria/push";
import styles from "./afetiria.module.css";
export function NotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [supported, setSupported] = useState<boolean|null>(null);
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
    callApi("af.push.status", token ? {token} : {}, () => Promise.resolve(""), isPushStatus).then(async result => {
      if (active) setStatus(result);
      // Renew only an already opted-in browser; never prompt during page load.
      if (active && capable && configured && result.ready && token && Notification.permission === "granted") {
        const fresh = await getDevicePushToken();
        const renewed = await callApi("af.push.subscribe", {token:fresh, previousToken:token}, () => Promise.resolve(""), isPushStatus);
        if (active) {localStorage.setItem(PUSH_TOKEN_KEY,fresh); setStatus(renewed);}
      }
    }).catch(error => {
      if (!active) return;
      if (error instanceof ApiError && error.code === "INVALID_REQUEST") setStatus({ready:false,enabled:false,deliveryIssue:false});
      else setError(error instanceof ApiError ? error.message : "通知設定を取得できませんでした。");
    })
      .finally(() => {if (active) setBusy(false);});
    return () => {active=false;};
  }, [configured]);
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
      const result = await callApi("af.push.subscribe", {token, previousToken}, () => Promise.resolve(""), isPushStatus);
      setStatus(result); setNotice("このブラウザーで開催通知を有効にしました。");
    } catch (error) {setError(error instanceof ApiError ? error.message : pushSetupMessage(error));}
    finally {setBusy(false);}
  }
  async function disable() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const token=localStorage.getItem(PUSH_TOKEN_KEY);
      if (token) setStatus(await callApi("af.push.unsubscribe", {token}, () => Promise.resolve(""), isPushStatus));
      else setStatus(previous => previous ? {...previous,enabled:false} : previous);
      localStorage.removeItem(PUSH_TOKEN_KEY);
      try {await deleteDevicePushToken();} catch { /* Server destination was already removed. */ }
      setNotice("このブラウザーで開催通知を停止しました。");
    } catch (error) {setError(error instanceof ApiError ? error.message : "通知を停止できませんでした。もう一度お試しください。");}
    finally {setBusy(false);}
  }
  return (
    <section className={styles.card} aria-labelledby="af-notifications">
      <h2 id="af-notifications">開催通知</h2>
      <p>開催日時が決定・変更されたときに通知します。</p>
      <div className={styles.notificationRow}>
        <div>
          <strong>
            <span
              className={`${styles.statusDot} ${status?.enabled ? styles.enabled : ""}`}
              aria-hidden="true"
            />
            このブラウザーの通知：
            {busy && !status ? "確認中…" : status?.enabled ? "有効" : "無効"}
          </strong>
          <p>
            「通知を有効にする」を押し、ブラウザーに表示される通知の許可を選んでください。端末・ブラウザーごとに設定が必要です。
          </p>
        </div>
        {status?.enabled ? (
          <button type="button" disabled={busy} onClick={() => void disable()}>
            通知を停止
          </button>
        ) : (
          <button
            type="button"
            disabled={
              busy || !supported || denied || !configured || !status?.ready
            }
            onClick={() => void enable()}
          >
            {busy ? "確認中…" : "通知を有効にする"}
          </button>
        )}
      </div>
      <details className={styles.notificationDetails}>
        <summary>通知が届かない場合・端末別の設定</summary>
        <div className={styles.notificationHelp}>
          <p>
            ブラウザーで通知を許可していても、OS側の通知がオフだと表示されません。
          </p>
          <p className={styles.platformLabel}>Windowsの設定</p>
          <ol>
            <li>
              Windowsの「設定 → システム → 通知」を開き、通知をオンにします。
            </li>
            <li>
              アプリの一覧で、使用している「Google Chrome」または「Microsoft
              Edge」の通知をオンにします。
            </li>
            <li>
              そのブラウザーの通知設定を開き、「通知バナーを表示する」と「通知センターに通知を表示する」をオンにします。
            </li>
            <li>「応答不可」はオフにします。</li>
          </ol>
          <figure className={styles.notificationExample}>
            <Image
              src="/UDM/afetiria-extra/windows-chrome-notifications.png"
              alt="Windowsの通知設定。Google Chromeの通知スイッチがオンになっている例"
              width={672}
              height={65}
            />
            <figcaption>Windowsの通知設定例（Google Chrome）</figcaption>
          </figure>
          <p className={styles.platformLabel}>iPhone・iPadの設定</p>
          <p>
            iOS／iPadOS
            16.4以降では、Safariの共有メニューから「ホーム画面に追加」してください。追加したアイコンからWebアプリを開き、「通知を有効にする」を押してください。
          </p>
        </div>
      </details>
      {(!configured || (status && !status.ready)) && (
        <p>通知機能は準備中です。準備が完了すると、ここから有効にできます。</p>
      )}
      {supported === false && (
        <p>
          このブラウザーでは通知を利用できません。対応ブラウザーで開いてください。iPhone・iPadはホーム画面への追加を先に行ってください。
        </p>
      )}
      {denied && (
        <p>
          通知がブロックされています。ブラウザーのサイト設定から通知を許可してください。
        </p>
      )}
      {status?.deliveryIssue && (
        <p role="alert" className={styles.error}>
          通知の配信に問題が発生しています。管理者に確認してください。
        </p>
      )}
      {busy && <LoadingProgress label="通知設定を確認中…" />}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
