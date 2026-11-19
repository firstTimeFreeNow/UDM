import { useState } from "react";
import { Input } from "@/components/ui/input";
import { configuredPlanningCap } from "@/lib/planner/planning-limit";
import type { Gear } from "@/lib/planner/types";
export function PlanningCapField({
  gear,
  onChange,
}: {
  gear: Gear;
  onChange: (g: Gear) => void;
}) {
  const [custom, setCustom] = useState(false);
  const cap = configuredPlanningCap(gear),
    presets = [255, 400, 600, 700],
    value = custom
      ? "custom"
      : cap === null
        ? "none"
        : presets.includes(cap)
          ? String(cap)
          : "custom";
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3">
      <label className="block space-y-2 text-xs font-medium">
        <span>強化案で目指す上限（各能力値）</span>
        <select
          aria-label={`${gear.slot} 強化目標上限`}
          className="planner-select"
          value={value}
          onChange={(e) => {
            setCustom(e.target.value === "custom");
            onChange({
              ...gear,
              planningCap:
                e.target.value === "none"
                  ? null
                  : e.target.value === "custom"
                    ? (cap ?? 255)
                    : Number(e.target.value),
            });
          }}
        >
          <option value="none">装備本来の上限まで</option>
          {presets.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
          <option value="custom">任意の数値</option>
        </select>
      </label>
      {value === "custom" && (
        <Input
          aria-label={`${gear.slot} 任意の強化目標上限`}
          type="number"
          min={0}
          value={cap ?? 255}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n))
              onChange({
                ...gear,
                planningCap: Math.max(0, Math.min(1e14, n)),
              });
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">
        提案する強化の上限です。装備本来の上限と現在値は変更せず、アビリティ等は別枠で加算します。
      </p>
    </div>
  );
}
