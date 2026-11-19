"use client";
import { CompletionTime } from "./completion-time";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  LoaderCircle,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseSaved } from "@/lib/planner/storage";
import { SLOTS } from "@/lib/planner/data";
import type { PlannerInput, PlanResult } from "@/lib/planner/types";
import type { ReplacementProposal } from "@/lib/planner/replacements";
export const COMPARISON_STORAGE_KEY = "udm.equipment-planner.comparison.v1";
const KEY = COMPARISON_STORAGE_KEY;
const sharedConditions = (input: PlannerInput) =>
  JSON.stringify({ ...input, gear: undefined });
const fmt = (n: number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(n);
const amount = (n: number) =>
  n >= 1e12
    ? `${fmt(n / 1e12)}兆`
    : n >= 1e8
      ? `${fmt(n / 1e8)}億`
      : n >= 1e4
        ? `${fmt(n / 1e4)}万`
        : fmt(Math.round(n));
function metrics(result: PlanResult | null) {
  if (!result) return null;
  if (result.status === "achieved") return { seed: 0, elso: 0, week: 0 };
  const plan = [...result.plans].sort(
    (a, b) =>
      a.summary.seed - b.summary.seed || a.summary.elso - b.summary.elso,
  )[0];
  return plan
    ? {
        seed: plan.summary.seed,
        elso: plan.summary.elso,
        week: plan.summary.week,
      }
    : null;
}
function ResultStats({ result }: { result: PlanResult | null }) {
  const cost = metrics(result);
  return (
    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div>
        <dt className="!mt-0 text-muted-foreground">装備合計 / 条件</dt>
        <dd className="!mt-1 font-medium">
          {result
            ? `${fmt(result.current)} / ${fmt(result.target)}`
            : "再計算待ち"}
        </dd>
      </div>
      <div>
        <dt className="!mt-0 text-muted-foreground">強化費用（期待値）</dt>
        <dd className="!mt-1 font-medium">
          {cost ? `${amount(cost.seed)} SEED` : "―"}
        </dd>
      </div>
      <div>
        <dt className="!mt-0 text-muted-foreground">ELSO（期待値）</dt>
        <dd className="!mt-1 font-medium">
          {cost ? `${amount(cost.elso)} ELSO` : "―"}
        </dd>
      </div>
      <div>
        <dt className="!mt-0 text-muted-foreground">完成までの目安</dt>
        <dd className="!mt-1 font-medium">
          {cost ? (
            <CompletionTime week={cost.week} compact />
          ) : result ? (
            "強化案なし"
          ) : (
            "―"
          )}
        </dd>
      </div>
    </dl>
  );
}
export function ReplacementComparison({
  input,
  result,
  disabled,
  onApply,
}: {
  input: PlannerInput;
  result: PlanResult | null;
  disabled: boolean;
  onApply: (input: PlannerInput, result: PlanResult | null) => void;
}) {
  const [baseline, setBaseline] = useState<PlannerInput | null>(null),
    [baselineResult, setBaselineResult] = useState<PlanResult | null>(null),
    [proposals, setProposals] = useState<ReplacementProposal[]>([]),
    [searching, setSearching] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false);
  const worker = useRef<Worker | null>(null),
    request = useRef(0);
  useEffect(() => {
    try {
      const text = localStorage.getItem(KEY);
      if (text) {
        const saved = parseSaved(text);
        if (saved) setBaseline(saved);
      }
    } catch {}
    worker.current = new Worker(
      new URL("../../lib/planner/replacement.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (event) => {
      if (event.data.id !== request.current) return;
      if (event.data.progress) {
        setProgress(
          `${event.data.progress.done} / ${event.data.progress.total}案を比較中`,
        );
        return;
      }
      setSearching(false);
      if (event.data.error) {
        setError(event.data.error);
        return;
      }
      setBaselineResult(event.data.baseline);
      setProposals(event.data.proposals);
      setSearched(true);
    };
    worker.current.onerror = () => {
      setSearching(false);
      setError(
        "差し替え案を計算できませんでした。ページを再読み込みしてください。",
      );
    };
    return () => worker.current?.terminate();
  }, []);
  const conditionsKey = sharedConditions(input);
  useEffect(() => {
    request.current++;
    setSearching(false);
    setProposals([]);
    setSearched(false);
    setBaselineResult(null);
  }, [conditionsKey]);
  function applyConfiguration(
    next: PlannerInput,
    nextResult: PlanResult | null,
  ) {
    onApply(
      { ...structuredClone(input), gear: structuredClone(next.gear) },
      sharedConditions(next) === conditionsKey ? nextResult : null,
    );
  }
  function search() {
    const source = {
      ...structuredClone(input),
      gear: structuredClone(baseline?.gear ?? input.gear),
    };
    setBaseline(source);
    setError("");
    setSearched(false);
    setSearching(true);
    setProgress("装備候補を比較しています");
    if (!baseline) setBaselineResult(result);
    try {
      localStorage.setItem(KEY, JSON.stringify(source));
    } catch {
      setError(
        "比較元を保存できませんでした。この画面内では比較を続けられます。",
      );
    }
    request.current++;
    worker.current?.postMessage({ id: request.current, input: source });
  }
  function resetBase() {
    const source = structuredClone(input);
    setBaseline(source);
    setBaselineResult(result);
    setProposals([]);
    setSearched(false);
    setError("");
    try {
      localStorage.setItem(KEY, JSON.stringify(source));
    } catch {
      setError("比較元を保存できませんでした。");
    }
  }
  const edited =
    !!baseline && JSON.stringify(input.gear) !== JSON.stringify(baseline.gear);
  return (
    <section
      aria-label="装備差し替え比較"
      className="space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="!m-0 flex items-center gap-2 text-base font-semibold">
          <ArrowRightLeft className="size-4" aria-hidden="true" />
          装備を差し替えて比較
        </h3>
        <Button
          onClick={search}
          disabled={
            disabled || searching || !input.gear.some((g) => g.included)
          }
        >
          {searching ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="size-4" />
          )}
          {baseline ? "比較元から差し替え案を再計算" : "差し替え案を自動提案"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        現在装備から一段上の系列への差し替えを比較します。セイクリッド系は、目標がルビコナの高難易度コンテンツの場合だけ候補に含めます。差し替え先は装備データの基礎値・未強化状態で計算し、MRや強化済みの値は提案を選んで編集できます。装備の取得・売却・継承費用は含みません。
      </p>
      {baseline && (
        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              比較元（装備を変更せず強化）
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || searching}
                onClick={() => applyConfiguration(baseline, baselineResult)}
              >
                <RotateCcw className="size-3" />
                比較元の構成に戻す
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || searching}
                onClick={resetBase}
              >
                入力中の構成を比較元にする
              </Button>
            </div>
          </div>
          <ResultStats result={baselineResult} />
          <p className="text-xs text-muted-foreground">
            比較元の構成は保存されています。再読み込み後は再計算すると費用を表示します。
          </p>
        </div>
      )}
      {searching && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {searched && !searching && !proposals.length && (
        <p className="text-sm">
          選択中の目標で使用する一段上の系列では、条件を満たす差し替え案が見つかりませんでした。現在の構成はそのまま編集できます。
        </p>
      )}
      <div className="space-y-3">
        {proposals.map((proposal, index) => (
          <article
            key={proposal.id}
            aria-label={`差し替え案${index + 1}`}
            className="min-w-0 space-y-3 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">差し替え案{index + 1}</h4>
                <Badge variant="secondary">
                  {proposal.changes.length}部位変更
                </Badge>
                {proposal.result.status === "achieved" && (
                  <Badge variant="outline">追加強化なしで達成</Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || searching}
                onClick={() => {
                  applyConfiguration(proposal.input, proposal.result);
                  document
                    .getElementById("section-02")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Pencil className="size-3" />
                この案を編集
              </Button>
            </div>
            <ul className="space-y-2">
              {proposal.changes.map((change) => (
                <li key={change.slot} className="min-w-0 text-xs">
                  <span className="font-medium">
                    {SLOTS.find((s) => s.id === change.slot)?.label}
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="break-words text-muted-foreground">
                      {change.from}
                    </span>
                    <ArrowRight
                      className="size-3 shrink-0"
                      aria-hidden="true"
                    />
                    <strong className="break-words">{change.to}</strong>
                  </div>
                </li>
              ))}
            </ul>
            <ResultStats result={proposal.result} />
          </article>
        ))}
      </div>
      {edited && (
        <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <h4 className="text-sm font-semibold">編集中の差し替え構成</h4>
          <p className="text-xs text-muted-foreground">
            上の装備入力欄で調整し、「強化計画を計算」で費用・ロードマップを更新できます。
          </p>
          <ResultStats result={result} />
        </div>
      )}
    </section>
  );
}
