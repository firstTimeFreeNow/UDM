import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Home() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <h1>機能一覧</h1>
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
            <ChartNoAxesCombined className="size-5" />
          </div>
          <CardTitle>
            <h2>装備条件・強化計画</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            テイルズウィーバーのコンテンツ条件と現在装備を比較し、インクリ・エンチャントの強化案、費用、資金ロードマップを計算します。
          </p>
          <Button asChild>
            <Link href="/equipment-planner/">
              装備プランナーを開く
              <ArrowUpRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
