"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesignMode, ModelState } from "@/lib/engineering/types";
import { solveModel } from "@/lib/engineering/solver";
import { evaluateConstraints } from "@/lib/engineering/constraints";
import { PARAMETER_MAP } from "@/lib/engineering/parameters";
import { buildInitialState, MODE_INFO, EXAMPLE_DATA_LABEL } from "@/data/exampleModel";
import { LogicMap } from "./LogicMap";
import { ParameterInspector } from "./ParameterInspector";
import { ParameterControl } from "./ParameterControl";
import { ForceTravelChart } from "./ForceTravelChart";
import { ConstraintPanel } from "./ConstraintPanel";
import { SpringStateIllustration } from "./SpringStateIllustration/SpringStateIllustration";

const MODES: DesignMode[] = ["forward", "reverse", "explore"];
const ENERGY_LENS_IDS = ["W_run", "eta", "KE", "v", "p"];
const DIAMETER_IDS = ["D", "OD", "ID"] as const;

/**
 * Primary engineering workbench: shared calculator state, the dependency
 * map, inspector, force-travel chart, constraint panel and energy lens.
 */
export function EngineeringWorkbench() {
  const [mode, setMode] = useState<DesignMode>("forward");
  const [model, setModel] = useState<ModelState>(() => buildInitialState("forward"));
  const [selectedId, setSelectedId] = useState<string | null>("k");
  const [etaMode, setEtaMode] = useState<"unspecified" | "ideal" | "assumed" | "measured">("unspecified");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorPinned, setInspectorPinned] = useState(false);
  const [constraintsOpen, setConstraintsOpen] = useState(false);

  const solve = useMemo(() => solveModel(model), [model]);
  const constraints = useMemo(() => evaluateConstraints(solve.values), [solve]);

  const violatedParamIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of constraints) if (!c.ok) for (const id of c.parameterIds) set.add(id);
    for (const c of solve.conflicts) {
      for (const id of c.parameterIds) set.add(id);
      for (const id of c.fixedParameterIds) set.add(id);
    }
    return set;
  }, [constraints, solve.conflicts]);

  const constraintSummary = useMemo(() => {
    const passing = constraints.filter((c) => c.ok).length;
    const total = constraints.length;
    const allOk =
      solve.conflicts.length === 0 && solve.unresolved.length === 0 && passing === total;
    return { passing, total, allOk, hasConflicts: solve.conflicts.length > 0 };
  }, [constraints, solve.conflicts, solve.unresolved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (constraintsOpen) setConstraintsOpen(false);
      else if (inspectorOpen && !inspectorPinned) setInspectorOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [constraintsOpen, inspectorOpen, inspectorPinned]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setInspectorOpen(true);
  }, []);

  const handleSetDiameterMode = useCallback((editableId: "D" | "OD" | "ID") => {
    setModel((prev) => {
      const next: ModelState = { ...prev };
      for (const id of DIAMETER_IDS) {
        const cur = next[id];
        if (!cur) continue;
        next[id] = {
          ...cur,
          status: id === editableId ? "variable" : "derived",
        };
      }
      return next;
    });
  }, []);

  const handleValueChange = useCallback((id: string, value: number) => {
    setModel((prev) => {
      const cur = prev[id];
      if (!cur || cur.status === "derived") return prev; // derived values are never edited directly

      if (id === "D" || id === "OD" || id === "ID") {
        const next: ModelState = { ...prev };
        for (const familyId of DIAMETER_IDS) {
          const familyCur = next[familyId];
          if (!familyCur) continue;
          next[familyId] = {
            ...familyCur,
            status: familyId === id ? "variable" : "derived",
          };
        }
        next[id] = { ...next[id], value };
        return next;
      }

      return { ...prev, [id]: { ...cur, value } };
    });
  }, []);

  const handleTogglePin = useCallback(
    (id: string) => {
      setModel((prev) => {
        const cur = prev[id];
        if (!cur) return prev;
        if (cur.status === "fixed") {
          // Unpin: return to the parameter's default role in this mode.
          const defaults = buildInitialState(mode);
          const fallback = defaults[id]?.status === "fixed" ? "variable" : (defaults[id]?.status ?? "variable");
          return {
            ...prev,
            [id]: {
              status: fallback,
              value: fallback === "derived" ? undefined : (cur.value ?? solve.values[id]),
            },
          };
        }
        // Pin at the currently displayed value (derived values get frozen).
        const pinValue = cur.status === "derived" ? solve.values[id] : cur.value;
        if (pinValue === undefined) return prev;
        return { ...prev, [id]: { status: "fixed", value: pinValue } };
      });
    },
    [mode, solve.values],
  );

  const handleModeChange = useCallback((next: DesignMode) => {
    setMode(next);
    setModel(buildInitialState(next));
    setSelectedId(next === "reverse" ? "F2" : "k");
  }, []);

  const handleReset = useCallback(() => {
    setModel(buildInitialState(mode));
  }, [mode]);

  const display = (id: string) =>
    model[id]?.status === "derived" ? solve.values[id] : (model[id]?.value ?? solve.values[id]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-900">
      {/* ── Header ── */}
      <header className="border-b border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-base font-bold tracking-tight text-zinc-900">
            Spring Mechanism Explorer
          </h1>

          <div className="flex overflow-hidden rounded-md border border-zinc-300 text-xs">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                title={MODE_INFO[m].blurb}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  mode === m
                    ? "bg-zinc-800 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {MODE_INFO[m].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
            title="Reset all parameters to the example dataset for the current mode"
          >
            Reset to Example
          </button>

          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10.5px] text-zinc-500">
            Units: Imperial (in · lbf · psi · lbm · ft/s)
          </span>

          <span className="ml-auto text-[11px] italic text-zinc-400">
            Conceptual engineering model — verify final spring design with supplier
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-500">
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{EXAMPLE_DATA_LABEL}</span>
          <span className="ml-2">{MODE_INFO[mode].blurb}</span>
        </p>
      </header>

      {/* ── Main workspace: Visual column | Logic map ── */}
      <div
        className={`flex flex-1 flex-col gap-3 p-3 xl:flex-row ${
          inspectorPinned ? "xl:pr-[392px]" : ""
        }`}
      >
        {/* Visual column: parametric illustration + force-travel graph */}
        <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 xl:w-[36%] xl:max-w-[560px]">
          <SpringStateIllustration
            values={solve.values}
            selectedId={selectedId}
            constraints={constraints}
            onSelect={handleSelect}
          />

          <ForceTravelChart
            F1={solve.values.F1}
            F2={solve.values.F2}
            F3={solve.values.F3}
            s_h={display("s_h")}
            y_latch={display("y_latch")}
            F_latch_avg={display("F_latch_avg")}
            onSelect={handleSelect}
          />
        </div>

        {/* Center column: dependency logic map + energy lens */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 xl:min-w-[540px]">
          <div className="relative min-h-[560px] flex-1">
            <div className="absolute inset-0">
              <LogicMap
                model={model}
                values={solve.values}
                selectedId={selectedId}
                violatedParamIds={violatedParamIds}
                constraints={constraints}
                mode={mode}
                onSelect={handleSelect}
              />
            </div>
          </div>

          {/* Optional advanced energy lens (collapsed by default) */}
          <details className="rounded-lg border border-zinc-200 bg-white">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-zinc-700">
              Advanced: energy lens (assumption-based)
            </summary>
            <div className="border-t border-zinc-100 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  Hammer transfer efficiency
                </span>
                <div className="flex gap-1 rounded border border-zinc-200 bg-zinc-50 p-1 text-[11px]">
                  {(["unspecified", "ideal", "assumed", "measured"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEtaMode(m)}
                      className={`rounded px-2 py-0.5 ${
                        etaMode === m ? "bg-zinc-800 text-white" : "text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      {m === "unspecified" ? "Not specified" : m === "ideal" ? "Ideal upper bound" : m === "assumed" ? "Assumed" : "Measured"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-2 text-[12px] leading-5 text-zinc-500">
                Linear-spring work over the run-up stroke: <span className="font-mono">W_run = F1·s_h − ½·k·s_h²</span>{" "}
                (equivalently <span className="font-mono">ΔU = ½·k·(x1² − x2²)</span>). The physical relationship is{" "}
                <span className="font-mono">KE = η·W_run</span> and{" "}
                <span className="font-mono">v = √(2·KE/m)</span>, <span className="font-mono">p = m·v</span>.
              </p>
              <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
                {etaMode === "unspecified"
                  ? "Hammer transfer efficiency: Not specified. This is an unresolved mechanism input, not a calculated spring result."
                  : etaMode === "ideal"
                    ? "Ideal upper bound: η = 1.0. Lossless theoretical upper bound only."
                    : etaMode === "assumed"
                      ? "Assumed efficiency: η is a user-entered assumption and should be treated as external input."
                      : "Measured efficiency: η reflects testing or field data and is treated as an external measured input."}
              </p>
              <div className="grid gap-1.5 md:grid-cols-2">
                {ENERGY_LENS_IDS.map((id) => (
                  <ParameterControl
                    key={id}
                    def={PARAMETER_MAP[id]}
                    state={model[id]}
                    value={display(id)}
                    selected={selectedId === id}
                    violated={violatedParamIds.has(id)}
                    onSelect={handleSelect}
                    onTogglePin={handleTogglePin}
                  />
                ))}
              </div>
            </div>
          </details>
        </div>

      </div>

      {/* ── Parameter inspector: pop-out drawer (pinnable, collapsed by default) ── */}
      <div
        className={`fixed right-0 top-0 z-40 flex h-screen w-[380px] max-w-[92vw] transform flex-col border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-200 ${
          inspectorOpen || inspectorPinned ? "translate-x-0" : "translate-x-full"
        }`}
        role="complementary"
        aria-label="Parameter inspector"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
          <span className="text-sm font-semibold text-zinc-700">Parameter Inspector</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setInspectorPinned((p) => !p)}
              aria-pressed={inspectorPinned}
              title={inspectorPinned ? "Unpin sidebar" : "Pin sidebar open"}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                inspectorPinned
                  ? "border-blue-400 bg-blue-100 text-blue-700"
                  : "border-zinc-300 text-zinc-500 hover:border-zinc-500"
              }`}
            >
              {inspectorPinned ? "Pinned" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectorOpen(false);
                setInspectorPinned(false);
              }}
              title="Collapse inspector"
              aria-label="Collapse inspector"
              className="rounded border border-zinc-300 px-2 py-0.5 text-[13px] leading-none text-zinc-500 hover:border-zinc-500"
            >
              ×
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ParameterInspector
            selectedId={selectedId}
            model={model}
            values={solve.values}
            conflicts={solve.conflicts}
            constraints={constraints}
            onSelect={handleSelect}
            onValueChange={handleValueChange}
            onTogglePin={handleTogglePin}
            onSetDiameterMode={handleSetDiameterMode}
          />
        </div>
      </div>

      {/* Collapsed inspector re-open tab */}
      {!(inspectorOpen || inspectorPinned) && (
        <button
          type="button"
          onClick={() => setInspectorOpen(true)}
          title="Open parameter inspector"
          className="fixed right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-md border border-r-0 border-zinc-300 bg-white px-2 py-3 text-[11px] font-medium text-zinc-600 shadow-md hover:bg-zinc-50 [writing-mode:vertical-rl]"
        >
          ‹ Inspector
        </button>
      )}

      {/* ── Constraints & consistency: floating status button ── */}
      <button
        type="button"
        onClick={() => setConstraintsOpen(true)}
        aria-label={`Constraints: ${constraintSummary.passing} of ${constraintSummary.total} checks passing`}
        title="Constraints & consistency"
        className={`fixed bottom-5 z-30 flex h-16 w-16 flex-col items-center justify-center rounded-full border font-bold text-white shadow-lg transition-all hover:scale-105 ${
          inspectorOpen || inspectorPinned ? "right-[396px]" : "right-5"
        } ${
          constraintSummary.allOk
            ? "border-emerald-300 bg-emerald-500"
            : constraintSummary.hasConflicts
              ? "border-red-300 bg-red-500"
              : "border-amber-300 bg-amber-500"
        }`}
      >
        <span className="text-sm leading-none">
          {constraintSummary.passing}/{constraintSummary.total}
        </span>
        <span className="text-[13px] leading-none">{constraintSummary.allOk ? "✓" : "!"}</span>
      </button>

      {/* Constraints modal */}
      {constraintsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16"
          role="dialog"
          aria-modal="true"
          aria-label="Constraints and consistency"
          onClick={() => setConstraintsOpen(false)}
        >
          <div className="relative w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setConstraintsOpen(false)}
              aria-label="Close"
              className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-600 shadow hover:bg-zinc-50"
            >
              ×
            </button>
            <ConstraintPanel
              conflicts={solve.conflicts}
              constraints={constraints}
              unresolved={solve.unresolved}
              onSelect={(id) => {
                handleSelect(id);
                setConstraintsOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
