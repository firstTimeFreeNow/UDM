import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AVATAR_SLOTS,
  AVATAR_SOURCE,
  avatarSetActive,
  avatarValues,
  type Avatar,
} from "@/lib/planner/avatar";
import { STATS, STAT_LABELS } from "@/lib/planner/data";

export function AvatarFields({
  value,
  onChange,
}: {
  value: Avatar[];
  onChange: (v: Avatar[]) => void;
}) {
  const active = avatarSetActive(value),
    totals = avatarValues(value);
  const count = value.filter((a) => a.equipped && a.setEligible).length;
  const update = (index: number, change: Partial<Avatar>) =>
    onChange(value.map((a, i) => (i === index ? { ...a, ...change } : a)));
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="!m-0 text-sm font-semibold">アバター装備</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange(
              value.map((a) => ({
                ...a,
                equipped: true,
                setEligible: true,
                actual: { S: 1, H: 1, I: 1, M: 1 },
              })),
            )
          }
        >
          補正付き5部位を設定
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        各部位の強化分を含む実数値を入力してください。通常装備の能力値とは別に加算します。
      </p>
      <div className="space-y-2">
        {value.map((avatar, index) => {
          const label = AVATAR_SLOTS.find((s) => s.id === avatar.slot)!.label;
          return (
            <details key={avatar.slot} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {avatar.equipped ? avatar.name || "装備中" : "未装備"}
                </span>
                {avatar.equipped && (
                  <span className="ml-2 text-xs font-normal">
                    {STATS.filter((stat) => totals[stat] > 0)
                      .map(
                        (stat) => `${STAT_LABELS[stat]} ${avatar.actual[stat]}`,
                      )
                      .join(" / ")}
                  </span>
                )}
              </summary>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      className="accent-emerald-700"
                      type="checkbox"
                      aria-label={`アバター ${label} 装備中`}
                      checked={avatar.equipped}
                      onChange={(e) =>
                        update(index, { equipped: e.target.checked })
                      }
                    />
                    装備中
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      className="accent-emerald-700"
                      type="checkbox"
                      aria-label={`アバター ${label} セット対象`}
                      checked={avatar.setEligible}
                      disabled={!avatar.equipped}
                      onChange={(e) =>
                        update(index, { setEligible: e.target.checked })
                      }
                    />
                    補正付きアバター（5点セット対象）
                  </label>
                </div>
                {avatar.equipped && (
                  <>
                    <label className="block space-y-1 text-xs">
                      <span>装備名（任意）</span>
                      <Input
                        aria-label={`アバター ${label} 装備名`}
                        value={avatar.name}
                        onChange={(e) =>
                          update(index, { name: e.target.value })
                        }
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {STATS.map((stat) => (
                        <label key={stat} className="block space-y-1 text-xs">
                          <span>{STAT_LABELS[stat]}</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={1e14}
                            aria-label={`アバター ${label} ${stat}`}
                            value={avatar.actual[stat]}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isFinite(n))
                                update(index, {
                                  actual: {
                                    ...avatar.actual,
                                    [stat]: Math.min(1e14, Math.max(0, n)),
                                  },
                                });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </details>
          );
        })}
      </div>
      <div
        className={`space-y-2 rounded-lg p-3 ${active ? "bg-emerald-50" : "bg-muted/40"}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">5点装備ボーナス</span>
          <Badge variant={active ? "default" : "secondary"}>
            {active ? "適用中" : `対象 ${count} / 5部位`}
          </Badge>
        </div>
        <p className="text-xs">
          {active
            ? "STAB・HACK・INT・MRにそれぞれ＋10を加算"
            : "兜・頭・体・脚・エフェクトの補正付きアバター5部位を装備すると適用"}
        </p>
        <p className="text-xs font-medium">
          アバター合計（ボーナス込み）：
          {STATS.map((stat) => `${STAT_LABELS[stat]} ${totals[stat]}`).join(
            " / ",
          )}
        </p>
      </div>
      <a
        href={AVATAR_SOURCE}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs underline underline-offset-4"
      >
        アバター補正・セット効果の参照元
      </a>
    </div>
  );
}
