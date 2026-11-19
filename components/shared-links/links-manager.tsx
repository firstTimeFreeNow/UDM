"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "@/components/afetiria/service-provider";
import styles from "@/components/afetiria/service.module.css";
import { ApiError, callApi } from "@/lib/udm-api/client";
import type { Action } from "@/lib/udm-api/client";
import { isInternalPath, isLinkList, type SharedLink } from "@/lib/shared-links/types";

export function LinksManager() {
  const {user, role} = useSession();
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [code, setCode] = useState("");
  const [path, setPath] = useState("/UDM/afetiria-extra/answer/");
  const [origin, setOrigin] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    if (role !== "admin") return;
    const current = ++generation.current;
    setOrigin(window.location.origin); setBusy(true); setError("");
    callApi("udm.links.list", {}, () => user.getIdToken(), isLinkList).then(result => {
      if (current === generation.current) { setLinks(result.links); setUncertain(false); }
    }).catch(error => {if (current === generation.current) setError(error instanceof ApiError ? error.message : "取得できませんでした。");})
      .finally(() => {if (current === generation.current) setBusy(false);});
    return () => {generation.current++;};
  }, [user, role, attempt]);
  if (role !== "admin") return <p role="alert">管理者アカウントでログインしてください。</p>;
  async function mutate(action: Action, payload: object) {
    if (busy || uncertain) return false;
    setBusy(true); setError(""); setNotice("");
    try { const result = await callApi(action, payload, () => user.getIdToken(), isLinkList); setLinks(result.links); setNotice("保存しました。"); return true; }
    catch (error) {
      if (error instanceof ApiError && error.outcomeUnknown) {setUncertain(true); setError("保存結果を確認できません。再送する前に一覧を取得してください。");}
      else setError(error instanceof ApiError ? error.message : "保存できませんでした。");
      return false;
    } finally {setBusy(false);}
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (await mutate("udm.links.create", {code, path})) setCode("");
  }
  const disabled = busy || uncertain;
  return <>
    <div className={styles.toolbar}><div><h1>共有URL</h1><p>UDMの各画面に、繰り返し使える短いURLを発行します。</p></div>
      <button type="button" disabled={busy} onClick={() => setAttempt(attempt + 1)}>一覧を取得</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className={styles.card}><h2>共有URLを発行</h2><form onSubmit={create}>
      <label htmlFor="udm-path">転送先</label><input id="udm-path" list="udm-paths" required value={path} disabled={disabled} onChange={event => setPath(event.target.value)}/>
      <datalist id="udm-paths"><option value="/UDM/afetiria-extra/">開催状況</option><option value="/UDM/afetiria-extra/answer/">参加回答</option><option value="/UDM/afetiria-extra/history/">開催履歴</option><option value="/UDM/equipment-planner/">装備プランナー</option></datalist>
      <p className={styles.muted}>UDM内の画面パスを指定します。例：/UDM/afetiria-extra/answer/</p>
      <label htmlFor="udm-code">短縮コード（空欄なら自動発行）</label><input id="udm-code" value={code} disabled={disabled} maxLength={32} pattern="[A-Za-z0-9_-]{4,32}" onChange={event => setCode(event.target.value)}/>
      <div className={styles.inline}><button className={styles.primary} type="submit" disabled={disabled || !isInternalPath(path)}>発行</button></div>
    </form></section>
    <section className={styles.card}><h2>発行済みURL</h2>
      {!links.length && !busy && <p>共有URLはまだありません。</p>}
      {links.map(link => <LinkRow key={link.code} link={link} origin={origin} disabled={disabled} mutate={mutate} onCopy={setNotice}/>)}
    </section>
  </>;
}
function LinkRow({link, origin, disabled, mutate, onCopy}: {link: SharedLink; origin: string; disabled: boolean;
  mutate: (action: Action, payload: object) => Promise<boolean>; onCopy: (text: string) => void}) {
  const [path, setPath] = useState(link.path);
  useEffect(() => {setPath(link.path);}, [link.path]);
  const url = `${origin}/UDM/s/?c=${encodeURIComponent(link.code)}`;
  return <article className={styles.card}><h3>{link.code}{!link.active && <span className={styles.badge}>無効</span>}</h3>
    <p style={{overflowWrap:"anywhere"}}><a href={url}>{url}</a></p>
    <div className={styles.inline}><button type="button" disabled={!link.active} onClick={async () => {
      try {await navigator.clipboard.writeText(url); onCopy("共有URLをコピーしました。");} catch {onCopy("表示されている共有URLをコピーしてください。");}
    }}>URLをコピー</button><button type="button" disabled={disabled} onClick={() => void mutate("udm.links.update", {
      code:link.code,path:link.path,active:!link.active,beforePath:link.path,beforeActive:link.active,
    })}>{link.active ? "無効にする" : "有効にする"}</button></div>
    <form onSubmit={event => {event.preventDefault(); void mutate("udm.links.update", {code:link.code,path,active:link.active,beforePath:link.path,beforeActive:link.active});}}>
      <label htmlFor={`path-${link.code}`}>転送先</label><input id={`path-${link.code}`} value={path} disabled={disabled} required onChange={event => setPath(event.target.value)}/>
      <button type="submit" disabled={disabled || path === link.path || !isInternalPath(path)}>転送先を変更</button>
    </form></article>;
}
