import { useEffect, useState } from "react";
import {
  japanToday,
  calendarDate,
  calendarDuration,
} from "@/lib/planner/calendar";
export function usePlanningDate() {
  const [start, setStart] = useState<string | null>(null);
  useEffect(() => {
    setStart(japanToday());
    const timer = setInterval(() => setStart(japanToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  return start;
}
export function CompletionTime({
  week,
  compact = false,
  zeroLabel,
}: {
  week: number | null;
  compact?: boolean;
  zeroLabel?: string;
}) {
  const start = usePlanningDate();
  if (week === null) return <span className="text-sm">資金・収入を確認</span>;
  if (!start) return null;
  return (
    <span className={compact ? "inline-flex flex-wrap gap-x-2" : "block"}>
      <span className={compact ? "" : "text-2xl font-semibold text-foreground"}>
        {week === 0 && zeroLabel ? zeroLabel : calendarDuration(start, week)}
      </span>
      <span
        className={
          compact
            ? "font-normal"
            : "mt-1 block text-xs font-normal text-muted-foreground"
        }
      >
        {calendarDate(start, week)}
        {week > 0 ? `（${week.toLocaleString("ja-JP")}週目）` : ""}
      </span>
    </span>
  );
}
