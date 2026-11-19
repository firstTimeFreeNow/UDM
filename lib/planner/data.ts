import { defaultAvatars } from "./avatar.ts";
import rawEquipment from "./equipment.json" with { type: "json" };
import rawTitles from "./titles.json" with { type: "json" };
import rawCatalog from "./catalog.json" with { type: "json" };
import type {
  Character,
  Content,
  Equipment,
  Gear,
  PlannerInput,
  Scroll,
  Slot,
  Stat,
  Values,
} from "./types";
export const TITLES = rawTitles;
export const EQUIPMENT = rawEquipment as Equipment[];
export const CONTENTS = rawCatalog.contents as Content[];
export const CHARACTERS = rawCatalog.characters as Character[];
export const STATS: Stat[] = ["S", "H", "I", "M"];
export const STAT_LABELS: Record<Stat, string> = {
  S: "STAB",
  H: "HACK",
  I: "INT",
  M: "MR",
};
export const SLOTS: { id: Slot; label: string }[] = [
  { id: "weapon", label: "武器" },
  { id: "armor", label: "鎧" },
  { id: "head", label: "兜" },
  { id: "face", label: "頭" },
  { id: "body", label: "体" },
  { id: "sub", label: "腕" },
  { id: "hand", label: "手" },
  { id: "feet", label: "脚" },
  { id: "effect", label: "エフェクト" },
  { id: "artifact", label: "AF" },
];
export const ZERO = (): Values => ({ S: 0, H: 0, I: 0, M: 0 });
export function emptyGear(slot: Slot): Gear {
  return {
    slot,
    equipmentId: "",
    name: "",
    actual: ZERO(),
    enchant: ZERO(),
    caps: ZERO(),
    mix: 2,
    increments: 0,
    method: "bianu",
    bianuFee: 0,
    etaFee: 0,
    eta: false,
    upgradable: false,
    included: false,
    verifiedCaps: false,
  };
}
export function selectEquipment(slot: Slot, equipment: Equipment): Gear {
  return {
    ...emptyGear(slot),
    equipmentId: equipment.id,
    name: equipment.name,
    actual: Object.fromEntries(
      STATS.map((s) => [s, equipment.base[s] ?? 0]),
    ) as Values,
    caps: Object.fromEntries(
      STATS.map((s) => [s, equipment.caps[s] ?? 0]),
    ) as Values,
    mix: equipment.mix,
    bianuFee: equipment.bianuFee ?? 0,
    etaFee: equipment.etaFee ?? 0,
    eta: equipment.eta,
    upgradable: equipment.upgradable,
    included: true,
    verifiedCaps: STATS.every((s) => equipment.caps[s] !== null),
    knownCaps: Object.fromEntries(
      STATS.map((s) => [s, equipment.caps[s] !== null]),
    ) as Record<Stat, boolean>,
  };
}
export function defaultScrolls(): Scroll[] {
  const prices: Record<Stat, number[]> = {
    S: [30, 60, 200],
    H: [60, 80, 300],
    I: [60, 80, 300],
    M: [80, 200, 350],
  };
  return STATS.flatMap((stat) => [
    ...[14, 17, 20].map((gain, i) => ({
      id: `${stat}-${gain}`,
      stat,
      gain,
      currency: "seed" as const,
      price: prices[stat][i] * 1e8,
      rate: 0.1,
      disposable: false,
      enabled: true,
      stock: 0,
    })),
    ...[12, 14].map((gain) => ({
      id: `${stat}-elso-${gain}`,
      stat,
      gain,
      currency: "elso" as const,
      price: gain === 12 ? 300 : 37500,
      rate: 0.02,
      disposable: true,
      enabled: gain === 12,
      stock: 0,
    })),
  ]);
}
export function defaultInput(): PlannerInput {
  const money = () => ({
    initial: 0,
    cap: 0,
    income: 0,
    budget: 0,
    windfall: 0,
  });
  return {
    schemaVersion: 1,
    contentId: "content-10",
    character: "ルシアン",
    style: 0,
    gear: SLOTS.map((x) => emptyGear(x.id)),
    title: { id: "", name: "未装着", actual: ZERO() },
    avatars: defaultAvatars(),
    special: [
      {
        id: "pendant",
        name: "ペンダント",
        kind: "神鳥",
        level: 1,
        actual: ZERO(),
        grow: false,
        target: ZERO(),
      },
      {
        id: "bracelet",
        name: "ブレスレット",
        kind: "神鳥",
        level: 1,
        actual: ZERO(),
        grow: false,
        target: ZERO(),
      },
      {
        id: "cuffs",
        name: "カフス",
        kind: "カフス",
        level: 140,
        actual: ZERO(),
        grow: false,
        target: ZERO(),
      },
    ],
    scrolls: defaultScrolls(),
    discount: true,
    seed: money(),
    elso: money(),
    windfalls: [],
    coreEnabled: false,
    cores: Array.from({ length: 6 }, () => ({
      evolution: 0,
      enhancement: 0,
      stat: "S" as const,
      coupon: 0,
      enabled: false,
    })),
    corePowder: 0,
    coreCrystal: 0,
    etaStock: 0,
  };
}
export function sampleInput(): PlannerInput {
  const input = defaultInput();
  const weapon = EQUIPMENT.find((x) => x.name === "アビスレイピア")!;
  input.gear[0] = {
    ...selectEquipment("weapon", weapon),
    actual: { S: 358, H: 120, I: 54, M: 36 },
    enchant: { S: 28, H: 0, I: 0, M: 0 },
    mix: 4,
  };
  // The remainder is an aggregate entered in a manual row; it is excluded from upgrades.
  input.gear[1] = {
    ...emptyGear("armor"),
    equipmentId: "manual",
    name: "他部位の合計（計算例）",
    included: true,
    actual: { S: 1828, H: 0, I: 0, M: 0 },
    caps: { S: 1828, H: 0, I: 0, M: 0 },
    verifiedCaps: true,
  };
  input.seed = {
    initial: 0,
    cap: 25e8,
    income: 25e8,
    budget: 25e8,
    windfall: 0,
  };
  return input;
}
