"use client";

import { useMemo, useState } from "react";
import type { ModelState } from "@/lib/engineering/types";
import type { V2Candidate, V2LandscapeMetric, V2Scenario } from "@/lib/v2/types";
import { DEFAULT_V2_SCENARIO } from "@/lib/v2/defaults";
import { sweepV2DesignSpace } from "@/lib/v2/sweepDesignSpace";
import { getV2Material } from "@/lib/v2/materials";
import { candidateToV1Model } from "@/lib/v2/inspectBridge";
import { V2ScenarioPanel } from "./V2ScenarioPanel";
import { V2DesignLandscape } from "./V2DesignLandscape";
import { V2CandidateMechanism } from "./V2CandidateMechanism";
import { V2PerformancePanel } from "./V2PerformancePanel";
import { V2ForceWorkChart } from "./V2ForceWorkChart";
import { V2CandidateTable } from "./V2CandidateTable";
import { V2AssumptionsPanel } from "./V2AssumptionsPanel";
import { fmtLbf } from "./v2format";
import { formatValue } from "../StatusBadge";
import { canonicalName, canonicalSym } from "@/lib/engineering/nomenclature";
import type { DeflectionConstraintState } from "@/lib/engineering/deflectionConstraint";

const MAX_SHORTLIST = 3;

/**
 * V2 optimization workbench — the container that owns all V2 scenario /
 * selection state. The governing deflection constraint is shared with V1; the
 * remaining V2 study state stays local. The design-space sweep is a
 * pure function memoized on the scenario, so it only recomputes when the
 * scenario or search bounds change — never on hover or selection.
 */
export function V2Workbench({
  onInspectCandidate,
  deflectionConstraint,
  onDeflectionConstraintChange,
}: {
  onInspectCandidate: (model: ModelState) => void;
  deflectionConstraint: DeflectionConstraintState;
  onDeflectionConstraintChange: (value: DeflectionConstraintState) => void;
}) {
  const [localScenario, setLocalScenario] = useState<V2Scenario>(DEFAULT_V2_SCENARIO);
  const [metric, setMetric] = useState<V2LandscapeMetric>("FeqAvgIdeal");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string[]>([]);

  const scenario = useMemo(
    () => ({ ...localScenario, maxDeflectionUtilization: deflectionConstraint.maxUtilization }),
    [localScenario, deflectionConstraint.maxUtilization],
  );
  const material = getV2Material(scenario.materialId);

  // Pure sweep — recomputed ONLY when the scenario changes.
  const sweep = useMemo(() => sweepV2DesignSpace(scenario), [scenario]);

  // Effective selection: the user's pick if it still exists, else the default.
  const { selected, byKey } = useMemo(() => {
    const map = new Map<string, V2Candidate>();
    for (const c of sweep.candidates) map.set(c.key, c);
    const chosen =
      (selectedKey && map.get(selectedKey)) ||
      (sweep.defaultKey ? map.get(sweep.defaultKey) : undefined) ||
      null;
    return { selected: chosen, byKey: map };
  }, [sweep, selectedKey]);

  const patchScenario = (patch: Partial<V2Scenario>) => {
    if (patch.maxDeflectionUtilization !== undefined) {
      onDeflectionConstraintChange({
        ...deflectionConstraint,
        maxUtilization: patch.maxDeflectionUtilization,
      });
    }
    const localPatch = { ...patch };
    delete localPatch.maxDeflectionUtilization;
    if (Object.keys(localPatch).length > 0) setLocalScenario((prev) => ({ ...prev, ...localPatch }));
  };

  const resetScenario = () => {
    setLocalScenario(DEFAULT_V2_SCENARIO);
    onDeflectionConstraintChange({
      ...deflectionConstraint,
      maxUtilization: DEFAULT_V2_SCENARIO.maxDeflectionUtilization,
    });
  };

  const toggleShortlist = (key: string) =>
    setShortlist((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : prev.length >= MAX_SHORTLIST
          ? prev
          : [...prev, key],
    );

  const shortlistCandidates = shortlist
    .map((k) => byKey.get(k))
    .filter((c): c is V2Candidate => c !== undefined);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Hero relationships strip — the 15-second read */}
      <div className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
          <span className="text-sm font-bold tracking-tight text-zinc-800">
            V2 · Spring / Hammer Optimization
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
            F₀ ≤ {scenario.forceCap} lbf
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
            spring + hammer stroke = {formatValue(scenario.axialBudget)} in
          </span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
            latch + {formatValue(scenario.latchTravel)} in
          </span>
          <span className="rounded bg-violet-700 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
            working deflection ≤ {(scenario.maxDeflectionUtilization * 100).toFixed(0)}%
          </span>
          <span className="text-zinc-400">
            Searching wire diameter × active coils. Thinner wire → lower rate &amp; solid height →
            more hammer run-up, but higher stress.
          </span>
        </div>
      </div>

      {/* Scenario + constrained landscape + selected mechanism (desktop 7-column layout) */}
      <div className="grid gap-3 xl:grid-cols-7">
        <div className="w-full xl:col-span-1">
          <V2ScenarioPanel
            scenario={scenario}
            material={material}
            onChange={patchScenario}
            onReset={resetScenario}
            deflectionConstraint={deflectionConstraint}
            onDeflectionConstraintChange={onDeflectionConstraintChange}
            referenceWorkingDeflection={selected?.x0}
          />
        </div>
        <div className={selected ? "min-w-0 xl:col-span-3" : "min-w-0 xl:col-span-6"}>
          <V2DesignLandscape
            sweep={sweep}
            metric={metric}
            onMetricChange={setMetric}
            selectedKey={selected?.key ?? null}
            onSelect={setSelectedKey}
            shortlist={shortlist}
            onToggleShortlist={toggleShortlist}
          />
        </div>
        {selected && (
          <div className="min-w-0 space-y-3 xl:col-span-3">
            <V2CandidateMechanism candidate={selected} />
            {shortlistCandidates.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Shortlist ({shortlistCandidates.length}/{MAX_SHORTLIST})
                </div>
                <div className="flex flex-wrap gap-2">
                  {shortlistCandidates.map((c) => {
                    const isSelected = selected?.key === c.key;
                    return (
                      <div
                        key={c.key}
                        onClick={() => setSelectedKey(c.key)}
                        className={`min-w-[168px] flex-1 cursor-pointer rounded border p-2 transition-colors ${
                          isSelected
                            ? "border-blue-300 bg-blue-50"
                            : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedKey(c.key);
                            }}
                            className="font-mono text-[11px] font-semibold text-zinc-800 hover:text-blue-600"
                          >
                            d={c.d.toFixed(3)} · Na={c.Na.toFixed(2)}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleShortlist(c.key);
                            }}
                            className="text-zinc-400 hover:text-red-500"
                            aria-label="Remove from shortlist"
                          >
                            ×
                          </button>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                          <dt>{canonicalName("FeqAvgIdeal")}</dt><dd className="text-right font-mono text-zinc-700">{fmtLbf(c.FeqAvgIdeal)}</dd>
                          <dt>{canonicalName("F3")} {canonicalSym("F3")}</dt><dd className="text-right font-mono text-zinc-700">{fmtLbf(c.F3)}</dd>
                          <dt>Stress %TS</dt><dd className="text-right font-mono text-zinc-700">{(c.stressPctConservative * 100).toFixed(0)}%</dd>
                          <dt>{canonicalName("s")} {canonicalSym("s")}</dt><dd className="text-right font-mono text-zinc-700">{c.s.toFixed(3)} in</dd>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected candidate */}
      {selected ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <V2PerformancePanel
              candidate={selected}
              scenario={scenario}
              material={material}
              shortlisted={shortlist.includes(selected.key)}
              onToggleShortlist={() => toggleShortlist(selected.key)}
              onInspectInV1={() => onInspectCandidate(candidateToV1Model(selected, scenario))}
            />
            <V2ForceWorkChart candidate={selected} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
          No feasible candidate to display. Adjust the scenario or search bounds — see the
          feasibility summary below for the most common exclusions.
        </div>
      )}

      {/* Candidate table */}
      <V2CandidateTable
        sweep={sweep}
        selectedKey={selected?.key ?? null}
        onSelect={setSelectedKey}
        shortlist={shortlist}
        onToggleShortlist={toggleShortlist}
      />

      {/* Model completeness + feasibility */}
      <V2AssumptionsPanel sweep={sweep} />
    </div>
  );
}
