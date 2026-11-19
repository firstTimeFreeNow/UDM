import raw from "./special-abilities.json" with { type: "json" };
import type { Special, Stat, Values } from "./types.ts";
export type SpecialAbilityDefinition = {
  id: string;
  slot: string;
  name: string;
  effect: string;
  stat: Stat | null;
  min: number;
  max: number;
  step: number;
  source: string;
};
export const SPECIAL_ABILITIES = raw as SpecialAbilityDefinition[];
export function specialAbilityOptions(item: Special, stats: Stat[]) {
  if (item.kind !== "カフス" && item.kind !== "ルナリア") return [];
  return SPECIAL_ABILITIES.filter(
    (a) => a.slot === item.id && (!a.stat || stats.includes(a.stat)),
  );
}
export function specialAbilityValues(item: Special): Values {
  const values: Values = { S: 0, H: 0, I: 0, M: 0 };
  if (item.kind !== "カフス" && item.kind !== "ルナリア") return values;
  for (const entry of item.abilities ?? []) {
    if (!entry) continue;
    const d = SPECIAL_ABILITIES.find(
      (a) => a.id === entry?.id && a.slot === item.id,
    );
    if (d?.stat) values[d.stat] += entry.value;
  }
  return values;
}
export function specialValues(item: Special): Values {
  const ability = specialAbilityValues(item);
  return Object.fromEntries(
    (["S", "H", "I", "M"] as Stat[]).map((s) => [
      s,
      item.actual[s] + ability[s],
    ]),
  ) as Values;
}
export function validSpecialAbilities(item: Special) {
  if (item.abilities === undefined) return true;
  if (
    !Array.isArray(item.abilities) ||
    item.abilities.length > (item.id === "cuffs" ? 2 : 1)
  )
    return false;
  return item.abilities.every((entry) => {
    if (entry === null) return true;
    const d = SPECIAL_ABILITIES.find(
      (a) => a.id === entry?.id && a.slot === item.id,
    );
    return (
      !!d &&
      Number.isInteger(entry.value) &&
      entry.value >= d.min &&
      entry.value <= d.max &&
      (entry.value - d.min) % d.step === 0
    );
  });
}
