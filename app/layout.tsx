import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import "./globals.css";

export const metadata: Metadata = { title: "UDM | GitHub Pages 機能検証", description: "Session Storage と App Router の動作確認" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body><div className="mx-auto max-w-6xl px-4 sm:px-8">
    <header className="flex flex-wrap items-center gap-4 border-b py-5">
      <Link className="mr-auto text-xl font-semibold tracking-tight" href="/">UDM</Link>
      <nav className="flex flex-wrap gap-1" aria-label="メインナビゲーション">
        <Button asChild variant="ghost"><Link href="/">機能一覧</Link></Button>
        <Button asChild variant="ghost"><Link href="/session-storage/">Session Storage</Link></Button>
        <Button asChild variant="ghost"><Link href="/routing/">ルーティング</Link></Button>
      </nav>
    </header>
    <main className="min-h-[75vh] space-y-5 py-8">{children}</main>
    <footer className="border-t py-5 text-xs text-muted-foreground">GitHub Pages 機能検証</footer>
  </div></body></html>;
}
