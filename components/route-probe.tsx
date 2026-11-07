"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

declare global { interface Window { udmDocumentId?: string } }

export default function RouteProbe() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [documentId, setDocumentId] = useState("確認中…");
  const [url, setUrl] = useState("");
  useEffect(() => {
    window.udmDocumentId ??= crypto.randomUUID();
    setDocumentId(window.udmDocumentId); setUrl(window.location.href);
  }, [pathname, params]);
  return <section className="card"><h2>現在のルート</h2><dl>
    <dt>パス（basePath を除く）</dt><dd data-testid="route-path">{pathname}</dd>
    <dt>クエリ</dt><dd data-testid="route-query">{params.toString() || "（なし）"}</dd>
    <dt>現在の URL</dt><dd>{url || "確認中…"}</dd>
    <dt>ドキュメント ID</dt><dd data-testid="document-id">{documentId}</dd>
  </dl><p className="small">Link で移動するとドキュメント ID は同じです。再読み込み・直接アクセスでは新しい ID になります。戻る・進むでブラウザーのキャッシュが復元された場合は元の ID に戻ることがあります。</p>
  <div className="actions"><button className="secondary" onClick={() => router.back()}>戻る</button><button className="secondary" onClick={() => router.forward()}>進む</button><button className="secondary" onClick={() => window.location.reload()}>このページを再読み込み</button></div>
  </section>;
}
