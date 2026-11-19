import raw from "./abilities.json" with { type: "json" };
import type { Gear, Stat, Values } from "./types.ts";
export type AbilitySelection = NonNullable<Gear["ability"]>;
export type AbilityDefinition = {
  id: string;
  slot: string;
  name: string;
  level: number;
  fixed: Values;
  effect: string;
  rollCount: number;
  options: { stat: Stat; min: number; max: number }[];
  source: string;
};
export const ABILITIES = raw as AbilityDefinition[];
export function availableAbilities(
  slot: string,
  level: number,
  stats: Stat[],
): AbilityDefinition[] {
  return ABILITIES.filter(
    (a) =>
      a.slot === slot &&
      a.level <= level &&
      stats.some(
        (stat) =>
          a.fixed[stat] > 0 || a.options.some((option) => option.stat === stat),
      ),
  );
}
const lookup = new Map(ABILITIES.map((a) => [a.id, a]));
export function abilityDefinition(
  selection: Gear["ability"],
): AbilityDefinition | undefined {
  return selection ? lookup.get(selection.id) : undefined;
}
export function abilityValues(selection: Gear["ability"]): Values {
  const result: Values = { S: 0, H: 0, I: 0, M: 0 },
    definition = abilityDefinition(selection);
  if (!definition || !selection) return result;
  Object.assign(result, definition.fixed);
  for (const roll of selection.rolls.slice(0, 1))
    if (roll.stat !== "none") result[roll.stat] += roll.value;
  return result;
}
export function outsideValue(gear: Gear, stat: Stat): number {
  return (gear.extra?.[stat] ?? 0) + abilityValues(gear.ability)[stat];
}
export function validAbility(gear: Gear): boolean {
  if (gear.ability === undefined) return true;
  const d = abilityDefinition(gear.ability);
  if (
    !d ||
    d.slot !== gear.slot ||
    !Array.isArray(gear.ability.rolls) ||
    gear.ability.rolls.length > 1
  )
    return false;
  const seen = new Set<string>();
  return gear.ability.rolls.every((roll) => {
    if (!roll || !Number.isInteger(roll.value)) return false;
    if (roll.stat === "none") return roll.value === 0;
    const option = d.options.find((o) => o.stat === roll.stat);
    if (
      !option ||
      seen.has(roll.stat) ||
      roll.value < option.min ||
      roll.value > option.max
    )
      return false;
    seen.add(roll.stat);
    return true;
  });
}
