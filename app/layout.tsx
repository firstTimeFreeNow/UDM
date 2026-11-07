import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "UDM | GitHub Pages 機能検証", description: "Session Storage と App Router の動作確認" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body><div className="shell">
    <header><Link className="wordmark" href="/">UDM</Link><nav aria-label="メインナビゲーション">
      <Link href="/">機能一覧</Link><Link href="/session-storage/">Session Storage</Link><Link href="/routing/">ルーティング</Link>
    </nav></header>
    <main>{children}</main><footer>GitHub Pages 機能検証</footer>
  </div></body></html>;
}
