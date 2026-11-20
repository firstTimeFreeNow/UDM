"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SWRConfig } from "swr";
import styles from "./afetiria.module.css";
import { createIdleSync } from "@/lib/afetiria/idle-sync";
const SyncPaused = createContext<() => boolean>(() => false);
export const useSyncPaused = () => useContext(SyncPaused);
export function DataProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new Map());
  const [idle] = useState(() => createIdleSync());
  const [stopped, setStopped] = useState(false);
  const notified = useRef(false);
  const isPaused = useCallback(() => {
    const paused = idle.isPaused();
    if (paused && !notified.current) {
      notified.current = true;
      queueMicrotask(() => setStopped(true));
    }
    return paused;
  }, [idle]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      if (!isPaused()) timer = setTimeout(check, idle.remaining());
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      idle.activity();
      check();
    };
    const events = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "touchstart",
    ];
    events.forEach((name) =>
      document.addEventListener(name, activity, {
        passive: true,
        capture: true,
      }),
    );
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      clearTimeout(timer);
      events.forEach((name) =>
        document.removeEventListener(name, activity, true),
      );
      document.removeEventListener("visibilitychange", check);
    };
  }, [idle, isPaused]);
  return (
    <SyncPaused.Provider value={isPaused}>
      <SWRConfig
        value={{
          isPaused,
          provider: () => cache,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
          revalidateIfStale: false,
          dedupingInterval: 1000,
          errorRetryInterval: 30000,
          errorRetryCount: 2,
          refreshWhenHidden: false,
          refreshWhenOffline: false,
        }}
      >
        {stopped && (
          <p className={styles.notice} role="status">
            長時間操作がないため同期を停止しています。再開するには再読み込みしてください
          </p>
        )}
        {children}
      </SWRConfig>
    </SyncPaused.Provider>
  );
}
