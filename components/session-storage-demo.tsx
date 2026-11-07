"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const KEY = "udm:session-demo:v1";
type Saved = { text: string; savedAt: string };

function parse(raw: string | null): Saved | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || !("text" in value) || typeof value.text !== "string" || !("savedAt" in value) || typeof value.savedAt !== "string") throw new Error("保存データの形式が不正です。削除して保存し直してください。");
  return value as Saved;
}

export default function SessionStorageDemo() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("保存状態を確認中…");
  const [error, setError] = useState("");
  const [test, setTest] = useState("");

  function read() {
    try {
      const value = parse(window.sessionStorage.getItem(KEY));
      setSaved(value); setText(value?.text ?? ""); setError("");
      setMessage(value ? "Session Storage から保存データを読み出しました。" : "保存データはありません。");
    } catch (e) { setError(e instanceof Error ? e.message : "Session Storage を読み出せません。"); }
    finally { setReady(true); }
  }
  useEffect(() => { read(); window.addEventListener("pageshow", read); return () => window.removeEventListener("pageshow", read); }, []);

  function save() {
    try {
      const value = { text, savedAt: new Date().toISOString() };
      const raw = JSON.stringify(value);
      window.sessionStorage.setItem(KEY, raw);
      if (window.sessionStorage.getItem(KEY) !== raw) throw new Error("保存内容が一致しません。");
      setSaved(value); setError(""); setMessage("保存して読出し一致を確認しました。再読み込みして保持を確認してください。");
    } catch (e) { setError(e instanceof Error ? e.message : "保存できません。"); }
  }
  function remove() {
    try { window.sessionStorage.removeItem(KEY); setSaved(null); setText(""); setError(""); setMessage("検証用データを削除しました。"); }
    catch (e) { setError(e instanceof Error ? e.message : "削除できません。"); }
  }
  function selfTest() {
    const key = `${KEY}:probe:${crypto.randomUUID()}`;
    try {
      const value = crypto.randomUUID();
      window.sessionStorage.setItem(key, value);
      if (window.sessionStorage.getItem(key) !== value) throw new Error("読出し不一致");
      window.sessionStorage.removeItem(key);
      if (window.sessionStorage.getItem(key) !== null) throw new Error("削除失敗");
      setTest("PASS：一時データの保存 → 読出し一致 → 削除を確認しました。保持期間は下の手順で別途確認してください。");
    } catch (e) { setTest(`FAIL：${e instanceof Error ? e.message : "利用できません"}`); }
    finally { try { window.sessionStorage.removeItem(key); } catch { /* Storage may be blocked. */ } }
  }

  return <Panel title="保存データ" aria-label="保存データの検証">
    <div className="mb-4 flex flex-wrap items-center gap-2"><Badge variant={saved ? "default" : "secondary"}>{!ready ? "確認中" : saved ? "保存済み" : "未保存"}</Badge><span className="small">検証用キー：<code>{KEY}</code></span></div>
    <div className="space-y-2"><Label htmlFor="storage-text">保存するテキスト</Label>
      <Textarea id="storage-text" value={text} onChange={e => setText(e.target.value)} disabled={!ready} rows={3} />
    </div>
    <div className="actions"><Button onClick={save} disabled={!ready}>保存</Button><Button variant="outline" onClick={read} disabled={!ready}>読出し</Button><Button variant="outline" onClick={remove} disabled={!ready}>検証データを削除</Button></div>
    <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>
    {error && <Alert variant="destructive" className="mt-3" data-testid="storage-error"><AlertDescription>{error}</AlertDescription></Alert>}
    <dl><dt>保存済みテキスト</dt><dd data-testid="saved-text">{saved === null ? "（未保存）" : saved.text === "" ? "（空文字を保存）" : saved.text}</dd><dt>保存日時（UTC）</dt><dd data-testid="saved-at">{saved?.savedAt ?? "—"}</dd></dl>
    <div className="actions"><Button variant="outline" onClick={() => window.location.reload()} disabled={!ready}>このページを再読み込み</Button><Button asChild variant="outline"><Link href="/routing/alpha/">別ページで保存内容を確認</Link></Button><Button asChild variant="outline"><a href="/UDM/session-storage/" target="_blank" rel="noopener noreferrer">独立した新しいタブで開く</a></Button></div>
    <Separator className="my-6" />
    <h3>API の自動チェック</h3><p>一時キーで保存・読出し・削除を試します。上の保存データは変更しません。</p><Button className="mt-3" variant="outline" onClick={selfTest} disabled={!ready}>自動チェックを実行</Button>
    {test && <Alert className="mt-3" role="status" variant={test.startsWith("FAIL") ? "destructive" : "default"} data-testid="storage-test"><AlertDescription>{test}</AlertDescription></Alert>}
  </Panel>;
}
