import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculate,
  bianuRate,
  coreValue,
  availableAt,
  discountedFee,
  simulate,
  random,
  geometricQuantile,
  expectedAttempts,
} from "../lib/planner/engine.ts";
import {
  defaultInput,
  sampleInput,
  EQUIPMENT,
  CONTENTS,
} from "../lib/planner/data.ts";
import { parseSaved } from "../lib/planner/storage.ts";
const target = CONTENTS.find((x) => x.name === "色を失った大地");
const zero = () => ({ S: 0, H: 0, I: 0, M: 0 });
function sample() {
  const i = sampleInput();
  i.scrolls = i.scrolls.map((s) => ({ ...s, enabled: s.id === "S-14" }));
  return i;
}
test("ビアヌは%を確率に変換し成功後の回数で低下する", () => {
  assert.equal(bianuRate(0), 0.0007);
  assert.ok(Math.abs(bianuRate(1) - 0.00065) < 1e-12);
  assert.equal(bianuRate(25), 0.0001);
  assert.equal(geometricQuantile(0.0007, 0.95), 4279);
  assert.equal(expectedAttempts(0.1), 10);
});
test("割引後の最低費用と大きな単価を保持する", () => {
  assert.equal(discountedFee(11325000, true, 3e6), 9060000);
  assert.equal(discountedFee(3e6, true, 3e6), 3e6);
  assert.equal(
    defaultInput().scrolls.find((s) => s.id === "M-20").price,
    35000000000,
  );
});
test("予算超過収入を翌週から利用でき臨時収入を重複計上しない", () => {
  const m = { initial: 0, cap: 1e8, income: 1e8, budget: 6e7, windfall: 5e7 };
  assert.equal(availableAt(m, 1), 11e7);
  assert.equal(availableAt(m, 2), 26e7);
});
test("装備実数値を一度だけ集計し合成4からインクリを挟む", () => {
  const r = calculate(sample(), target, ["S"]);
  assert.equal(r.current, 2186);
  assert.equal(r.plans[0].gain, 14);
  assert.deepEqual(
    r.plans[0].operations.map((o) => o.kind),
    ["increment", "enchant"],
  );
  assert.match(r.plans[0].operations[0].to, /合成3/);
  assert.ok(Math.abs(r.plans[0].summary.seed - 15942857142.857143) < 1);
  assert.equal(r.plans[0].summary.week, 7);
});
test("臨時収入で費用を賄う週が前倒しになる", () => {
  const i = sample();
  i.windfalls = [{ id: "sale", week: 2, seed: 20e8, elso: 0 }];
  assert.equal(calculate(i, target, ["S"]).plans[0].summary.week, 6);
});
test("合成枠に空きがあればインクリを提案しない", () => {
  const i = sample();
  i.gear[0].mix = 3;
  assert.deepEqual(
    calculate(i, target, ["S"]).plans[0].operations.map((o) => o.kind),
    ["enchant"],
  );
});
test("上限で届かない場合だけ装備更新を示す", () => {
  const i = sample();
  i.gear[0].caps.S = 358;
  const r = calculate(i, target, ["S"]);
  assert.equal(r.status, "blocked");
  assert.ok(r.replacements.length >= 1);
});
test("呪文書の除外による不足を装備限界と誤認しない", () => {
  const i = sample();
  i.scrolls.forEach((s) => (s.enabled = false));
  const r = calculate(i, target, ["S"]);
  assert.equal(r.status, "blocked");
  assert.equal(r.replacements.length, 0);
});
test("装備条件を満たしてもコア未入力は未確認のまま", () => {
  const i = sample();
  const r = calculate(
    i,
    { ...target, single: 2000, core: 120, coreRegion: "エクリプス" },
    ["S"],
  );
  assert.equal(r.coreState, "unknown");
  assert.equal(r.status, "achieved");
});
test("コアは枠別の進化強化から値を求め装備値へ混ぜない", () => {
  const i = sample();
  i.gear[1].actual.S = 1900;
  i.coreEnabled = true;
  i.cores = Array.from({ length: 6 }, (_, n) => ({
    enabled: true,
    stat: "S",
    evolution: 2,
    enhancement: n === 5 ? 3 : 4,
    coupon: 0,
  }));
  const r = calculate(i, { ...target, core: 120, coreRegion: "エクリプス" }, [
    "S",
  ]);
  assert.equal(r.current, 2258);
  assert.equal(r.coreCurrent, 118);
  assert.equal(r.plans[0].coreGain, 2);
  assert.equal(r.plans[0].operations[0].fee, 11500000);
  assert.equal(coreValue(4, 4), 80);
});
test("ELSOを先に使い残額で次の試行を払えなければSEEDを使う", () => {
  const i = defaultInput();
  i.elso.initial = 1359;
  i.seed.initial = 9060000;
  const op = {
    kind: "increment",
    label: "test",
    slot: "武器",
    gain: 0,
    rate: 0.0007,
    fee: 11325000,
    minimum: 3e6,
    from: "4",
    to: "3",
  };
  const u = 1 - Math.pow(1 - 0.0007, 1.5);
  const r = simulate([op], i, () => u);
  assert.equal(r.elso, 1359);
  assert.equal(r.seed, 9060000);
  assert.equal(r.week, 0);
});
test("通常の呪文書は失敗ごとに購入しない", () => {
  const i = defaultInput();
  i.seed.initial = 1e12;
  i.scrolls.find((s) => s.id === "S-14").stock = 1;
  const op = {
    kind: "enchant",
    label: "test",
    slot: "武器",
    gain: 14,
    rate: 0.1,
    fee: 8190000,
    product: { id: "S-14", seed: 30e8, elso: 0, disposable: false },
    from: "3",
    to: "4",
  };
  const r = simulate([op], i, () => 0.9);
  assert.equal(r.seed, 0);
  assert.equal(r.stocks["S-14"], 0);
});
test("複数部位の所持呪文書を二重使用しない", () => {
  const i = defaultInput();
  i.seed.initial = 1e12;
  i.scrolls.find((s) => s.id === "S-14").stock = 1;
  const op = {
    kind: "enchant",
    label: "test",
    slot: "武器",
    gain: 14,
    rate: 1,
    fee: 8190000,
    product: { id: "S-14", seed: 30e8, elso: 0, disposable: false },
    from: "3",
    to: "4",
  };
  assert.equal(simulate([op, op], i, random()).seed, 30e8);
});
test("ELSO使い捨ては失敗でも消費しエンチャント手数料は計上しない", () => {
  const i = defaultInput();
  i.seed.initial = 1e12;
  i.elso.initial = 600;
  const op = {
    kind: "enchant",
    label: "test",
    slot: "武器",
    gain: 12,
    rate: 0.5,
    fee: 8190000,
    product: { id: "S-elso-12", seed: 0, elso: 300, disposable: true },
    from: "3",
    to: "4",
  };
  const r = simulate([op], i, () => 0.6);
  assert.equal(r.elso, 600);
  assert.equal(r.seed, 0);
});
test("保存データは復元でき、破損・異常値を拒否する", () => {
  assert.deepEqual(parseSaved(JSON.stringify(defaultInput())), defaultInput());
  assert.equal(parseSaved("{broken"), null);
  const i = defaultInput();
  i.gear[0].actual.S = -1;
  assert.equal(parseSaved(JSON.stringify(i)), null);
});
test("エフェクトの例外はレベルでなく上限で選び通常装備はLv310以上と追加指定系列に限定", () => {
  const effects = EQUIPMENT.filter((e) => e.slot === "effect" && e.level < 310);
  assert.ok(effects.some((e) => e.level === 300));
  assert.ok(effects.some((e) => e.level < 300));
  assert.ok(effects.every((e) => Object.values(e.caps).some((v) => v >= 255)));
  assert.ok(
    EQUIPMENT.every(
      (e) =>
        e.slot === "effect" ||
        e.level >= 310 ||
        e.name.includes("アクィルス") ||
        e.name.includes("インファーナル"),
    ),
  );
});
test("エフェクトへ複数インクリを提案し各回の成功率を切り替える", () => {
  const i = sample();
  i.gear[0].slot = "effect";
  i.gear[0].actual.S = 30;
  i.gear[0].caps.S = 1000;
  i.gear[1].actual.S = 2100;
  i.gear[1].caps.S = 2100;
  const r = calculate(i, target, ["S"]);
  assert.ok(r.plans.length > 0);
  const ops = r.plans[0].operations.filter((o) => o.kind === "increment");
  assert.equal(ops.length, 5);
  assert.ok(ops[1].rate < ops[0].rate);
  assert.ok(ops[4].rate < ops[3].rate);
});

test("所持済みの高額呪文書を購入単価で不利にしない", () => {
  const i = sample();
  i.scrolls.forEach((s) => {
    s.enabled = s.id === "S-14" || s.id === "S-20";
    if (s.id === "S-20") s.stock = 1;
  });
  const r = calculate(i, target, ["S"]);
  assert.equal(r.plans[0].operations.at(-1).gain, 20);
});

test("更新が必要な場合は該当部位の具体的な装備候補を示す", () => {
  const i = sample();
  i.gear[0].caps.S = 358;
  const r = calculate(i, target, ["S"], EQUIPMENT);
  assert.ok(
    r.replacements.some((s) => s.startsWith("武器：") && s.includes("上限")),
  );
});

test("専用武器の装備可能キャラを保持し更新候補にも反映する", () => {
  const launcher = EQUIPMENT.find(
    (e) => e.name === "改・セイクリッドハンドランチャー",
  );
  assert.deepEqual(launcher.characters, ["ノクターン"]);
  const i = sample();
  i.gear[0].caps.S = 358;
  const r = calculate(i, target, ["S"], EQUIPMENT);
  assert.ok(r.replacements.some((s) => s.startsWith("武器：")));
  assert.ok(
    EQUIPMENT.filter((e) => e.slot === "weapon").every(
      (e) => e.characters.length > 0,
    ),
  );
  assert.deepEqual(
    EQUIPMENT.find((e) => e.name === "アビスウィップ").characters,
    ["ミラ"],
  );
  assert.deepEqual(
    EQUIPMENT.find((e) => e.name === "アビスリスト").characters,
    [],
  );
  assert.ok(
    !EQUIPMENT.find((e) => e.name === "アビスメイル").characters.includes(
      "ミラ",
    ),
  );
  assert.ok(r.replacements.every((s) => !s.includes("ハンドランチャー")));
});

test("選択したエンチャントと任意入力を基礎値へ加算し合成枠の削減も反映する", async () => {
  const { withEnchants, withMix, enchantSlots } =
    await import("../lib/planner/enchantment.ts");
  const g = sample().gear[0];
  g.actual.S = 130;
  g.enchant.S = 30;
  g.appliedEnchants = [];
  g.mix = 4;
  g.increments = 1;
  assert.equal(enchantSlots(g, 2), 3);
  const a = withEnchants(g, [
    { stat: "S", gain: 14 },
    { stat: "S", gain: 20 },
  ]);
  assert.equal(a.actual.S, 164);
  assert.equal(a.enchant.S, 64);
  const b = withEnchants(a, [{ stat: "M", gain: 17 }]);
  assert.equal(b.actual.S, 130);
  assert.equal(b.actual.M, g.actual.M + 17);
  const c = withMix(b, { mix: 2, increments: 0 }, 2);
  assert.equal(c.actual.S, 130);
  assert.equal(c.actual.M, g.actual.M);
});

test("旧保存データのエンチャント手数料を使わず未入力でも強化計画を作成する", () => {
  const i = sample();
  i.gear[0].enchantFee = 0;
  const a = calculate(i, target, ["S"]);
  assert.ok(a.plans.length > 0);
  assert.ok(a.warnings.every((w) => !w.includes("エンチャント手数料")));
  i.gear[0].enchantFee = 999999999;
  const b = calculate(i, target, ["S"]);
  assert.equal(b.plans[0].summary.seed, a.plans[0].summary.seed);
  assert.ok(
    b.plans[0].operations
      .filter((o) => o.kind === "enchant")
      .every((o) => o.fee === 0),
  );
});

test("安価な途中候補だけを残さず複数部位の強化で到達可能な案を保持する", () => {
  const i = defaultInput();
  i.gear.forEach((g) => {
    g.included = true;
    g.upgradable = true;
    g.verifiedCaps = true;
    g.actual.M = 100;
    g.caps.M = 200;
    g.bianuFee = 8325000;
    g.mix = 2;
  });
  i.scrolls.forEach(
    (s) => (s.enabled = s.stat === "M" && s.currency === "seed"),
  );
  for (const amount of [1700, 1950, 2000]) {
    const r = calculate(i, { ...target, mr: amount }, ["M"]);
    assert.ok(r.plans.length > 0, `MR${amount}へ届く計画が必要`);
    assert.ok(r.plans.every((p) => r.current + p.gain >= r.target));
    assert.ok(
      r.plans.every(
        (p) =>
          p.operations
            .filter((o) => o.kind === "enchant")
            .reduce((v, o) => v + o.gain, 0) === p.gain,
      ),
    );
  }
});

test("称号の補正を合計と到達上限へ一度だけ反映し強化対象にはしない", () => {
  const i = sample();
  const before = calculate(i, target, ["S"]);
  i.title = {
    id: "manual",
    name: "テスト称号",
    actual: { S: 14, H: 20, I: 0, M: 0 },
  };
  const after = calculate(i, target, ["S"]);
  assert.equal(after.current, before.current + 14);
  assert.equal(after.status, "achieved");
  assert.equal(after.plans.length, 0);
  const combined = calculate(i, { ...target, combined: 9999 }, ["S", "H"]);
  const without = calculate(
    { ...i, title: { id: "", name: "未装着", actual: zero() } },
    { ...target, combined: 9999 },
    ["S", "H"],
  );
  assert.equal(combined.current, without.current + 34);
  i.title.actual.S = -2;
  assert.equal(parseSaved(JSON.stringify(i)).title.actual.S, -2);
  const legacy = { ...i };
  delete legacy.title;
  assert.deepEqual(parseSaved(JSON.stringify(legacy)).title.actual, zero());
  i.title.actual.S = "invalid";
  assert.equal(parseSaved(JSON.stringify(i)), null);
});

test("アバター5部位の実数値とセット補正を一度だけ加算し対象外・未装備を区別する", async () => {
  const { avatarValues, avatarSetActive, defaultAvatars } =
    await import("../lib/planner/avatar.ts");
  const i = sample();
  assert.deepEqual(avatarValues(i.avatars), zero());
  const before = calculate(i, target, ["S"]);
  i.avatars.forEach((a) => (a.equipped = true));
  assert.equal(avatarSetActive(i.avatars), true);
  assert.deepEqual(avatarValues(i.avatars), { S: 15, H: 15, I: 15, M: 15 });
  const after = calculate(i, target, ["S"]);
  assert.equal(after.current, before.current + 15);
  assert.equal(after.status, "achieved");
  i.avatars[0].actual.S = 11;
  assert.equal(avatarValues(i.avatars).S, 25);
  const combined = calculate(i, { ...target, combined: 9999 }, ["S", "H"]);
  const none = calculate(
    { ...i, avatars: defaultAvatars() },
    { ...target, combined: 9999 },
    ["S", "H"],
  );
  assert.equal(combined.current, none.current + 40);
  i.avatars[4].setEligible = false;
  assert.equal(avatarSetActive(i.avatars), false);
  assert.equal(avatarValues(i.avatars).S, 15);
  i.avatars[0].equipped = false;
  assert.equal(avatarValues(i.avatars).S, 4);
  assert.deepEqual(parseSaved(JSON.stringify(i)).avatars, i.avatars);
  const legacy = { ...i };
  delete legacy.avatars;
  assert.deepEqual(
    parseSaved(JSON.stringify(legacy)).avatars,
    defaultAvatars(),
  );
  i.avatars[0].actual.S = -1;
  assert.equal(parseSaved(JSON.stringify(i)), null);
  i.avatars[0].actual.S = 1;
  i.avatars[0].slot = i.avatars[1].slot;
  assert.equal(parseSaved(JSON.stringify(i)), null);
});

test("エンチャントは装備上限で切り捨て任意加算を上限の外へ加える", async () => {
  const {
    withEnchants,
    withExtra,
    withBase,
    withCap,
    withEntryCount,
    enchantSlots,
  } = await import("../lib/planner/enchantment.ts");
  const g = sample().gear[0];
  g.actual.S = 390;
  g.enchant.S = 0;
  g.caps.S = 400;
  g.mix = 3;
  let a = withEnchants(g, [{ stat: "S", gain: 20 }]);
  assert.equal(a.actual.S, 400);
  assert.equal(a.enchant.S, 10);
  a = withExtra(a, "S", 15);
  assert.equal(a.actual.S, 415);
  a = withEnchants(a, [{ stat: "S", gain: 14 }]);
  assert.equal(a.actual.S, 415);
  a = withBase(a, "S", 380);
  assert.equal(a.actual.S, 409);
  a = withCap(a, "S", 390);
  assert.equal(a.actual.S, 405);
  a = withCap(a, "S", 450);
  assert.equal(a.actual.S, 409);
  a = withEntryCount(a, 3);
  assert.equal(enchantSlots(a, 2), 3);
  assert.equal(a.mix, 3);
  assert.equal(a.increments, 0);
  a = withEntryCount(a, 0);
  assert.equal(a.actual.S, 395);
  assert.equal(a.extra.S, 15);
});
test("上限を超える呪文書も実増分で強化案を作り任意加算で強化余地を減らさない", () => {
  const i = sample();
  i.gear[0].actual.S = 405;
  i.gear[0].enchant.S = 0;
  i.gear[0].extra = { S: 15, H: 0, I: 0, M: 0 };
  i.gear[0].caps.S = 400;
  i.gear[0].mix = 3;
  i.gear[1].actual.S = 1788;
  i.scrolls.forEach((s) => (s.enabled = s.id === "S-20"));
  const r = calculate(i, target, ["S"]);
  assert.equal(r.current, 2193);
  assert.equal(r.warnings.length, 0);
  assert.ok(r.plans.length > 0);
  assert.equal(r.plans[0].gain, 10);
  const op = r.plans[0].operations.find((o) => o.kind === "enchant");
  assert.equal(op.product.id, "S-20");
  assert.equal(op.gain, 10);
  assert.equal(r.plans[0].summary.seed, 200e8);
});
test("旧保存データの選択済みエンチャントも復元時に上限へ収める", () => {
  const i = sample();
  const g = i.gear[0];
  g.actual.S = 410;
  g.enchant.S = 20;
  g.caps.S = 400;
  g.appliedEnchants = [{ stat: "S", gain: 20 }];
  const restored = parseSaved(JSON.stringify(i));
  assert.equal(restored.gear[0].actual.S, 400);
  assert.equal(restored.gear[0].base.S, 390);
  assert.equal(restored.gear[0].appliedEnchants[0].gain, 20);
});

test("現在装備の強化だけで達成できても自動差し替え案を比較し入力は維持する", async () => {
  const { calculateReplacements } =
    await import("../lib/planner/replacements.ts");
  const i = sample(),
    saved = JSON.stringify(i);
  const result = calculateReplacements(i, target, ["S"], EQUIPMENT);
  assert.ok(result.baseline.plans.length > 0);
  assert.ok(result.proposals.length > 0);
  assert.equal(JSON.stringify(i), saved);
  for (const p of result.proposals) {
    assert.ok(p.changes.length > 0);
    for (const change of p.changes) {
      const g = p.input.gear.find((g) => g.slot === change.slot),
        master = EQUIPMENT.find((e) => e.id === g.equipmentId);
      assert.ok(
        master.characters.length === 0 ||
          master.characters.includes(i.character),
      );
      const original = EQUIPMENT.find(
        (e) =>
          e.id ===
          i.gear.find((before) => before.slot === change.slot).equipmentId,
      );
      if (original?.source) assert.equal(master.source, original.source);
      assert.deepEqual(g.enchant, zero());
    }
    assert.deepEqual(p.input.seed, i.seed);
    assert.deepEqual(p.input.title, i.title);
    assert.deepEqual(p.input.avatars, i.avatars);
    assert.ok(p.result.status === "achieved" || p.result.plans.length > 0);
  }
  result.proposals[0].input.gear[0].actual.S = 999;
  assert.equal(JSON.stringify(i), saved);
});
test("1部位では届かなくても複数部位の自動差し替えと上限までの強化を提案する", async () => {
  const { calculateReplacements } =
    await import("../lib/planner/replacements.ts");
  const i = sample();
  i.gear[1].upgradable = true;
  for (const g of i.gear.slice(0, 2)) {
    g.actual = zero();
    g.actual.S = 100;
    g.enchant = zero();
    g.caps = zero();
    g.caps.S = 110;
    g.verifiedCaps = true;
    g.mix = 2;
    g.bianuFee = 10000000;
    g.name = `アビス${g.slot}`;
  }
  const equipment = i.gear.slice(0, 2).map((g, n) => ({
    id: `replacement-${n}`,
    name: `エクリプス差し替え${n}`,
    slot: g.slot,
    level: 310,
    characters: ["ルシアン"],
    base: { S: 125, H: 0, I: 0, M: 0 },
    caps: { S: 135, H: 0, I: 0, M: 0 },
    mix: 2,
    bianuFee: 10000000,
    etaFee: null,
    eta: false,
    upgradable: true,
    source: "",
  }));
  const r = calculateReplacements(
    i,
    { ...target, single: 260 },
    ["S"],
    equipment,
  );
  assert.equal(r.baseline.plans.length, 0);
  assert.ok(
    r.proposals.some(
      (p) => p.changes.length === 2 && p.result.plans.length > 0,
    ),
  );
  assert.ok(
    r.proposals.every((p) => p.result.current + p.result.plans[0].gain >= 260),
  );
});

test("自動差し替えは各装備から一段上の系列に限定しイベント装備や段飛ばしを除外する", async () => {
  const { replacementInputs, calculateReplacements } =
    await import("../lib/planner/replacements.ts");
  const { equipmentTier, isNextEquipmentTier } =
    await import("../lib/planner/equipment-tier.ts");
  assert.equal(equipmentTier("改・セイクリッドレイピア"), 3);
  assert.equal(
    isNextEquipmentTier("アビスレイピア", "エクリプスレイピア"),
    true,
  );
  assert.equal(
    isNextEquipmentTier("アビスレイピア", "セイクリッドレイピア"),
    false,
  );
  assert.equal(
    isNextEquipmentTier("セイクリッドレイピア", "改・セイクリッドレイピア"),
    true,
  );
  const i = sample();
  const inputs = replacementInputs(i, target, ["S"], EQUIPMENT);
  assert.ok(inputs.length > 0);
  for (const next of inputs)
    for (let index = 0; index < next.gear.length; index++) {
      const before = i.gear[index],
        after = next.gear[index];
      if (before.equipmentId !== after.equipmentId)
        assert.ok(isNextEquipmentTier(before.name, after.name));
    }
  const result = calculateReplacements(i, target, ["S"], EQUIPMENT);
  assert.ok(result.proposals.length > 0);
  assert.ok(
    result.proposals.every((p) =>
      p.changes.every((c) => c.to.includes("エクリプス")),
    ),
  );
  const unknown = sample();
  unknown.gear[0].equipmentId = "manual";
  unknown.gear[0].name = "系列不明の装備";
  assert.equal(replacementInputs(unknown, target, ["S"], EQUIPMENT).length, 0);
});

test("セイクリッド系はルビコナハード以降だけで提案し製作前の入場案には使わない", async () => {
  const { replacementInputs, calculateReplacements } =
    await import("../lib/planner/replacements.ts");
  const { isAvailableForContent } =
    await import("../lib/planner/equipment-tier.ts");
  const { selectEquipment } = await import("../lib/planner/data.ts");
  const i = sample();
  i.gear[0] = selectEquipment(
    "weapon",
    EQUIPMENT.find((e) => e.name === "エクリプスレイピア"),
  );
  i.gear[1].actual.S = 3350;
  i.gear[1].caps.S = 3350;
  const hardNames = ["追従する喜び（ハード）", "見つめる悲しみ（ハード）"];
  const ordinary = CONTENTS.filter((c) => !hardNames.includes(c.name));
  for (const content of ordinary) {
    assert.equal(isAvailableForContent("セイクリッドレイピア", content), false);
    assert.equal(
      isAvailableForContent("改・セイクリッドレイピア", content),
      false,
    );
    assert.equal(replacementInputs(i, content, ["S"], EQUIPMENT).length, 0);
  }
  for (const name of hardNames) {
    const content = CONTENTS.find((c) => c.name === name);
    assert.equal(isAvailableForContent("セイクリッドレイピア", content), true);
    const replacements = replacementInputs(i, content, ["S"], EQUIPMENT);
    assert.ok(replacements.length > 0);
    assert.ok(
      replacements.every(
        (next) =>
          next.gear[0].name.includes("セイクリッド") &&
          !next.gear[0].name.includes("改・"),
      ),
    );
  }
  const hard = CONTENTS.find((c) => c.name === "追従する喜び（ハード）");
  const result = calculateReplacements(i, hard, ["S"], EQUIPMENT);
  assert.ok(result.proposals.length > 0);
  assert.ok(
    result.proposals.every((p) =>
      p.changes.every(
        (c) => c.to.includes("セイクリッド") && !c.to.includes("改・"),
      ),
    ),
  );
  assert.equal("replacementAccess" in i, false);
});

test("スタリオンサイン-イエローは既知のMR上限700で計算し他能力の不明値で止めない", async () => {
  const { selectEquipment } = await import("../lib/planner/data.ts");
  const { withBase, withEnchants, withExtra, withCap } =
    await import("../lib/planner/enchantment.ts");
  const { isCapKnown } = await import("../lib/planner/caps.ts");
  const master = EQUIPMENT.find((e) => e.name === "スタリオンサイン-イエロー");
  const i = sample();
  i.gear[0].included = false;
  i.gear[1].actual.M = 2570;
  i.gear[1].caps.M = 2570;
  i.gear[8] = selectEquipment("effect", master);
  assert.equal(i.gear[8].caps.M, 700);
  assert.equal(isCapKnown(i.gear[8], "M"), true);
  assert.equal(isCapKnown(i.gear[8], "S"), false);
  i.scrolls.forEach((s) => (s.enabled = s.id === "M-14"));
  const r = calculate(i, { ...target, mr: 2610 }, ["M"]);
  assert.ok(r.plans.length > 0);
  assert.equal(r.warnings.length, 0);
  const unknown = calculate(i, { ...target, single: 9999 }, ["S"]);
  assert.ok(
    unknown.warnings.some(
      (w) => w.includes("エフェクト") && w.includes("Sの能力値上限"),
    ),
  );
  let g = withEnchants(withBase(i.gear[8], "M", 695), [
    { stat: "M", gain: 20 },
  ]);
  assert.equal(g.actual.M, 700);
  g = withExtra(g, "M", 15);
  assert.equal(g.actual.M, 715);
  g = withCap(g, "S", 255);
  assert.equal(isCapKnown(g, "S"), true);
  assert.equal(isCapKnown(g, "H"), false);
  const legacy = structuredClone(i);
  delete legacy.gear[8].knownCaps;
  const restored = parseSaved(JSON.stringify(legacy));
  assert.equal(isCapKnown(restored.gear[8], "M"), true);
  assert.equal(isCapKnown(restored.gear[8], "S"), false);
});

test("アビリティ名と追加効果から補正を自動集計し上限外へ加算、解除・変更も反映する", async () => {
  const { ABILITIES, abilityValues } =
    await import("../lib/planner/abilities.ts");
  const { withEnchants, withAbility, withExtra } =
    await import("../lib/planner/enchantment.ts");
  const night = ABILITIES.find(
    (a) => a.slot === "weapon" && a.name === "夜星の耐魔力",
  );
  const lost = ABILITIES.find(
    (a) => a.slot === "weapon" && a.name === "喪失の耐魔力",
  );
  assert.deepEqual(night.fixed, { S: 0, H: 0, I: 0, M: 20 });
  assert.deepEqual(night.options, [{ stat: "M", min: 9, max: 18 }]);
  const i = sample(),
    g = i.gear[0];
  g.actual.M = 390;
  g.enchant.M = 0;
  g.caps.M = 400;
  let next = withEnchants(g, [{ stat: "M", gain: 20 }]);
  assert.equal(next.actual.M, 400);
  next = withAbility(next, {
    id: night.id,
    rolls: [{ stat: "M", value: 18 }],
  });
  assert.equal(next.actual.M, 438);
  assert.equal(next.enchant.M, 10);
  next = withExtra(next, "M", 5);
  assert.equal(next.actual.M, 443);
  i.gear[0] = next;
  assert.equal(parseSaved(JSON.stringify(i)).gear[0].actual.M, 443);
  assert.equal(abilityValues(next.ability).M, 38);
  next = withAbility(next, { id: lost.id, rolls: [{ stat: "M", value: 15 }] });
  assert.equal(next.actual.M, 437);
  next = withAbility(next, undefined);
  assert.equal(next.actual.M, 405);
  assert.equal(next.extra.M, 5);
  i.gear[0].ability.rolls[0].value = 19;
  assert.equal(parseSaved(JSON.stringify(i)), null);
});
test("エフェクトの強化目標は初期255、指定値内だけで探索し装備上限や現在値は変えない", async () => {
  const { configuredPlanningCap } =
    await import("../lib/planner/planning-limit.ts");
  const i = sample();
  i.gear[0].slot = "effect";
  i.gear[0].caps.S = 1000;
  i.gear[0].actual.S = 30;
  i.gear[0].enchant.S = 0;
  i.gear[1].actual.S = 1870;
  assert.equal(configuredPlanningCap(i.gear[0]), 255);
  const limited = calculate(i, target, ["S"]);
  assert.equal(limited.status, "blocked");
  assert.equal(limited.replacements.length, 0);
  assert.ok(limited.warnings.some((w) => w.includes("強化目標上限255")));
  i.gear[0].planningCap = 400;
  const allowed = calculate(i, target, ["S"]);
  assert.ok(allowed.plans.length > 0);
  assert.ok(
    allowed.plans.every(
      (p) =>
        30 +
          p.operations
            .filter((o) => o.kind === "enchant")
            .reduce((v, o) => v + o.gain, 0) <=
        400,
    ),
  );
  assert.equal(i.gear[0].caps.S, 1000);
  assert.equal(i.gear[0].actual.S, 30);
  i.gear[0].planningCap = 310;
  assert.equal(configuredPlanningCap(i.gear[0]), 310);
  assert.equal(parseSaved(JSON.stringify(i)).gear[0].planningCap, 310);
});
test("装備別費用はインクリと呪文書に分かれ合計が全体費用と一致する", () => {
  const i = sample(),
    r = calculate(i, target, ["S"]),
    summary = r.plans[0].summary;
  const weapon = summary.breakdown.find((c) => c.slot === "武器");
  assert.ok(Math.abs(weapon.incrementSeed - 9060000 / 0.0007) < 1);
  assert.equal(weapon.scrollSeed, 30e8);
  assert.ok(
    Math.abs(weapon.incrementSeed + weapon.scrollSeed - summary.seed) < 1,
  );
  i.elso.initial = 1000000;
  const mixed = calculate(i, target, ["S"]).plans[0].summary;
  assert.ok(mixed.elso > 0);
  assert.ok(
    Math.abs(
      mixed.breakdown.reduce(
        (v, c) => v + c.incrementSeed + c.scrollSeed + c.coreSeed,
        0,
      ) - mixed.seed,
    ) < 0.01,
  );
  assert.ok(
    Math.abs(
      mixed.breakdown.reduce(
        (v, c) => v + c.incrementElso + c.scrollElso + c.coreElso,
        0,
      ) - mixed.elso,
    ) < 0.01,
  );
});
test("装備別費用でも共有の所持呪文書を二重使用しない", async () => {
  const { summarize } = await import("../lib/planner/engine.ts");
  const i = defaultInput();
  i.seed.initial = 1e12;
  i.scrolls.find((s) => s.id === "S-14").stock = 1;
  const op = {
    kind: "enchant",
    label: "S＋14",
    slot: "武器",
    gain: 14,
    stat: "S",
    rate: 1,
    fee: 0,
    product: { id: "S-14", seed: 30e8, elso: 0, disposable: false },
    from: "3",
    to: "4",
  };
  const plan = {
    id: "two",
    labels: [],
    operations: [op, { ...op, slot: "手" }],
    gain: 28,
    coreGain: 0,
    score: 0,
    growth: [],
  };
  const s = summarize(plan, i, 16);
  assert.equal(s.seed, 30e8);
  assert.equal(s.breakdown.find((c) => c.slot === "武器").scrollSeed, 0);
  assert.equal(s.breakdown.find((c) => c.slot === "手").scrollSeed, 30e8);
});

test("能力値の追加効果は1枠だけを受け付ける", async () => {
  const { ABILITIES, validAbility, abilityValues } =
    await import("../lib/planner/abilities.ts");
  const d = ABILITIES.find(
    (a) => a.slot === "hand" && a.name === "夜星の的中剣",
  );
  const g = {
    ...sample().gear[0],
    slot: "hand",
    ability: {
      id: d.id,
      rolls: [
        { stat: "S", value: 14 },
        { stat: "H", value: 14 },
      ],
    },
  };
  assert.equal(validAbility(g), false);
  assert.equal(abilityValues(g.ability).H, 0);
  g.ability.rolls.pop();
  assert.equal(validAbility(g), true);
});

test("強化目標上限はエフェクト以外には適用しない", async () => {
  const { configuredPlanningCap, planningLimit } =
    await import("../lib/planner/planning-limit.ts");
  const g = { ...sample().gear[0], planningCap: 255 };
  assert.equal(configuredPlanningCap(g), null);
  assert.equal(planningLimit(g, "S"), g.caps.S);
});
test("保存済みの能力値以外の追加効果枠を取り除いて復元する", async () => {
  const { ABILITIES } = await import("../lib/planner/abilities.ts");
  const i = sample();
  i.gear[0].ability = {
    id: ABILITIES.find((a) => a.name === "夜星の尖った刃").id,
    rolls: [
      { stat: "S", value: 18 },
      { stat: "none", value: 0 },
    ],
  };
  const restored = parseSaved(JSON.stringify(i));
  assert.equal(restored.gear[0].ability.rolls.length, 1);
  assert.equal(restored.gear[0].ability.rolls[0].value, 18);
});

test("収入は旧獲得上限が0でもそのまま使い520週を超える目安も表示する", () => {
  const i = sample();
  i.seed.cap = 0;
  i.seed.income = 1e6;
  i.seed.budget = 1e6;
  const r = calculate(i, target, ["S"]).plans[0].summary;
  assert.equal(r.week, 15943);
  assert.equal(r.milestones.find((m) => m.slot === "武器").week, r.week);
  assert.ok(r.week90 > 520);
});
test("資金到達週は遠い臨時収入と両通貨を反映し、到達不能だけnullを返す", async () => {
  const { fundingWeek } = await import("../lib/planner/engine.ts");
  const i = defaultInput();
  i.windfalls = [{ id: "late", week: 10000000, seed: 100, elso: 5 }];
  assert.equal(fundingWeek(i, 100, 5), 10000000);
  assert.equal(fundingWeek(i, 101, 5), null);
  i.seed.income = 10;
  i.seed.budget = 5;
  i.elso.income = 2;
  i.elso.budget = 2;
  i.windfalls = [];
  assert.equal(fundingWeek(i, 25, 9), 5);
  assert.equal(fundingWeek(i, 25, 9, 7), 7);
  assert.equal(fundingWeek(i, 0, 0), 0);
});
test("試行の待機も520週で打ち切らず、必要な入金週まで進む", () => {
  const i = defaultInput();
  i.seed.income = 1e6;
  i.seed.budget = 1e6;
  i.discount = false;
  const op = {
    kind: "increment",
    label: "test",
    slot: "武器",
    gain: 0,
    rate: 1,
    fee: 1e9,
    from: "4",
    to: "3",
  };
  const r = simulate([op], i, () => 0.5, true);
  assert.equal(r.week, 1000);
  assert.equal(r.seed, 1e9);
  assert.equal(r.rows.at(-1).completed, 1);
});
test("部位ごとの完了週は所持呪文書を反映した手順順の累積費用で求める", async () => {
  const { summarize } = await import("../lib/planner/engine.ts");
  const i = defaultInput();
  i.seed.income = 10e8;
  i.seed.budget = 10e8;
  i.scrolls.find((s) => s.id === "S-14").stock = 1;
  const op = {
    kind: "enchant",
    label: "S+14",
    slot: "武器",
    gain: 14,
    stat: "S",
    rate: 1,
    fee: 0,
    product: { id: "S-14", seed: 30e8, elso: 0, disposable: false },
    from: "3",
    to: "4",
  };
  const result = summarize(
    {
      id: "two",
      labels: [],
      operations: [op, { ...op, slot: "手" }],
      gain: 28,
      coreGain: 0,
      score: 0,
      growth: [],
    },
    i,
    16,
  );
  assert.deepEqual(result.milestones, [
    { slot: "武器", week: 0 },
    { slot: "手", week: 3 },
  ]);
  assert.equal(result.week, 3);
});

test("アビリティ名も固定補正・追加補正が主能力に合う候補だけを表示する", async () => {
  const { availableAbilities } = await import("../lib/planner/abilities.ts");
  const stab = availableAbilities("weapon", 310, ["S"]);
  assert.equal(stab.length, 4);
  assert.ok(stab.every((a) => a.name.includes("尖った刃")));
  const combined = availableAbilities("weapon", 310, ["S", "H"]);
  assert.equal(combined.length, 8);
  assert.ok(
    combined.every(
      (a) => a.name.includes("尖った刃") || a.name.includes("鋭い刃"),
    ),
  );
  assert.ok(
    availableAbilities("weapon", 310, ["M"]).every((a) =>
      a.name.includes("耐魔力"),
    ),
  );
  assert.ok(
    availableAbilities("weapon", 310, ["I"]).every((a) =>
      a.name.includes("知力"),
    ),
  );
  assert.equal(availableAbilities("armor", 310, ["S"]).length, 0);
  assert.equal(availableAbilities("sub", 310, ["S"]).length, 0);
  assert.ok(
    availableAbilities("armor", 310, ["M"]).some(
      (a) => a.name === "夜星の魔法耐性(鎧)",
    ),
  );
  assert.ok(
    availableAbilities("hand", 310, ["S"]).some(
      (a) => a.name === "夜星の致命打",
    ),
  );
  assert.equal(availableAbilities("weapon", 300, ["S"]).length, 1);
});

test("アクィルス・インファーナルをキャラ制限と未確認値を保持して追加する", async () => {
  const { equipmentTier, isNextEquipmentTier } =
    await import("../lib/planner/equipment-tier.ts");
  for (const name of ["アクィルスレイピア", "インファーナルレイピア"]) {
    const e = EQUIPMENT.find((e) => e.name === name);
    assert.equal(e.level, 300);
    assert.deepEqual(e.characters, ["ルシアン", "イスピン"]);
  }
  const a = EQUIPMENT.find((e) => e.name === "アクィルスレイピア");
  assert.equal(a.base.S, 242);
  assert.equal(a.caps.S, 300);
  assert.equal(a.bianuFee, 10500000);
  assert.equal(
    EQUIPMENT.find((e) => e.name === "インファーナルレイピア").caps.S,
    null,
  );
  assert.equal(equipmentTier("アクィルスレイピア"), -1);
  assert.equal(
    isNextEquipmentTier("インファーナルレイピア", "アクィルスレイピア"),
    true,
  );
  assert.equal(
    isNextEquipmentTier("アクィルスレイピア", "アビスレイピア"),
    true,
  );
});
test("カフス2枠とルナリア1枠のアビリティを本体と別に集計し入場用カフス補正へ混ぜない", async () => {
  const { SPECIAL_ABILITIES, specialValues, specialAbilityValues } =
    await import("../lib/planner/special-abilities.ts");
  const i = sample(),
    cuffs = i.special.find((s) => s.id === "cuffs"),
    pendant = i.special.find((s) => s.id === "pendant");
  const c = SPECIAL_ABILITIES.find((a) => a.slot === "cuffs" && a.stat === "S"),
    p = SPECIAL_ABILITIES.find((a) => a.slot === "pendant" && a.stat === "S");
  cuffs.abilities = [
    { id: c.id, value: 15 },
    { id: c.id, value: 15 },
  ];
  cuffs.actual.S = 130;
  pendant.kind = "ルナリア";
  pendant.abilities = [{ id: p.id, value: 15 }];
  assert.equal(specialValues(cuffs).S, 160);
  assert.equal(specialAbilityValues(pendant).S, 15);
  const r = calculate(i, { ...target, cuffs: 140 }, ["S"]);
  assert.equal(r.current, 2186 + 130 + 30 + 15);
  assert.equal(r.cuffsMet, false);
  const restored = parseSaved(JSON.stringify(i));
  assert.equal(
    specialValues(restored.special.find((s) => s.id === "cuffs")).S,
    160,
  );
  pendant.kind = "神鳥";
  assert.equal(specialAbilityValues(pendant).S, 0);
  cuffs.abilities[0].value = 16;
  assert.equal(parseSaved(JSON.stringify(i)), null);
});
test("ルナリア左の防御系アビリティは主能力補正を加算しない", async () => {
  const { SPECIAL_ABILITIES, specialAbilityValues, validSpecialAbilities } =
    await import("../lib/planner/special-abilities.ts");
  const i = sample(),
    b = i.special.find((s) => s.id === "bracelet");
  b.kind = "ルナリア";
  b.abilities = [
    {
      id: SPECIAL_ABILITIES.find((a) => a.name === "不死の生命力").id,
      value: 10000,
    },
  ];
  assert.equal(validSpecialAbilities(b), true);
  assert.deepEqual(specialAbilityValues(b), zero());
  b.abilities[0].value = 9500;
  assert.equal(validSpecialAbilities(b), false);
});
test("48週を年月に換算し日本時間の当日から完成日を求める", async () => {
  const { japanToday, calendarDate, calendarDuration } =
    await import("../lib/planner/calendar.ts");
  assert.equal(japanToday(new Date("2026-11-09T16:00:00Z")), "2026-11-10");
  assert.equal(calendarDuration("2026-11-10", 48), "約11か月");
  assert.equal(calendarDate("2026-11-10", 48), "2027年10月12日");
  assert.equal(calendarDuration("2026-11-10", 52), "約1年");
  assert.equal(calendarDuration("2026-11-10", 4), "約1か月");
  assert.equal(calendarDuration("2026-11-10", 1), "約7日");
  assert.equal(calendarDate("2028-02-22", 1), "2028年2月29日");
  assert.equal(calendarDate("2028-02-22", 2), "2028年3月7日");
});
test("手順別スケジュールはインクリとエンチャントの費用を順に積み上げて各週と強化量を返す", () => {
  const summary = calculate(sample(), target, ["S"]).plans[0].summary;
  assert.equal(summary.schedule[0].kind, "increment");
  assert.equal(summary.schedule[0].week, 6);
  assert.equal(summary.schedule[0].gain, 0);
  assert.equal(summary.schedule[1].kind, "enchant");
  assert.equal(summary.schedule[1].week, 7);
  assert.equal(summary.schedule[1].gain, 14);
  assert.equal(summary.schedule.at(-1).week, summary.week);
});

function disposableFixture() {
  const i = sample();
  i.gear.forEach((g) => (g.included = false));
  const gear = structuredClone(i.gear[0]);
  gear.included = true;
  gear.mix = 4;
  gear.enchant.S = 0;
  i.gear[2] = {
    ...structuredClone(gear),
    slot: "head",
    equipmentId: "manual",
    name: "エクリプスヘルム",
    actual: { S: 100, H: 0, I: 0, M: 0 },
    caps: { S: 600, H: 0, I: 0, M: 0 },
    bianuFee: 25575000,
  };
  i.gear[8] = {
    ...structuredClone(gear),
    slot: "effect",
    equipmentId: "manual",
    name: "エフェクト（確認用）",
    actual: { S: 30, H: 0, I: 0, M: 0 },
    caps: { S: 700, H: 0, I: 0, M: 0 },
    planningCap: 400,
    bianuFee: 8250000,
  };
  i.elso.initial = 1e9;
  i.scrolls.forEach(
    (s) => (s.enabled = s.id === "S-14" || s.id === "S-elso-12"),
  );
  return i;
}
test("通常強化で使い捨てを使わず、同じ合成状態なら安いエフェクトへ強化を配分する", () => {
  const i = disposableFixture(),
    r = calculate(i, { ...target, single: 158 }, ["S"]);
  assert.ok(r.plans.length > 0);
  for (const p of r.plans) {
    const enchants = p.operations.filter((o) => o.kind === "enchant");
    assert.ok(enchants.length > 0);
    assert.ok(enchants.every((o) => !o.product.disposable));
    assert.ok(enchants.every((o) => o.slot === "エフェクト"));
  }
});
test("乗り換え予定を指定した装備では上限調整以外にも使い捨てを使用できる", () => {
  const i = disposableFixture();
  i.scrolls.forEach((s) => (s.enabled = s.id === "S-elso-12"));
  const content = { ...target, single: 154 };
  const blocked = calculate(i, content, ["S"]);
  assert.equal(blocked.plans.length, 0);
  assert.ok(
    blocked.warnings.some((w) => w.includes("使い捨て呪文書のみが有効")),
  );
  assert.ok(blocked.warnings.every((w) => !w.includes("強化目標上限")));
  i.gear[8].replacementPlanned = true;
  const r = calculate(i, content, ["S"]);
  assert.ok(r.plans.length > 0);
  assert.ok(
    r.plans[0].operations
      .filter((o) => o.kind === "enchant")
      .every((o) => o.product.disposable && o.slot === "エフェクト"),
  );
  assert.equal(parseSaved(JSON.stringify(i)).gear[8].replacementPlanned, true);
  i.gear[8].replacementPlanned = "yes";
  assert.equal(parseSaved(JSON.stringify(i)), null);
});
test("使い捨ては装備本来の上限へ到達し上限外の補正を別扱いにする", () => {
  const i = disposableFixture();
  i.gear[2].included = false;
  i.gear[8].planningCap = 255;
  i.gear[8].caps.S = 255;
  i.gear[8].actual.S = 264;
  i.gear[8].extra = { S: 20, H: 0, I: 0, M: 0 };
  i.scrolls.forEach((s) => (s.enabled = s.id === "S-elso-12"));
  const r = calculate(i, { ...target, single: 275 }, ["S"]);
  assert.ok(r.plans.length > 0);
  const op = r.plans[0].operations.find((o) => o.kind === "enchant");
  assert.equal(op.gain, 11);
  assert.equal(op.product.disposable, true);
  i.gear[8].actual.S = 262;
  assert.equal(calculate(i, { ...target, single: 275 }, ["S"]).plans.length, 0);
});
test("自動差し替え先に元装備の乗り換え予定を引き継がない", async () => {
  const { replacementInputs } = await import("../lib/planner/replacements.ts");
  const i = sample();
  i.gear[0].replacementPlanned = true;
  const replacements = replacementInputs(i, target, ["S"], EQUIPMENT);
  assert.ok(replacements.length > 0);
  assert.ok(replacements.every((next) => !next.gear[0].replacementPlanned));
  assert.equal(i.gear[0].replacementPlanned, true);
});

test("入場条件やエフェクト目標255に達しても装備本来の上限700未満なら使い捨てを使わない", () => {
  const i = disposableFixture();
  i.gear[2].included = false;
  i.gear[8].planningCap = 255;
  i.gear[8].actual.S = 244;
  i.scrolls.forEach((s) => (s.enabled = s.id === "S-elso-12"));
  assert.equal(calculate(i, { ...target, single: 255 }, ["S"]).plans.length, 0);
  i.gear[8].replacementPlanned = true;
  assert.ok(calculate(i, { ...target, single: 255 }, ["S"]).plans.length > 0);
  i.gear[8].replacementPlanned = false;
  i.gear[8].planningCap = 400;
  i.gear[8].actual.S = 390;
  i.scrolls.find((s) => s.id === "S-14").enabled = true;
  const r = calculate(i, { ...target, single: 400 }, ["S"]);
  assert.ok(r.plans.length > 0);
  assert.ok(
    r.plans.every((p) =>
      p.operations
        .filter((o) => o.kind === "enchant")
        .every((o) => !o.product.disposable),
    ),
  );
});
test("使い捨ての素の上昇量で届いても目標上限で切られ装備上限へ届かない場合は使わない", () => {
  const i = disposableFixture();
  i.gear[2].included = false;
  i.gear[8].caps.S = 255;
  i.gear[8].planningCap = 250;
  i.gear[8].actual.S = 244;
  i.scrolls.forEach((s) => (s.enabled = s.id === "S-elso-12"));
  assert.equal(calculate(i, { ...target, single: 250 }, ["S"]).plans.length, 0);
  i.gear[8].planningCap = 255;
  assert.ok(calculate(i, { ...target, single: 255 }, ["S"]).plans.length > 0);
});
test("各ビアヌ成功の期待試行回数・費用と前手順からの資金準備を個別集計する", () => {
  const i = sample();
  const summary = calculate(i, target, ["S"]).plans[0].summary;
  const increment = summary.schedule[0],
    enchant = summary.schedule[1];
  assert.ok(Math.abs(increment.expectedTrials - 1 / 0.0007) < 1e-9);
  assert.ok(Math.abs(increment.expectedSeed - 9060000 / 0.0007) < 1);
  assert.equal(increment.expectedElso, 0);
  assert.equal(increment.waitWeeks, 6);
  assert.equal(enchant.waitWeeks, 1);
  assert.equal(enchant.expectedSeed, 30e8);
  i.gear[1].actual.S = 1797;
  i.gear[0].caps.S = 600;
  i.seed.initial = 1e14;
  i.scrolls.find((s) => s.id === "S-17").enabled = true;
  const plan = calculate(i, target, ["S"]).plans[0];
  assert.equal(plan.summary.schedule.length, 6);
  assert.ok(
    plan.summary.schedule.every((op) => op.week === 0 && op.waitWeeks === 0),
  );
  const increments = plan.summary.schedule.filter(
    (op) => op.kind === "increment",
  );
  assert.equal(increments.length, 3);
  assert.ok(increments[1].expectedTrials > increments[0].expectedTrials);
  assert.ok(increments[1].expectedSeed > increments[0].expectedSeed);
});

test("部位の実施順を変えても部位内のインクリ・エンチャントの順は保つ", async () => {
  const { arrangeOperations } = await import("../lib/planner/schedule.ts");
  const i = sample(),
    ops = calculate(i, target, ["S"]).plans[0].operations;
  const both = [...ops, ...ops.map((op) => ({ ...op, slot: "手" }))];
  const arranged = arrangeOperations(
    both,
    { order: ["手", "武器"], startDates: {} },
    "2026-11-10",
  );
  assert.deepEqual(
    arranged.map((op) => [op.slot, op.kind]),
    [
      ["手", "increment"],
      ["手", "enchant"],
      ["武器", "increment"],
      ["武器", "enchant"],
    ],
  );
  const dated = arrangeOperations(
    both,
    { order: ["武器", "手"], startDates: { 武器: "2027-01-05" } },
    "2026-11-10",
  );
  assert.equal(dated[0].slot, "手");
  assert.equal(dated[2].notBeforeWeek, 8);
});
test("開始日を変更すると完成日・90%95%目安と個々の予定週も指定日以降になる", async () => {
  const { completionDate, japanToday } =
    await import("../lib/planner/calendar.ts");
  const i = sample();
  i.seed.initial = 1e14;
  i.schedule = {
    order: ["武器"],
    startDates: {
      武器: completionDate(japanToday(), 8).toISOString().slice(0, 10),
    },
  };
  const s = calculate(i, target, ["S"]).plans[0].summary;
  assert.equal(s.week, 8);
  assert.equal(s.week90, 8);
  assert.equal(s.week95, 8);
  assert.ok(s.schedule.every((op) => op.week >= 8));
  assert.ok(s.schedule.every((op) => op.notBeforeWeek === 8));
  assert.deepEqual(parseSaved(JSON.stringify(i)).schedule, i.schedule);
  i.schedule.startDates["武器"] = "2027-02-30";
  assert.equal(parseSaved(JSON.stringify(i)), null);
  i.schedule.startDates = {};
  i.schedule.order = ["武器", "武器"];
  assert.equal(parseSaved(JSON.stringify(i)), null);
});
test("指定日までの収入を加えELSO優先で支払い、開始日変更が支出通貨へも反映する", () => {
  const i = defaultInput();
  i.discount = false;
  i.seed.initial = 9060000;
  i.elso.income = 1359;
  i.elso.budget = 1359;
  const op = {
    kind: "increment",
    label: "ビアヌ",
    slot: "武器",
    gain: 0,
    rate: 1,
    fee: 9060000,
    from: "4",
    to: "3",
  };
  const now = simulate([op], i, () => 0.5);
  assert.equal(now.seed, 9060000);
  assert.equal(now.elso, 0);
  const later = simulate([{ ...op, notBeforeWeek: 1 }], i, () => 0.5);
  assert.equal(later.week, 1);
  assert.equal(later.seed, 0);
  assert.equal(later.elso, 1359);
});
test("実施順変更後も所持呪文書を一度だけ使い費用内訳を再計算する", async () => {
  const { arrangeOperations } = await import("../lib/planner/schedule.ts");
  const { summarize } = await import("../lib/planner/engine.ts");
  const i = defaultInput();
  i.seed.initial = 30e8;
  i.scrolls.find((s) => s.id === "S-14").stock = 1;
  const op = {
    kind: "enchant",
    label: "S+14",
    slot: "武器",
    gain: 14,
    stat: "S",
    rate: 1,
    fee: 0,
    product: { id: "S-14", seed: 30e8, elso: 0, disposable: false },
    from: "3",
    to: "4",
  };
  const operations = arrangeOperations([op, { ...op, slot: "手" }], {
    order: ["手", "武器"],
    startDates: {},
  });
  const s = summarize(
    {
      id: "two",
      labels: [],
      operations,
      gain: 28,
      coreGain: 0,
      score: 0,
      growth: [],
    },
    i,
    16,
  );
  assert.equal(s.schedule[0].slot, "手");
  assert.equal(s.schedule[0].expectedSeed, 0);
  assert.equal(s.schedule[1].expectedSeed, 30e8);
  assert.equal(s.seed, 30e8);
});
