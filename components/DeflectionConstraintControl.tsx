"use client";

import { useId, useState } from "react";
import type {
  DeflectionConstraintDisplayMode,
  DeflectionConstraintState,
} from "@/lib/engineering/deflectionConstraint";
import {
  requiredSolidClearance,
  utilizationFromClearance,
} from "@/lib/engineering/deflectionConstraint";

const MM_PER_INCH = 25.4;

interface Props {
  value: DeflectionConstraintState;
  workingDeflection?: number;
  onChange: (value: DeflectionConstraintState) => void;
  compact?: boolean;
}

export function DeflectionConstraintControl({ value, workingDeflection, onChange, compact }: Props) {
  const id = useId();
  const [lengthUnit, setLengthUnit] = useState<"in" | "mm">("in");
  const hasReference = Number.isFinite(workingDeflection) && (workingDeflection ?? 0) > 0;
  const clearance = hasReference
    ? requiredSolidClearance(workingDeflection!, value.maxUtilization)
    : NaN;
  const displayedClearance = lengthUnit === "mm" ? clearance * MM_PER_INCH : clearance;

  const setMode = (displayMode: DeflectionConstraintDisplayMode) =>
    onChange({ ...value, displayMode });

  return (
    <div className={compact ? "space-y-2" : "rounded-lg border border-violet-200 bg-violet-50/50 p-3"}>
      <div className="flex overflow-hidden rounded border border-zinc-300 bg-white text-[10.5px]">
        <button
          type="button"
          onClick={() => setMode("utilization")}
          aria-pressed={value.displayMode === "utilization"}
          className={`flex-1 px-2 py-1.5 font-medium ${value.displayMode === "utilization" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          Max deflection utilization %
        </button>
        <button
          type="button"
          onClick={() => setMode("clearance")}
          aria-pressed={value.displayMode === "clearance"}
          className={`flex-1 px-2 py-1.5 font-medium ${value.displayMode === "clearance" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          Clearance above solid
        </button>
      </div>

      {value.displayMode === "utilization" ? (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-[11.5px] text-zinc-700">Maximum working deflection</label>
          <div className="flex items-center gap-1">
            <input
              id={id}
              data-testid="max-deflection-utilization-input"
              type="number"
              min={5}
              max={99}
              step={1}
              value={(value.maxUtilization * 100).toFixed(0)}
              onChange={(e) => {
                const next = Number.parseFloat(e.target.value);
                if (Number.isFinite(next)) onChange({ ...value, maxUtilization: next / 100 });
              }}
              className="w-[72px] rounded border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-[12px]"
            />
            <span className="w-5 text-[10px] text-zinc-500">%</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={id} className="text-[11.5px] text-zinc-700">Equivalent minimum clearance</label>
            <div className="flex items-center gap-1">
              <input
                id={id}
                data-testid="clearance-above-solid-input"
                type="number"
                min={0}
                step={lengthUnit === "in" ? 0.005 : 0.1}
                disabled={!hasReference}
                value={Number.isFinite(displayedClearance) ? displayedClearance.toFixed(lengthUnit === "in" ? 4 : 2) : ""}
                onChange={(e) => {
                  const entered = Number.parseFloat(e.target.value);
                  if (!Number.isFinite(entered) || !hasReference) return;
                  const inches = lengthUnit === "mm" ? entered / MM_PER_INCH : entered;
                  const next = utilizationFromClearance(workingDeflection!, inches);
                  if (Number.isFinite(next)) onChange({ ...value, maxUtilization: next });
                }}
                className="w-[82px] rounded border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-[12px] disabled:bg-zinc-100"
              />
              <div className="flex overflow-hidden rounded border border-zinc-300 bg-white text-[9.5px]">
                {(["in", "mm"] as const).map((unit) => (
                  <button key={unit} type="button" onClick={() => setLengthUnit(unit)} className={`px-1.5 py-1 ${lengthUnit === unit ? "bg-zinc-800 text-white" : "text-zinc-500"}`}>{unit}</button>
                ))}
              </div>
            </div>
          </div>
          {!hasReference && <p className="text-[10px] text-amber-700">A solved spring is required to express this scenario as clearance.</p>}
        </div>
      )}

      <p className="text-[10px] leading-snug text-zinc-500">
        Scenario limit: <span className="font-mono font-semibold text-zinc-700">{(value.maxUtilization * 100).toFixed(1)}%</span>
        {hasReference && Number.isFinite(clearance) ? <> · current spring equivalent: <span className="font-mono font-semibold text-zinc-700">{clearance.toFixed(4)} in / {(clearance * MM_PER_INCH).toFixed(2)} mm</span></> : null}.
        The percentage stays fixed across the landscape; required clearance varies with each candidate&apos;s working deflection.
      </p>
    </div>
  );
}
