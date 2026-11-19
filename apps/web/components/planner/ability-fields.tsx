import { availableAbilities, abilityValues } from "@/lib/planner/abilities";
import { withAbility } from "@/lib/planner/enchantment";
import { STAT_LABELS } from "@/lib/planner/data";
import type { Gear, Stat } from "@/lib/planner/types";
export function AbilityFields({
  gear,
  level,
  stats,
  onChange,
}: {
  gear: Gear;
  level: number;
  stats: Stat[];
  onChange: (g: Gear) => void;
}) {
  const definitions = availableAbilities(gear.slot, level, stats);
  if (!definitions.length) return null;
  const selected = definitions.find((d) => d.id === gear.ability?.id),
    values = abilityValues(gear.ability);
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <label className="block space-y-2 text-xs font-medium">
        <span>装着アビリティ</span>
        <select
          aria-label={`${gear.slot} アビリティ`}
          className="planner-select"
          value={selected?.id ?? ""}
          onChange={(e) => {
            const d = definitions.find((a) => a.id === e.target.value);
            onChange(
              withAbility(
                gear,
                d
                  ? {
                      id: d.id,
                      rolls: Array.from({ length: 1 }, () => ({
                        stat: "none" as const,
                        value: 0,
                      })),
                    }
                  : undefined,
              ),
            );
          }}
        >
          <option value="">なし</option>
          {definitions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}（{d.effect}）
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p className="text-xs">
            固定効果：<strong>{selected.effect}</strong>
          </p>
          {selected.options.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 1 }, (_, index) => {
                const roll = gear.ability?.rolls[index];
                const used = new Set(
                  gear.ability?.rolls
                    .filter((_, i) => i !== index)
                    .map((r) => r.stat),
                );
                return (
                  <label key={index} className="block space-y-2 text-xs">
                    <span>実際に付いた能力値の追加効果</span>
                    <select
                      aria-label={`${gear.slot} アビリティ追加${index + 1}`}
                      className="planner-select"
                      value={
                        roll &&
                        roll.stat !== "none" &&
                        stats.includes(roll.stat)
                          ? `${roll.stat}:${roll.value}`
                          : ""
                      }
                      onChange={(e) => {
                        const entries = Array.from(
                          { length: 1 },
                          (_, i) =>
                            gear.ability?.rolls[i] ?? {
                              stat: "none" as const,
                              value: 0,
                            },
                        );
                        const [stat, n] = e.target.value.split(":");
                        entries[index] = stat
                          ? { stat: stat as Stat, value: Number(n) }
                          : { stat: "none", value: 0 };
                        onChange(
                          withAbility(gear, {
                            id: selected.id,
                            rolls: entries,
                          }),
                        );
                      }}
                    >
                      <option value="">能力値以外・未指定（加算なし）</option>
                      {selected.options
                        .filter((option) => stats.includes(option.stat))
                        .flatMap((option) =>
                          Array.from(
                            { length: option.max - option.min + 1 },
                            (_, i) => {
                              const n = option.min + i;
                              return (
                                <option
                                  key={`${option.stat}:${n}`}
                                  value={`${option.stat}:${n}`}
                                  disabled={used.has(option.stat)}
                                >
                                  {STAT_LABELS[option.stat]}＋{n}
                                </option>
                              );
                            },
                          ),
                        )}
                    </select>
                  </label>
                );
              })}
            </div>
          )}
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-medium">
            能力値への加算：
            {stats
              .filter((s) => values[s] !== 0)
              .map((s) => `${STAT_LABELS[s]}＋${values[s]}`)
              .join(" / ") || "対象の能力補正なし"}
          </div>
          <p className="text-xs text-muted-foreground">
            固定補正と選択した追加補正は自動加算します。手入力欄には、それ以外の補正だけを入力してください。
          </p>
        </>
      )}
    </div>
  );
}
