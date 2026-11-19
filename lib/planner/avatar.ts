import type { Values } from "./types.ts";
export const AVATAR_SLOTS = [
  { id: "head", label: "兜" },
  { id: "face", label: "頭" },
  { id: "body", label: "体" },
  { id: "feet", label: "脚" },
  { id: "effect", label: "エフェクト" },
] as const;
export type Avatar = {
  slot: (typeof AVATAR_SLOTS)[number]["id"];
  name: string;
  equipped: boolean;
  setEligible: boolean;
  actual: Values;
};
export const AVATAR_SOURCE =
  "https://talewiki.com/?Item/Random/%B6%C0%B2%D6%BF%E5%B7%EE";
export function defaultAvatars(): Avatar[] {
  return AVATAR_SLOTS.map((slot) => ({
    slot: slot.id,
    name: "",
    equipped: false,
    setEligible: true,
    actual: { S: 1, H: 1, I: 1, M: 1 },
  }));
}
export function avatarSetActive(avatars: Avatar[] = []): boolean {
  return AVATAR_SLOTS.every((slot) =>
    avatars.some((a) => a.slot === slot.id && a.equipped && a.setEligible),
  );
}
export function avatarValues(avatars: Avatar[] = []): Values {
  const result: Values = { S: 0, H: 0, I: 0, M: 0 };
  const bonus = avatarSetActive(avatars) ? 10 : 0;
  for (const stat of ["S", "H", "I", "M"] as const) {
    result[stat] =
      avatars
        .filter((a) => a.equipped)
        .reduce((sum, a) => sum + a.actual[stat], 0) + bonus;
  }
  return result;
}
