import type { Content } from "./types.ts";
const SERIES = [
  "インファーナル",
  "アクィルス",
  "アビス",
  "エクリプス",
  "セイクリッド",
  "改・セイクリッド",
] as const;
export function equipmentTier(name: string): number | null {
  // Match the revised series before the shared Sacred name.
  for (let i = SERIES.length - 1; i >= 0; i--)
    if (name.includes(SERIES[i])) return i - 2;
  return null;
}
export function isNextEquipmentTier(
  current: string,
  candidate: string,
): boolean {
  const from = equipmentTier(current),
    to = equipmentTier(candidate);
  return from !== null && to !== null && to === from + 1;
}

const RUBICONA_HARD_AND_LATER = new Set([
  "追従する喜び（ハード）",
  "見つめる悲しみ（ハード）",
]);
export function isAvailableForContent(
  name: string,
  content: Pick<Content, "name">,
): boolean {
  const tier = equipmentTier(name);
  return (
    tier !== null && (tier < 2 || RUBICONA_HARD_AND_LATER.has(content.name))
  );
}
