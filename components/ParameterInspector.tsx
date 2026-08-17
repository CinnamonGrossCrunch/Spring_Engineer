"use client";

import { useState } from "react";
import type {
  Conflict,
  ConstraintResult,
  ModelState,
} from "@/lib/engineering/types";
import { PARAMETERS, PARAMETER_MAP } from "@/lib/engineering/parameters";
import { equationsFor } from "@/lib/engineering/equations";
import {
  StatusBadge,
  STATUS_STYLES,
  formatLengthValue,
  formatValue,
} from "./StatusBadge";

/**
 * Right-panel inspector: full engineering context for the selected parameter —
 * meaning, value, status, equations, dependencies, sensitivity and warnings.
 */
export function ParameterInspector({
  selectedId,
  model,
  values,
  conflicts,
  constraints,
  onSelect,
  onValueChange,
  onTogglePin,
  onSetDiameterMode,
}: {
  selectedId: string | null;
  model: ModelState;
  values: Record<string, number | undefined>;
  conflicts: Conflict[];
  constraints: ConstraintResult[];
  onSelect: (id: string) => void;
  onValueChange: (id: string, value: number) => void;
  onTogglePin: (id: string) => void;
  onSetDiameterMode: (id: "D" | "OD" | "ID") => void;
}) {
  const def = selectedId ? PARAMETER_MAP[selectedId] : undefined;
  const state = selectedId ? model[selectedId] : undefined;
  const value = selectedId ? values[selectedId] : undefined;

  // Local text state so partially-typed numbers don't fight the model.
  // While the input is focused the user's text wins; otherwise the draft is
  // resynced during render when selection/value changes (recommended React
  // pattern for adjusting state on prop change).
  const [draft, setDraft] = useState<string>("");
  const [draftKey, setDraftKey] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [lengthUnit, setLengthUnit] = useState<"in" | "mm">("in");

  const key = `${selectedId}:${value}`;
  if (!editing && key !== draftKey) {
    setDraftKey(key);
    const raw = value !== undefined && Number.isFinite(value) ? value : undefined;
    const draftValue =
      raw === undefined
        ? ""
        : lengthUnit === "in"
          ? String(roundForEdit(raw))
          : String(roundForEdit(raw * 25.4));
    setDraft(draftValue);
  }

  if (!def || !state) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
        <h2 className="mb-2 font-semibold text-zinc-700">Parameter Inspector</h2>
        <p>
          Click any parameter in the map, chart section or lists to see its meaning, equation,
          dependencies and sensitivity.
        </p>
      </div>
    );
  }

  const editable = state.status !== "derived";
  const relatedConflicts = conflicts.filter(
    (c) => c.parameterIds.includes(def.id) || c.fixedParameterIds.includes(def.id),
  );
  const relatedConstraints = constraints.filter(
    (c) => !c.ok && c.parameterIds.includes(def.id),
  );
  const violated = relatedConstraints.length > 0 || relatedConflicts.length > 0;
  const equations = equationsFor(def.id);
  const usedBy = PARAMETERS.filter((p) => p.dependencies?.includes(def.id));

  const commit = (text: string) => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      const nextIn = lengthUnit === "in" ? parsed : parsed / 25.4;
      onValueChange(def.id, nextIn);
    }
  };

  const isLengthField = def.unit === "in";
  const isDiameterField = ["D", "OD", "ID"].includes(def.id);
  const sliderMin = isLengthField ? def.min ?? 0 : def.min ?? 0;
  const sliderMax = isLengthField ? def.max ?? 1 : def.max ?? 1;
  const sliderValue = isLengthField
    ? lengthUnit === "in"
      ? value ?? sliderMin
      : (value ?? sliderMin) * 25.4
    : value ?? sliderMin;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white text-sm">
      {/* Header */}
      <div className="border-b border-zinc-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-lg font-bold text-zinc-900">{def.symbol}</div>
            <div className="text-[13px] font-medium text-zinc-600">{def.name}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={state.status} violated={violated} />
            <button
              type="button"
              onClick={() => onTogglePin(def.id)}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                state.status === "fixed"
                  ? "border-blue-400 bg-blue-100 text-blue-700"
                  : "border-zinc-300 text-zinc-500 hover:border-zinc-500 hover:text-zinc-700"
              }`}
              title={
                state.status === "fixed"
                  ? "Unpin — return to its default role"
                  : "Pin as FIXED at the current value — the engine will never change it"
              }
            >
              {state.status === "fixed" ? "⏍ Unpin" : "⏍ Pin"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-zinc-600">{def.description}</p>
        <p className="mt-1 text-[11px] italic text-zinc-400">{STATUS_STYLES[state.status].explain}</p>
        {def.source && (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            Source: {def.source}
          </p>
        )}
      </div>

      {/* Value */}
      <div className="border-b border-zinc-100 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Current value
          </span>
          <span className={`font-mono text-lg tabular-nums ${violated ? "text-red-600" : "text-zinc-900"}`}>
            {def.unit === "in" ? formatLengthValue(value) : `${formatValue(value)} ${def.unit}`}
          </span>
        </div>
        {editable ? (
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
                    onClick={() => {
                      setLengthUnit(unit);
                      if (typeof value === "number" && Number.isFinite(value)) {
                        setDraft(String(roundForEdit(unit === "in" ? value : value * 25.4)));
                      }
                    }}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      lengthUnit === unit
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            )}
            <input
              type="number"
              value={draft}
              step={isLengthField && lengthUnit === "mm" ? (def.step ? def.step * 25.4 : "any") : (def.step ?? "any")}
              onFocus={() => setEditing(true)}
              onBlur={() => {
                setEditing(false);
                setDraftKey(""); // force resync with the committed value
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                commit(e.target.value);
              }}
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
        ) : (
          <p className="mt-1 text-[11px] text-zinc-400">
            ƒ Derived — computed by the engine. Pin it to freeze the current value and let the
            engine work backward instead.
          </p>
        )}
      </div>

      {/* Formula & equations */}
      {(def.formula || equations.length > 0) && (
        <div className="border-b border-zinc-100 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Equations
          </div>
          {def.formula && (
            <div className="mt-1 rounded bg-zinc-50 px-2 py-1.5 font-mono text-[13px] text-zinc-800">
              {def.formula}
            </div>
          )}
          <ul className="mt-2 space-y-1.5">
            {equations.map((eq) => (
              <li key={eq.id} className="text-[12px] text-zinc-600">
                <span className="font-mono text-zinc-800">{eq.expression}</span>
                {eq.note && <span className="block text-[11px] italic text-zinc-400">{eq.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dependencies */}
      {((def.dependencies?.length ?? 0) > 0 || usedBy.length > 0) && (
        <div className="border-b border-zinc-100 p-4">
          {def.dependencies && def.dependencies.length > 0 && (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Depends on
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {def.dependencies.map((depId) => (
                  <ChipLink key={depId} id={depId} values={values} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}
          {usedBy.length > 0 && (
            <>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Feeds into
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {usedBy.map((p) => (
                  <ChipLink key={p.id} id={p.id} values={values} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sensitivity */}
      {(def.sensitivity || def.whatIfIncrease) && (
        <div className="border-b border-zinc-100 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Sensitivity
          </div>
          {def.sensitivity && (
            <div className="mt-1 font-mono text-[12px] leading-5 text-zinc-700">
              {def.sensitivity.split("·").map((s, i) => (
                <div key={i}>{s.trim()}</div>
              ))}
            </div>
          )}
          {def.whatIfIncrease && (
            <p className="mt-2 text-[12px] leading-5 text-zinc-600">
              <span className="font-semibold text-zinc-700">If this increases: </span>
              {def.whatIfIncrease}
            </p>
          )}
        </div>
      )}

      {/* Warnings */}
      {(relatedConflicts.length > 0 || relatedConstraints.length > 0 || def.note) && (
        <div className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Warnings & notes
          </div>
          <div className="mt-1.5 space-y-1.5">
            {relatedConflicts.map((c) => (
              <p key={c.equationId} className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[12px] text-red-700">
                {c.message}
              </p>
            ))}
            {relatedConstraints.map((c) => (
              <p key={c.id} className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[12px] text-red-700">
                {c.message}
              </p>
            ))}
            {def.note && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
                {def.note}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChipLink({
  id,
  values,
  onSelect,
}: {
  id: string;
  values: Record<string, number | undefined>;
  onSelect: (id: string) => void;
}) {
  const def = PARAMETER_MAP[id];
  if (!def) return null;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      title={`${def.name}: ${def.description}`}
      className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 hover:border-zinc-500"
    >
      {def.symbol} = {def.unit === "in" ? formatLengthValue(values[id]) : formatValue(values[id])}
    </button>
  );
}

function roundForEdit(x: number): number {
  return Number(x.toPrecision(6));
}
