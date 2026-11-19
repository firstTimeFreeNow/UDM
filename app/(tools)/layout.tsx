import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ToolsLayout({ children }: {children: ReactNode}) {
  return (
        <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
          <header className="flex flex-wrap items-center gap-4 border-b py-4">
            <Link
              href="/"
              className="mr-auto text-xl font-semibold tracking-tight"
            >
              UDM
              <span className="ml-3 text-[10px] font-normal tracking-widest text-muted-foreground">
                TALESWEAVER TOOLS
              </span>
            </Link>
            <nav aria-label="メインナビゲーション" className="flex gap-1">
              <Button asChild variant="ghost">
                <Link href="/">機能一覧</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/equipment-planner/">装備プランナー</Link>
              </Button>
            </nav>
          </header>
          <main className="min-h-[80vh] py-6 sm:py-8">{children}</main>
          <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t py-5 text-xs text-muted-foreground">
            <span>UDM · TalesWeaver Equipment Planner</span>
            <span>入力はこのブラウザーに保存されます</span>
          </footer>
        </div>
  );
}
