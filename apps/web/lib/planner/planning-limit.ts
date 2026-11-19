import type { Gear, Stat } from "./types.ts";
export function configuredPlanningCap(gear: Gear): number | null {
  if (gear.slot !== "effect") return null;
  return gear.planningCap === undefined ? 255 : gear.planningCap;
}
export function planningLimit(gear: Gear, stat: Stat): number {
  const configured = configuredPlanningCap(gear);
  return configured === null
    ? gear.caps[stat]
    : Math.min(gear.caps[stat], configured);
}
