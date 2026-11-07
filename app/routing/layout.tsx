import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import RouteProbe from "@/components/route-probe";

export default function RoutingLayout({ children }: { children: ReactNode }) {
  return <><h1>App Router 検証</h1><nav className="actions" aria-label="ルーティング検証">
    <Link className="button secondary" href="/routing/">一覧</Link><Link className="button secondary" href="/routing/alpha/">ページ A</Link><Link className="button secondary" href="/routing/beta/">ページ B</Link><Link className="button secondary" href="/routing/beta/?source=query-test">クエリ付きページ B</Link>
  </nav><Suspense fallback={<p>ルートを確認中…</p>}><RouteProbe /></Suspense>{children}</>;
}
