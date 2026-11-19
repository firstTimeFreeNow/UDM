import {
  specialAbilityOptions,
  specialAbilityValues,
} from "@/lib/planner/special-abilities";
import { STAT_LABELS } from "@/lib/planner/data";
import type { Special, Stat } from "@/lib/planner/types";
export function SpecialAbilityFields({
  item,
  stats,
  onChange,
}: {
  item: Special;
  stats: Stat[];
  onChange: (item: Special) => void;
}) {
  const options = specialAbilityOptions(item, stats);
  if (!options.length) return null;
  const values = specialAbilityValues(item);
  const set = (
    index: number,
    entry: NonNullable<Special["abilities"]>[number],
  ) => {
    const entries = Array.from(
      { length: item.id === "cuffs" ? 2 : 1 },
      (_, i) => item.abilities?.[i] ?? null,
    );
    entries[index] = entry;
    onChange({ ...item, abilities: entries });
  };
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium">
        装着アビリティ{item.id === "cuffs" ? "（2枠）" : "（1枠）"}
      </p>
      {Array.from({ length: item.id === "cuffs" ? 2 : 1 }, (_, index) => {
        const entry = item.abilities?.[index];
        const selected = options.find((a) => a.id === entry?.id);
        return (
          <div key={index} className="grid gap-3 sm:grid-cols-[1fr_6rem]">
            <label className="space-y-1 text-xs">
              <span>アビリティ{index + 1}</span>
              <select
                className="planner-select"
                aria-label={`${item.id} アビリティ${index + 1}`}
                value={selected?.id ?? ""}
                onChange={(e) => {
                  const d = options.find((a) => a.id === e.target.value);
                  set(index, d ? { id: d.id, value: d.min } : null);
                }}
              >
                <option value="">なし</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}（{a.effect}）
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <label className="space-y-1 text-xs">
                <span>実際の補正</span>
                <select
                  className="planner-select"
                  aria-label={`${item.id} アビリティ補正${index + 1}`}
                  value={entry?.value ?? selected.min}
                  onChange={(e) =>
                    set(index, {
                      id: selected.id,
                      value: Number(e.target.value),
                    })
                  }
                >
                  {Array.from(
                    {
                      length:
                        Math.floor(
                          (selected.max - selected.min) / selected.step,
                        ) + 1,
                    },
                    (_, n) => selected.min + n * selected.step,
                  ).map((n) => (
                    <option key={n} value={n}>
                      ＋{n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}
      {stats.some((s) => values[s] > 0) && (
        <p className="text-xs font-medium text-emerald-800">
          本体の補正に加算：
          {stats
            .filter((s) => values[s] > 0)
            .map((s) => `${STAT_LABELS[s]}＋${values[s]}`)
            .join(" / ")}
        </p>
      )}
    </div>
  );
}
