export const SYNC_IDLE_MS = 30 * 60 * 1000;

// Check the deadline on requests and activity too: background timers may be delayed.
export function createIdleSync(now: () => number = Date.now) {
  let deadline = now() + SYNC_IDLE_MS;
  let stopped = false;
  return {
    isPaused() {
      stopped ||= now() >= deadline;
      return stopped;
    },
    activity() {
      stopped ||= now() >= deadline;
      if (!stopped) deadline = now() + SYNC_IDLE_MS;
    },
    remaining() {
      return stopped ? 0 : Math.max(0, deadline - now());
    },
  };
}
