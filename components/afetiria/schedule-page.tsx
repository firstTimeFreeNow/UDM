"use client";

import Link from "next/link";
import { PushTestForm } from "./push-test-form";
import { NotificationSettings } from "./notification-settings";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, callApi, type Action } from "@/lib/udm-api/client";
import { isHistory, isSchedule, answers, type Answer, type Schedule, type Change, type History } from "@/lib/afetiria/types";
import { useSession } from "./service-provider";
import styles from "./service.module.css";

const SELECTED_MEMBER = "udm:afetiria:selected-member";
const dateLabel = (date: string) => new Intl.DateTimeFormat("ja-JP", {month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo"}).format(new Date(date + "T00:00:00+09:00"));
const slotLabel = (slot: string) => { const [date, time] = slot.split(" "); return `${dateLabel(date)} ${time}`; };
function message(error: unknown) {
  return error instanceof ApiError ? error.outcomeUnknown ?
    "保存結果を確認できません。入力内容は残っています。再送する前に最新の予定を取得してください。" : error.message : "処理を完了できませんでした。接続を確認してください。";
}
function useSchedule() {
  const { user } = useSession();
  const [state, setState] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const lastLoad = useRef(0);
  const getToken = useCallback(() => user.getIdToken(), [user]);
  const load = useCallback(async (force = true) => {
    if (pending.current || (!force && Date.now() - lastLoad.current < 5000)) return;
    const current = ++generation.current;
    pending.current = true; setBusy(true);
    try {
      const data = await callApi("af.read", {}, getToken, isSchedule);
      if (current === generation.current) { setState(data); setUncertain(false); setError(""); setLoadedAt(new Date()); lastLoad.current = Date.now(); }
    } catch (error) { if (current === generation.current) setError(message(error)); }
    finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  }, [getToken]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(false); };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { generation.current++; pending.current = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  useEffect(() => {
    if (state === null && !busy && !error) void load();
  }, [state, busy, error, load]);
  async function mutate(action: Action, payload: object) {
    if (pending.current || uncertain) return false;
    const current = ++generation.current;
    pending.current = true; setBusy(true); setError("");
    try {
      let result: Schedule;
      if (action === "af.answers.save") {
        const saved = await callApi(action, payload, getToken, (data): data is {saved: true; state: Schedule} =>
          !!data && typeof data === "object" && (data as {saved: boolean}).saved === true && isSchedule((data as {state: unknown}).state));
        result = saved.state;
      } else result = await callApi(action, payload, getToken, isSchedule);
      if (current !== generation.current) return false;
      setState(result); setLoadedAt(new Date()); lastLoad.current = Date.now(); return true;
    } catch (error) {
      if (current === generation.current) { setError(message(error)); if (error instanceof ApiError && error.outcomeUnknown) setUncertain(true); }
      return false;
    } finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  }
  return {state, busy, error, uncertain, loadedAt, load, mutate};
}
type View = "schedule" | "answer" | "admin" | "history";
export function SchedulePage({ view }: {view: View}) {
  if (view === "history") return <HistoryPage/>;
  return <CurrentWeek view={view}/>;
}
function CurrentWeek({view}: {view: Exclude<View, "history">}) {
  const schedule = useSchedule();
  const { role } = useSession();
  const { state, busy, error, loadedAt, load } = schedule;
  if (view === "admin" && role !== "admin") return <><h1>管理</h1><p role="alert">管理者アカウントでログインしてください。</p></>;
  return <>
    <div className={styles.toolbar}><div><h1>{view === "answer" ? "参加回答" : view === "admin" ? "日程とメンバーの管理" : "開催状況"}</h1>
      <p>{state ? `${dateLabel(state.weekId)}からの予定` : "予定を読み込んでいます…"}</p></div>
      <div><button type="button" disabled={busy} onClick={() => void load()}>最新の予定を取得</button>
        {loadedAt && <div className={styles.muted}>取得 {loadedAt.toLocaleTimeString("ja-JP", {hour: "2-digit", minute: "2-digit"})}</div>}</div></div>
    {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}
    {state && <>
      <Confirmation state={state}/>
      {view === "schedule" && <><Overview state={state}/><NotificationSettings/></>}
      {view === "answer" && <AnswerForm {...schedule} state={state}/>}
      {view === "admin" && <Admin {...schedule} state={state}/>}
    </>}
  </>;
}
function Confirmation({state}: {state: Schedule}) {
  if (!state.confirmed) return <p className={styles.notice}>開催日時はまだ確定していません。</p>;
  const eligible = state.slots.some(slot => slot.key === state.confirmed && slot.judgment === "開催可能");
  return <section className={styles.notice}><h2>開催確定：{slotLabel(state.confirmed)}</h2>
    <p>確定後も参加回答を変更できます。</p>
    {!eligible && <p role="alert" className={styles.error}>回答の変更により開催条件を満たしていません。管理者が確認してください。</p>}
  </section>;
}
function Overview({state}: {state: Schedule}) {
  const candidates = state.slots.filter(slot => slot.judgment === "開催可能").sort((a,b) => b.count - a.count || a.key.localeCompare(b.key));
  return <>
    <section className={styles.card}><h2>開催できる候補</h2>
      <p className={styles.muted}>必須メンバー全員が○、○が{state.minParticipants}〜{state.maxParticipants}人の日時です。△は人数に含めません。</p>
      {candidates.length ? <ul className={styles.list}>{candidates.map(slot => <li key={slot.key}><strong>{slotLabel(slot.key)}</strong><span>○ {slot.count}人</span></li>)}</ul> :
        <p>現在、開催条件を満たす候補はありません。</p>}
    </section>
    <p><Link href="/afetiria-extra/answer/">参加できる日時を回答する</Link></p>
  </>;
}
function AnswerForm({state, busy, uncertain, mutate}: ReturnType<typeof useSchedule> & {state: Schedule}) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Record<string, Change>>({});
  const [draftWeek, setDraftWeek] = useState(state.weekId);
  const [notice, setNotice] = useState("");
  const initialized = useRef(false);
  const changes = Object.values(draft);
  const member = state.members.find(member => member.id === selected);
  const weekChanged = changes.length > 0 && draftWeek !== state.weekId;
  const conflicts = changes.filter(change => {
    const current = state.answers[selected]?.[change.slot] || "";
    return current !== change.before && current !== change.answer;
  });
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try { const id = localStorage.getItem(SELECTED_MEMBER); if (state.members.some(member => member.id === id)) setSelected(id!); }
    catch { /* Selection still works when browser storage is unavailable. */ }
  }, [state.members]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (changes.length) { event.preventDefault(); event.returnValue = ""; } };
    const links = (event: MouseEvent) => {
      if (!changes.length || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (link && !confirm("未保存の回答があります。破棄して移動しますか？")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", warn); document.addEventListener("click", links, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", links, true); };
  }, [changes.length]);
  function selectMember(id: string) {
    if (changes.length && !confirm("未保存の回答を破棄してメンバーを切り替えますか？")) return;
    setSelected(id); setDraft({}); setDraftWeek(state.weekId); setNotice("");
    try { if (id) localStorage.setItem(SELECTED_MEMBER, id); else localStorage.removeItem(SELECTED_MEMBER); } catch { /* Optional persistence. */ }
  }
  function change(slot: string, answer: Answer) {
    setNotice("");
    if (!changes.length) setDraftWeek(state.weekId);
    setDraft(previous => {
      const before = previous[slot]?.before ?? state.answers[selected]?.[slot] ?? "";
      const next = {...previous};
      if (before === answer) delete next[slot]; else next[slot] = {slot, before, answer};
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!member || !changes.length || weekChanged || busy || uncertain) return;
    if (await mutate("af.answers.save", {weekId: draftWeek, memberId: selected, changes})) { setDraft({}); setNotice("回答を保存しました。"); }
  }
  const days = [...new Set(state.slots.map(slot => slot.date))].sort();
  return <form onSubmit={save}>
    <div className={styles.memberSelect}><label htmlFor="af-member">回答するメンバー</label>
      <select id="af-member" value={member ? selected : ""} disabled={busy} onChange={event => selectMember(event.target.value)}>
        <option value="">名前を選択してください</option>{state.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select><p className={styles.muted}>次回も同じブラウザーでこの選択を保持します。</p></div>
    {changes.length > 0 && (!member || weekChanged) && <div className={styles.notice} role="alert"><p>対象週またはメンバーが変更されました。未保存の回答は保存できません。</p>
      <button type="button" onClick={() => { setDraft({}); setDraftWeek(state.weekId); }}>未保存の回答を破棄</button></div>}
    {conflicts.length > 0 && !weekChanged && <p role="alert" className={styles.error}>同じ日時の回答が更新されています。変更を破棄して最新の回答を確認してください。</p>}
    {member && <>
      <p>○：参加可能　△：未定　×：参加不可　未回答：選択を解除</p>
      {days.map(day => <section key={day} className={styles.day}><h2>{dateLabel(day)}</h2>
        {state.slots.filter(slot => slot.date === day).sort((a,b) => a.time.localeCompare(b.time)).map(slot => {
          const answer = draft[slot.key]?.answer ?? state.answers[selected]?.[slot.key] ?? "";
          return <div key={slot.key} className={`${styles.answerRow} ${draft[slot.key] ? styles.dirty : ""}`}>
            <div><strong>{slot.time}</strong><small>○ {slot.count}人 · {slot.judgment}{state.confirmed === slot.key ? " · 開催確定" : ""}</small></div>
            <div className={styles.choices} role="group" aria-label={`${dateLabel(day)} ${slot.time}の回答`}>
              {answers.map(value => <button type="button" key={value || "empty"} disabled={busy || weekChanged} aria-pressed={answer === value} onClick={() => change(slot.key, value)}>{value || "未回答"}</button>)}
            </div></div>;
        })}</section>)}
      {!days.length && <p>候補日時はまだ登録されていません。</p>}
      <div className={styles.saveBar}><span role="status">{notice || (changes.length ? `未保存 ${changes.length}件` : "変更はありません")}</span>
        <div className={styles.inline}>{changes.length > 0 && <button type="button" disabled={busy} onClick={() => { if (confirm("未保存の回答を破棄しますか？")) setDraft({}); }}>変更を破棄</button>}
          <button className={styles.primary} type="submit" disabled={busy || !changes.length || weekChanged || uncertain || conflicts.length > 0}>回答を保存</button></div></div>
    </>}
  </form>;
}

function Admin({state, busy, uncertain, mutate}: ReturnType<typeof useSchedule> & {state: Schedule}) {
  const [name, setName] = useState("");
  const [required, setRequired] = useState(false);
  const [date, setDate] = useState(state.weekId);
  const [time, setTime] = useState("21:30");
  const disabled = busy || uncertain;
  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (await mutate("af.members.add", {weekId: state.weekId, name, required})) { setName(""); setRequired(false); }
  }
  async function addSlot(event: FormEvent) {
    event.preventDefault();
    await mutate("af.candidates.add", {weekId: state.weekId, date, time});
  }
  const candidates = state.slots.filter(slot => slot.judgment === "開催可能").sort((a,b) => b.count - a.count || a.key.localeCompare(b.key));
  return <>
    <section className={styles.card}><h2>開催日時を確定</h2>
      {!candidates.length ? <p>開催条件を満たす候補はありません。</p> : <ul className={styles.list}>{candidates.map(slot => <li key={slot.key}>
        <span>{slotLabel(slot.key)} · ○ {slot.count}人</span><button type="button" disabled={disabled || slot.key === state.confirmed} onClick={() => {
          if (confirm(`${slotLabel(slot.key)}で開催を確定しますか？`)) void mutate("af.confirm", {weekId: state.weekId, slot: slot.key, before: state.confirmed});
        }}>{slot.key === state.confirmed ? "確定済み" : "この日時で確定"}</button>
      </li>)}</ul>}
    </section>
    <PushTestForm/>
    <section className={styles.card}><h2>メンバー</h2>
      <ul className={styles.list}>{state.members.map(member => <li key={member.id}><span>{member.name}</span>
        <label className={styles.inline}><input type="checkbox" checked={member.required} disabled={disabled} onChange={event => void mutate("af.members.required", {weekId: state.weekId, memberId: member.id, before: member.required, required: event.target.checked})}/>必須メンバー</label>
      </li>)}</ul>
      <form className={styles.formGrid} onSubmit={addMember}><div><label htmlFor="af-new-member">メンバー名</label><input id="af-new-member" value={name} maxLength={80} required disabled={disabled} onChange={event => setName(event.target.value)}/></div>
        <div className={styles.inline}><label><input type="checkbox" checked={required} disabled={disabled} onChange={event => setRequired(event.target.checked)}/>必須メンバー</label></div>
        <button type="submit" disabled={disabled || !name.trim()}>追加</button></form>
      <p className={styles.muted}>現在 {state.members.length}人。名前の追加・必須条件の設定は管理者が行います。</p>
    </section>
    <section className={styles.card}><h2>候補日時</h2>
      <form className={styles.formGrid} onSubmit={addSlot}><div><label htmlFor="af-date">候補日</label><input id="af-date" type="date" value={date} required disabled={disabled} onChange={event => setDate(event.target.value)}/></div>
        <div><label htmlFor="af-time">開始時刻（30分刻み）</label><input id="af-time" type="time" step={1800} value={time} required disabled={disabled} onChange={event => setTime(event.target.value)}/></div>
        <button type="submit" disabled={disabled}>候補を追加</button></form>
      <ul className={styles.list}>{[...state.slots].sort((a,b) => a.key.localeCompare(b.key)).map(slot => <li key={slot.key}>
        <span>{slotLabel(slot.key)}</span><button type="button" disabled={disabled || state.confirmed === slot.key || Object.values(state.answers).some(answers => answers[slot.key])} onClick={() => {
          if (confirm(`${slotLabel(slot.key)}を削除しますか？`)) void mutate("af.candidates.remove", {weekId: state.weekId, slot: slot.key});
        }}>削除</button></li>)}</ul>
      <p className={styles.muted}>回答がある候補と開催確定済みの候補は削除できません。</p>
    </section>
  </>;
}
function HistoryPage() {
  const {user} = useSession();
  const [history, setHistory] = useState<History>({items: [], nextOffset: null});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError("");
    callApi("af.history", {offset}, () => user.getIdToken(), isHistory).then(result => {
      if (active) setHistory(previous => ({items: offset === 0 ? result.items : [...previous.items, ...result.items], nextOffset: result.nextOffset}));
    }).catch(error => {if (active) setError(message(error));}).finally(() => {if (active) setBusy(false);});
    return () => {active = false;};
  }, [user, offset]);
  return <><h1>開催履歴</h1>{error && <p role="alert" className={styles.error}>{error}</p>}
    <ul className={styles.list}>{history.items.map(item => <li key={item.weekId}><div><strong>{dateLabel(item.weekId)}からの週</strong><div>{item.confirmed ? slotLabel(item.confirmed) : "開催日時なし"}</div></div><span>{item.status}</span></li>)}</ul>
    {busy && <p role="status">履歴を読み込んでいます…</p>}
    {!busy && !error && !history.items.length && <p>開催履歴はまだありません。</p>}
    {history.nextOffset !== null && <button type="button" disabled={busy} onClick={() => setOffset(history.nextOffset!)}>以前の履歴を表示</button>}
  </>;
}
