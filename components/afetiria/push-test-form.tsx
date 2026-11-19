"use client";
import { useRef, useState, type FormEvent } from "react";
import { ApiError, callApi } from "@/lib/udm-api/client";
import { isPushTestResult, type PushTestResult } from "@/lib/afetiria/push";
import { useSession } from "./service-provider";
import styles from "./service.module.css";

export function PushTestForm() {
  const {user,role}=useSession();
  const [title,setTitle]=useState("テスト通知");
  const [body,setBody]=useState("");
  const [busy,setBusy]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [result,setResult]=useState<PushTestResult|null>(null);
  const [error,setError]=useState("");
  const pending=useRef(false);
  if(role!=="admin") return null;
  async function send(event: FormEvent) {
    event.preventDefault();
    if(pending.current || uncertain || !title.trim() || !body.trim()) return;
    pending.current=true;setBusy(true);setError("");setResult(null);
    try {setResult(await callApi("af.push.test",{title:title.trim(),body:body.trim()},()=>user.getIdToken(),isPushTestResult));}
    catch(error) {
      if(error instanceof ApiError && error.outcomeUnknown) {setUncertain(true);setError("送信結果を確認できません。重複送信を避けるため、自動再送は行いません。受信状況を確認してください。");}
      else setError(error instanceof ApiError ? error.message : "テスト通知を送信できませんでした。");
    } finally {pending.current=false;setBusy(false);}
  }
  return <section className={styles.card} aria-labelledby="af-push-test"><h2 id="af-push-test">プッシュ通知のテスト</h2>
    <p>通知を有効にした全端末へ、入力した内容を即時送信します。</p>
    <form onSubmit={send}>
      <label htmlFor="af-push-title">通知タイトル</label>
      <input id="af-push-title" required maxLength={80} value={title} disabled={busy || uncertain} onChange={event=>setTitle(event.target.value)}/>
      <label htmlFor="af-push-body" style={{marginTop:16}}>通知本文</label>
      <textarea id="af-push-body" required maxLength={500} rows={4} value={body} disabled={busy || uncertain} onChange={event=>setBody(event.target.value)}/>
      <button className={styles.primary} type="submit" disabled={busy || uncertain || !title.trim() || !body.trim()} style={{marginTop:12}}>{busy ? "送信中…" : "全端末へテスト通知を送信"}</button>
    </form>
    {result && <p role="status">{result.total===0 ? "通知を有効にした端末がありません。" : `送信結果：受付 ${result.accepted}件、失敗 ${result.failed}件、失効 ${result.removed}件。`}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
