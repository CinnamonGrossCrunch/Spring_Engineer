"use client";

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
import { ParameterValueEditor } from "./ParameterValueEditor";
import { overviewName, overviewSym } from "./overview/overviewLabels";

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
  variant = "engineering",
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
  /** Overview presents plain-language first with engineering detail on demand. */
  variant?: "engineering" | "overview";
}) {
  const def = selectedId ? PARAMETER_MAP[selectedId] : undefined;
  const state = selectedId ? model[selectedId] : undefined;
  const value = selectedId ? values[selectedId] : undefined;

  if (!def || !state) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
        <h2 className="mb-2 font-semibold text-zinc-700">Parameter Inspector</h2>
        <p>
          Click any parameter in the map, chart, or cards to view what it controls, why it
          matters, and edit it when that value is user-adjustable.
        </p>
      </div>
    );
  }

  const relatedConflicts = conflicts.filter(
    (c) => c.parameterIds.includes(def.id) || c.fixedParameterIds.includes(def.id),
  );
  const relatedConstraints = constraints.filter((c) => !c.ok && c.parameterIds.includes(def.id));
  const violated = relatedConstraints.length > 0 || relatedConflicts.length > 0;
  const equations = equationsFor(def.id);
  const usedBy = PARAMETERS.filter((p) => p.dependencies?.includes(def.id));

  const valueText =
    def.unit === "in" ? formatLengthValue(value) : `${formatValue(value)} ${def.unit}`;

  const pinButton = (
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
  );

  const valueEditor = (
    <ParameterValueEditor
      def={def}
      state={state}
      value={value}
      model={model}
      onValueChange={onValueChange}
      onSetDiameterMode={onSetDiameterMode}
    />
  );

  const equationsSection =
    def.formula || equations.length > 0 ? (
      <>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Equations</div>
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
      </>
    ) : null;

  const dependenciesSection =
    (def.dependencies?.length ?? 0) > 0 || usedBy.length > 0 ? (
      <>
        {def.dependencies && def.dependencies.length > 0 && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Depends on</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {def.dependencies.map((depId) => (
                <ChipLink key={depId} id={depId} values={values} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}
        {usedBy.length > 0 && (
          <>
            <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Feeds into</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {usedBy.map((p) => (
                <ChipLink key={p.id} id={p.id} values={values} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}
      </>
    ) : null;

  const sensitivityTech = def.sensitivity ? (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Sensitivity</div>
      <div className="mt-1 font-mono text-[12px] leading-5 text-zinc-700">
        {def.sensitivity.split("·").map((s, i) => (
          <div key={i}>{s.trim()}</div>
        ))}
      </div>
    </>
  ) : null;

  const warningsSection =
    relatedConflicts.length > 0 || relatedConstraints.length > 0 || def.note ? (
      <>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Warnings & notes</div>
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
      </>
    ) : null;

  const sourceBadge = def.source ? (
    <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Source: {def.source}</p>
  ) : null;

  // ── Overview: plain-language first, engineering detail on demand ──
  if (variant === "overview") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white text-sm">
        <div className="border-b border-zinc-100 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-snug text-zinc-900">
                {overviewName(def.id)}
              </div>
              <div className="font-mono text-[12px] text-zinc-400">{overviewSym(def.id)}</div>
            </div>
            <StatusBadge status={state.status} violated={violated} />
          </div>
        </div>

        <div className="border-b border-zinc-100 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">What this means</div>
          <p className="mt-1 text-[13px] leading-5 text-zinc-600">{def.description}</p>
        </div>

        <div className="border-b border-zinc-100 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Current value</div>
          <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${violated ? "text-red-600" : "text-zinc-900"}`}>
            {valueText}
          </div>
        </div>

        {def.whatIfIncrease && (
          <div className="border-b border-zinc-100 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Why it matters</div>
            <p className="mt-1 text-[13px] leading-5 text-zinc-600">
              <span className="font-semibold text-zinc-700">If this increases: </span>
              {def.whatIfIncrease}
            </p>
          </div>
        )}

        <div className="border-b border-zinc-100 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Change this</div>
            {pinButton}
          </div>
          {valueEditor}
          <p className="mt-2 text-[11px] italic text-zinc-400">{STATUS_STYLES[state.status].explain}</p>
        </div>

        <details className="p-4">
          <summary className="cursor-pointer text-[12px] font-medium text-zinc-600">Show Engineering Details</summary>
          <div className="mt-3 space-y-4">
            {equationsSection && <div>{equationsSection}</div>}
            {dependenciesSection && <div>{dependenciesSection}</div>}
            {sensitivityTech && <div>{sensitivityTech}</div>}
            {sourceBadge && <div>{sourceBadge}</div>}
            {warningsSection && <div>{warningsSection}</div>}
          </div>
        </details>
      </div>
    );
  }

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
        {valueEditor}
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
