import { TablePagination } from "./table-pagination";
import { useEffect, useState } from "react";
import { availableAt } from "@/lib/planner/engine";
import { calendarDate } from "@/lib/planner/calendar";
import { formatMoney } from "@/lib/planner/format-money";
import { usePlanningDate } from "./completion-time";
import type { PlannerInput } from "@/lib/planner/types";
export function FundingTable({
  max,
  input,
}: {
  max: number;
  input: PlannerInput;
}) {
  const start = usePlanningDate(),
    [page, setPage] = useState(0),
    [pageSize, setPageSize] = useState(20);
  useEffect(() => setPage(0), [max, pageSize]);
  const pages = Math.max(1, Math.ceil((max + 1) / pageSize)),
    current = Math.min(page, pages - 1);
  const first = current * pageSize,
    end = Math.min(max, first + pageSize - 1);
  const weeks = Array.from({ length: end - first + 1 }, (_, i) => first + i);
  const funds = (week: number, currency: "seed" | "elso") =>
    availableAt(input[currency], week) +
    input.windfalls
      .filter((w) => w.week <= week)
      .reduce((n, w) => n + w[currency], 0);
  return (
    <div role="region" aria-label="全期間の週別資金表" className="space-y-3">
      <TablePagination
        label="資金表"
        page={current}
        pageSize={pageSize}
        total={max + 1}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-background shadow-sm">
            <tr>
              {["週", "日付", "SEED累計", "ELSO累計"].map((label) => (
                <th className="h-12 px-3 font-medium" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr
                key={week}
                aria-label={`資金 ${week}週目`}
                className={`border-t ${week === max ? "bg-emerald-50 font-semibold" : ""}`}
                style={{ height: 48 }}
              >
                <th className="whitespace-nowrap px-3 font-medium">
                  {week}週目
                  {week === max && (
                    <span className="ml-2 text-emerald-800">完成目安</span>
                  )}
                </th>
                <td className="whitespace-nowrap px-3">
                  {start ? calendarDate(start, week) : ""}
                </td>
                <td className="whitespace-nowrap px-3 tabular-nums">
                  {formatMoney(funds(week, "seed"), "SEED")}
                </td>
                <td className="whitespace-nowrap px-3 tabular-nums">
                  {formatMoney(funds(week, "elso"), "ELSO")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
