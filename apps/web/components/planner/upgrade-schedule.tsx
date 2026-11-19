import { TablePagination } from "./table-pagination";
import { ScheduleEditor } from "./schedule-editor";
import { Input } from "@/components/ui/input";
import { weekForDate } from "@/lib/planner/schedule";
import { ScheduleSteps } from "./schedule-steps";
import { useState, useEffect } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STAT_LABELS } from "@/lib/planner/data";
import { calendarDate, calendarDuration } from "@/lib/planner/calendar";
import { usePlanningDate } from "./completion-time";
import type {
  Summary,
  PlannerInput,
  ScheduleSettings,
} from "@/lib/planner/types";
type Event = Summary["schedule"][number];
function describe(events: Event[]) {
  const increments = events.filter((e) => e.kind === "increment").length;
  const enchants = events.filter((e) => e.kind === "enchant");
  const gains = (["S", "H", "I", "M"] as const)
    .map((stat) => ({
      stat,
      gain: enchants
        .filter((e) => e.stat === stat)
        .reduce((n, e) => n + e.gain, 0),
    }))
    .filter((e) => e.gain > 0);
  const core = events.filter((e) => e.kind === "core");
  return [
    increments ? `インクリ${increments}回成功` : "",
    ...gains.map((g) => `${STAT_LABELS[g.stat]}＋${g.gain}`),
    core.length ? `コア＋${core.reduce((n, e) => n + e.gain, 0)}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}
export function UpgradeSchedule({
  summary,
  input,
  busy,
  onScheduleChange,
}: {
  summary: Summary;
  input: PlannerInput;
  busy: boolean;
  onScheduleChange: (settings: ScheduleSettings | undefined) => void;
}) {
  const start = usePlanningDate();
  const [selected, setSelected] = useState<{
    week: number;
    slot: string;
  } | null>(null);
  const [slotFilter, setSlotFilter] = useState("all"),
    [fromDate, setFromDate] = useState(""),
    [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0),
    [pageSize, setPageSize] = useState(20);
  useEffect(() => setSelected(null), [summary]);
  useEffect(
    () => setPage(0),
    [selected, slotFilter, fromDate, toDate, pageSize, summary],
  );
  const scheduled = summary.schedule.filter(
    (e): e is Event & { week: number } => e.week !== null,
  );
  if (!start || !scheduled.length) return null;
  const allSlots = [...new Set(scheduled.map((e) => e.slot))];
  const lastWeek = Math.max(...scheduled.map((e) => e.week));
  const rangeStart = fromDate ? weekForDate(start, fromDate) : 0;
  const rangeEnd = toDate
    ? Math.floor(
        (Date.parse(toDate + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) /
          (7 * 86400000),
      )
    : lastWeek;
  const invalidRange = !!fromDate && !!toDate && fromDate > toDate;
  const filtered = scheduled.filter(
    (e) =>
      (slotFilter === "all" || e.slot === slotFilter) &&
      !invalidRange &&
      e.week >= rangeStart &&
      e.week <= rangeEnd,
  );
  const slots = allSlots.filter((slot) =>
    filtered.some((e) => e.slot === slot),
  );
  const span = Math.max(1, rangeEnd - rangeStart);
  const position = (week: number) => ((week - rangeStart) / span) * 100;
  const ticks = [
    ...new Set(
      Array.from(
        { length: 5 },
        (_, i) =>
          rangeStart + Math.round((Math.max(0, rangeEnd - rangeStart) * i) / 4),
      ),
    ),
  ];
  const rows = selected
    ? filtered.filter(
        (e) => e.week === selected.week && e.slot === selected.slot,
      )
    : filtered;
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  const pageRows = rows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const visibleWeeks = [...new Set(pageRows.map((e) => e.week))];
  const resetView = () => {
    setFromDate("");
    setToDate("");
    setSlotFilter("all");
    setSelected(null);
    setPage(0);
  };
  const preset = (months: number) => {
    const end = new Date(start + "T00:00:00Z");
    end.setUTCMonth(end.getUTCMonth() + months);
    setFromDate(start);
    setToDate(end.toISOString().slice(0, 10));
    setSelected(null);
  };
  return (
    <section
      aria-label="部位別の強化スケジュール"
      className="space-y-4 rounded-xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="size-4" />
          部位別の強化スケジュール
        </h3>
        <Badge variant="outline">{calendarDate(start, 0)}開始</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        各点がその時期に行う強化です。点を選ぶと強化内容を確認できます。期待費用と入力した収入・予算から作成した目安です。
      </p>
      <div className="grid gap-3 rounded-lg bg-muted/20 p-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs">
          <span>表示する部位</span>
          <select
            className="planner-select"
            aria-label="スケジュール 部位"
            value={slotFilter}
            onChange={(e) => {
              setSlotFilter(e.target.value);
              setSelected(null);
            }}
          >
            <option value="all">全部位</option>
            {allSlots.map((slot) => (
              <option key={slot}>{slot}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span>表示開始日</span>
          <Input
            type="date"
            aria-label="スケジュール 表示開始日"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span>表示終了日</span>
          <Input
            type="date"
            aria-label="スケジュール 表示終了日"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setSelected(null);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={resetView}>
          全景を表示
        </Button>
        <Button size="sm" variant="outline" onClick={() => preset(3)}>
          今後3か月
        </Button>
        <Button size="sm" variant="outline" onClick={() => preset(12)}>
          今後1年
        </Button>
      </div>
      {invalidRange && (
        <p role="alert" className="text-xs text-destructive">
          表示開始日を表示終了日以前にしてください。
        </p>
      )}
      <ScheduleEditor
        slots={allSlots}
        value={input.schedule}
        start={start}
        busy={busy}
        onApply={onScheduleChange}
      />
      <div className="overflow-x-auto pb-2">
        <div
          className="min-w-[680px] px-2"
          role="group"
          aria-label="強化時期のチャート"
        >
          <div className="relative ml-28 mr-12 h-14 text-[10px] text-muted-foreground">
            {ticks.map((w) => (
              <div
                key={w}
                className="absolute w-24"
                style={{
                  left: `${position(w)}%`,
                  transform:
                    w === rangeEnd
                      ? "translateX(-100%)"
                      : w === rangeStart
                        ? undefined
                        : "translateX(-50%)",
                }}
              >
                <span className="block font-medium">
                  {w === 0 ? "現在" : calendarDuration(start, w)}
                </span>
                <span>{calendarDate(start, w)}</span>
              </div>
            ))}
          </div>
          {slots.map((slot) => {
            const events = filtered.filter((e) => e.slot === slot),
              weeks = [...new Set(events.map((e) => e.week))],
              first = Math.min(...weeks),
              last = Math.max(...weeks);
            return (
              <div
                key={slot}
                className="grid grid-cols-[7rem_1fr] items-center border-t py-3 pr-12"
              >
                <span className="pr-2 text-xs font-medium">{slot}</span>
                <div className="relative h-8 rounded bg-muted/30">
                  <div
                    className="absolute top-3.5 h-1 rounded bg-emerald-200"
                    style={{
                      left: `${position(first)}%`,
                      width: `${((last - first) / span) * 100}%`,
                    }}
                  />
                  {weeks.map((w) => {
                    const at = events.filter((e) => e.week === w);
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-label={`${slot} ${w}週目 ${describe(at)}`}
                        title={`${calendarDate(start, w)}（${w}週目）\n${describe(at)}`}
                        className={`absolute top-1.5 z-10 size-5 -translate-x-1/2 rounded-full border-2 border-background shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${selected?.week === w && selected.slot === slot ? "bg-amber-500" : "bg-emerald-600 hover:bg-emerald-800"}`}
                        style={{ left: `${position(w)}%` }}
                        onClick={() =>
                          setSelected(
                            selected?.week === w && selected.slot === slot
                              ? null
                              : { week: w, slot },
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {selected === null
            ? "強化手順"
            : `${selected.slot}・${selected.week}週目の強化手順`}
        </p>
        {selected !== null && (
          <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
            選択解除
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        インクリはELSOで先に試し、未成功のままELSOが1回分未満になったらSEEDに切り替えます。成功した時点で打ち切り、残金は次の手順へ引き継ぎます。両方とも足りなければ次の収入を待ち、再びELSOから試します。
      </p>
      <p className="text-xs text-muted-foreground">
        各行の成功率は1回ごとの確率です。支出の期待値はこの順序で試した場合の平均で、支払いの指示額ではありません。使えるELSOと試行回数は、それまでの成功・失敗によって変わります。
      </p>
      <TablePagination
        label="強化手順"
        page={currentPage}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      {!filtered.length && (
        <p className="rounded-lg border p-4 text-sm">
          指定した期間・部位に強化予定はありません。
        </p>
      )}
      <div className="space-y-4">
        {visibleWeeks.map((week) => (
          <ScheduleSteps
            key={week}
            week={week}
            start={start}
            input={input}
            events={pageRows.filter((e) => e.week === week)}
          />
        ))}
      </div>
    </section>
  );
}
