import { FundingTable } from "./funding-table";
import { CompletionTime } from "./completion-time";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Coins,
  Hammer,
  Layers3,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SLOTS, STATS, STAT_LABELS } from "@/lib/planner/data";
import type {
  Operation,
  Plan,
  PlannerInput,
  Summary,
  SlotCost,
} from "@/lib/planner/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(n);
const money = (n: number, currency: "seed" | "elso") =>
  currency === "seed"
    ? `${n >= 1e12 ? `${fmt(n / 1e12)}兆` : n >= 1e8 ? `${fmt(n / 1e8)}億` : fmt(Math.round(n))} SEED`
    : `${n >= 1e12 ? `${fmt(n / 1e12)}兆` : n >= 1e8 ? `${fmt(n / 1e8)}億` : n >= 1e4 ? `${fmt(n / 1e4)}万` : fmt(Math.round(n))} ELSO`;
function CostDetails({ cost }: { cost: SlotCost | undefined }) {
  if (!cost) return null;
  const rows = [
    ["インクリ", cost.incrementSeed, cost.incrementElso],
    ["呪文書", cost.scrollSeed, cost.scrollElso],
    ["コア育成", cost.coreSeed, cost.coreElso],
  ] as const;
  return (
    <div
      className="rounded-md bg-muted/25 p-3"
      aria-label={`${cost.slot}の費用内訳`}
    >
      <p className="mb-2 text-xs font-medium">この装備の費用内訳（期待値）</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 font-normal">項目</th>
              <th className="pb-2 font-normal">SEED</th>
              <th className="pb-2 font-normal">ELSO</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(([_, seed, elso]) => seed > 0 || elso > 0)
              .map(([label, seed, elso]) => (
                <tr key={label}>
                  <th className="py-1 pr-3 font-normal">{label}</th>
                  <td className="py-1 pr-3 tabular-nums">
                    {money(seed, "seed")}
                  </td>
                  <td className="py-1 tabular-nums">{money(elso, "elso")}</td>
                </tr>
              ))}
            <tr className="border-t font-semibold">
              <th className="pt-2 pr-3">合計</th>
              <td className="pt-2 pr-3 tabular-nums">
                {money(
                  cost.incrementSeed + cost.scrollSeed + cost.coreSeed,
                  "seed",
                )}
              </td>
              <td className="pt-2 tabular-nums">
                {money(
                  cost.incrementElso + cost.scrollElso + cost.coreElso,
                  "elso",
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function EquipmentCostCards({
  costs,
  input,
}: {
  costs: SlotCost[];
  input: PlannerInput;
}) {
  if (!costs.length) return null;
  return (
    <section aria-label="装備ごとの費用内訳" className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Coins className="size-4" aria-hidden="true" />
        装備ごとの費用内訳
      </h3>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))",
        }}
      >
        {costs.map((cost) => {
          const slot = SLOTS.find((slot) => slot.label === cost.slot);
          const gear = input.gear.find((gear) => gear.slot === slot?.id);
          return (
            <Card
              key={cost.slot}
              size="sm"
              role="article"
              aria-label={`${cost.slot}の費用カード`}
            >
              <CardHeader>
                <CardTitle>{cost.slot}</CardTitle>
                {gear && <CardDescription>{gear.name}</CardDescription>}
              </CardHeader>
              <CardContent>
                <CostDetails cost={cost} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
function OperationDetails({ operations }: { operations: Operation[] }) {
  return (
    <details className="mt-4 border-t pt-3">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        実行順・各回の詳細（{operations.length}手順）
      </summary>
      <ol className="mt-3 list-none space-y-2 !pl-0">
        {operations.map((op, i) => (
          <li key={i} className="flex gap-3 text-xs">
            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
              {i + 1}.
            </span>
            <div>
              <span className="font-medium">{op.label}</span>
              <p className="mt-1 text-muted-foreground">
                {op.from} → {op.to}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
export function UpgradeRoadmap({
  summary,
  plan,
  input,
  current,
  target,
}: {
  plan: Plan;
  summary: Summary;
  input: PlannerInput;
  current: number;
  target: number;
}) {
  const equipment = SLOTS.flatMap((slot) => {
    const operations = plan.operations.filter(
      (op) => op.kind !== "core" && op.slot === slot.label,
    );
    const gear = input.gear.find((g) => g.slot === slot.id);
    if (!operations.length || !gear) return [];
    const increments = operations.filter((op) => op.kind === "increment");
    const enchants = operations.filter((op) => op.kind === "enchant");
    const scrolls = new Map<string, { label: string; count: number }>();
    for (const op of enchants) {
      const key = op.product?.id ?? op.label;
      const group = scrolls.get(key);
      if (group) group.count++;
      else
        scrolls.set(key, {
          label: op.stat
            ? `${STAT_LABELS[op.stat]}＋${op.product?.id.match(/-(\d+)$/)?.[1] ?? op.gain}${op.product?.disposable ? "（使い捨て）" : ""}`
            : op.label,
          count: 1,
        });
    }
    const gains = STATS.map((stat) => ({
      stat,
      gain: enchants
        .filter((op) => op.stat === stat)
        .reduce((sum, op) => sum + op.gain, 0),
    })).filter((x) => x.gain > 0);
    return [
      {
        slot,
        gear,
        operations,
        increments,
        scrolls: [...scrolls.values()],
        gains,
      },
    ];
  });
  const cores = [
    ...new Set(
      plan.operations.filter((op) => op.kind === "core").map((op) => op.slot),
    ),
  ].map((slot) => ({
    slot,
    operations: plan.operations.filter(
      (op) => op.kind === "core" && op.slot === slot,
    ),
  }));
  const increments = equipment.reduce((sum, g) => sum + g.increments.length, 0);
  return (
    <section
      aria-label="強化ロードマップ"
      className="space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="!m-0 text-base font-semibold">強化ロードマップ</h3>
        <div className="flex flex-wrap gap-2">
          {summary.week !== null && (
            <Badge variant="secondary">
              <CompletionTime week={summary.week} compact />
            </Badge>
          )}
          <Badge variant="outline">
            装備 {equipment.length}部位
            {increments > 0 && ` · インクリ成功 計${increments}回`}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg bg-emerald-50 p-4">
        <div>
          <p className="text-xs text-muted-foreground">現在の装備合計</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {fmt(current)}
          </p>
        </div>
        <div className="text-center text-emerald-800">
          <span className="text-xs font-medium">＋{fmt(plan.gain)}</span>
          <ArrowRight className="mx-auto mt-1 size-5" aria-hidden="true" />
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">強化後 / 入場条件</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-900">
            {fmt(current + plan.gain)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / {fmt(target)}
            </span>
          </p>
        </div>
      </div>
      {equipment.length > 0 && (
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Hammer className="size-4" aria-hidden="true" />
            装備の強化
          </h4>
          <p className="text-xs text-muted-foreground">
            回数は必要な成功回数です。完了目安は、手順順に累積した期待費用を資金・収入で賄える週を示します。
          </p>
          {equipment.map((group) => (
            <article
              key={group.slot.id}
              className="min-w-0 rounded-lg border bg-background p-4"
              aria-label={`${group.slot.label}の強化計画`}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{group.slot.label}</Badge>
                <h5 className="min-w-0 break-words text-sm font-semibold">
                  {group.gear.name}
                </h5>
                {summary.milestones.find((m) => m.slot === group.slot.label)
                  ?.week != null && (
                  <Badge variant="outline">
                    <CompletionTime
                      week={
                        summary.milestones.find(
                          (m) => m.slot === group.slot.label,
                        )!.week
                      }
                      compact
                    />
                  </Badge>
                )}
              </div>
              <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-amber-900">
                    <Hammer className="size-3.5" aria-hidden="true" />
                    インクリ
                  </p>
                  {group.increments.length ? (
                    <>
                      <p className="mt-2 text-xl font-semibold text-amber-950">
                        {group.increments[0].label.startsWith("エタ")
                          ? "エタ"
                          : "ビアヌ"}
                        <span className="mt-1 block whitespace-nowrap text-sm">
                          {group.increments.length}回成功
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-amber-900/80">
                        通算 {group.gear.increments} →{" "}
                        {group.gear.increments + group.increments.length}回
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm font-medium">
                      不要（空き枠を使用）
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight
                    className="hidden size-4 sm:block"
                    aria-hidden="true"
                  />
                  <ArrowDown className="size-4 sm:hidden" aria-hidden="true" />
                </div>
                <div className="rounded-lg bg-sky-50 p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-sky-900">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    エンチャント
                  </p>
                  <ul className="mt-2 space-y-1">
                    {group.scrolls.map((s) => (
                      <li
                        key={s.label}
                        className="break-words text-sm font-medium text-sky-950"
                      >
                        {s.label}
                        <span className="mt-1 block whitespace-nowrap">
                          × {s.count}回
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight
                    className="hidden size-4 sm:block"
                    aria-hidden="true"
                  />
                  <ArrowDown className="size-4 sm:hidden" aria-hidden="true" />
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-xs font-medium text-emerald-900">
                    <Check className="size-3.5" aria-hidden="true" />
                    強化後
                  </p>
                  <div className="mt-2 space-y-1">
                    {group.gains.map(({ stat, gain }) => (
                      <p
                        key={stat}
                        className="text-sm font-semibold tabular-nums text-emerald-950"
                      >
                        {STAT_LABELS[stat]} {fmt(group.gear.actual[stat])} →{" "}
                        {fmt(group.gear.actual[stat] + gain)}
                        <span className="ml-1 text-xs font-normal">
                          （＋{fmt(gain)}）
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              {group.increments.length > 1 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  合成4のときは、インクリで枠を空けてエンチャントする操作を繰り返します。
                </p>
              )}
              <OperationDetails operations={group.operations} />
            </article>
          ))}
        </div>
      )}
      {plan.growth.length > 0 && (
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4" aria-hidden="true" />
            レリック・カフス
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.growth.map((g, i) => (
              <div key={i} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="mt-2 text-sm tabular-nums">
                  {STAT_LABELS[g.stat]} {g.from} → <strong>{g.to}</strong>
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            育成費用は計上しません。
          </p>
        </div>
      )}
      {cores.length > 0 && (
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Layers3 className="size-4" aria-hidden="true" />
            テシスコア
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {cores.map((g) => (
              <article key={g.slot} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{g.slot}</p>
                {summary.milestones.find((m) => m.slot === g.slot)?.week !=
                  null && (
                  <Badge variant="outline">
                    <CompletionTime
                      week={
                        summary.milestones.find((m) => m.slot === g.slot)!.week
                      }
                      compact
                    />
                  </Badge>
                )}
                <p className="mt-2 text-xs">
                  {g.operations[0].from}
                  <ArrowRight
                    className="mx-2 inline size-3"
                    aria-hidden="true"
                  />
                  <strong>{g.operations.at(-1)?.to}</strong>
                </p>
                <OperationDetails operations={g.operations} />
              </article>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            コアの補正は装備合計に加算しません。
          </p>
        </div>
      )}
    </section>
  );
}
export function FundingRoadmap({
  summary,
  input,
}: {
  summary: Summary;
  input: PlannerInput;
}) {
  const max = summary.week;
  if (max === null)
    return (
      <p className="text-sm text-muted-foreground">
        収入と予算を設定すると、資金ロードマップを表示します。
      </p>
    );
  return (
    <section
      aria-label="資金ロードマップ"
      className="space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="!m-0 flex items-center gap-2 text-base font-semibold">
          <Coins className="size-4" aria-hidden="true" />
          資金ロードマップ
        </h3>
        <Badge variant="secondary">
          <CompletionTime week={max} compact />
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        0週目から完成目安まで、毎週の利用可能資金の累計を表示します。
      </p>
      <FundingTable max={max} input={input} />
    </section>
  );
}
