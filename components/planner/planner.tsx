"use client";
import { CompletionTime } from "./completion-time";
import { UpgradeSchedule } from "./upgrade-schedule";
import { specialValues } from "@/lib/planner/special-abilities";
import { SpecialAbilityFields } from "./special-ability-fields";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Calculator,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CHARACTERS,
  CONTENTS,
  EQUIPMENT,
  SLOTS,
  STATS,
  TITLES,
  STAT_LABELS,
  defaultInput,
  emptyGear,
  sampleInput,
  selectEquipment,
  ZERO,
} from "@/lib/planner/data";
import { bianuRate, coreValue } from "@/lib/planner/engine";
import {
  enchantSlots,
  baseValues,
  withBase,
  withExtra,
  withCap,
  withEntryCount,
  withEnchants,
  withMix,
} from "@/lib/planner/enchantment";
import {
  ReplacementComparison,
  COMPARISON_STORAGE_KEY,
} from "./replacement-comparison";
import { isCapKnown, hasRelevantCaps } from "@/lib/planner/caps";
import { AbilityFields } from "./ability-fields";
import { PlanningCapField } from "./planning-cap-field";
import { abilityValues } from "@/lib/planner/abilities";
import { AvatarFields } from "./avatars";
import { avatarValues } from "@/lib/planner/avatar";
import { UpgradeRoadmap, FundingRoadmap, EquipmentCostCards } from "./roadmap";
import { parseSaved, STORAGE_KEY } from "@/lib/planner/storage";
import type {
  Gear,
  MoneyInput,
  PlanResult,
  PlannerInput,
  Special,
  Stat,
} from "@/lib/planner/types";
const SCREENS = [
  ["01", "目標・キャラクター"],
  ["02", "現在の装備"],
  ["03", "レリック・カフス"],
  ["04", "テシスコア"],
  ["05", "呪文書・費用設定"],
  ["06", "資金・収入"],
  ["07", "計算結果"],
  ["08", "装備差し替え比較"],
] as const;
const fmt = (n: number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(n);
const seed = (n: number) =>
  n >= 1e12
    ? `${fmt(n / 1e12)}兆`
    : n >= 1e8
      ? `${fmt(n / 1e8)}億`
      : fmt(Math.round(n));
const elso = (n: number) =>
  n >= 1e12
    ? `${fmt(n / 1e12)}兆`
    : n >= 1e8
      ? `${fmt(n / 1e8)}億`
      : n >= 1e4
        ? `${fmt(n / 1e4)}万`
        : fmt(Math.round(n));
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="relative space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
      {hint && <p className="!mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
function Num({
  label,
  value,
  onChange,
  scale = 1,
  max = 1e14,
  min = 0,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  scale?: number;
  max?: number;
  min?: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="relative">
      <Label className="sr-only" htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        aria-label={label}
        type="number"
        inputMode="decimal"
        value={value === null ? "" : value / scale}
        placeholder={value === null ? "未確認" : undefined}
        min={min}
        max={max / scale}
        step={scale === 1 ? "1" : "any"}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value) * scale;
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (s: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <>
      <Label className="sr-only" htmlFor={id}>
        {label}
      </Label>
      <select
        id={id}
        aria-label={label}
        className="planner-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </>
  );
}
function Tick({
  label,
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  label: string;
  checked: boolean;
  ariaLabel?: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        className="size-4 accent-emerald-700"
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
function Section({
  number,
  title,
  description,
  children,
  hidden = false,
}: {
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
  hidden?: boolean;
}) {
  return (
    <div hidden={hidden} style={hidden ? { display: "none" } : undefined}>
      <Card className="scroll-mt-24" id={`section-${number}`}>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="section-number">{number}</span>
            <div>
              <h2
                tabIndex={-1}
                className="text-base font-semibold outline-none"
              >
                {title}
              </h2>
              {description && (
                <p className="!mt-1 text-xs text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
function MoneyFields({
  name,
  value,
  onChange,
}: {
  name: "SEED" | "ELSO";
  value: MoneyInput;
  onChange: (m: MoneyInput) => void;
}) {
  const scale = name === "SEED" ? 1e8 : 1e4;
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="!m-0 text-sm font-semibold">{name}</h3>
        <span className="text-xs text-muted-foreground">
          単位：{name === "SEED" ? "億SEED" : "万ELSO"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(
          [
            ["initial", "初期資金"],
            ["income", "毎週の収入"],
            ["budget", "毎週の強化予算"],
            ["windfall", "毎週の平均臨時収入"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <Num
              label={`${name} ${label}`}
              value={value[key]}
              scale={scale}
              onChange={(n) => onChange({ ...value, [key]: Math.round(n) })}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
export function Planner() {
  const [activeScreen, setActiveScreen] = useState("01");
  const [titleSearch, setTitleSearch] = useState("");
  const [comparisonEpoch, setComparisonEpoch] = useState(0);
  const [input, setInput] = useState<PlannerInput>(defaultInput),
    [hydrated, setHydrated] = useState(false),
    [saveState, setSaveState] = useState(""),
    [result, setResult] = useState<PlanResult | null>(null),
    [computedInput, setComputedInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selectedPlan, setSelectedPlan] = useState(0);
  const worker = useRef<Worker | null>(null),
    requestId = useRef(0),
    pendingInput = useRef("");
  const character =
    CHARACTERS.find((c) => c.name === input.character) ?? CHARACTERS[0];
  const style = character.styles[input.style] ?? character.styles[0];
  const content = CONTENTS.find((c) => c.id === input.contentId) ?? CONTENTS[0];
  const current = useMemo(
    () =>
      input.gear
        .filter((g) => g.included)
        .reduce(
          (n, g) => n + style.stats.reduce((v, s) => v + g.actual[s], 0),
          0,
        ) +
      style.stats.reduce(
        (sum, stat) =>
          sum + input.title.actual[stat] + avatarValues(input.avatars)[stat],
        0,
      ) +
      input.special.reduce(
        (n, g) => n + style.stats.reduce((v, s) => v + specialValues(g)[s], 0),
        0,
      ),
    [input, style],
  );
  const target =
    style.stats.length > 1
      ? content.combined
      : style.stats[0] === "M"
        ? content.mr
        : content.single;
  const stale = !!result && computedInput !== JSON.stringify(input);
  useEffect(() => {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (text) {
        const saved = parseSaved(text);
        if (
          saved &&
          CHARACTERS.some((c) => c.name === saved.character) &&
          CONTENTS.some((c) => c.id === saved.contentId)
        )
          setInput(saved);
        else
          setSaveState(
            "保存データを読み込めませんでした。新しい入力を使用します。",
          );
      }
    } catch {
      setSaveState("このブラウザーでは保存データを読み込めません。");
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
        setSaveState("自動保存済み");
      } catch {
        setSaveState(
          "保存できませんでした。ブラウザーの保存容量・設定を確認してください。",
        );
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [input, hydrated]);
  useEffect(() => {
    worker.current = new Worker(
      new URL("../../lib/planner/planner.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (event) => {
      if (event.data.id !== requestId.current) return;
      setBusy(false);
      if (event.data.error) setError(event.data.error);
      else {
        setResult(event.data.result);
        setComputedInput(pendingInput.current);
        setSelectedPlan(0);
      }
    };
    worker.current.onerror = () => {
      setBusy(false);
      setError(
        "計算処理を読み込めませんでした。ページを再読み込みしてください。",
      );
    };
    return () => worker.current?.terminate();
  }, []);
  function update<K extends keyof PlannerInput>(
    key: K,
    value: PlannerInput[K],
  ) {
    setInput((v) => ({ ...v, [key]: value }));
  }
  function updateGear(index: number, gear: Gear) {
    setInput((v) => ({
      ...v,
      gear: v.gear.map((g, i) => (i === index ? gear : g)),
    }));
  }
  function updateSpecial(index: number, special: Special) {
    setInput((v) => ({
      ...v,
      special: v.special.map((s, i) => (i === index ? special : s)),
    }));
  }
  function calculate(nextInput: PlannerInput = input) {
    setError("");
    const invalid = nextInput.gear.find(
      (g) =>
        g.included &&
        g.equipmentId !== "manual" &&
        (!EQUIPMENT.some((e) => e.id === g.equipmentId) ||
          EQUIPMENT.some(
            (e) =>
              e.id === g.equipmentId &&
              e.characters.length > 0 &&
              !e.characters.includes(nextInput.character),
          )),
    );
    if (invalid) {
      setError(
        `${invalid.name}は現在のキャラクターの装備候補にありません。装備選択を確認してください。`,
      );
      return;
    }

    setBusy(true);
    pendingInput.current = JSON.stringify(nextInput);
    requestId.current++;
    worker.current?.postMessage({
      id: requestId.current,
      input: nextInput,
      content,
      stats: style.stats,
    });
  }
  function example() {
    if (
      input.gear.some((g) => g.included) &&
      !window.confirm("現在の入力を計算例で置き換えますか？")
    )
      return;
    try {
      localStorage.removeItem(COMPARISON_STORAGE_KEY);
    } catch {}
    setComparisonEpoch((v) => v + 1);
    setInput(sampleInput());
    setResult(null);
    setError("");
  }
  function reset() {
    if (!window.confirm("保存した入力をすべて初期化しますか？")) return;
    try {
      localStorage.removeItem(COMPARISON_STORAGE_KEY);
    } catch {}
    setComparisonEpoch((v) => v + 1);
    setInput(defaultInput());
    setResult(null);
    setError("");
  }
  function navigate(screen: string) {
    setActiveScreen(screen);
    requestAnimationFrame(() => {
      const section = document.getElementById(`section-${screen}`);
      section?.querySelector("h2")?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: "start" });
    });
  }
  const plan = result?.plans[selectedPlan];
  return (
    <div className="planner-layout">
      <aside className="planner-sidebar">
        <div className="mb-3 lg:mb-6">
          <div className="mb-2 text-xs font-medium tracking-widest text-emerald-700">
            EQUIPMENT PLANNER
          </div>
          <h1 className="!text-xl">装備条件・強化計画</h1>
        </div>
        <select
          aria-label="表示する画面"
          className="planner-select lg:hidden"
          value={activeScreen}
          onChange={(e) => navigate(e.target.value)}
        >
          {SCREENS.map(([n, title]) => (
            <option key={n} value={n}>
              {title}
            </option>
          ))}
        </select>
        <nav className="space-y-1" aria-label="入力項目">
          {SCREENS.map(([n, title]) => (
            <button
              key={n}
              type="button"
              className="sidebar-link w-full text-left"
              aria-current={activeScreen === n ? "page" : undefined}
              aria-controls={`section-${n}`}
              onClick={() => navigate(n)}
            >
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {n}
              </span>
              <span className="min-w-0 leading-snug">{title}</span>
              <ChevronRight className="ml-auto hidden size-3 shrink-0 text-muted-foreground lg:block" />
            </button>
          ))}
        </nav>
        <div className="mt-6 space-y-3 border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Save className="size-3.5" />
            <span role="status">
              {saveState || "入力はブラウザーに保存されます"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={example}
            disabled={!hydrated}
          >
            計算例を入力
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={reset}
            disabled={!hydrated}
          >
            <RotateCcw />
            入力を初期化
          </Button>
        </div>
      </aside>
      <div className="min-w-0 space-y-5">
        <div className="planner-overview">
          <div>
            <p className="text-xs text-muted-foreground">{content.name}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-medium">
                {style.stats.map((s) => STAT_LABELS[s]).join("＋")}
              </span>
              <strong className="text-3xl tabular-nums">{fmt(current)}</strong>
              <span className="text-sm text-muted-foreground">
                / {fmt(target)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {current >= target ? "装備条件" : "不足"}
            </p>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">
              {current >= target ? "達成" : `あと ${fmt(target - current)}`}
            </div>
          </div>
          <div className="col-span-2 mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-950/10">
            <div
              className="h-full rounded-full bg-emerald-700 transition-all"
              style={{ width: `${Math.min(100, (current / target) * 100)}%` }}
            />
          </div>
        </div>
        <div className="planner-commandbar z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="min-w-0 text-xs text-muted-foreground">
            {stale
              ? "入力が変更されました。再計算してください。"
              : `${style.stats.map((s) => STAT_LABELS[s]).join("＋")} ${fmt(current)} / ${fmt(target)}`}
          </div>
          <Button
            size="lg"
            disabled={busy || !hydrated}
            onClick={() => calculate()}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Calculator />}
            {busy ? "計算中…" : "強化計画を計算"}
          </Button>
        </div>
        <div
          className={`planner-workspace ${activeScreen === "07" ? "results-only" : ""}`}
        >
          <div
            className="planner-input-pane"
            hidden={activeScreen === "07"}
            style={activeScreen === "07" ? { display: "none" } : undefined}
          >
            <Section
              hidden={activeScreen !== "01"}
              number="01"
              title="目標・キャラクター"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="目標コンテンツ">
                  <Select
                    label="目標コンテンツ"
                    value={input.contentId}
                    onChange={(v) => update("contentId", v)}
                  >
                    {CONTENTS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="キャラクター">
                  <Select
                    label="キャラクター"
                    value={input.character}
                    onChange={(v) =>
                      setInput((i) => ({ ...i, character: v, style: 0 }))
                    }
                  >
                    {CHARACTERS.map((c) => (
                      <option key={c.name}>{c.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="戦闘タイプ">
                  <Select
                    label="戦闘タイプ"
                    value={input.style}
                    onChange={(v) => update("style", Number(v))}
                  >
                    {character.styles.map((s, i) => (
                      <option key={i} value={i}>
                        {s.label}（
                        {s.stats.map((x) => STAT_LABELS[x]).join("＋")}）
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                装備能力値とコアの条件を判定します。前提クエストなどの入場条件は含みません。
              </p>
            </Section>
            <Section
              hidden={activeScreen !== "02"}
              number="02"
              title="現在の装備"
              description="装備の基礎値にエンチャントを加算して実数値を計算します。MRによる個体差は基礎値を変更してください。"
            >
              <div className="space-y-2">
                {input.gear.map((g, index) => {
                  const options = EQUIPMENT.filter(
                    (e) =>
                      e.slot === g.slot &&
                      (!e.characters.length ||
                        e.characters.includes(input.character)),
                  );
                  const selected = EQUIPMENT.find(
                    (e) => e.id === g.equipmentId,
                  );
                  const initialMix = g.initialMix ?? selected?.mix ?? 1;
                  const usedSlots = enchantSlots(g, initialMix);
                  const incompatible =
                    !!selected?.characters.length &&
                    !selected.characters.includes(input.character);
                  const isManual = g.equipmentId === "manual";
                  return (
                    <details
                      className="gear-details"
                      key={g.slot}
                      open={g.included || undefined}
                    >
                      <summary>
                        <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                          {SLOTS.find((s) => s.id === g.slot)?.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {g.included ? g.name : "未選択"}
                        </span>
                        {g.included && (
                          <span className="mr-2 text-sm tabular-nums">
                            {style.stats
                              .map((s) => `${s} ${fmt(g.actual[s])}`)
                              .join(" / ")}
                          </span>
                        )}
                      </summary>
                      <div className="space-y-4 border-t p-4">
                        <Field label="装備">
                          <Select
                            label={`${g.slot} 装備`}
                            value={g.equipmentId}
                            onChange={(id) => {
                              if (!id) updateGear(index, emptyGear(g.slot));
                              else if (id === "manual")
                                updateGear(index, {
                                  ...emptyGear(g.slot),
                                  equipmentId: id,
                                  included: true,
                                  upgradable: true,
                                  name: "手入力の装備",
                                });
                              else {
                                const equipment = EQUIPMENT.find(
                                  (e) => e.id === id,
                                );
                                if (equipment)
                                  updateGear(
                                    index,
                                    selectEquipment(g.slot, equipment),
                                  );
                              }
                            }}
                          >
                            <option value="">未装備</option>
                            <option value="manual">基礎値を手入力</option>
                            {incompatible && (
                              <option value={g.equipmentId} disabled>
                                {g.name}（装備不可）
                              </option>
                            )}
                            {options.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name}（Lv{e.level}）
                              </option>
                            ))}
                          </Select>
                        </Field>
                        {incompatible && (
                          <p className="text-sm text-destructive">
                            {input.character}
                            はこの装備を装備できません。装備を選び直してください。
                          </p>
                        )}
                        {g.included && (
                          <>
                            {isManual && (
                              <Field label="装備名">
                                <Input
                                  aria-label={`${g.slot} 装備名`}
                                  value={g.name}
                                  onChange={(e) =>
                                    updateGear(index, {
                                      ...g,
                                      name: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                            )}
                            {selected && (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant="secondary">
                                  Lv{selected.level}
                                </Badge>
                                {g.slot === "effect" &&
                                  selected.level < 310 && (
                                    <Badge variant="outline">
                                      上限255以上のエフェクト
                                    </Badge>
                                  )}
                                {selected.source && (
                                  <a
                                    className="underline underline-offset-4"
                                    href={selected.source}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    装備データの参照元
                                  </a>
                                )}
                              </div>
                            )}
                            <div className="overflow-x-auto">
                              <table className="planner-table">
                                <thead>
                                  <tr>
                                    <th>能力値</th>
                                    {STATS.map((s) => (
                                      <th key={s}>
                                        {STAT_LABELS[s]}
                                        {style.stats.includes(s) && (
                                          <span className="ml-1 text-emerald-700">
                                            ●
                                          </span>
                                        )}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <th>基礎値（MR反映）</th>
                                    {STATS.map((s) => (
                                      <td key={s}>
                                        <Num
                                          label={`${g.slot} 基礎${s}`}
                                          value={baseValues(g)[s]}
                                          onChange={(n) =>
                                            updateGear(index, withBase(g, s, n))
                                          }
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                  <tr>
                                    <th>エンチャント（上限まで）</th>
                                    {STATS.map((s) => (
                                      <td key={s}>
                                        <output
                                          aria-label={`${g.slot} エンチャント適用${s}`}
                                          className="tabular-nums"
                                        >
                                          {fmt(g.enchant[s])}
                                        </output>
                                      </td>
                                    ))}
                                  </tr>
                                  <tr>
                                    <th>アビリティ（上限外）</th>
                                    {STATS.map((s) => (
                                      <td key={s}>
                                        <output
                                          aria-label={`${g.slot} アビリティ加算${s}`}
                                        >
                                          {fmt(abilityValues(g.ability)[s])}
                                        </output>
                                      </td>
                                    ))}
                                  </tr>
                                  <tr>
                                    <th>その他の補正（上限外）</th>
                                    {STATS.map((s) => (
                                      <td key={s}>
                                        <Num
                                          label={`${g.slot} 任意加算${s}`}
                                          value={g.extra?.[s] ?? 0}
                                          onChange={(n) =>
                                            updateGear(
                                              index,
                                              withExtra(g, s, n),
                                            )
                                          }
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                  <tr>
                                    <th>現在の実数値</th>
                                    {STATS.map((s) => (
                                      <td key={s}>
                                        <output
                                          aria-label={`${g.slot} 現在${s}`}
                                          className="font-semibold tabular-nums"
                                        >
                                          {fmt(g.actual[s])}
                                        </output>
                                      </td>
                                    ))}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <AbilityFields
                              stats={style.stats}
                              gear={g}
                              level={selected?.level ?? 310}
                              onChange={(next) => updateGear(index, next)}
                            />
                            <div className="grid gap-3 sm:grid-cols-3">
                              <Field label="現在の合成回数 / 4">
                                <Num
                                  label={`${g.slot} 合成回数`}
                                  value={g.mix}
                                  min={1}
                                  max={4}
                                  onChange={(n) =>
                                    updateGear(
                                      index,
                                      withMix(
                                        g,
                                        { mix: Math.round(n) },
                                        initialMix,
                                      ),
                                    )
                                  }
                                />
                              </Field>
                              <Field label="現在のインクリ回数">
                                <Num
                                  label={`${g.slot} インクリ回数`}
                                  value={g.increments}
                                  max={999}
                                  onChange={(n) =>
                                    updateGear(
                                      index,
                                      withMix(
                                        g,
                                        { increments: Math.round(n) },
                                        initialMix,
                                      ),
                                    )
                                  }
                                />
                              </Field>
                              <Field label="インクリ方式">
                                <Select
                                  label={`${g.slot} インクリ方式`}
                                  value={g.method}
                                  onChange={(v) =>
                                    updateGear(index, {
                                      ...g,
                                      method: v as Gear["method"],
                                    })
                                  }
                                >
                                  <option value="bianu">
                                    ビアヌ（次回
                                    {fmt(bianuRate(g.increments) * 100)}
                                    %）
                                  </option>
                                  {g.eta && (
                                    <option value="eta">エタ（1%）</option>
                                  )}
                                </Select>
                              </Field>
                            </div>
                            <div className="space-y-3 rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-medium">
                                  現在付いているエンチャント（{usedSlots}枠）
                                </p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={usedSlots === 0}
                                    onClick={() =>
                                      updateGear(
                                        index,
                                        withEntryCount(g, usedSlots - 1),
                                      )
                                    }
                                  >
                                    末尾の枠を削除
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={usedSlots >= 1004}
                                    onClick={() =>
                                      updateGear(
                                        index,
                                        withEntryCount(g, usedSlots + 1),
                                      )
                                    }
                                  >
                                    <Plus className="size-3" />
                                    エンチャントを追加
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                追加ボタンで入力枠を増やせます。装備の合成回数・インクリ回数は変更しません。エンチャントは装備上限で止まり、任意の強化値は上限とは別に加算されます。
                              </p>
                              {Array.from(
                                { length: usedSlots },
                                (_, slotIndex) => {
                                  const entry = g.appliedEnchants?.[slotIndex];
                                  const key = entry?.gain
                                    ? `${entry.stat}-${entry.gain}`
                                    : "";
                                  const known =
                                    !key ||
                                    style.stats.some((stat) =>
                                      [12, 14, 17, 20].some(
                                        (gain) => key === `${stat}-${gain}`,
                                      ),
                                    );
                                  return (
                                    <Field
                                      key={slotIndex}
                                      label={`強化${slotIndex + 1}`}
                                    >
                                      <Select
                                        label={`${g.slot} 強化${slotIndex + 1}`}
                                        value={key}
                                        onChange={(value) => {
                                          const entries = Array.from(
                                            { length: usedSlots },
                                            (_, j) =>
                                              g.appliedEnchants?.[j] ?? {
                                                stat: style.stats[0],
                                                gain: 0,
                                              },
                                          );
                                          const [stat, gain] = value.split("-");
                                          entries[slotIndex] = {
                                            stat: (stat ||
                                              style.stats[0]) as Stat,
                                            gain: Number(gain) || 0,
                                          };
                                          updateGear(
                                            index,
                                            withEnchants(g, entries),
                                          );
                                        }}
                                      >
                                        <option value="">未選択</option>
                                        {!known && (
                                          <option
                                            value={key}
                                            disabled={
                                              !!entry &&
                                              !style.stats.includes(entry.stat)
                                            }
                                          >
                                            {entry?.stat} +{entry?.gain}
                                            （登録済み）
                                          </option>
                                        )}
                                        {style.stats.flatMap((stat) =>
                                          [12, 14, 17, 20].map((gain) => (
                                            <option
                                              key={`${stat}-${gain}`}
                                              value={`${stat}-${gain}`}
                                            >
                                              {STAT_LABELS[stat]} +{gain}
                                              {gain === 12 ? "（ELSO）" : ""}
                                            </option>
                                          )),
                                        )}
                                      </Select>
                                    </Field>
                                  );
                                },
                              )}
                              <p className="text-xs text-muted-foreground">
                                装着アビリティは名前と追加効果を選ぶと自動加算されます。その他の補正だけを手入力してください。
                              </p>
                            </div>
                            <Tick
                              label="この装備を強化候補に含める"
                              checked={g.upgradable}
                              disabled={!!selected && !selected.upgradable}
                              onChange={(v) =>
                                updateGear(index, { ...g, upgradable: v })
                              }
                            />
                            {g.upgradable && (
                              <div className="space-y-1 rounded-md bg-muted/30 p-3">
                                <Tick
                                  label="この装備はすぐ乗り換える予定"
                                  ariaLabel={`${g.slot} 乗り換え予定`}
                                  checked={g.replacementPlanned ?? false}
                                  onChange={(v) =>
                                    updateGear(index, {
                                      ...g,
                                      replacementPlanned: v,
                                    })
                                  }
                                />
                                <p className="text-xs text-muted-foreground">
                                  指定すると、使い捨て呪文書を通常の強化にも使います。未指定では、その1回で装備本来の上限に達するときだけ使います。目標上限や入場条件への到達では使いません。
                                </p>
                              </div>
                            )}
                            {g.upgradable && g.slot === "effect" && (
                              <PlanningCapField
                                key={g.equipmentId}
                                gear={g}
                                onChange={(next) => updateGear(index, next)}
                              />
                            )}
                            <details
                              className="rounded-md bg-muted/40 p-3"
                              open={
                                (g.upgradable &&
                                  !hasRelevantCaps(g, style.stats)) ||
                                undefined
                              }
                            >
                              <summary className="cursor-pointer text-xs font-medium">
                                費用・上限の詳細
                                {g.upgradable &&
                                  !hasRelevantCaps(g, style.stats) &&
                                  "（入力が必要です）"}
                              </summary>
                              <div className="mt-3 space-y-3">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                  <Field label="ビアヌ / 回（万SEED）">
                                    <Num
                                      label={`${g.slot} ビアヌ費用`}
                                      scale={1e4}
                                      value={g.bianuFee}
                                      onChange={(n) =>
                                        updateGear(index, { ...g, bianuFee: n })
                                      }
                                    />
                                  </Field>
                                  {g.eta && (
                                    <Field label="エタ手数料 / 回（万SEED）">
                                      <Num
                                        label={`${g.slot} エタ費用`}
                                        scale={1e4}
                                        value={g.etaFee}
                                        onChange={(n) =>
                                          updateGear(index, { ...g, etaFee: n })
                                        }
                                      />
                                    </Field>
                                  )}
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                  {STATS.map((s) => (
                                    <Field key={s} label={`${s} 上限`}>
                                      <Num
                                        label={`${g.slot} 上限${s}`}
                                        value={
                                          isCapKnown(g, s) ? g.caps[s] : null
                                        }
                                        onChange={(n) =>
                                          updateGear(index, withCap(g, s, n))
                                        }
                                      />
                                    </Field>
                                  ))}
                                </div>
                                {isManual && (
                                  <Tick
                                    label="エタインクリ対応装備"
                                    checked={g.eta}
                                    onChange={(v) =>
                                      updateGear(index, {
                                        ...g,
                                        eta: v,
                                        method: v ? g.method : "bianu",
                                      })
                                    }
                                  />
                                )}
                                <Field
                                  label="装備の初期合成回数 / 4"
                                  hint="装備データの値です。通常は変更不要です。"
                                >
                                  <Num
                                    label={`${g.slot} 初期合成回数`}
                                    value={initialMix}
                                    min={1}
                                    max={4}
                                    onChange={(n) =>
                                      updateGear(
                                        index,
                                        withMix(
                                          g,
                                          { initialMix: Math.round(n) },
                                          Math.round(n),
                                        ),
                                      )
                                    }
                                  />
                                </Field>
                                <p className="text-xs text-muted-foreground">
                                  手数料は割引前の金額です。未登録の費用は装備画面で確認して入力してください。
                                </p>
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="!mt-0 text-sm font-semibold">称号</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="称号名で検索">
                    <Input
                      aria-label="称号名で検索"
                      placeholder="称号名"
                      value={titleSearch}
                      onChange={(e) => setTitleSearch(e.target.value)}
                    />
                  </Field>
                  <Field label="装着する称号">
                    <Select
                      label="称号"
                      value={input.title.id}
                      onChange={(id) => {
                        const title = TITLES.find((t) => t.id === id);
                        update(
                          "title",
                          title
                            ? {
                                id: title.id,
                                name: title.name,
                                actual: { ...title.actual },
                              }
                            : {
                                id,
                                name:
                                  id === "manual" ? "手入力の称号" : "未装着",
                                actual: ZERO(),
                              },
                        );
                      }}
                    >
                      <option value="">未装着</option>
                      <option value="manual">能力値を手入力</option>
                      {TITLES.filter(
                        (t) =>
                          t.id === input.title.id ||
                          t.name.includes(titleSearch.trim()),
                      ).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                {input.title.id && (
                  <>
                    {input.title.id === "manual" && (
                      <Field label="称号名">
                        <Input
                          aria-label="称号名"
                          value={input.title.name}
                          onChange={(e) =>
                            update("title", {
                              ...input.title,
                              name: e.target.value,
                            })
                          }
                        />
                      </Field>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {STATS.map((stat) => (
                        <Field key={stat} label={STAT_LABELS[stat]}>
                          <Num
                            label={`称号 ${stat}`}
                            min={-1e14}
                            value={input.title.actual[stat]}
                            onChange={(n) =>
                              update("title", {
                                ...input.title,
                                actual: { ...input.title.actual, [stat]: n },
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    {TITLES.find((t) => t.id === input.title.id)?.source && (
                      <a
                        className="inline-block text-xs underline underline-offset-4"
                        href={
                          TITLES.find((t) => t.id === input.title.id)?.source
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        称号データの参照元
                      </a>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  称号の補正を装備合計に加算します。能力値は調整できます。
                </p>
              </div>
              <AvatarFields
                value={input.avatars}
                onChange={(v) => update("avatars", v)}
              />
              <p className="text-xs text-muted-foreground">
                通常装備はLv310以上に加え、アクィルス・インファーナルも選択できます。エフェクトはレベルにかかわらず強化上限255以上も含みます。
              </p>
            </Section>
            <Section
              hidden={activeScreen !== "03"}
              number="03"
              title="レリック・カフス"
              description="現在値を装備合計に含めます。育成による増分は提案に含め、費用は計上しません。"
            >
              {input.special.map((item, index) => (
                <details key={item.id} className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {item.name}
                    <span className="ml-3 text-xs font-normal text-muted-foreground">
                      {style.stats
                        .map((s) => `${s} ${specialValues(item)[s]}`)
                        .join(" / ")}
                    </span>
                  </summary>
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {item.kind !== "カフス" && (
                        <Field label="系列">
                          <Select
                            label={`${item.id} 系列`}
                            value={item.kind}
                            onChange={(v) =>
                              updateSpecial(index, {
                                ...item,
                                kind: v as Special["kind"],
                              })
                            }
                          >
                            <option>神鳥</option>
                            <option>ルナリア</option>
                          </Select>
                        </Field>
                      )}
                      <Field
                        label={item.kind === "カフス" ? "補正上限" : "レベル"}
                      >
                        {item.kind === "カフス" ? (
                          <Select
                            label="カフス 上限"
                            value={item.level}
                            onChange={(v) =>
                              updateSpecial(index, {
                                ...item,
                                level: Number(v),
                              })
                            }
                          >
                            {[100, 120, 140, 160, 180, 200].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </Select>
                        ) : (
                          <Num
                            label={`${item.id} レベル`}
                            min={1}
                            max={10}
                            value={item.level}
                            onChange={(v) =>
                              updateSpecial(index, {
                                ...item,
                                level: Math.round(v),
                              })
                            }
                          />
                        )}
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {STATS.filter(
                        (s) =>
                          item.id === "cuffs" ||
                          (item.id === "pendant" ? s !== "M" : s === "M"),
                      ).map((s) => (
                        <Field key={s} label={`本体の補正${s}`}>
                          <Num
                            label={`${item.id} 現在${s}`}
                            value={item.actual[s]}
                            max={item.kind === "カフス" ? 200 : 230}
                            onChange={(n) =>
                              updateSpecial(index, {
                                ...item,
                                actual: { ...item.actual, [s]: n },
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                    <SpecialAbilityFields
                      item={item}
                      stats={style.stats}
                      onChange={(next) => updateSpecial(index, next)}
                    />
                    <Tick
                      label="育成目標を計画に含める"
                      checked={item.grow}
                      onChange={(v) =>
                        updateSpecial(index, {
                          ...item,
                          grow: v,
                          target: v ? { ...item.actual } : item.target,
                        })
                      }
                    />
                    {item.grow && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {STATS.filter(
                          (s) =>
                            item.id === "cuffs" ||
                            (item.id === "pendant" ? s !== "M" : s === "M"),
                        ).map((s) => (
                          <Field key={s} label={`育成後${s}`}>
                            <Num
                              label={`${item.id} 目標${s}`}
                              value={item.target[s]}
                              max={item.kind === "カフス" ? item.level : 200}
                              onChange={(n) =>
                                updateSpecial(index, {
                                  ...item,
                                  target: { ...item.target, [s]: n },
                                })
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </Section>
            <Section
              hidden={activeScreen !== "04"}
              number="04"
              title="テシスコア"
            >
              <Tick
                label="コアを入力・育成費用を計算する"
                checked={input.coreEnabled}
                onChange={(v) => update("coreEnabled", v)}
              />
              {input.coreEnabled ? (
                <>
                  <p className="text-sm">
                    {content.coreRegion ??
                      "選択したコンテンツにコア条件はありません"}
                    {content.core > 0 && (
                      <>
                        {" "}
                        / 必要値 <strong>{content.core}</strong>
                      </>
                    )}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="planner-table">
                      <thead>
                        <tr>
                          <th>位置</th>
                          <th>装着</th>
                          <th>能力タイプ</th>
                          <th>進化</th>
                          <th>強化</th>
                          <th>補正</th>
                          <th>所持券</th>
                        </tr>
                      </thead>
                      <tbody>
                        {input.cores.map((c, i) => (
                          <tr key={i}>
                            <th>{i + 1}</th>
                            <td>
                              <Tick
                                label={`コア${i + 1}`}
                                checked={c.enabled}
                                onChange={(v) =>
                                  update(
                                    "cores",
                                    input.cores.map((x, j) =>
                                      j === i ? { ...x, enabled: v } : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <Select
                                label={`コア${i + 1} 能力`}
                                value={c.stat}
                                onChange={(v) =>
                                  update(
                                    "cores",
                                    input.cores.map((x, j) =>
                                      j === i
                                        ? { ...x, stat: v as typeof c.stat }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                {STATS.map((s) => (
                                  <option key={s} value={s}>
                                    {STAT_LABELS[s]}
                                  </option>
                                ))}
                                <option value="other">その他</option>
                              </Select>
                            </td>
                            {(["evolution", "enhancement"] as const).map(
                              (key) => (
                                <td key={key}>
                                  <Select
                                    label={`コア${i + 1} ${key === "evolution" ? "進化" : "強化"}`}
                                    value={c[key]}
                                    onChange={(v) =>
                                      update(
                                        "cores",
                                        input.cores.map((x, j) =>
                                          j === i
                                            ? { ...x, [key]: Number(v) }
                                            : x,
                                        ),
                                      )
                                    }
                                  >
                                    {[0, 1, 2, 3, 4].map((n) => (
                                      <option key={n}>{n}</option>
                                    ))}
                                  </Select>
                                </td>
                              ),
                            )}
                            <td className="tabular-nums">
                              {c.enabled
                                ? coreValue(c.evolution, c.enhancement)
                                : "―"}
                            </td>
                            <td>
                              <Num
                                label={`コア${i + 1} 所持券`}
                                value={c.coupon}
                                onChange={(v) =>
                                  update(
                                    "cores",
                                    input.cores.map((x, j) =>
                                      j === i ? { ...x, coupon: v } : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="所持しているコアの粉">
                      <Num
                        label="コアの粉"
                        value={input.corePowder}
                        onChange={(v) => update("corePowder", v)}
                      />
                    </Field>
                    <Field label="所持しているコアの結晶">
                      <Num
                        label="コアの結晶"
                        value={input.coreCrystal}
                        onChange={(v) => update("coreCrystal", v)}
                      />
                    </Field>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    所持券は表示中の進化段階に対応する券の枚数です。補正は装備能力値と分けて判定します。
                  </p>
                </>
              ) : (
                content.core > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {content.coreRegion}コア{content.core}
                    が別途必要です。未入力でも装備の強化計画は表示できます。
                  </p>
                )
              )}
            </Section>
            <Section
              hidden={activeScreen !== "05"}
              number="05"
              title="呪文書・費用設定"
            >
              <div className="flex flex-wrap items-center gap-6">
                <Tick
                  label="対象手数料を20%割引"
                  checked={input.discount}
                  onChange={(v) => update("discount", v)}
                />
                <Field label="所持エタインクリ呪文書">
                  <Num
                    label="所持エタインクリ呪文書"
                    value={input.etaStock}
                    onChange={(v) => update("etaStock", v)}
                  />
                </Field>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  使用する呪文書・価格・所持数
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="planner-table">
                    <thead>
                      <tr>
                        <th>使用</th>
                        <th>呪文書</th>
                        <th>単価</th>
                        <th>単位</th>
                        <th>所持数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {input.scrolls
                        .filter((s) => style.stats.includes(s.stat))
                        .map((s) => (
                          <tr key={s.id}>
                            <td>
                              <Tick
                                label={`${s.stat}＋${s.gain}${s.disposable ? "使い捨て" : ""}`}
                                checked={s.enabled}
                                onChange={(v) =>
                                  update(
                                    "scrolls",
                                    input.scrolls.map((x) =>
                                      x.id === s.id ? { ...x, enabled: v } : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="whitespace-nowrap">
                              {s.disposable ? "使い捨て" : "通常"}
                            </td>
                            <td>
                              <Num
                                label={`${s.id} 単価`}
                                value={s.price}
                                scale={s.currency === "seed" ? 1e8 : 1}
                                onChange={(v) =>
                                  update(
                                    "scrolls",
                                    input.scrolls.map((x) =>
                                      x.id === s.id ? { ...x, price: v } : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="whitespace-nowrap text-xs text-muted-foreground">
                              {s.currency === "seed" ? "億SEED" : "ELSO"}
                            </td>
                            <td>
                              <Num
                                label={`${s.id} 所持数`}
                                value={s.stock}
                                onChange={(v) =>
                                  update(
                                    "scrolls",
                                    input.scrolls.map((x) =>
                                      x.id === s.id
                                        ? { ...x, stock: Math.round(v) }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Section>
            <Section
              hidden={activeScreen !== "06"}
              number="06"
              title="資金・収入"
            >
              <MoneyFields
                name="SEED"
                value={input.seed}
                onChange={(v) => update("seed", v)}
              />
              <MoneyFields
                name="ELSO"
                value={input.elso}
                onChange={(v) => update("elso", v)}
              />
              <details open={input.windfalls.length > 0 || undefined}>
                <summary className="cursor-pointer text-sm font-medium">
                  指定週の臨時収入
                </summary>
                <div className="mt-3 space-y-3">
                  {input.windfalls.map((w, i) => (
                    <div
                      key={w.id}
                      className="grid grid-cols-[4rem_1fr_1fr_auto] items-end gap-2"
                    >
                      <Field label="週">
                        <Num
                          label={`臨時収入${i + 1} 週`}
                          value={w.week}
                          onChange={(v) =>
                            update(
                              "windfalls",
                              input.windfalls.map((x) =>
                                x.id === w.id
                                  ? { ...x, week: Math.round(v) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="億SEED">
                        <Num
                          label={`臨時収入${i + 1} SEED`}
                          scale={1e8}
                          value={w.seed}
                          onChange={(v) =>
                            update(
                              "windfalls",
                              input.windfalls.map((x) =>
                                x.id === w.id ? { ...x, seed: v } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="万ELSO">
                        <Num
                          label={`臨時収入${i + 1} ELSO`}
                          scale={1e4}
                          value={w.elso}
                          onChange={(v) =>
                            update(
                              "windfalls",
                              input.windfalls.map((x) =>
                                x.id === w.id ? { ...x, elso: v } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`臨時収入${i + 1} 削除`}
                        onClick={() =>
                          update(
                            "windfalls",
                            input.windfalls.filter((x) => x.id !== w.id),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update("windfalls", [
                        ...input.windfalls,
                        { id: crypto.randomUUID(), week: 2, seed: 0, elso: 0 },
                      ])
                    }
                  >
                    <Plus />
                    収入を追加
                  </Button>
                </div>
              </details>
              <p className="text-xs text-muted-foreground">
                臨時収入は週間上限・予算に上乗せします。使わなかった資金と予算を超えた収入も翌週以降に繰り越します。
              </p>
            </Section>
            <Section
              hidden={activeScreen !== "08"}
              number="08"
              title="装備差し替え比較"
            >
              {hydrated && (
                <ReplacementComparison
                  key={comparisonEpoch}
                  input={input}
                  result={stale || busy ? null : result}
                  disabled={busy}
                  onApply={(next, nextResult) => {
                    requestId.current++;
                    setInput(next);
                    setResult(nextResult);
                    setComputedInput(nextResult ? JSON.stringify(next) : "");
                    setSelectedPlan(0);
                    setError("");
                    setActiveScreen("02");
                    requestAnimationFrame(() =>
                      document.getElementById("section-02")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      }),
                    );
                  }}
                />
              )}
            </Section>
          </div>
          <div className="planner-results-pane" aria-label="常設の計算結果">
            <Section number="07" title="計算結果">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {!result && !busy && !error && (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  装備と資金を入力して、強化計画を計算してください。
                </p>
              )}
              {busy && (
                <div
                  role="status"
                  className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
                >
                  <LoaderCircle className="size-4 animate-spin" />
                  強化候補と費用を計算しています
                </div>
              )}
              {result && (
                <div className={stale ? "space-y-4 opacity-50" : "space-y-4"}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        result.current >= result.target
                          ? "default"
                          : "secondary"
                      }
                    >
                      装備 {fmt(result.current)} / {fmt(result.target)}
                    </Badge>
                    <Badge variant="outline">
                      {result.coreState === "none"
                        ? "コア条件なし"
                        : result.coreState === "unknown"
                          ? "コア未確認"
                          : `コア ${result.coreCurrent} / ${result.coreTarget}`}
                    </Badge>
                    {content.cuffs > 0 && (
                      <Badge variant="outline">
                        カフス {result.cuffsMet ? "達成" : "不足"}
                      </Badge>
                    )}
                  </div>
                  {result.status === "incomplete" &&
                    !result.warnings.length && (
                      <p className="text-sm">現在の装備を入力してください。</p>
                    )}
                  {result.status === "achieved" && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
                      <Check className="size-4" />
                      {result.coreState === "unknown"
                        ? "装備条件を達成しています。"
                        : "対象の装備・コア条件を達成しています。"}
                    </div>
                  )}
                  {result.warnings.map((w, i) => (
                    <p className="rounded-lg border px-3 py-2 text-sm" key={i}>
                      {w}
                    </p>
                  ))}
                  {result.replacements.map((w, i) => (
                    <p className="rounded-lg border px-3 py-2 text-sm" key={i}>
                      {w}
                    </p>
                  ))}
                  {result.plans.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {result.plans.map((p, i) => (
                          <Button
                            key={p.id}
                            variant={selectedPlan === i ? "default" : "outline"}
                            onClick={() => setSelectedPlan(i)}
                          >
                            {p.labels.join("・")}重視
                          </Button>
                        ))}
                      </div>
                      {plan && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="result-stat">
                              <span>期待SEED支出</span>
                              <strong>
                                {seed(plan.summary.seed)}
                                <small>SEED</small>
                              </strong>
                            </div>
                            <div className="result-stat">
                              <span>期待ELSO支出</span>
                              <strong>
                                {elso(plan.summary.elso)}
                                <small>ELSO</small>
                              </strong>
                            </div>
                            <div className="result-stat">
                              <span>完成までの目安</span>
                              <CompletionTime week={plan.summary.week} />
                            </div>
                          </div>
                          <EquipmentCostCards
                            costs={plan.summary.breakdown}
                            input={input}
                          />
                          <UpgradeSchedule
                            summary={plan.summary}
                            input={input}
                            busy={busy}
                            onScheduleChange={(settings) => {
                              const next = { ...input, schedule: settings };
                              setInput(next);
                              calculate(next);
                            }}
                          />
                          <UpgradeRoadmap
                            summary={plan.summary}
                            plan={plan}
                            input={input}
                            current={result.current}
                            target={result.target}
                          />
                          <details className="rounded-lg border p-4">
                            <summary className="cursor-pointer text-sm font-medium">
                              90%・95%予算と費用の詳細
                            </summary>
                            <div className="mt-3 overflow-x-auto">
                              <table className="planner-table">
                                <thead>
                                  <tr>
                                    <th>目安</th>
                                    <th>SEED</th>
                                    <th>ELSO</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    [
                                      "期待支出",
                                      plan.summary.seed,
                                      plan.summary.elso,
                                    ],
                                    [
                                      "90%予算",
                                      plan.summary.seed90,
                                      plan.summary.elso90,
                                    ],
                                    [
                                      "95%予算",
                                      plan.summary.seed95,
                                      plan.summary.elso95,
                                    ],
                                  ].map(([title, s, e]) => (
                                    <tr key={title}>
                                      <th>{title}</th>
                                      <td>{seed(Number(s))}</td>
                                      <td>{elso(Number(e))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                              祝福値を含めない簡易モデルによる推定です。予算・収入見込みは成功を保証するものではありません。通貨別の予算はそれぞれの分位点です。
                            </p>
                            {input.coreEnabled && plan.coreGain > 0 && (
                              <p className="text-xs">
                                追加で必要な素材の期待数：粉{" "}
                                {fmt(plan.summary.materials.powder)} / 結晶{" "}
                                {fmt(plan.summary.materials.crystal)}
                              </p>
                            )}
                          </details>
                          <FundingRoadmap
                            summary={plan.summary}
                            input={input}
                          />
                          {result.limited && (
                            <p className="text-xs text-muted-foreground">
                              探索範囲内の候補を表示しています。
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
