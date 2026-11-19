import { validSchedule } from "./schedule.ts";
import { validSpecialAbilities } from "./special-abilities.ts";
import { validAbility } from "./abilities.ts";
import { EQUIPMENT, STATS } from "./data.ts";
import { withEnchants } from "./enchantment.ts";
import { AVATAR_SLOTS, defaultAvatars } from "./avatar.ts";
import type { PlannerInput } from "./types";
export const STORAGE_KEY = "udm.equipment-planner.v1";
const number = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e14;
const values = (v: unknown) =>
  !!v &&
  typeof v === "object" &&
  ["S", "H", "I", "M"].every((k) => number((v as Record<string, unknown>)[k]));
const money = (m: unknown) =>
  !!m &&
  typeof m === "object" &&
  ["initial", "cap", "income", "budget", "windfall"].every((k) =>
    number((m as Record<string, unknown>)[k]),
  );
export function parseSaved(text: string): PlannerInput | null {
  try {
    const v = JSON.parse(text) as PlannerInput;
    if (
      !v ||
      v.schemaVersion !== 1 ||
      typeof v.character !== "string" ||
      typeof v.contentId !== "string" ||
      !number(v.style) ||
      !money(v.seed) ||
      !money(v.elso) ||
      typeof v.discount !== "boolean" ||
      typeof v.coreEnabled !== "boolean"
    )
      return null;
    if (v.schedule !== undefined && !validSchedule(v.schedule)) return null;
    if (Array.isArray(v.gear)) {
      for (const g of v.gear) {
        const rolls = g?.ability?.rolls;
        if (
          Array.isArray(rolls) &&
          rolls.length === 2 &&
          rolls.some((r) => r?.stat === "none" && r.value === 0)
        ) {
          g.ability!.rolls = rolls
            .filter((r) => !(r?.stat === "none" && r.value === 0))
            .slice(0, 1);
        }
      }
    }
    if (
      !Array.isArray(v.gear) ||
      v.gear.length !== 10 ||
      !v.gear.every(
        (g) =>
          g &&
          typeof g.slot === "string" &&
          typeof g.equipmentId === "string" &&
          typeof g.name === "string" &&
          (g.initialMix === undefined ||
            (Number.isInteger(g.initialMix) &&
              g.initialMix >= 1 &&
              g.initialMix <= 4)) &&
          (g.appliedEnchants === undefined ||
            (Array.isArray(g.appliedEnchants) &&
              g.appliedEnchants.length <= 1004 &&
              g.appliedEnchants.every(
                (e) =>
                  e && ["S", "H", "I", "M"].includes(e.stat) && number(e.gain),
              ))) &&
          (g.base === undefined || values(g.base)) &&
          (g.extra === undefined || values(g.extra)) &&
          (g.unlistedEnchant === undefined || values(g.unlistedEnchant)) &&
          (g.enchantEntryCount === undefined ||
            (Number.isInteger(g.enchantEntryCount) &&
              g.enchantEntryCount >= 0 &&
              g.enchantEntryCount <= 1004)) &&
          (g.knownCaps === undefined ||
            (g.knownCaps &&
              typeof g.knownCaps === "object" &&
              STATS.every((s) => typeof g.knownCaps![s] === "boolean"))) &&
          validAbility(g) &&
          (g.replacementPlanned === undefined ||
            typeof g.replacementPlanned === "boolean") &&
          (g.planningCap === undefined ||
            g.planningCap === null ||
            number(g.planningCap)) &&
          values(g.actual) &&
          values(g.enchant) &&
          values(g.caps) &&
          number(g.mix) &&
          g.mix >= 1 &&
          g.mix <= 4 &&
          Number.isInteger(g.mix) &&
          number(g.increments) &&
          Number.isInteger(g.increments) &&
          ["bianu", "eta"].includes(g.method) &&
          ["bianuFee", "etaFee"].every((k) => number(g[k as keyof typeof g])) &&
          ["included", "upgradable", "eta", "verifiedCaps"].every(
            (k) => typeof g[k as keyof typeof g] === "boolean",
          ),
      )
    )
      return null;
    if (
      !Array.isArray(v.scrolls) ||
      v.scrolls.length !== 20 ||
      !v.scrolls.every(
        (s) =>
          s &&
          typeof s.id === "string" &&
          ["S", "H", "I", "M"].includes(s.stat) &&
          number(s.price) &&
          number(s.stock) &&
          number(s.gain) &&
          s.gain > 0 &&
          number(s.rate) &&
          s.rate > 0 &&
          s.rate <= 1 &&
          ["seed", "elso"].includes(s.currency) &&
          typeof s.enabled === "boolean" &&
          typeof s.disposable === "boolean",
      )
    )
      return null;
    if (
      !Array.isArray(v.special) ||
      v.special.length !== 3 ||
      !v.special.every(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          ["神鳥", "ルナリア", "カフス"].includes(s.kind) &&
          number(s.level) &&
          values(s.actual) &&
          values(s.target) &&
          validSpecialAbilities(s) &&
          typeof s.grow === "boolean",
      )
    )
      return null;
    if (
      !Array.isArray(v.cores) ||
      v.cores.length !== 6 ||
      !v.cores.every(
        (c) =>
          c &&
          Number.isInteger(c.evolution) &&
          c.evolution >= 0 &&
          c.evolution <= 4 &&
          Number.isInteger(c.enhancement) &&
          c.enhancement >= 0 &&
          c.enhancement <= 4 &&
          ["S", "H", "I", "M", "other"].includes(c.stat) &&
          number(c.coupon) &&
          typeof c.enabled === "boolean",
      )
    )
      return null;
    if (
      !Array.isArray(v.windfalls) ||
      v.windfalls.length > 100 ||
      !v.windfalls.every(
        (w) =>
          w &&
          typeof w.id === "string" &&
          number(w.week) &&
          Number.isInteger(w.week) &&
          number(w.seed) &&
          number(w.elso),
      )
    )
      return null;
    if (!number(v.corePowder) || !number(v.coreCrystal) || !number(v.etaStock))
      return null;
    if (v.title === undefined)
      v.title = { id: "", name: "未装着", actual: { S: 0, H: 0, I: 0, M: 0 } };
    if (
      !v.title ||
      typeof v.title.id !== "string" ||
      typeof v.title.name !== "string" ||
      !v.title.actual ||
      !["S", "H", "I", "M"].every((k) => {
        const n = v.title.actual[k as keyof typeof v.title.actual];
        return (
          typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e14
        );
      })
    )
      return null;
    if (v.avatars === undefined) v.avatars = defaultAvatars();
    if (
      !Array.isArray(v.avatars) ||
      v.avatars.length !== AVATAR_SLOTS.length ||
      !AVATAR_SLOTS.every(
        (slot) => v.avatars.filter((a) => a && a.slot === slot.id).length === 1,
      ) ||
      !v.avatars.every(
        (a) =>
          a &&
          typeof a.name === "string" &&
          typeof a.equipped === "boolean" &&
          typeof a.setEligible === "boolean" &&
          values(a.actual),
      )
    )
      return null;
    v.gear = v.gear.map((g) => {
      const master = EQUIPMENT.find((e) => e.id === g.equipmentId);
      if (g.knownCaps === undefined && master) {
        const knownCaps = Object.fromEntries(
          STATS.map((s) => [s, master.caps[s] !== null || g.caps[s] > 0]),
        ) as NonNullable<typeof g.knownCaps>;
        return {
          ...g,
          knownCaps,
          verifiedCaps: STATS.every((s) => knownCaps[s]),
        };
      }
      return g;
    });
    v.gear = v.gear.map((g) =>
      g.base || g.appliedEnchants?.length || g.ability
        ? withEnchants(g, g.appliedEnchants ?? [])
        : g,
    );
    return v;
  } catch {
    return null;
  }
}
