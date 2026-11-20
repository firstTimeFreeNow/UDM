"use client";

import Link from "next/link";
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
import styles from "./service.module.css";

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
        isSyncPaused() ? 0 : Math.max(1000, Math.min(300000, remainingTtl(result))),
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
    loadedAt: data ? new Date(data.meta?.sourceFetchedAt || Date.now()) : null,
    load,
    mutate,
  };
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
  if (view === "admin" && role !== "admin")
    return (
      <>
        <h1>管理</h1>
        <p role="alert">管理者アカウントでログインしてください。</p>
      </>
    );
  return (
    <>
      <div className={styles.toolbar}>
        <div>
          <h1>
            {view === "answer"
              ? "参加回答"
              : view === "admin"
                ? "日程とメンバーの管理"
                : "開催状況"}
          </h1>
          <p>{state ? `${dateLabel(state.weekId)}からの予定` : ""}</p>
        </div>
        <div>
          <button type="button" disabled={busy} onClick={() => void load()}>
            更新
          </button>
          {loadedAt && (
            <div className={styles.muted}>
              更新{" "}
              {loadedAt.toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
      </div>
      {(schedule.refreshing || schedule.saving || (!state && !error)) && (
        <LoadingProgress
          label={
            schedule.saving
              ? "保存中…"
              : state
                ? "更新中…"
                : "予定を読み込み中…"
          }
          initial={!state}
        />
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
      <h2>開催確定：{slotLabel(state.confirmed)}</h2>
      <p>確定後も参加回答を変更できます。</p>
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
      <p>
        <Link href="/afetiria-extra/answer/">参加できる日時を回答する</Link>
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
  return (
    <form onSubmit={save}>
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
        <p className={styles.muted}>
          選んだ名前はこのブラウザーに保存されます。
        </p>
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
          <p>○：参加可能　△：未定　×：参加不可　未回答：選択を解除</p>
          <div className={styles.answerToolbar}>
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
            {display === "day" && (
              <div className={styles.dayNavigation}>
                <button
                  type="button"
                  disabled={dayIndex === 0}
                  onClick={() => moveDay(-1)}
                >
                  前日
                </button>
                <span>
                  {dayIndex + 1} / {days.length}日
                </span>
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
              className={styles.dayTabs}
              role="group"
              aria-label="回答する日付"
            >
              {days.map((day) => (
                <button
                  type="button"
                  key={day}
                  aria-pressed={day === days[dayIndex]}
                  onClick={() => setActiveDay(day)}
                >
                  {dateLabel(day)}
                </button>
              ))}
            </div>
          )}
          {shownDays.map((day) => (
            <section
              key={day}
              className={styles.day}
              onTouchStart={(event) => {
                touch.current = {
                  x: event.changedTouches[0].clientX,
                  y: event.changedTouches[0].clientY,
                };
              }}
              onTouchEnd={(event) => {
                const start = touch.current;
                touch.current = null;
                if (display !== "day" || !start) return;
                const dx = event.changedTouches[0].clientX - start.x;
                const dy = event.changedTouches[0].clientY - start.y;
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
                      <div>
                        <strong>{slot.time}</strong>
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
                            disabled={busy || weekChanged}
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
          {display === "day" && dayIndex < days.length - 1 && (
            <div className={styles.nextDay}>
              <button type="button" onClick={() => moveDay(1)}>
                翌日の回答へ
              </button>
            </div>
          )}
          <div className={styles.saveBar}>
            <span role="status">
              {notice ||
                (changes.length
                  ? `未保存 ${changes.length}件`
                  : "未保存の変更はありません")}
            </span>
            <div className={styles.inline}>
              {changes.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("未保存の回答を破棄しますか？")) setDraft({});
                  }}
                >
                  変更を破棄
                </button>
              )}
              <button
                className={styles.primary}
                type="submit"
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
              <label className={styles.inline}>
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
            <label>
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
        isSyncPaused() ? 0 : Math.max(1000, Math.min(300000, remainingTtl(pages?.[0]))),
    },
  );
  const items = data?.flatMap((page) => page.data.items) || [];
  const next = data?.at(-1)?.data.nextOffset;
  return (
    <>
      <h1>開催履歴</h1>
      {isValidating && (
        <LoadingProgress label="履歴を読み込み中…" initial={!data} />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {message(error)}
        </p>
      )}
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.weekId}>
            <div>
              <strong>{dateLabel(item.weekId)}からの週</strong>
              <div>
                {item.confirmed ? slotLabel(item.confirmed) : "開催日時なし"}
              </div>
            </div>
            <span>{item.status}</span>
          </li>
        ))}
      </ul>
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
        <button type="button" onClick={() => void refreshHistory()}>
          再読み込み
        </button>
      )}
    </>
  );
}
