import { discountedFee } from "@/lib/planner/engine";
import { calendarDate, calendarDuration } from "@/lib/planner/calendar";
import { formatMoney } from "@/lib/planner/format-money";
import { STAT_LABELS } from "@/lib/planner/data";
import { Badge } from "@/components/ui/badge";
import type { PlannerInput, Summary } from "@/lib/planner/types";
type Event = Summary["schedule"][number];
function Payment({ seed, elso }: { seed: number; elso: number }) {
  return (
    <div className="space-y-1 whitespace-nowrap tabular-nums">
      {(seed > 0 || elso === 0) && <div>{formatMoney(seed, "SEED")}</div>}
      {elso > 0 && <div>{formatMoney(elso, "ELSO")}</div>}
    </div>
  );
}
function PaymentSequence({ event, input }: { event: Event; input: PlannerInput }) {
  const fee = event.kind === "enchant"
    ? 0
    : discountedFee(event.fee, input.discount, event.minimum ?? 0);
  const elsoFee = Math.ceil((fee * 3) / 20000);
  const product = event.product;
  if (event.kind === "enchant") {
    return (
      <div className="space-y-2">
        <p>所持する呪文書を先に使用</p>
        <p className="text-muted-foreground">
          なければ購入：<Payment seed={product?.seed ?? 0} elso={product?.elso ?? 0} />
          {product?.disposable ? "1試行ごとに1枚使用" : "1枚で成功まで試行"}
        </p>
        <p className="font-medium">成功したら次の手順へ</p>
      </div>
    );
  }
  const eta = product?.id === "eta";
  return (
    <div className="min-w-64 space-y-2" aria-label="支払いの順序">
      {event.coupon && <p>所持する強化券を先に使用</p>}
      {eta && <p>所持するエタを先に使用（費用は手数料のみ）</p>}
      <ol className="list-none space-y-2 pl-0">
        <li className="rounded border border-primary/25 bg-primary/5 px-2 py-2">
          <span className="block font-semibold">① ELSOで試行</span>
          <span className="block">1回 {formatMoney(elsoFee, "ELSO")}{eta && "（手数料）"}</span>
          {eta && <span className="block text-muted-foreground">エタがなければ1回分を{formatMoney(product.elso, "ELSO")}で購入</span>}
          <span className="block text-muted-foreground">成功するか、ELSOが1回分未満になるまで</span>
        </li>
        <li className="rounded border px-2 py-2">
          <span className="block font-semibold">② 未成功ならSEEDで継続</span>
          <span className="block">1回 {formatMoney(fee, "SEED")}{eta && "（手数料）"}</span>
          {eta && <span className="block text-muted-foreground">エタはELSO購入を優先。不足時は1回分を{formatMoney(product.seed, "SEED")}で購入</span>}
          <span className="block text-muted-foreground">ELSOで成功済みなら実施しない</span>
        </li>
      </ol>
      <p className="font-medium">どちらで成功しても次の手順へ</p>
    </div>
  );
}
export function ScheduleSteps({
  events,
  week,
  start,
  input,
}: {
  events: Event[];
  week: number;
  start: string;
  input: PlannerInput;
}) {
  return (
    <article
      aria-label={`${week}週目の強化手順`}
      className="overflow-hidden rounded-lg border"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-4 py-3">
        <div>
          <span className="text-sm font-semibold">
            {calendarDate(start, week)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {week === 0 ? "今日" : calendarDuration(start, week)}
          </span>
        </div>
        <Badge variant="outline">
          {week}週目・{events.length}手順
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="border-b text-muted-foreground">
            <tr>
              {[
                "順序",
                "部位",
                "やること",
                "期待試行回数",
                "実施順・1回の費用",
                "SEED支出の期待値",
                "ELSO支出の期待値",
              ].map((label) => (
                <th key={label} className="px-3 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.index}
                aria-label={`手順${event.index + 1} ${event.slot} ${event.label}`}
                className="border-b last:border-b-0"
              >
                <td className="px-3 py-4 tabular-nums">{event.index + 1}</td>
                <td className="whitespace-nowrap px-3 py-4 font-medium">
                  {event.slot}
                </td>
                <td className="px-3 py-4">
                  <span className="block whitespace-nowrap font-semibold">
                    {event.kind === "enchant"
                      ? `${event.stat ? STAT_LABELS[event.stat] : "能力値"}＋${event.gain}`
                      : event.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {event.kind === "enchant"
                      ? event.product?.disposable
                        ? "使い捨て"
                        : "通常呪文書"
                      : `1回の成功率 ${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 4 }).format(event.rate * 100)}%`}
                  </span>
                </td>
                <td className="px-3 py-4 tabular-nums">
                  約{Math.ceil(event.expectedTrials).toLocaleString("ja-JP")}回
                </td>
                <td className="px-3 py-4">
                  <PaymentSequence event={event} input={input} />
                </td>
                <td className="whitespace-nowrap px-3 py-4 font-semibold tabular-nums">
                  {formatMoney(event.expectedSeed, "SEED")}
                  {event.expectedSeed === 0 && event.expectedElso === 0 && (
                    <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                      所持品で対応
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-4 font-semibold tabular-nums">
                  {formatMoney(event.expectedElso, "ELSO")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
