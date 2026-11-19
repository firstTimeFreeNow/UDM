import {
  isNextEquipmentTier,
  isAvailableForContent,
} from "./equipment-tier.ts";
import { specialValues } from "./special-abilities.ts";
import { avatarValues } from "./avatar.ts";
import { calculate } from "./engine.ts";
import { selectEquipment } from "./data.ts";
import type {
  Content,
  Equipment,
  Gear,
  PlannerInput,
  PlanResult,
  Stat,
} from "./types.ts";
export type ReplacementProposal = {
  id: string;
  input: PlannerInput;
  result: PlanResult;
  changes: { slot: string; from: string; to: string }[];
};
const sum = (values: Record<Stat, number | null>, stats: Stat[]) =>
  stats.reduce((n, s) => n + (values[s] ?? 0), 0);
export function replacementInputs(
  input: PlannerInput,
  content: Content,
  stats: Stat[],
  equipment: Equipment[],
): PlannerInput[] {
  const total =
    input.gear
      .filter((g) => g.included)
      .reduce((n, g) => n + sum(g.actual, stats), 0) +
    sum(input.title.actual, stats) +
    sum(avatarValues(input.avatars), stats) +
    input.special.reduce(
      (n, special) => n + sum(specialValues(special), stats),
      0,
    );
  const target =
    stats.length > 1
      ? content.combined
      : stats[0] === "M"
        ? content.mr
        : content.single;
  const missing = Math.max(0, target - total);
  const groups = input.gear
    .flatMap((gear, index) => {
      if (!gear.included) return [];
      const original = equipment.find((e) => e.id === gear.equipmentId) ?? gear;
      const current = sum(gear.actual, stats),
        currentCap = sum(gear.caps, stats);
      const choices = equipment.filter(
        (e) =>
          e.slot === gear.slot &&
          e.id !== gear.equipmentId &&
          isNextEquipmentTier(original.name, e.name) &&
          isAvailableForContent(e.name, content) &&
          (!("source" in original) ||
            !original.source ||
            e.source === original.source) &&
          (!e.characters.length || e.characters.includes(input.character)) &&
          stats.every((s) => e.base[s] !== null && e.caps[s] !== null) &&
          (sum(e.base, stats) > current || sum(e.caps, stats) > currentCap),
      );
      if (!choices.length) return [];
      const byBase = [...choices].sort(
        (a, b) => sum(b.base, stats) - sum(a.base, stats),
      );
      const byCap = [...choices].sort(
        (a, b) =>
          sum(b.caps, stats) - sum(a.caps, stats) ||
          sum(b.base, stats) - sum(a.base, stats),
      );
      const enough = choices
        .filter((e) => sum(e.base, stats) - current >= missing)
        .sort((a, b) => sum(a.base, stats) - sum(b.base, stats))[0];
      const best = enough ?? byBase[0];
      const options = [
        ...new Map([best, byBase[0], byCap[0]].map((e) => [e.id, e])).values(),
      ];
      return [{ index, gear, options, gain: sum(best.base, stats) - current }];
    })
    .sort((a, b) => b.gain - a.gain);
  const all: PlannerInput[] = [],
    seen = new Set<string>();
  const add = (changes: { index: number; equipment: Equipment }[]) => {
    if (!changes.length) return;
    const gear = [...input.gear];
    for (const change of changes)
      gear[change.index] = {
        ...selectEquipment(gear[change.index].slot, change.equipment),
        planningCap: gear[change.index].planningCap,
      };
    const key = gear.map((g) => g.equipmentId).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    all.push({ ...structuredClone(input), gear: structuredClone(gear) });
  };
  // Keep combinations that can make progress across several slots, too.
  add(groups.map((g) => ({ index: g.index, equipment: g.options[0] })));
  add(
    groups.map((g) => ({
      index: g.index,
      equipment: [...g.options].sort(
        (a, b) => sum(b.caps, stats) - sum(a.caps, stats),
      )[0],
    })),
  );
  let gain = 0;
  const prefix: { index: number; equipment: Equipment }[] = [];
  for (const group of groups) {
    prefix.push({ index: group.index, equipment: group.options[0] });
    gain += group.gain;
    if (gain >= missing) {
      add(prefix);
      break;
    }
  }
  for (const group of groups)
    for (const equipment of group.options)
      add([{ index: group.index, equipment }]);
  for (let count = 2; count < groups.length; count++)
    add(
      groups
        .slice(0, count)
        .map((g) => ({ index: g.index, equipment: g.options[0] })),
    );
  return all.slice(0, 12);
}
export function proposalChanges(
  before: Gear[],
  after: Gear[],
): ReplacementProposal["changes"] {
  return after.flatMap((gear, index) =>
    gear.equipmentId !== before[index].equipmentId
      ? [{ slot: gear.slot, from: before[index].name, to: gear.name }]
      : [],
  );
}
export function rankReplacements(
  proposals: ReplacementProposal[],
): ReplacementProposal[] {
  const cost = (p: ReplacementProposal) =>
    p.result.status === "achieved"
      ? 0
      : Math.min(...p.result.plans.map((plan) => plan.summary.seed));
  const good = proposals.filter(
    (p) => p.result.status === "achieved" || p.result.plans.length > 0,
  );
  const ranked = good.sort(
    (a, b) =>
      a.changes.length - b.changes.length ||
      cost(a) - cost(b) ||
      a.result.current - b.result.current,
  );
  const chosen: ReplacementProposal[] = [];
  for (const p of [
    ranked[0],
    [...good].sort(
      (a, b) => cost(a) - cost(b) || a.changes.length - b.changes.length,
    )[0],
    ...ranked,
  ]) {
    if (p && !chosen.some((c) => c.id === p.id)) chosen.push(p);
    if (chosen.length === 4) break;
  }
  return chosen;
}
export function calculateReplacements(
  input: PlannerInput,
  content: Content,
  stats: Stat[],
  equipment: Equipment[],
  onProgress?: (done: number, total: number) => void,
) {
  const baseline = calculate(input, content, stats, equipment);
  const inputs = replacementInputs(input, content, stats, equipment),
    proposals: ReplacementProposal[] = [];
  inputs.forEach((next, index) => {
    const result = calculate(next, content, stats, equipment);
    proposals.push({
      id: next.gear.map((g) => g.equipmentId).join("|"),
      input: next,
      result,
      changes: proposalChanges(input.gear, next.gear),
    });
    onProgress?.(index + 1, inputs.length);
  });
  return { baseline, proposals: rankReplacements(proposals) };
}
