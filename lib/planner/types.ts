import type { Avatar } from "./avatar.ts";
export type Stat = "S" | "H" | "I" | "M";
export type Values = Record<Stat, number>;
export type Slot =
  | "weapon"
  | "armor"
  | "head"
  | "face"
  | "body"
  | "sub"
  | "hand"
  | "feet"
  | "effect"
  | "artifact";
export type Equipment = {
  id: string;
  name: string;
  slot: Slot;
  level: number;
  characters: string[];
  base: Record<Stat, number | null>;
  caps: Record<Stat, number | null>;
  mix: number;
  bianuFee: number | null;
  etaFee: number | null;
  eta: boolean;
  upgradable: boolean;
  source: string;
};
export type Gear = {
  slot: Slot;
  equipmentId: string;
  name: string;
  actual: Values;
  enchant: Values;
  base?: Values;
  extra?: Values;
  ability?: { id: string; rolls: { stat: Stat | "none"; value: number }[] };
  planningCap?: number | null;
  replacementPlanned?: boolean;
  unlistedEnchant?: Values;
  enchantEntryCount?: number;
  appliedEnchants?: { stat: Stat; gain: number }[];
  initialMix?: number;
  caps: Values;
  mix: number;
  increments: number;
  method: "bianu" | "eta";
  bianuFee: number;
  etaFee: number;
  eta: boolean;
  upgradable: boolean;
  included: boolean;
  verifiedCaps: boolean;
  knownCaps?: Record<Stat, boolean>;
};
export type Special = {
  abilities?: ({ id: string; value: number } | null)[];
  id: string;
  name: string;
  kind: "神鳥" | "ルナリア" | "カフス";
  level: number;
  actual: Values;
  grow: boolean;
  target: Values;
};
export type Scroll = {
  id: string;
  stat: Stat;
  gain: number;
  currency: "seed" | "elso";
  price: number;
  rate: number;
  disposable: boolean;
  enabled: boolean;
  stock: number;
};
export type MoneyInput = {
  initial: number;
  cap: number;
  income: number;
  budget: number;
  windfall: number;
};
export type Windfall = { id: string; week: number; seed: number; elso: number };
export type Core = {
  evolution: number;
  enhancement: number;
  stat: Stat | "other";
  coupon: number;
  enabled: boolean;
};
export type ScheduleSettings = {
  order: string[];
  startDates: Record<string, string>;
};
export type PlannerInput = {
  schedule?: ScheduleSettings;
  schemaVersion: 1;
  contentId: string;
  character: string;
  style: number;
  gear: Gear[];
  avatars: Avatar[];
  title: { id: string; name: string; actual: Values };
  special: Special[];
  scrolls: Scroll[];
  discount: boolean;
  seed: MoneyInput;
  elso: MoneyInput;
  windfalls: Windfall[];
  coreEnabled: boolean;
  cores: Core[];
  corePowder: number;
  coreCrystal: number;
  etaStock: number;
};
export type Content = {
  id: string;
  name: string;
  single: number;
  mr: number;
  combined: number;
  coreRegion: string | null;
  core: number;
  cuffs: number;
};
export type Character = {
  name: string;
  styles: { label: string; stats: Stat[] }[];
};
export type Operation = {
  notBeforeWeek?: number;
  kind: "increment" | "enchant" | "core";
  label: string;
  slot: string;
  gain: number;
  stat?: Stat;
  rate: number;
  fee: number;
  minimum?: number;
  product?: { id: string; seed: number; elso: number; disposable: boolean };
  from: string;
  to: string;
  powder?: number;
  crystal?: number;
  coupon?: string;
};
export type Plan = {
  id: string;
  labels: string[];
  operations: Operation[];
  gain: number;
  coreGain: number;
  score: number;
  growth: { name: string; stat: Stat; from: number; to: number }[];
};
export type BudgetRow = {
  week: number;
  seed: number;
  elso: number;
  usedSeed: number;
  usedElso: number;
  completed: number;
};
export type SlotCost = {
  slot: string;
  incrementSeed: number;
  incrementElso: number;
  scrollSeed: number;
  scrollElso: number;
  coreSeed: number;
  coreElso: number;
};
export type Summary = {
  breakdown: SlotCost[];
  milestones: { slot: string; week: number | null }[];
  schedule: (Operation & {
    index: number;
    week: number | null;
    expectedSeed: number;
    expectedElso: number;
    expectedTrials: number;
    waitWeeks: number | null;
  })[];
  seed: number;
  elso: number;
  seed90: number;
  elso90: number;
  seed95: number;
  elso95: number;
  week: number | null;
  week90: number | null;
  week95: number | null;
  finishRate: number;
  rows: BudgetRow[];
  materials: { powder: number; crystal: number };
  stocks: Record<string, number>;
  sampled: boolean;
};
export type PlanResult = {
  status: "ready" | "achieved" | "blocked" | "incomplete";
  current: number;
  target: number;
  missing: number;
  coreCurrent: number;
  coreTarget: number;
  coreState: "none" | "unknown" | "met" | "short";
  cuffsMet: boolean;
  warnings: string[];
  plans: (Plan & { summary: Summary })[];
  replacements: string[];
  limited: boolean;
};
