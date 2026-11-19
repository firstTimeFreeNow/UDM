"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, callApi } from "@/lib/udm-api/client";
import { isResolvedLink } from "@/lib/shared-links/types";

export function ResolveLink() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const code = new URLSearchParams(window.location.search).get("c") || "";
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(code)) { setError("共有URLを確認してください。"); return; }
    callApi("udm.links.resolve", {code}, async () => "", isResolvedLink).then(result => {
      if (active) window.location.replace(result.path);
    }).catch(error => { if (active) setError(error instanceof ApiError ? error.message : "共有URLを開けませんでした。"); });
    return () => {active = false;};
  }, []);
  return <main className="mx-auto max-w-xl px-6 py-16"><h1 className="mb-4 text-2xl font-semibold">UDM 共有URL</h1>
    <p role={error ? "alert" : "status"}>{error || "画面を開いています…"}</p>
    {error && <p className="mt-6"><Link href="/">UDMを開く</Link></p>}</main>;
}
