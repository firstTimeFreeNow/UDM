"use client";

import Link from "next/link";
import { DataProvider } from "./data-provider";
import { LoadingProgress } from "./loading-progress";
import { ShareButton } from "@/components/shared-links/share-button";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, type Auth, type User } from "firebase/auth";
import { getServiceAuth } from "@/lib/afetiria/firebase";
import { callApi, ApiError } from "@/lib/udm-api/client";
import type { Role } from "@udm/contracts/afetiria";
import styles from "./service.module.css";

const Session = createContext<{ role: Role; user: User } | null>(null);
export function useSession() {
  const value = useContext(Session);
  if (!value) throw Error("Missing service session");
  return value;
}
function authMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/invalid-credential": "共通メールアドレスとパスワードを確認してください。",
    "auth/invalid-email": "メールアドレスの形式を確認してください。",
    "auth/too-many-requests": "少し待ってからログインしてください。",
    "auth/popup-closed-by-user": "Googleログインをキャンセルしました。",
    "auth/popup-blocked": "ブラウザーのポップアップを許可してください。",
    "auth/unauthorized-domain": "このサイトからのログインは現在利用できません。管理者に確認してください。",
  };
  return messages[code || ""] || "ログインを完了できませんでした。接続と設定を確認してください。";
}
export function ServiceProvider({ children, service = "afetiria" }: { children: ReactNode; service?: "afetiria" | "links" }) {
  const pathname = usePathname();
  const [auth, setAuth] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    let generation = 0;
    setLoading(true);
    if (!process.env.NEXT_PUBLIC_UDM_API_URL && !process.env.NEXT_PUBLIC_AF_API_URL) {
      setLoading(false); setError("接続先が未設定です。管理者に確認してください。");
      return () => { active = false; };
    }
    getServiceAuth().then(auth => {
      if (!active) return;
      setAuth(auth);
      unsubscribe = onAuthStateChanged(auth, async user => {
        const current = ++generation;
        setUser(user); setRole(null); setError(""); setLoading(true);
        if (!user) { setLoading(false); return; }
        try {
          const session = await callApi("af.session", {}, () => user.getIdToken(),
            (data): data is { role: Role } => !!data && typeof data === "object" &&
              ["participant", "admin"].includes((data as { role: string }).role));
          if (active && current === generation) setRole(session.role);
        } catch (error) {
          if (active && current === generation) setError(authMessage(error));
        } finally { if (active && current === generation) setLoading(false); }
      }, error => { if (active) { setLoading(false); setError(authMessage(error)); } });
    }).catch(() => { if (active) { setLoading(false); setError("接続先が未設定です。管理者に確認してください。"); } });
    return () => { active = false; unsubscribe(); };
  }, [attempt]);
  useEffect(() => {
    if (!role || service !== "afetiria" || !("serviceWorker" in navigator)) return;
    // Update an existing notification worker without subscribing or requesting permission.
    navigator.serviceWorker.getRegistration("/UDM/afetiria-extra/").then(registration => {
      if (registration?.scope === new URL("/UDM/afetiria-extra/", window.location.origin).href) return registration.update();
    }).catch(() => { /* The browser retries worker updates independently. */ });
  }, [role, service]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") || "").trim();
    const password = String(fields.get("password") || "");
    setBusy(true); setError("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (error) { setError(authMessage(error)); }
    finally { const input = form.elements.namedItem("password") as HTMLInputElement | null; if (input) input.value = ""; setBusy(false); }
  }
  async function googleLogin() {
    if (!auth || busy) return;
    setBusy(true); setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try { await signInWithPopup(auth, provider); }
    catch (error) { setError(authMessage(error)); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!auth || busy) return;
    setBusy(true);
    try { await signOut(auth); }
    catch (error) { setError(authMessage(error)); }
    finally { setBusy(false); }
  }
  const navigation = service === "links" ? [["/admin/links/", "共有URLの管理"]] : [
    ["/afetiria-extra/", "開催状況"], ["/afetiria-extra/answer/", "参加回答"], ["/afetiria-extra/history/", "開催履歴"],
    ...(role === "admin" ? [["/afetiria-extra/admin/", "管理"]] : []),
  ];
  return <div className={styles.shell}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>UDM / TALESWEAVER</span><Link className={styles.title} href={service === "links" ? "/admin/links/" : "/afetiria-extra/"}>{service === "links" ? "共有URLの管理" : "アフェティリアハード追加便"}</Link></div>
      {user && <button type="button" disabled={busy} onClick={logout}>ログアウト</button>}
    </header>
    {role && <nav className={styles.navigation} aria-label="アフェティリアのメニュー">{navigation.map(([href, label]) =>
      <Link key={href} href={href} aria-current={pathname.replace(/\/$/, "") === href.replace(/\/$/, "") ? "page" : undefined}>{label}</Link>)}</nav>}
    <main className={styles.main}>
      {loading ? <LoadingProgress label="ログインを確認中…"/> : user && role ?
        <DataProvider key={`${user.uid}:${role}:${service}`}><Session.Provider value={{user, role}}>
          {service === "afetiria" && !pathname.includes("/admin") && <ShareButton key={pathname} path={pathname.startsWith("/UDM/") ? pathname : `/UDM${pathname}`} getToken={() => user.getIdToken()}/>}
          {children}</Session.Provider></DataProvider> :
        <section className={styles.login}>
          <h1>{service === "links" ? "ログイン" : "参加者ログイン"}</h1>
          <p>共有されたメールアドレスとパスワードでログインしてください。</p>
          {user ? <button type="button" onClick={() => setAttempt(attempt + 1)}>アクセスを再確認</button> : <>
            <form onSubmit={login}>
              <label htmlFor="af-email">共通メールアドレス</label><input id="af-email" name="email" type="email" autoComplete="username" required disabled={!auth || busy}/>
              <label htmlFor="af-password">共通パスワード</label><input id="af-password" name="password" type="password" autoComplete="current-password" required disabled={!auth || busy}/>
              <button className={styles.primary} type="submit" disabled={!auth || busy}>ログイン</button>
            </form>
            <div className={service === "afetiria" ? styles.adminLogin : undefined}>{service === "afetiria" && <p>管理者ログイン</p>}<button type="button" onClick={googleLogin} disabled={!auth || busy}>Googleでログイン</button></div>
          </>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </section>}
    </main>
    <footer className={styles.footer}>{service === "links" ? "UDM · 共有URL" : "アフェティリアハード追加便"}</footer>
  </div>;
}
