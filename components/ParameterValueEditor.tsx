"use client";

import { useState } from "react";
import { CommitNumberInput } from "@/components/CommitNumberInput";
import type { ModelState, ParameterDefinition, ParameterState } from "@/lib/engineering/types";

/**
 * Reusable numeric editing controls for a single parameter: value input,
 * optional in/mm toggle for length fields, D/OD/ID edit-mode selector for the
 * diameter family, and a slider. Extracted so both the Engineering and
 * Overview inspectors share ONE editing implementation. It never computes
 * engineering values — it only forwards edits via `onValueChange`.
 */
export function ParameterValueEditor({
  def,
  state,
  value,
  model,
  onValueChange,
  onSetDiameterMode,
}: {
  def: ParameterDefinition;
  state: ParameterState;
  value: number | undefined;
  model: ModelState;
  onValueChange: (id: string, value: number) => void;
  onSetDiameterMode: (id: "D" | "OD" | "ID") => void;
}) {
  const [lengthUnit, setLengthUnit] = useState<"in" | "mm">("in");

  const editable = state.status !== "derived";

  const commit = (text: string) => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      const nextIn = lengthUnit === "in" ? parsed : parsed / 25.4;
      onValueChange(def.id, nextIn);
    }
  };

  const isLengthField = def.unit === "in";
  const isDiameterField = ["D", "OD", "ID"].includes(def.id);
  const displayedValue = value === undefined || !Number.isFinite(value)
    ? Number.NaN
    : roundForEdit(isLengthField && lengthUnit === "mm" ? value * 25.4 : value);
  const sliderMin = def.min ?? 0;
  const sliderMax = def.max ?? 1;
  const sliderValue = isLengthField
    ? lengthUnit === "in"
      ? value ?? sliderMin
      : (value ?? sliderMin) * 25.4
    : value ?? sliderMin;

  if (!editable) {
    return (
      <p className="mt-1 text-[11px] text-zinc-400">
        ƒ Derived — computed by the engine. Pin it to freeze the current value and let the engine
        work backward instead.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {isDiameterField && (
        <div className="flex flex-wrap gap-1 rounded border border-zinc-200 bg-zinc-50 p-1">
          {(["D", "OD", "ID"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSetDiameterMode(id)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                (model.D.status === "variable" && id === "D") ||
                (model.OD.status === "variable" && id === "OD") ||
                (model.ID.status === "variable" && id === "ID")
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              Edit {id}
            </button>
          ))}
        </div>
      )}
      {isLengthField && (
        <div className="flex items-center justify-end gap-1 rounded border border-zinc-200 bg-zinc-50 p-1">
          {(["in", "mm"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => setLengthUnit(unit)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                lengthUnit === unit ? "bg-zinc-800 text-white" : "text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
      )}
      <CommitNumberInput
        value={displayedValue}
        step={isLengthField && lengthUnit === "mm" ? (def.step ? def.step * 25.4 : "any") : (def.step ?? "any")}
        onCommit={(next) => commit(String(next))}
        className="w-full rounded border border-zinc-300 px-2 py-1 font-mono text-sm focus:border-zinc-600 focus:outline-none"
      />
      {def.min !== undefined && def.max !== undefined && (
        <div className="space-y-1">
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={
              isLengthField && lengthUnit === "mm"
                ? (def.step ?? (def.max - def.min) / 200) * 25.4
                : def.step ?? (def.max - def.min) / 200
            }
            value={sliderValue}
            onChange={(e) => {
              const next = Number(e.target.value);
              const nextIn = isLengthField && lengthUnit === "mm" ? next / 25.4 : next;
              onValueChange(def.id, nextIn);
            }}
            className="w-full accent-zinc-700"
          />
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>{isLengthField && lengthUnit === "mm" ? `${sliderMin * 25.4} mm` : `${sliderMin} in`}</span>
            <span>{isLengthField && lengthUnit === "mm" ? `${sliderMax * 25.4} mm` : `${sliderMax} in`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function roundForEdit(x: number): number {
  return Number(x.toPrecision(6));
}
