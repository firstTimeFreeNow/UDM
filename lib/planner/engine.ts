import { arrangeOperations } from "./schedule.ts";
import { specialAbilityValues } from "./special-abilities.ts";
import { outsideValue } from "./abilities.ts";
import { planningLimit, configuredPlanningCap } from "./planning-limit.ts";
import { isCapKnown, hasRelevantCaps } from "./caps.ts";
import {
  isNextEquipmentTier,
  isAvailableForContent,
} from "./equipment-tier.ts";
import { avatarValues } from "./avatar.ts";
import type {
  Content,
  Equipment,
  Gear,
  MoneyInput,
  Operation,
  Plan,
  PlannerInput,
  PlanResult,
  Scroll,
  Stat,
  Summary,
  SlotCost,
  BudgetRow,
} from "./types.ts";
export const MASTER_VERSION = "2026-11-10.1";
export function bianuRate(count: number): number {
  return Math.max(0.0001, 0.0007 - Math.min(count, 12) * 0.00005);
}
export function discountedFee(
  fee: number,
  discount: boolean,
  minimum = 0,
): number {
  return Math.max(minimum, Math.floor(fee * (discount ? 0.8 : 1)));
}
export function expectedAttempts(p: number): number {
  if (!(p > 0 && p <= 1)) throw new Error("成功率が範囲外です");
  return 1 / p;
}
export function geometricQuantile(p: number, q: number): number {
  return p === 1 ? 1 : Math.ceil(Math.log1p(-q) / Math.log1p(-p));
}
export function weeklyIncome(m: MoneyInput): number {
  return m.income;
}
export function availableAt(m: MoneyInput, week: number): number {
  const income = weeklyIncome(m);
  return (
    m.initial +
    week * Math.min(m.budget, income) +
    Math.max(0, week - 1) * Math.max(0, income - m.budget) +
    week * m.windfall
  );
}
export function fundingWeek(
  input: PlannerInput,
  seed: number,
  elso: number,
  from = 0,
): number | null {
  const funded = (week: number) => {
    const extra = input.windfalls.filter((w) => w.week <= week);
    return (
      availableAt(input.seed, week) + extra.reduce((v, w) => v + w.seed, 0) >=
        seed &&
      availableAt(input.elso, week) + extra.reduce((v, w) => v + w.elso, 0) >=
        elso
    );
  };
  if (funded(from)) return from;
  for (const [currency, required] of [
    ["seed", seed],
    ["elso", elso],
  ] as const) {
    const m = input[currency];
    if (
      weeklyIncome(m) + m.windfall === 0 &&
      m.initial + input.windfalls.reduce((v, w) => v + w[currency], 0) <
        required
    )
      return null;
  }
  let low = from,
    high = Math.max(1, from + 1);
  while (!funded(high)) {
    if (high === Number.MAX_SAFE_INTEGER) return null;
    high = Math.min(Number.MAX_SAFE_INTEGER, high * 2);
  }
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (funded(mid)) high = mid;
    else low = mid;
  }
  return high;
}
export function coreValue(e: number, s: number): number {
  return (
    [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [12, 14, 16, 18, 20],
      [23, 26, 29, 32, 35],
      [40, 50, 60, 70, 80],
    ][e]?.[s] ?? 0
  );
}
const CORE_FEE = [
  0, 5e6, 5.5e6, 6e6, 6.5e6, 7e6, 7.5e6, 8e6, 8.5e6, 9e6, 9.5e6, 10e6, 10.5e6,
  11e6, 11.5e6, 15e6, 15.5e6, 16e6, 16.5e6, 17e6, 17.5e6, 18e6, 18.5e6, 19e6,
  19.5e6,
];
const CORE_POWDER = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 200, 210, 220,
  230, 240, 250, 260, 270, 290, 290,
];
const CORE_RATE = [
  0, 1, 0.7, 0.5, 0.2, 0.1, 0.07, 0.07, 0.07, 0.07, 0.05, 0.05, 0.05, 0.05,
  0.05, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01,
];
const VISIBLE_SLOTS: Record<string, string> = {
  weapon: "武器",
  armor: "鎧",
  head: "兜",
  face: "頭",
  body: "体",
  sub: "腕",
  hand: "手",
  feet: "脚",
  effect: "エフェクト",
  artifact: "AF",
};
export function stockFor(input: PlannerInput): Record<string, number> {
  return Object.fromEntries([
    ...input.scrolls.map((s) => [s.id, s.stock] as const),
    ["eta", input.etaStock],
    ...input.cores.map((c, i) => [`core-${i}-${c.evolution}`, c.coupon]),
  ]);
}
function trialFee(op: Operation, input: PlannerInput): number {
  return op.kind === "enchant"
    ? 0
    : discountedFee(op.fee, input.discount, op.minimum);
}
function scoreOps(ops: Operation[], input: PlannerInput, mode: number): number {
  let seed = 0,
    elso = 0;
  const stocks = stockFor(input);
  for (const op of ops) {
    let n = 1 / op.rate;
    if (op.coupon) {
      const used = Math.min(stocks[op.coupon] ?? 0, n);
      n -= used;
      stocks[op.coupon] = (stocks[op.coupon] ?? 0) - used;
    }
    seed += trialFee(op, input) * n;
    const buy = op.product;
    if (buy) {
      const count = buy.disposable ? n : 1,
        used = Math.min(stocks[buy.id] ?? 0, count);
      stocks[buy.id] = (stocks[buy.id] ?? 0) - used;
      if (buy.seed) seed += buy.seed * (count - used);
      else elso += buy.elso * (count - used);
    }
  }
  const se = Math.max(1e8, weeklyIncome(input.seed) + input.seed.windfall),
    ee = Math.max(15000, weeklyIncome(input.elso) + input.elso.windfall);
  if (
    elso > input.elso.initial &&
    weeklyIncome(input.elso) + input.elso.windfall === 0
  )
    return 1e15 + elso;
  return mode === 0
    ? seed / se + (elso / ee) * 0.15
    : mode === 1
      ? Math.max(seed / se, elso / ee)
      : (seed / se) * 1.3 + elso / ee;
}
function enchantOperation(
  g: Gear,
  s: Scroll,
  mix: number,
  rateCount: number,
): Operation {
  return {
    kind: "enchant",
    label: `${s.stat}＋${s.gain}${s.disposable ? "（使い捨て）" : ""}`,
    slot: VISIBLE_SLOTS[g.slot],
    gain: s.gain,
    stat: s.stat,
    rate: s.rate,
    fee: 0,
    product: {
      id: s.id,
      seed: s.currency === "seed" ? s.price : 0,
      elso: s.currency === "elso" ? s.price : 0,
      disposable: s.disposable,
    },
    from: `合成${mix}/4`,
    to: `合成${mix + 1}/4`,
  };
}
function incrementOperation(g: Gear, mix: number, count: number): Operation {
  return {
    kind: "increment",
    label: g.method === "eta" ? "エタを1回成功" : "ビアヌを1回成功",
    slot: VISIBLE_SLOTS[g.slot],
    gain: 0,
    rate: g.method === "eta" ? 0.01 : bianuRate(count),
    fee: g.method === "eta" ? g.etaFee : g.bianuFee,
    minimum: g.method === "bianu" ? 3e6 : 0,
    product:
      g.method === "eta"
        ? { id: "eta", seed: 2e8, elso: 30000, disposable: true }
        : undefined,
    from: `合成${mix}/4・インクリ${count}回`,
    to: `合成${mix - 1}/4・インクリ${count + 1}回`,
  };
}
type GearOption = {
  gain: number;
  ops: Operation[];
  values: Record<Stat, number>;
  mix: number;
  inc: number;
  score: number;
};
// Keep progress toward the target as well as inexpensive partial plans.
// Cost per gained point alone can discard every plan that can reach the target.
function retainProgress<T extends { gain: number; score: number }>(
  candidates: T[],
  limit: number,
  protectedStates: T[] = [],
): T[] {
  const selected = new Set<T>(protectedStates);
  const byGain = [...candidates].sort(
    (a, b) => a.gain - b.gain || b.score - a.score,
  );
  selected.add(byGain[0]);
  selected.add(byGain[byGain.length - 1]);
  const spread = Math.floor(limit / 2);
  for (let i = 0; i < spread; i++) {
    selected.add(byGain[Math.round((i * (byGain.length - 1)) / (spread - 1))]);
  }
  const byEfficiency = [...candidates].sort(
    (a, b) => a.score / (a.gain || 1) - b.score / (b.gain || 1),
  );
  for (const state of byEfficiency) {
    if (selected.size >= limit) break;
    selected.add(state);
  }
  return [...selected];
}
function gearOptions(
  g: Gear,
  stats: Stat[],
  missing: number,
  input: PlannerInput,
  mode: number,
): { options: GearOption[]; limited: boolean } {
  const empty: GearOption = {
    gain: 0,
    ops: [],
    values: { ...g.actual },
    mix: g.mix,
    inc: g.increments,
    score: 0,
  };
  if (
    !g.included ||
    !g.upgradable ||
    !hasRelevantCaps(g, stats) ||
    missing <= 0
  )
    return { options: [empty], limited: false };
  const scrolls = input.scrolls.filter(
    (s) =>
      s.enabled &&
      stats.includes(s.stat) &&
      (s.currency !== "elso" ||
        s.stock > 0 ||
        input.elso.initial +
          weeklyIncome(input.elso) +
          input.elso.windfall +
          input.windfalls.reduce((v, w) => v + w.elso, 0) >
          0),
  );
  let frontier = [empty],
    all = [empty],
    limited = false;
  const depthLimit = Math.min(256, Math.ceil(missing / 12) + 4);
  for (let depth = 0; depth < depthLimit && frontier.length; depth++) {
    const next = new Map<string, GearOption>();
    for (const state of frontier) {
      if (state.gain >= missing) continue;
      for (const s of scrolls) {
        const gain = Math.min(
          s.gain,
          planningLimit(g, s.stat) +
            outsideValue(g, s.stat) -
            state.values[s.stat],
        );
        if (gain <= 0) continue;
        // A planning target or content threshold is not the equipment's physical cap.
        const physicalRemaining =
          g.caps[s.stat] + outsideValue(g, s.stat) - state.values[s.stat];
        if (s.disposable && !g.replacementPlanned && gain < physicalRemaining)
          continue;
        let mix = state.mix,
          inc = state.inc;
        const ops = [...state.ops];
        if (mix === 4) {
          if (
            (g.method === "eta" && (!g.eta || g.etaFee <= 0)) ||
            (g.method === "bianu" && g.bianuFee <= 0)
          )
            continue;
          ops.push(incrementOperation(g, mix, inc));
          mix--;
          inc++;
        }
        ops.push({ ...enchantOperation(g, s, mix, inc), gain });
        const values = {
          ...state.values,
          [s.stat]: state.values[s.stat] + gain,
        };
        const option = {
          gain: state.gain + gain,
          ops,
          values,
          mix: mix + 1,
          inc,
          score: scoreOps(ops, input, mode),
        };
        const key = `${stats.map((s) => values[s]).join("/")}:${mix + 1}:${inc}`;
        if (!next.has(key) || next.get(key)!.score > option.score)
          next.set(key, option);
      }
    }
    let candidates = [...next.values()];
    if (candidates.length > 80) {
      limited = true;
      const extremes = stats.flatMap((stat) => [
        candidates.reduce((a, b) => (a.values[stat] < b.values[stat] ? a : b)),
        candidates.reduce((a, b) => (a.values[stat] > b.values[stat] ? a : b)),
      ]);
      candidates = retainProgress(candidates, 80, extremes);
    }
    all.push(...candidates);
    frontier = candidates;
    if (depth === depthLimit - 1 && frontier.some((x) => x.gain < missing))
      limited = true;
  }
  const byGain = new Map<number, GearOption>();
  for (const o of all) {
    const key = Math.min(o.gain, missing);
    if (!byGain.has(key) || byGain.get(key)!.score > o.score)
      byGain.set(key, o);
  }
  return { options: [...byGain.values()], limited };
}
function addCore(
  ops: Operation[],
  input: PlannerInput,
  stats: Stat[],
  target: number,
): { gain: number; complete: boolean } {
  const stages = input.cores.map((c) => c.evolution * 5 + c.enhancement);
  let value = input.cores.reduce(
      (v, c) =>
        v +
        (c.enabled && stats.includes(c.stat as Stat)
          ? coreValue(c.evolution, c.enhancement)
          : 0),
      0,
    ),
    gain = 0;
  for (let step = 0; value < target && step < 144; step++) {
    const choices = input.cores
      .flatMap((c, i) => {
        const n = stages[i] + 1;
        if (!c.enabled || !stats.includes(c.stat as Stat) || n > 24) return [];
        const delta =
          coreValue(Math.floor(n / 5), n % 5) -
          coreValue(Math.floor((n - 1) / 5), (n - 1) % 5);
        const coupon =
          input.cores[i].evolution === Math.floor(stages[i] / 5) &&
          c.coupon > 0;
        return [
          {
            i,
            n,
            delta,
            score: (coupon ? 0 : CORE_FEE[n] / CORE_RATE[n]) / delta,
          },
        ];
      })
      .sort((a, b) => a.score - b.score);
    if (!choices.length) return { gain, complete: false };
    const { i, n, delta } = choices[0];
    ops.push({
      kind: "core",
      label: `コア${i + 1}を強化`,
      slot: `コア${i + 1}`,
      gain: delta,
      stat: input.cores[i].stat as Stat,
      rate: CORE_RATE[n],
      fee: CORE_FEE[n],
      powder: CORE_POWDER[n],
      crystal: n >= 15 ? 5 : 0,
      coupon: `core-${i}-${Math.floor(stages[i] / 5)}`,
      from: `進化${Math.floor(stages[i] / 5)}・強化${stages[i] % 5}`,
      to: `進化${Math.floor(n / 5)}・強化${n % 5}`,
    });
    stages[i] = n;
    value += delta;
    gain += delta;
  }
  return { gain, complete: value >= target };
}
export function random(seed = 98417): () => number {
  let n = seed | 0;
  return () => {
    n |= 0;
    n = (n + 0x6d2b79f5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function sampleTrials(p: number, rng: () => number): number {
  return p === 1 ? 1 : Math.floor(Math.log1p(-rng()) / Math.log1p(-p)) + 1;
}
type CostMap = Record<string, SlotCost>;
const COST_FIELDS = [
  "incrementSeed",
  "incrementElso",
  "scrollSeed",
  "scrollElso",
  "coreSeed",
  "coreElso",
] as const;
function costRow(costs: CostMap, slot: string): SlotCost {
  return (costs[slot] ??= {
    slot,
    incrementSeed: 0,
    incrementElso: 0,
    scrollSeed: 0,
    scrollElso: 0,
    coreSeed: 0,
    coreElso: 0,
  });
}
function recordCost(
  costs: CostMap,
  op: Operation,
  seed: number,
  elso: number,
): void {
  const row = costRow(costs, op.slot);
  if (op.kind === "increment") {
    row.incrementSeed += seed;
    row.incrementElso += elso;
  } else if (op.kind === "core") {
    row.coreSeed += seed;
    row.coreElso += elso;
  } else {
    row.scrollSeed += seed;
    row.scrollElso += elso;
  }
}
type Trajectory = {
  operationCosts: { seed: number; elso: number }[];
  bySlot: CostMap;
  seed: number;
  elso: number;
  week: number | null;
  rows: BudgetRow[];
  powder: number;
  crystal: number;
  stocks: Record<string, number>;
};
export function simulate(
  operations: Operation[],
  input: PlannerInput,
  rng: () => number,
  capture = false,
): Trajectory {
  let seed = input.seed.initial,
    elso = input.elso.initial,
    usedSeed = 0,
    usedElso = 0,
    week = 0,
    powder = 0,
    crystal = 0,
    completed = 0;
  const bySlot: CostMap = {};
  const operationCosts = operations.map(() => ({ seed: 0, elso: 0 }));
  const stocks = stockFor(input),
    rows: BudgetRow[] = [];
  const snapshot = () => {
    if (capture) {
      const row = { week, seed, elso, usedSeed, usedElso, completed };
      if (rows.at(-1)?.week === week) rows[rows.length - 1] = row;
      else rows.push(row);
    }
  };
  const moveTo = (nextWeek: number) => {
    if (nextWeek <= week) return;
    snapshot();
    const previous = week;
    week = nextWeek;
    seed += availableAt(input.seed, week) - availableAt(input.seed, previous);
    elso += availableAt(input.elso, week) - availableAt(input.elso, previous);
    for (const w of input.windfalls)
      if (w.week > previous && w.week <= week) {
        seed += w.seed;
        elso += w.elso;
      }
  };
  const advance = (payments: { seed: number; elso: number }[]) => {
    const next = payments
      .map((p) =>
        fundingWeek(input, usedSeed + p.seed, usedElso + p.elso, week + 1),
      )
      .filter((w): w is number => w !== null);
    if (!next.length) return false;
    moveTo(Math.min(...next));
    return true;
  };
  for (const w of input.windfalls)
    if (w.week === 0) {
      seed += w.seed;
      elso += w.elso;
    }
  for (const [operationIndex, op] of operations.entries()) {
    moveTo(op.notBeforeWeek ?? 0);
    let n = sampleTrials(op.rate, rng);
    const fee = trialFee(op, input),
      elfee = Math.ceil((fee * 3) / 20000);
    const product = op.product;
    if (op.coupon && stocks[op.coupon] > 0) {
      const used = Math.min(stocks[op.coupon], n);
      stocks[op.coupon] -= used;
      n -= used;
    }
    if (product && !product.disposable) {
      if ((stocks[product.id] ?? 0) > 0) stocks[product.id]--;
      else {
        while (seed < product.seed) {
          if (!advance([{ seed: product.seed, elso: 0 }]))
            return {
              seed: usedSeed,
              elso: usedElso,
              week: null,
              rows,
              powder,
              crystal,
              stocks,
              bySlot,
              operationCosts,
            };
        }
        seed -= product.seed;
        usedSeed += product.seed;
        recordCost(bySlot, op, product.seed, 0);
        operationCosts[operationIndex].seed += product.seed;
      }
    }
    while (n > 0) {
      const stock = product?.disposable ? (stocks[product.id] ?? 0) : 0,
        limit = stock > 0 ? Math.min(stock, n) : n;
      // Eta scrolls have two legal fixed-shop payments; prefer ELSO and then SEED.
      const buyElso = product?.disposable && stock === 0 ? product.elso : 0;
      const buySeed = product?.disposable && stock === 0 ? product.seed : 0;
      let count = 0,
        paySeed = 0,
        payElso = 0;
      if (fee === 0 && buyElso === 0 && buySeed === 0) {
        count = limit;
      } else if (elso >= buyElso + elfee) {
        count = Math.min(
          limit,
          Math.floor(elso / Math.max(1, buyElso + elfee)),
        );
        payElso = (buyElso + elfee) * count;
      } else if (product?.id === "eta" && stock === 0) {
        if (elso >= buyElso && seed >= fee) {
          count = Math.min(
            limit,
            Math.floor(elso / buyElso),
            Math.floor(seed / Math.max(1, fee)),
          );
          payElso = buyElso * count;
          paySeed = fee * count;
        } else if (seed >= fee + buySeed) {
          count = Math.min(
            limit,
            Math.floor(seed / Math.max(1, fee + buySeed)),
          );
          paySeed = (fee + buySeed) * count;
        }
      } else if (seed >= fee && elso >= buyElso) {
        count = Math.min(
          limit,
          Math.floor(seed / Math.max(1, fee)),
          buyElso > 0 ? Math.floor(elso / buyElso) : limit,
        );
        paySeed = fee * count;
        payElso = buyElso * count;
      }
      if (count > 0) {
        seed -= paySeed;
        elso -= payElso;
        usedSeed += paySeed;
        usedElso += payElso;
        recordCost(bySlot, op, paySeed, payElso);
        operationCosts[operationIndex].seed += paySeed;
        operationCosts[operationIndex].elso += payElso;
        n -= count;
        if (stock > 0 && product) stocks[product.id] -= count;
        powder += (op.powder ?? 0) * count;
        crystal += (op.crystal ?? 0) * count;
      } else {
        const payments = [
          { seed: 0, elso: buyElso + elfee },
          { seed: fee, elso: buyElso },
        ];
        if (product?.id === "eta" && stock === 0)
          payments.push({ seed: fee + buySeed, elso: 0 });
        if (!advance(payments))
          return {
            seed: usedSeed,
            elso: usedElso,
            week: null,
            rows,
            powder,
            crystal,
            stocks,
            bySlot,
            operationCosts,
          };
      }
    }
    completed++;
    snapshot();
  }
  snapshot();
  return {
    seed: usedSeed,
    elso: usedElso,
    week,
    rows,
    powder,
    crystal,
    stocks,
    bySlot,
    operationCosts,
  };
}
function unfundedCost(
  operations: Operation[],
  input: PlannerInput,
  rng: () => number,
): Trajectory {
  const stocks = stockFor(input),
    bySlot: CostMap = {};
  const operationCosts = operations.map(() => ({ seed: 0, elso: 0 }));
  let seed = 0,
    elso = 0,
    powder = 0,
    crystal = 0;
  for (const [operationIndex, op] of operations.entries()) {
    const beforeSeed = seed,
      beforeElso = elso;
    let n = sampleTrials(op.rate, rng);
    if (op.coupon) {
      const used = Math.min(stocks[op.coupon] ?? 0, n);
      stocks[op.coupon] = (stocks[op.coupon] ?? 0) - used;
      n -= used;
    }
    seed += trialFee(op, input) * n;
    powder += (op.powder ?? 0) * n;
    crystal += (op.crystal ?? 0) * n;
    if (op.product) {
      const p = op.product,
        count = p.disposable ? n : 1,
        used = Math.min(stocks[p.id] ?? 0, count);
      stocks[p.id] = (stocks[p.id] ?? 0) - used;
      if (p.seed) seed += (count - used) * p.seed;
      else elso += (count - used) * p.elso;
    }
    recordCost(bySlot, op, seed - beforeSeed, elso - beforeElso);
    operationCosts[operationIndex] = {
      seed: seed - beforeSeed,
      elso: elso - beforeElso,
    };
  }
  return {
    bySlot,
    operationCosts,
    seed,
    elso,
    week: null,
    rows: [],
    powder,
    crystal,
    stocks,
  };
}
function quantile(values: number[], q: number) {
  return (
    [...values].sort((a, b) => a - b)[
      Math.min(values.length - 1, Math.ceil(q * values.length) - 1)
    ] ?? 0
  );
}
export function summarize(
  plan: Plan,
  input: PlannerInput,
  samples = 768,
): Summary {
  const rng = random(),
    expectedCosts: CostMap = {};
  const expectedOperations = plan.operations.map(() => ({ seed: 0, elso: 0 }));
  let seed = 0,
    elso = 0,
    powder = 0,
    crystal = 0;
  const seeds: number[] = [],
    elsos: number[] = [],
    weeks: number[] = [];
  let success = 0;
  const samplesOut: Trajectory[] = [];
  for (let i = 0; i < samples; i++) {
    let r = simulate(plan.operations, input, rng, i === 0);
    if (r.week === null) r = unfundedCost(plan.operations, input, rng);
    samplesOut.push(r);
    r.operationCosts.forEach((cost, index) => {
      expectedOperations[index].seed += cost.seed / samples;
      expectedOperations[index].elso += cost.elso / samples;
    });
    for (const row of Object.values(r.bySlot)) {
      const expected = costRow(expectedCosts, row.slot);
      for (const field of COST_FIELDS) expected[field] += row[field] / samples;
    }
    seed += r.seed;
    elso += r.elso;
    powder += r.powder;
    crystal += r.crystal;
    seeds.push(r.seed);
    elsos.push(r.elso);
    weeks.push(r.week ?? Infinity);
    if (r.week !== null) success++;
  }
  // Without ELSO or stock, the all-SEED mean is analytic and does not inherit sampling noise.
  const noElso =
    input.elso.initial +
      weeklyIncome(input.elso) +
      input.elso.windfall +
      input.windfalls.reduce((v, w) => v + w.elso, 0) ===
    0;
  const noStock = Object.values(stockFor(input)).every((v) => v === 0);
  if (
    noElso &&
    noStock &&
    !plan.operations.some((o) => o.product?.elso && !o.product.seed)
  ) {
    for (const key of Object.keys(expectedCosts)) delete expectedCosts[key];
    for (const [index, op] of plan.operations.entries()) {
      const price =
        trialFee(op, input) / op.rate +
        (op.product
          ? op.product.seed * (op.product.disposable ? 1 / op.rate : 1)
          : 0);
      recordCost(expectedCosts, op, price, 0);
      expectedOperations[index] = { seed: price, elso: 0 };
    }
    seed =
      plan.operations.reduce(
        (v, o) =>
          v +
          trialFee(o, input) / o.rate +
          (o.product
            ? o.product.seed * (o.product.disposable ? 1 / o.rate : 1)
            : 0),
        0,
      ) * samples;
  }
  for (const op of plan.operations) costRow(expectedCosts, op.slot);
  const meanSeed = seed / samples,
    meanElso = elso / samples;
  const earliestFinish = Math.max(
    0,
    ...plan.operations.map((op) => op.notBeforeWeek ?? 0),
  );
  const week = fundingWeek(input, meanSeed, meanElso, earliestFinish),
    w90 = fundingWeek(
      input,
      quantile(seeds, 0.9),
      quantile(elsos, 0.9),
      earliestFinish,
    ),
    w95 = fundingWeek(
      input,
      quantile(seeds, 0.95),
      quantile(elsos, 0.95),
      earliestFinish,
    );
  let cumulativeSeed = 0,
    cumulativeElso = 0;
  const breakdown = [...new Set(plan.operations.map((op) => op.slot))].map(
    (slot) => expectedCosts[slot],
  );
  const milestones = breakdown.map((cost, index) => {
    cumulativeSeed += cost.incrementSeed + cost.scrollSeed + cost.coreSeed;
    cumulativeElso += cost.incrementElso + cost.scrollElso + cost.coreElso;
    const earliestSlot = Math.max(
      0,
      ...plan.operations
        .filter((op) => op.slot === cost.slot)
        .map((op) => op.notBeforeWeek ?? 0),
    );
    return {
      slot: cost.slot,
      week:
        index === breakdown.length - 1
          ? week
          : fundingWeek(input, cumulativeSeed, cumulativeElso, earliestSlot),
    };
  });
  let scheduleSeed = 0,
    scheduleElso = 0;
  let previousWeek: number | null = 0;
  const schedule = plan.operations.map((op, index) => {
    scheduleSeed += expectedOperations[index].seed;
    scheduleElso += expectedOperations[index].elso;
    const completionWeek =
      index === plan.operations.length - 1
        ? week
        : fundingWeek(
            input,
            scheduleSeed,
            scheduleElso,
            Math.max(previousWeek ?? 0, op.notBeforeWeek ?? 0),
          );
    const waitWeeks =
      completionWeek === null || previousWeek === null
        ? null
        : Math.max(0, completionWeek - previousWeek);
    previousWeek = completionWeek;
    return {
      ...op,
      index,
      week: completionWeek,
      expectedSeed: expectedOperations[index].seed,
      expectedElso: expectedOperations[index].elso,
      expectedTrials: 1 / op.rate,
      waitWeeks,
    };
  });
  const reference = simulate(plan.operations, input, random(7451), true);
  return {
    breakdown,
    milestones,
    schedule,
    seed: seed / samples,
    elso: elso / samples,
    seed90: quantile(seeds, 0.9),
    seed95: quantile(seeds, 0.95),
    elso90: quantile(elsos, 0.9),
    elso95: quantile(elsos, 0.95),
    week,
    week90: w90,
    week95: w95,
    finishRate: success / samples,
    rows: reference.rows,
    materials: {
      powder: Math.max(0, Math.round(powder / samples) - input.corePowder),
      crystal: Math.max(0, Math.round(crystal / samples) - input.coreCrystal),
    },
    stocks: reference.stocks,
    sampled: true,
  };
}
export function calculate(
  input: PlannerInput,
  content: Content,
  stats: Stat[],
  equipment: Equipment[] = [],
): PlanResult {
  const warnings: string[] = [];
  let current = 0,
    max = 0;
  const growth: Plan["growth"] = [];
  for (const g of input.gear)
    if (g.included) {
      for (const s of stats) {
        current += g.actual[s];
        max += g.upgradable
          ? Math.max(g.actual[s], g.caps[s] + outsideValue(g, s))
          : g.actual[s];
        if (g.enchant[s] > g.actual[s])
          warnings.push(
            `${VISIBLE_SLOTS[g.slot]}：エンチャント内訳が現在値を超えています。`,
          );
        if (
          isCapKnown(g, s) &&
          g.actual[s] - outsideValue(g, s) > g.caps[s] &&
          g.upgradable
        )
          warnings.push(
            `${VISIBLE_SLOTS[g.slot]}：現在値と上限を確認してください。`,
          );
      }
      if (g.upgradable && !hasRelevantCaps(g, stats))
        warnings.push(
          `${VISIBLE_SLOTS[g.slot]}：${stats.filter((s) => !isCapKnown(g, s)).join("・")}の能力値上限を入力してください。`,
        );
      if (
        g.mix < 1 ||
        g.mix > 4 ||
        !Number.isInteger(g.mix) ||
        g.increments < 0
      )
        warnings.push(
          `${VISIBLE_SLOTS[g.slot]}：合成・インクリ回数を確認してください。`,
        );
    }
  const titleGain = stats.reduce(
    (sum, stat) => sum + (input.title?.actual[stat] ?? 0),
    0,
  );
  const avatar = avatarValues(input.avatars);
  const avatarGain = stats.reduce((sum, stat) => sum + avatar[stat], 0);
  current += avatarGain;
  max += avatarGain;
  current += titleGain;
  max += titleGain;
  let growthGain = 0;
  for (const item of input.special)
    for (const s of stats) {
      const bonus = specialAbilityValues(item)[s];
      current += item.actual[s] + bonus;
      const owned = item.grow || Object.values(item.actual).some((v) => v > 0);
      const growthCap =
        item.id === "cuffs"
          ? 200
          : item.id === "pendant"
            ? s === "M"
              ? 0
              : 200
            : s === "M"
              ? 200
              : 0;
      max +=
        Math.max(item.actual[s], item.target[s], owned ? growthCap : 0) + bonus;
      if (item.grow && item.target[s] > item.actual[s]) {
        growthGain += item.target[s] - item.actual[s];
        growth.push({
          name: item.name,
          stat: s,
          from: item.actual[s] + bonus,
          to: item.target[s] + bonus,
        });
      }
    }
  const cuffs = input.special.find((s) => s.id === "cuffs");
  const cuffsMet =
    !content.cuffs ||
    (!!cuffs &&
      Math.max(
        ...Object.values(cuffs.actual).map((v, i) =>
          cuffs.grow ? Math.max(v, Object.values(cuffs.target)[i]) : v,
        ),
      ) >= content.cuffs);
  const coreCurrent = input.coreEnabled
    ? input.cores.reduce(
        (v, c) =>
          v +
          (c.enabled && stats.includes(c.stat as Stat)
            ? coreValue(c.evolution, c.enhancement)
            : 0),
        0,
      )
    : 0;
  const coreState = !content.core
    ? "none"
    : !input.coreEnabled
      ? "unknown"
      : coreCurrent >= content.core
        ? "met"
        : "short";
  const target =
    stats.length > 1
      ? content.combined
      : stats[0] === "M"
        ? content.mr
        : content.single;
  const result: PlanResult = {
    status: "ready",
    current,
    target,
    missing: Math.max(0, target - current),
    coreCurrent,
    coreTarget: content.core,
    coreState,
    cuffsMet,
    warnings,
    plans: [],
    replacements: [],
    limited: false,
  };
  if (
    !input.gear.some((g) => g.included) &&
    !input.special.some((s) => Object.values(s.actual).some((v) => v > 0)) &&
    titleGain === 0 &&
    avatarGain === 0
  ) {
    result.status = "incomplete";
    return result;
  }
  if (warnings.length) {
    result.status = "incomplete";
    return result;
  }
  if (!cuffsMet) {
    result.warnings.push(
      `カフスのいずれか1補正${content.cuffs}が必要です。現在値、または育成目標を確認してください。`,
    );
  }
  const missing = Math.max(0, target - current - growthGain);
  if (missing === 0 && coreState !== "short" && !growth.length && cuffsMet) {
    result.status = "achieved";
    return result;
  }
  const candidates: Plan[] = [];
  let limited = false;
  for (let mode = 0; mode < 3; mode++) {
    let beam: { gain: number; ops: Operation[]; score: number }[] = [
      { gain: 0, ops: [], score: 0 },
    ];
    for (const g of input.gear) {
      const { options, limited: l } = gearOptions(
        g,
        stats,
        missing,
        input,
        mode,
      );
      limited ||= l;
      const next = new Map<
        number,
        { gain: number; ops: Operation[]; score: number }
      >();
      for (const b of beam)
        for (const o of options) {
          const ops = [...b.ops, ...o.ops],
            gain = b.gain + o.gain,
            score = scoreOps(ops, input, mode);
          const k = Math.min(missing, gain);
          if (!next.has(k) || next.get(k)!.score > score)
            next.set(k, { gain, ops, score });
        }
      beam = [...next.values()];
      if (beam.length > 180) {
        limited = true;
        beam = retainProgress(beam, 180);
      }
    }
    for (const state of beam
      .filter((b) => b.gain >= missing)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2)) {
      const rawOperations = [...state.ops];
      const core =
        input.coreEnabled && content.core
          ? addCore(rawOperations, input, stats, content.core)
          : { gain: 0, complete: true };
      if (!core.complete) {
        result.warnings.push(
          "対象能力のコアを装着位置ごとに入力してください。",
        );
        continue;
      }
      const operations = arrangeOperations(rawOperations, input.schedule);
      const id = operations
        .map((o) => `${o.slot}:${o.label}:${o.from}`)
        .join("|");
      if (!candidates.some((c) => c.id === id))
        candidates.push({
          id,
          labels: [],
          operations,
          gain: state.gain + growthGain,
          coreGain: core.gain,
          score: state.score,
          growth,
        });
    }
  }
  result.limited = limited;
  if (!candidates.length || !cuffsMet) {
    result.status = "blocked";
    const completeCaps = input.gear.every(
      (g) => !g.included || hasRelevantCaps(g, stats),
    );
    if (completeCaps && max < target) {
      result.replacements.push(
        `現在構成の入力済み上限では${Math.round(target - max)}不足します。`,
      );
      for (const g of input.gear.filter((g) => g.included)) {
        const original = equipment.find(
          (current) => current.id === g.equipmentId,
        );
        const currentCap = stats.reduce(
          (v, s) =>
            v +
            (g.upgradable
              ? Math.max(g.actual[s], g.caps[s] + outsideValue(g, s))
              : g.actual[s]),
          0,
        );
        const options = equipment
          .filter(
            (e) =>
              e.slot === g.slot &&
              e.id !== g.equipmentId &&
              isAvailableForContent(e.name, content) &&
              isNextEquipmentTier(
                equipment.find((current) => current.id === g.equipmentId)
                  ?.name ?? g.name,
                e.name,
              ) &&
              (!original?.source || e.source === original.source) &&
              e.upgradable &&
              (!e.characters.length ||
                e.characters.includes(input.character)) &&
              stats.every((s) => e.caps[s] !== null),
          )
          .map((e) => ({
            e,
            cap: stats.reduce((v, s) => v + (e.caps[s] ?? 0), 0),
          }))
          .filter((x) => x.cap > currentCap)
          .sort((a, b) => b.cap - a.cap)
          .slice(0, 2);
        for (const { e, cap } of options)
          result.replacements.push(
            `${VISIBLE_SLOTS[g.slot]}：${e.name}（${stats.join("＋")}上限${cap}、現装備の上限から＋${cap - currentCap}）`,
          );
      }
      if (result.replacements.length === 1)
        result.replacements.push(
          "入力済み部位を、より上限の高い装備へ更新する必要があります。",
        );
    } else if (!result.warnings.length) {
      const limited = input.gear.filter(
        (g) =>
          g.included &&
          g.upgradable &&
          configuredPlanningCap(g) !== null &&
          stats.some((s) => planningLimit(g, s) < g.caps[s]),
      );
      const plannedMaximum =
        current +
        growthGain +
        input.gear
          .filter((g) => g.included && g.upgradable)
          .reduce(
            (sum, g) =>
              sum +
              stats.reduce(
                (value, stat) =>
                  value +
                  Math.max(
                    0,
                    planningLimit(g, stat) +
                      outsideValue(g, stat) -
                      g.actual[stat],
                  ),
                0,
              ),
            0,
          );
      const onlyDisposable =
        input.scrolls.some(
          (s) => s.enabled && s.disposable && stats.includes(s.stat),
        ) &&
        !input.scrolls.some(
          (s) => s.enabled && !s.disposable && stats.includes(s.stat),
        ) &&
        !input.gear.some(
          (g) => g.included && g.upgradable && g.replacementPlanned,
        );
      result.warnings.push(
        limited.length && plannedMaximum < target
          ? `${limited.map((g) => `${VISIBLE_SLOTS[g.slot]}の強化目標上限${configuredPlanningCap(g)}`).join("、")}の範囲では、条件を満たす強化案が見つかりませんでした。`
          : onlyDisposable
            ? "使い捨て呪文書のみが有効です。すぐ乗り換える予定を指定していない装備には、装備本来の上限に達する最後の1回にだけ使用します。"
            : "使用する呪文書、強化方式、手数料と上限を確認してください。現在の設定では強化案が見つかりませんでした。",
      );
    }
    return result;
  }
  const plans = candidates.map((p) => ({ ...p, summary: summarize(p, input) }));
  const viable = plans.filter((p) => p.summary.finishRate > 0.5);
  const source = viable.length ? viable : plans;
  const bestCost = [...source].sort(
    (a, b) =>
      a.summary.seed - b.summary.seed || a.summary.elso - b.summary.elso,
  )[0];
  const bestTime = [...source].sort(
    (a, b) =>
      (a.summary.week ?? Infinity) - (b.summary.week ?? Infinity) ||
      a.summary.seed - b.summary.seed,
  )[0];
  const bestRisk = [...source].sort(
    (a, b) =>
      a.summary.seed95 - b.summary.seed95 ||
      a.summary.elso95 - b.summary.elso95,
  )[0];
  for (const [plan, label] of [
    [bestCost, "費用"],
    [bestTime, "期間"],
    [bestRisk, "リスク"],
  ] as const) {
    if (!result.plans.some((p) => p.id === plan.id)) {
      result.plans.push(plan);
    }
    plan.labels.push(label);
  }
  result.warnings = [...new Set(result.warnings)];
  return result;
}
