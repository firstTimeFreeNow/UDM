import type { Gear, Stat } from "./types.ts";
export function isCapKnown(gear: Gear, stat: Stat): boolean {
  return gear.knownCaps?.[stat] ?? gear.verifiedCaps;
}
export function hasRelevantCaps(gear: Gear, stats: Stat[]): boolean {
  return stats.every((stat) => isCapKnown(gear, stat));
}
