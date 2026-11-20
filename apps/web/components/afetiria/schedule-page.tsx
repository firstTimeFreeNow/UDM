"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShareButton } from "@/components/shared-links/share-button";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { LoadingProgress } from "./loading-progress";
import { useSyncPaused } from "./data-provider";
import { weekDays, changeDraft } from "@/lib/afetiria/answer-draft";
import { PushTestForm } from "./push-test-form";
import { NotificationSettings } from "./notification-settings";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  callApiResult,
  remainingTtl,
  type ApiResult,
  type Action,
} from "@/lib/udm-api/client";
import {
  isHistory,
  isSchedule,
  answers,
  type Answer,
  type Schedule,
  type Change,
  type History,
} from "@udm/contracts/afetiria";
import { useSession } from "./service-provider";
import styles from "./afetiria.module.css";

const SELECTED_MEMBER = "udm:afetiria:selected-member";
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(date + "T00:00:00+09:00"));
const slotLabel = (slot: string) => {
  const [date, time] = slot.split(" ");
  return `${dateLabel(date)} ${time}`;
};
function message(error: unknown) {
  return error instanceof ApiError
    ? error.outcomeUnknown
      ? "保存結果を確認できません。入力は残しています。「更新」で反映を確認してください。"
      : error.message
    : "処理を完了できませんでした。接続を確認してください。";
}
type ScheduleResult = ApiResult<Schedule> & { selection: string };
function useSchedule(view: Exclude<View, "history">, memberId: string | null) {
  const isSyncPaused = useSyncPaused();
  const { user } = useSession();
  const { mutate: mutateCache } = useSWRConfig();
  const [saving, setSaving] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pendingWrite = useRef(false);
  const fresh = useRef(false);
  const getToken = useCallback(() => user.getIdToken(), [user]);
  const key =
    memberId === null
      ? null
      : [
          "af.schedule",
          process.env.NEXT_PUBLIC_UDM_API_URL ||
            process.env.NEXT_PUBLIC_AF_API_URL,
          user.uid,
          view,
          memberId,
        ];
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refresh,
  } = useSWR<ScheduleResult>(
    key,
    async () => {
      const force = fresh.current;
      fresh.current = false;
      const payload = { view, memberId: memberId || "", fresh: force };
      let result: ApiResult<Schedule>;
      try {
        result = await callApiResult("af.read", payload, getToken, isSchedule);
      } catch (error) {
        if (
          view !== "answer" ||
          !memberId ||
          !(error instanceof ApiError) ||
          error.code !== "INVALID_REQUEST"
        )
          throw error;
        result = await callApiResult(
          "af.read",
          { ...payload, memberId: "" },
          getToken,
          isSchedule,
        );
      }
      setUncertain(false);
      setWriteError("");
      return { ...result, selection: memberId || "" };
    },
    {
      keepPreviousData: true,
      refreshInterval: (result) =>
        isSyncPaused()
          ? 0
          : Math.max(1000, Math.min(300000, remainingTtl(result))),
    },
  );
  const load = useCallback(
    async (force = true) => {
      if (pendingWrite.current || isSyncPaused()) return;
      fresh.current = force;
      try {
        await refresh();
      } catch {
        /* SWR exposes the error. */
      }
    },
    [refresh, isSyncPaused],
  );
  useEffect(() => {
    const update = () => {
      if (
        document.visibilityState === "visible" &&
        data &&
        remainingTtl(data) <= 0
      )
        void load(false);
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [data, load]);
  async function mutate(action: Action, payload: object) {
    if (pendingWrite.current || uncertain) return false;
    pendingWrite.current = true;
    setSaving(true);
    setWriteError("");
    try {
      await refresh(
        async () => {
          let result: ApiResult<Schedule>;
          if (action === "af.answers.save") {
            const saved = await callApiResult(
              action,
              payload,
              getToken,
              (value): value is { saved: true; state: Schedule } =>
                !!value &&
                typeof value === "object" &&
                (value as { saved: boolean }).saved === true &&
                isSchedule((value as { state: unknown }).state),
            );
            result = { ...saved, data: saved.data.state };
          } else
            result = await callApiResult(action, payload, getToken, isSchedule);
          return { ...result, selection: memberId || "" };
        },
        { revalidate: false, populateCache: true, throwOnError: true },
      );
      await mutateCache(
        (cacheKey) =>
          Array.isArray(cacheKey) &&
          cacheKey[0] === "af.schedule" &&
          JSON.stringify(cacheKey) !== JSON.stringify(key),
        undefined,
        { revalidate: false },
      );
      return true;
    } catch (error) {
      setWriteError(message(error));
      if (error instanceof ApiError && error.outcomeUnknown) setUncertain(true);
      return false;
    } finally {
      pendingWrite.current = false;
      setSaving(false);
    }
  }
  return {
    state: data?.data || null,
    busy:
      saving ||
      isLoading ||
      memberId === null ||
      (view === "answer" && data?.selection !== memberId),
    saving,
    refreshing: isValidating,
    error: writeError || (error ? message(error) : ""),
    uncertain,
    loadedAt: data?.meta?.sourceFetchedAt
      ? new Date(data.meta.sourceFetchedAt)
      : null,
    load,
    mutate,
  };
}
function PageToolbar({
  children,
  busy,
  refreshing,
  onRefresh,
  share = true,
}: {
  children?: ReactNode;
  busy: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  share?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useSession();
  return (
    <div className={styles.toolbar}>
      <div className={styles.weekLabel}>{children}</div>
      <button
        className={styles.refreshButton}
        type="button"
        disabled={busy}
        aria-busy={refreshing}
        onClick={onRefresh}
      >
        {refreshing ? "更新中…" : "更新"}
      </button>
      {share && (
        <ShareButton
          key={pathname}
          path={pathname.startsWith("/UDM/") ? pathname : `/UDM${pathname}`}
          getToken={() => user.getIdToken()}
        />
      )}
      <div className={styles.toolbarProgress}>
        {refreshing && <LoadingProgress label="予定を更新中…" compact />}
      </div>
    </div>
  );
}
function CheckedAt({ value, label }: { value: Date | null; label: string }) {
  if (!value || !Number.isFinite(value.getTime())) return null;
  return (
    <div className={styles.checkedAt}>
      <span>{label}</span>
      <time dateTime={value.toISOString()}>
        {new Intl.DateTimeFormat("ja-JP", {
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: "Asia/Tokyo",
        }).format(value)}
      </time>
    </div>
  );
}
type View = "schedule" | "answer" | "admin" | "history";
export function SchedulePage({ view }: { view: View }) {
  if (view === "history") return <HistoryPage />;
  return <CurrentWeek view={view} />;
}
function CurrentWeek({ view }: { view: Exclude<View, "history"> }) {
  const [memberId, setMemberId] = useState<string | null>(
    view === "answer" ? null : "",
  );
  useEffect(() => {
    if (view !== "answer") return;
    try {
      setMemberId(localStorage.getItem(SELECTED_MEMBER) || "");
    } catch {
      setMemberId("");
    }
  }, [view]);
  const schedule = useSchedule(view, memberId);
  const { role } = useSession();
  const { state, busy, error, loadedAt, load } = schedule;
  const isSyncPaused = useSyncPaused();
  const [manualRefresh, setManualRefresh] = useState(false);
  async function refreshPage() {
    if (manualRefresh || isSyncPaused()) return;
    setManualRefresh(true);
    try {
      await load();
    } finally {
      setManualRefresh(false);
    }
  }
  if (view === "admin" && role !== "admin")
    return (
      <>
        <h1>管理</h1>
        <p role="alert">管理者アカウントでログインしてください。</p>
      </>
    );
  return (
    <>
      <h1 className={styles.visuallyHidden}>
        {view === "answer"
          ? "参加回答"
          : view === "admin"
            ? "日程とメンバーの管理"
            : "開催状況"}
      </h1>
      <PageToolbar
        busy={busy || manualRefresh || isSyncPaused()}
        refreshing={manualRefresh}
        onRefresh={() => void refreshPage()}
        share={view !== "admin"}
      >
        {state &&
          `${dateLabel(state.weekId)}〜${dateLabel(weekDays(state.weekId)[6])}`}
      </PageToolbar>
      {!state && !error && (
        <LoadingProgress label="予定を読み込み中…" initial />
      )}
      {error && (
        <p role="alert" className={`${styles.notice} ${styles.error}`}>
          {error}
        </p>
      )}
      {state && (
        <>
          <Confirmation state={state} />
          {view === "schedule" && (
            <>
              <Overview state={state} />
              <NotificationSettings />
            </>
          )}
          {view === "answer" && (
            <AnswerForm
              {...schedule}
              state={state}
              onMemberSelect={setMemberId}
            />
          )}
          {view === "admin" && <Admin {...schedule} state={state} />}
          <CheckedAt
            value={loadedAt}
            label={
              view === "answer"
                ? "予定・回答の確認時刻"
                : view === "admin"
                  ? "日程・メンバーの確認時刻"
                  : "開催状況の確認時刻"
            }
          />
        </>
      )}
    </>
  );
}
function Confirmation({ state }: { state: Schedule }) {
  if (!state.confirmed)
    return <p className={styles.notice}>開催日時はまだ確定していません。</p>;
  const eligible = state.slots.some(
    (slot) => slot.key === state.confirmed && slot.judgment === "開催可能",
  );
  return (
    <section className={styles.notice}>
      <div className={styles.confirmation}>
        <span>開催確定</span>
        <strong>{slotLabel(state.confirmed)}</strong>
      </div>
      {!eligible && (
        <p role="alert" className={styles.error}>
          回答の変更により開催条件を満たしていません。管理者が確認してください。
        </p>
      )}
    </section>
  );
}
function Overview({ state }: { state: Schedule }) {
  const candidates = state.slots
    .filter((slot) => slot.judgment === "開催可能")
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return (
    <>
      <section className={styles.card}>
        <h2>開催できる候補</h2>
        <p className={styles.muted}>
          必須メンバー全員が○で、○が{state.minParticipants}〜
          {state.maxParticipants}人の日時です。△は人数に含めません。
        </p>
        {candidates.length ? (
          <ul className={styles.list}>
            {candidates.map((slot) => (
              <li key={slot.key}>
                <strong>{slotLabel(slot.key)}</strong>
                <span>○ {slot.count}人</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>開催できる候補はありません。</p>
        )}
      </section>
      <p className={styles.answerLink}>
        <Link href="/afetiria-extra/answer/">参加できる日時を回答する →</Link>
      </p>
    </>
  );
}
function AnswerForm({
  state,
  busy,
  saving,
  uncertain,
  mutate,
  onMemberSelect,
}: ReturnType<typeof useSchedule> & {
  state: Schedule;
  onMemberSelect: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Record<string, Change>>({});
  const [draftWeek, setDraftWeek] = useState(state.weekId);
  const [notice, setNotice] = useState("");
  const [display, setDisplay] = useState<"day" | "all">("day");
  const [activeDay, setActiveDay] = useState("");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const initialized = useRef(false);
  const changes = Object.values(draft);
  const member = state.members.find((member) => member.id === selected);
  const weekChanged = changes.length > 0 && draftWeek !== state.weekId;
  const conflicts = changes.filter((change) => {
    const current = state.answers[selected]?.[change.slot] || "";
    return current !== change.before && current !== change.answer;
  });
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const id = localStorage.getItem(SELECTED_MEMBER);
      if (state.members.some((member) => member.id === id)) {
        setSelected(id!);
        onMemberSelect(id!);
      }
    } catch {
      /* Selection still works when browser storage is unavailable. */
    }
  }, [state.members, onMemberSelect]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (changes.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const links = (event: MouseEvent) => {
      if (!changes.length || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (link && !confirm("未保存の回答があります。破棄して移動しますか？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", links, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", links, true);
    };
  }, [changes.length]);
  function selectMember(id: string) {
    if (
      changes.length &&
      !confirm("未保存の回答を破棄してメンバーを切り替えますか？")
    )
      return;
    setSelected(id);
    onMemberSelect(id);
    setDraft({});
    setDraftWeek(state.weekId);
    setNotice("");
    try {
      if (id) localStorage.setItem(SELECTED_MEMBER, id);
      else localStorage.removeItem(SELECTED_MEMBER);
    } catch {
      /* Optional persistence. */
    }
  }
  function change(slot: string, answer: Answer) {
    setNotice("");
    if (!changes.length) setDraftWeek(state.weekId);
    setDraft((previous) =>
      changeDraft(
        previous,
        slot,
        answer,
        state.answers[selected]?.[slot] ?? "",
      ),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!member || !changes.length || weekChanged || busy || uncertain) return;
    if (
      await mutate("af.answers.save", {
        weekId: draftWeek,
        memberId: selected,
        changes,
      })
    ) {
      setDraft({});
      setNotice("回答を保存しました。");
    }
  }
  const days = weekDays(state.weekId);
  const dayIndex = Math.max(0, days.indexOf(activeDay));
  const shownDays = display === "all" ? days : [days[dayIndex]];
  function moveDay(delta: number) {
    setActiveDay(
      days[Math.max(0, Math.min(days.length - 1, dayIndex + delta))],
    );
  }
  const dayTabsRef = useRef<HTMLDivElement>(null);
  const answerDaysRef = useRef<HTMLDivElement>(null);
  const previousDay = useRef(days[dayIndex]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const tabs = dayTabsRef.current;
    if (!tabs) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const button = tabs.querySelector<HTMLButtonElement>(
        '[aria-pressed="true"]',
      );
      if (button?.offsetWidth)
        setIndicator((previous) =>
          previous.left === button.offsetLeft &&
          previous.width === button.offsetWidth
            ? previous
            : { left: button.offsetLeft, width: button.offsetWidth },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [display, dayIndex, state.weekId, member?.id]);
  useEffect(() => {
    const oldDay = previousDay.current;
    previousDay.current = days[dayIndex];
    const element = answerDaysRef.current;
    if (
      !element ||
      oldDay === days[dayIndex] ||
      display !== "day" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const direction = days[dayIndex] > oldDay ? 1 : -1;
    const animation = element.animate(
      [
        { opacity: 0.75, transform: `translateX(${direction * 6}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 140, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    return () => animation.cancel();
  }, [days[dayIndex], display]);
  return (
    <form onSubmit={save}>
      <div className={styles.answerPanel}>
        <div className={styles.answerPanelHeader}>
          <div className={styles.memberToolbar}>
            <div className={styles.memberSelect}>
              <label htmlFor="af-member">回答するメンバー</label>
              <select
                id="af-member"
                value={member ? selected : ""}
                disabled={busy}
                onChange={(event) => selectMember(event.target.value)}
              >
                <option value="">名前を選択してください</option>
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
            {member && (
              <div
                className={styles.viewToggle}
                role="group"
                aria-label="回答画面の表示"
              >
                <button
                  type="button"
                  aria-pressed={display === "day"}
                  onClick={() => setDisplay("day")}
                >
                  1日ずつ
                </button>
                <button
                  type="button"
                  aria-pressed={display === "all"}
                  onClick={() => setDisplay("all")}
                >
                  一覧
                </button>
              </div>
            )}
          </div>
          {changes.length > 0 && (!member || weekChanged) && (
            <div className={styles.notice} role="alert">
              <p>
                対象週またはメンバーが変更されました。未保存の回答は保存できません。
              </p>
              <button
                type="button"
                onClick={() => {
                  setDraft({});
                  setDraftWeek(state.weekId);
                }}
              >
                未保存の回答を破棄
              </button>
            </div>
          )}
          {conflicts.length > 0 && !weekChanged && (
            <p role="alert" className={styles.error}>
              同じ日時の回答が更新されています。変更を破棄して最新の回答を確認してください。
            </p>
          )}
          {member && (
            <>
              <div className={styles.answerToolbar}>
                <div className={styles.legend}>
                  <span>
                    <b>○</b>参加可能
                  </span>
                  <span>
                    <b>△</b>未定
                  </span>
                  <span>
                    <b>×</b>参加不可
                  </span>
                </div>
                {display === "day" && (
                  <div className={styles.dayNavigation}>
                    <button
                      type="button"
                      disabled={dayIndex === 0}
                      onClick={() => moveDay(-1)}
                    >
                      前日
                    </button>
                    <span className={styles.dayPosition}>
                      {dayIndex + 1} / {days.length}日
                    </span>
                    <select
                      className={styles.mobileDaySelect}
                      aria-label="回答する日付"
                      value={days[dayIndex]}
                      onChange={(event) => setActiveDay(event.target.value)}
                    >
                      {days.map((day) => (
                        <option key={day} value={day}>
                          {dateLabel(day)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={dayIndex === days.length - 1}
                      onClick={() => moveDay(1)}
                    >
                      翌日
                    </button>
                  </div>
                )}
              </div>
              {display === "day" && (
                <div
                  ref={dayTabsRef}
                  className={styles.dayTabs}
                  role="group"
                  aria-label="回答する日付"
                >
                  <span
                    className={styles.dayIndicator}
                    aria-hidden="true"
                    style={{
                      width: indicator.width,
                      transform: `translateX(${indicator.left}px)`,
                    }}
                  />
                  {days.map((day) => (
                    <button
                      type="button"
                      key={day}
                      aria-label={dateLabel(day)}
                      aria-pressed={day === days[dayIndex]}
                      onClick={() => setActiveDay(day)}
                    >
                      <span className={styles.dateNumber}>
                        {Number(day.slice(5, 7))}/{Number(day.slice(8))}
                      </span>
                      <span className={styles.weekday}>
                        {new Intl.DateTimeFormat("ja-JP", {
                          weekday: "short",
                          timeZone: "Asia/Tokyo",
                        }).format(new Date(day + "T00:00:00+09:00"))}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {member && (
          <div ref={answerDaysRef}>
            {shownDays.map((day) => (
              <section
                key={day}
                className={styles.day}
                aria-label={dateLabel(day)}
                onTouchStart={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest("button,input,select")
                  ) {
                    touch.current = null;
                    return;
                  }
                  touch.current = {
                    x: event.changedTouches[0].clientX,
                    y: event.changedTouches[0].clientY,
                  };
                }}
                onTouchEnd={(event) => {
                  const start = touch.current;
                  touch.current = null;
                  if (display !== "day" || !start) return;
                  const dx = event.changedTouches[0].clientX - start.x,
                    dy = event.changedTouches[0].clientY - start.y;
                  if (Math.abs(dx) > 60 && Math.abs(dy) < 40)
                    moveDay(dx < 0 ? 1 : -1);
                }}
              >
                <h2>{dateLabel(day)}</h2>
                {!state.slots.some((slot) => slot.date === day) && (
                  <p className={styles.emptyDay}>この日の候補はありません。</p>
                )}
                {state.slots
                  .filter((slot) => slot.date === day)
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((slot) => {
                    const answer =
                      draft[slot.key]?.answer ??
                      state.answers[selected]?.[slot.key] ??
                      "";
                    return (
                      <div
                        key={slot.key}
                        className={`${styles.answerRow} ${draft[slot.key] ? styles.dirty : ""}`}
                      >
                        <div className={styles.rowCaption}>
                          <strong className={styles.answerTime}>
                            {slot.time}
                          </strong>
                          <small>
                            ○ {slot.count}人 · {slot.judgment}
                            {state.confirmed === slot.key ? " · 開催確定" : ""}
                          </small>
                        </div>
                        <div
                          className={styles.choices}
                          role="group"
                          aria-label={`${dateLabel(day)} ${slot.time}の回答`}
                        >
                          {answers.map((value) => (
                            <button
                              type="button"
                              key={value || "empty"}
                              className={value ? undefined : styles.emptyChoice}
                              disabled={busy || weekChanged}
                              aria-label={
                                {
                                  "○": "参加可能",
                                  "△": "未定",
                                  "×": "参加不可",
                                  "": "未回答",
                                }[value]
                              }
                              aria-pressed={answer === value}
                              onClick={() => change(slot.key, value)}
                            >
                              {value || "未回答"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </section>
            ))}
          </div>
        )}
      </div>
      {member && (
        <>
          {display === "day" && dayIndex < days.length - 1 && (
            <div className={styles.nextDay}>
              <button type="button" onClick={() => moveDay(1)}>
                翌日の回答へ →
              </button>
            </div>
          )}
          <div className={styles.saveBar}>
            <span
              role="status"
              className={`${styles.saveStatus} ${changes.length ? styles.dirtyText : ""}`}
            >
              {saving
                ? "回答を保存しています…"
                : notice ||
                  (changes.length
                    ? `未保存 ${changes.length}件`
                    : "未保存の変更はありません")}
            </span>
            <div className={styles.saveActions}>
              {changes.length > 0 && (
                <button
                  className={styles.discard}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("未保存の回答を破棄しますか？")) {
                      setDraft({});
                      setNotice("");
                    }
                  }}
                >
                  変更を破棄
                </button>
              )}
              <button
                className={styles.primary}
                type="submit"
                aria-busy={saving}
                disabled={
                  busy ||
                  !changes.length ||
                  weekChanged ||
                  uncertain ||
                  conflicts.length > 0
                }
              >
                {saving ? "保存中…" : "回答を保存"}
              </button>
            </div>
          </div>
        </>
      )}
    </form>
  );
}

function Admin({
  state,
  busy,
  uncertain,
  mutate,
}: ReturnType<typeof useSchedule> & { state: Schedule }) {
  const [name, setName] = useState("");
  const [required, setRequired] = useState(false);
  const [date, setDate] = useState(state.weekId);
  const [time, setTime] = useState("21:30");
  const disabled = busy || uncertain;
  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (
      await mutate("af.members.add", { weekId: state.weekId, name, required })
    ) {
      setName("");
      setRequired(false);
    }
  }
  async function addSlot(event: FormEvent) {
    event.preventDefault();
    await mutate("af.candidates.add", { weekId: state.weekId, date, time });
  }
  const candidates = state.slots
    .filter((slot) => slot.judgment === "開催可能")
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return (
    <>
      <section className={styles.card}>
        <h2>開催日時を確定</h2>
        {!candidates.length ? (
          <p>開催条件を満たす候補はありません。</p>
        ) : (
          <ul className={styles.list}>
            {candidates.map((slot) => (
              <li key={slot.key}>
                <span>
                  {slotLabel(slot.key)} · ○ {slot.count}人
                </span>
                <button
                  type="button"
                  disabled={disabled || slot.key === state.confirmed}
                  onClick={() => {
                    if (confirm(`${slotLabel(slot.key)}で開催を確定しますか？`))
                      void mutate("af.confirm", {
                        weekId: state.weekId,
                        slot: slot.key,
                        before: state.confirmed,
                      });
                  }}
                >
                  {slot.key === state.confirmed ? "確定済み" : "この日時で確定"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <PushTestForm />
      <section className={styles.card}>
        <h2>メンバー</h2>
        <ul className={styles.list}>
          {state.members.map((member) => (
            <li key={member.id}>
              <span>{member.name}</span>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={member.required}
                  disabled={disabled}
                  onChange={(event) =>
                    void mutate("af.members.required", {
                      weekId: state.weekId,
                      memberId: member.id,
                      before: member.required,
                      required: event.target.checked,
                    })
                  }
                />
                必須メンバー
              </label>
            </li>
          ))}
        </ul>
        <form className={styles.formGrid} onSubmit={addMember}>
          <div>
            <label htmlFor="af-new-member">メンバー名</label>
            <input
              id="af-new-member"
              value={name}
              maxLength={80}
              required
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className={styles.inline}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={required}
                disabled={disabled}
                onChange={(event) => setRequired(event.target.checked)}
              />
              必須メンバー
            </label>
          </div>
          <button type="submit" disabled={disabled || !name.trim()}>
            追加
          </button>
        </form>
        <p className={styles.muted}>登録メンバー：{state.members.length}人</p>
      </section>
      <section className={styles.card}>
        <h2>候補日時</h2>
        <form className={styles.formGrid} onSubmit={addSlot}>
          <div>
            <label htmlFor="af-date">候補日</label>
            <input
              id="af-date"
              type="date"
              value={date}
              required
              disabled={disabled}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="af-time">開始時刻（30分刻み）</label>
            <input
              id="af-time"
              type="time"
              step={1800}
              value={time}
              required
              disabled={disabled}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <button type="submit" disabled={disabled}>
            候補を追加
          </button>
        </form>
        <ul className={styles.list}>
          {[...state.slots]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((slot) => (
              <li key={slot.key}>
                <span>{slotLabel(slot.key)}</span>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    state.confirmed === slot.key ||
                    slot.hasAnswers ||
                    Object.values(state.answers).some(
                      (answers) => answers[slot.key],
                    )
                  }
                  onClick={() => {
                    if (confirm(`${slotLabel(slot.key)}を削除しますか？`))
                      void mutate("af.candidates.remove", {
                        weekId: state.weekId,
                        slot: slot.key,
                      });
                  }}
                >
                  削除
                </button>
              </li>
            ))}
        </ul>
        <p className={styles.muted}>
          回答がある候補と開催確定済みの候補は削除できません。
        </p>
      </section>
    </>
  );
}
function HistoryPage() {
  const isSyncPaused = useSyncPaused();
  const { user } = useSession();
  const {
    data,
    size,
    setSize,
    error,
    isValidating,
    mutate: refreshHistory,
  } = useSWRInfinite<ApiResult<History>>(
    (index, previous) =>
      previous?.data.nextOffset === null
        ? null
        : [
            "af.history",
            process.env.NEXT_PUBLIC_UDM_API_URL ||
              process.env.NEXT_PUBLIC_AF_API_URL,
            user.uid,
            index === 0 ? 0 : previous!.data.nextOffset,
          ],
    async (key) =>
      callApiResult(
        "af.history",
        { offset: key[3] },
        () => user.getIdToken(),
        isHistory,
      ),
    {
      revalidateFirstPage: false,
      revalidateAll: true,
      refreshInterval: (pages) =>
        isSyncPaused()
          ? 0
          : Math.max(1000, Math.min(300000, remainingTtl(pages?.[0]))),
    },
  );
  const items = data?.flatMap((page) => page.data.items) || [];
  const next = data?.at(-1)?.data.nextOffset;
  const [manualRefresh, setManualRefresh] = useState(false);
  async function refreshPage() {
    if (manualRefresh || isSyncPaused()) return;
    setManualRefresh(true);
    try {
      await refreshHistory();
    } catch {
      /* SWR exposes the error. */
    } finally {
      setManualRefresh(false);
    }
  }
  const checkedAt =
    data?.length && data.every((page) => page.meta?.sourceFetchedAt)
      ? new Date(Math.min(...data.map((page) => page.meta!.sourceFetchedAt)))
      : null;
  return (
    <>
      <h1 className={styles.visuallyHidden}>開催履歴</h1>
      <PageToolbar
        busy={isValidating || isSyncPaused()}
        refreshing={manualRefresh}
        onRefresh={() => void refreshPage()}
      />
      {isValidating && !data && (
        <LoadingProgress label="履歴を読み込み中…" initial={!data} />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {message(error)}
        </p>
      )}
      <div className={styles.historyContainer}>
        <table className={styles.historyTable}>
          <thead>
            <tr>
              <th scope="col">対象週</th>
              <th scope="col">開催日時</th>
              <th scope="col">結果</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.weekId}>
                <td>{dateLabel(item.weekId)}〜</td>
                <td>{item.confirmed ? slotLabel(item.confirmed) : "—"}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isValidating && !error && !items.length && (
        <p>開催履歴はありません。</p>
      )}
      {next != null && (
        <button
          type="button"
          disabled={isValidating}
          onClick={() => void setSize(size + 1)}
        >
          以前の履歴を表示
        </button>
      )}
      {error && (
        <button type="button" onClick={() => void refreshPage()}>
          再読み込み
        </button>
      )}
      <CheckedAt value={checkedAt} label="履歴の確認時刻" />
    </>
  );
}
