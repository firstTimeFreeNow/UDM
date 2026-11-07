"use client";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";


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
  return <Panel title={<>現在のルート</>}><dl>
    <dt>パス（basePath を除く）</dt><dd data-testid="route-path">{pathname}</dd>
    <dt>クエリ</dt><dd data-testid="route-query">{params.toString() || "（なし）"}</dd>
    <dt>現在の URL</dt><dd>{url || "確認中…"}</dd>
    <dt>ドキュメント ID</dt><dd data-testid="document-id">{documentId}</dd>
  </dl><p className="small">Link で移動するとドキュメント ID は同じです。再読み込み・直接アクセスでは新しい ID になります。戻る・進むでブラウザーのキャッシュが復元された場合は元の ID に戻ることがあります。</p>
  <div className="actions"><Button variant="outline" onClick={() => router.back()}>戻る</Button><Button variant="outline" onClick={() => router.forward()}>進む</Button><Button variant="outline" onClick={() => window.location.reload()}>このページを再読み込み</Button></div>
  </Panel>;
}
