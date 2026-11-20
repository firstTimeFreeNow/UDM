"use client";
import { useState } from "react";
import { ApiError, callApi } from "@/lib/udm-api/client";
import { isInternalPath } from "@udm/contracts/shared-links";
import styles from "@/components/afetiria/service.module.css";

export function ShareButton({path, getToken}: {path: string; getToken: () => Promise<string>}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const target = path.endsWith("/") ? path : path + "/";
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("共有リンクをコピーしました。"); }
    catch { setNotice("表示されている共有リンクをコピーしてください。"); }
  }
  async function share() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const link = await callApi("udm.links.share", {path: target}, getToken, (value): value is {code: string; path: string} => {
        const item = value as {code?: string; path?: string} | null;
        return !!item && typeof item.code === "string" && /^[A-Za-z0-9_-]{4,32}$/.test(item.code) && item.path === target && isInternalPath(item.path);
      });
      const value = `${window.location.origin}/UDM/s/?c=${encodeURIComponent(link.code)}`;
      setUrl(value); await copy(value);
    } catch (error) { setError(error instanceof ApiError ? error.message : "共有リンクを発行できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div className={styles.sharePanel}>
    <button type="button" disabled={busy} onClick={() => void share()}>{busy ? "発行中…" : "共有リンクを発行"}</button>
    {url && <div className={styles.shareResult}><a href={url}>{url}</a><button type="button" onClick={() => void copy(url)}>コピー</button></div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
