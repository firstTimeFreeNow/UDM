import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScheduleSettings } from "@/lib/planner/types";
export function ScheduleEditor({
  slots,
  value,
  start,
  busy,
  onApply,
}: {
  slots: string[];
  value: ScheduleSettings | undefined;
  start: string;
  busy: boolean;
  onApply: (settings: ScheduleSettings | undefined) => void;
}) {
  const [draft, setDraft] = useState<ScheduleSettings>(
    value ?? { order: [], startDates: {} },
  );
  const slotKey = slots.join("|");
  useEffect(
    () => setDraft(value ?? { order: [], startDates: {} }),
    [value, slotKey],
  );
  const order = [
    ...draft.order.filter((slot) => slots.includes(slot)),
    ...slots.filter((slot) => !draft.order.includes(slot)),
  ];
  const move = (index: number, delta: number) => {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setDraft({ ...draft, order: next });
  };
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        部位ごとの実施順・開始日を調整
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        開始日の早い部位から進め、同じ開始日は実施順を優先します。部位内のインクリ・エンチャントの順序は保ちます。指定日以降の週に、資金・収入を反映して再計算します。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr>
              {["実施順", "部位", "この日以降に開始", "順序変更"].map(
                (label) => (
                  <th key={label} className="px-2 py-2 font-medium">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {order.map((slot, index) => (
              <tr key={slot} className="border-t">
                <td className="px-2 py-2">{index + 1}</td>
                <th className="px-2 py-2 font-medium">{slot}</th>
                <td className="px-2 py-2">
                  <Input
                    aria-label={`${slot} 開始日`}
                    type="date"
                    min={start}
                    value={draft.startDates[slot] ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      const dates = { ...draft.startDates };
                      if (e.target.value) dates[slot] = e.target.value;
                      else delete dates[slot];
                      setDraft({ ...draft, startDates: dates });
                    }}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`${slot}の実施順を上げる`}
                      disabled={busy || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`${slot}の実施順を下げる`}
                      disabled={busy || index === order.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onApply({ ...draft, order })}
        >
          適用して再計算
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setDraft({ order: [], startDates: {} });
            onApply(undefined);
          }}
        >
          自動スケジュールに戻す
        </Button>
      </div>
    </details>
  );
}
