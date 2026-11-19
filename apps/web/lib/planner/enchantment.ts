import { outsideValue } from "./abilities.ts";
import { isCapKnown } from "./caps.ts";
import type { Gear, Stat, Values } from "./types.ts";
const stats: Stat[] = ["S", "H", "I", "M"];
const zero = (): Values => ({ S: 0, H: 0, I: 0, M: 0 });
export function enchantSlots(gear: Gear, initialMix: number): number {
  return (
    gear.enchantEntryCount ??
    Math.max(0, gear.mix - initialMix + gear.increments)
  );
}
export function selectedGain(gear: Gear, stat: Stat): number {
  return (gear.appliedEnchants ?? [])
    .filter((e) => e.stat === stat)
    .reduce((sum, e) => sum + e.gain, 0);
}
export function baseValues(gear: Gear): Values {
  return (
    gear.base ??
    (Object.fromEntries(
      stats.map((stat) => [
        stat,
        gear.actual[stat] - gear.enchant[stat] - outsideValue(gear, stat),
      ]),
    ) as Values)
  );
}
function normalized(gear: Gear): Gear {
  return {
    ...gear,
    base: { ...baseValues(gear) },
    extra: { ...(gear.extra ?? zero()) },
    unlistedEnchant:
      gear.unlistedEnchant ??
      (Object.fromEntries(
        stats.map((stat) => [
          stat,
          Math.max(0, gear.enchant[stat] - selectedGain(gear, stat)),
        ]),
      ) as Values),
  };
}
function rebuild(gear: Gear): Gear {
  const next = { ...gear, enchant: zero(), actual: zero() };
  for (const stat of stats) {
    const base = gear.base![stat],
      raw = selectedGain(gear, stat) + gear.unlistedEnchant![stat];
    const applied = isCapKnown(gear, stat)
      ? Math.min(raw, Math.max(0, gear.caps[stat] - base))
      : raw;
    next.enchant[stat] = applied;
    next.actual[stat] = base + applied + outsideValue(gear, stat);
  }
  return next;
}
export function withEnchants(
  gear: Gear,
  entries: NonNullable<Gear["appliedEnchants"]>,
): Gear {
  return rebuild({ ...normalized(gear), appliedEnchants: entries });
}
export function withBase(gear: Gear, stat: Stat, value: number): Gear {
  const next = normalized(gear);
  return rebuild({ ...next, base: { ...next.base!, [stat]: value } });
}
export function withExtra(gear: Gear, stat: Stat, value: number): Gear {
  const next = normalized(gear);
  return rebuild({ ...next, extra: { ...next.extra!, [stat]: value } });
}
export function withCap(gear: Gear, stat: Stat, value: number): Gear {
  const knownCaps = {
    ...Object.fromEntries(stats.map((s) => [s, isCapKnown(gear, s)])),
    [stat]: true,
  } as Record<Stat, boolean>;
  return rebuild({
    ...normalized(gear),
    caps: { ...gear.caps, [stat]: value },
    knownCaps,
    verifiedCaps: stats.every((s) => knownCaps[s]),
  });
}
export function withEntryCount(gear: Gear, count: number): Gear {
  return withEnchants(
    { ...gear, enchantEntryCount: count },
    (gear.appliedEnchants ?? []).slice(0, count),
  );
}
export function withMix(
  gear: Gear,
  changes: Partial<Gear>,
  initialMix: number,
): Gear {
  const next = { ...normalized(gear), ...changes };
  return withEnchants(
    next,
    (gear.appliedEnchants ?? []).slice(0, enchantSlots(next, initialMix)),
  );
}

export function withAbility(gear: Gear, ability: Gear["ability"]): Gear {
  return rebuild({ ...normalized(gear), ability });
}
