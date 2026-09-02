"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  V2Candidate,
  V2LandscapeMetric,
  V2Scenario,
  V2ShortlistEntry,
} from "@/lib/v2/types";
import { sweepV2DesignSpace } from "@/lib/v2/sweepDesignSpace";
import { getV2Material } from "@/lib/v2/materials";
import {
  createV2ShortlistEntry,
  isV2ShortlistEntryActive,
  v2ScenarioSignature,
  v2ShortlistEntryId,
} from "@/lib/v2/shortlist";
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
  onSelectedCandidateChange,
  onOpenEngineering,
  deflectionConstraint,
  onDeflectionConstraintChange,
  scenario,
  onScenarioChange,
  onResetScenario,
}: {
  onSelectedCandidateChange: (candidate: V2Candidate, scenario: V2Scenario) => void;
  onOpenEngineering: () => void;
  deflectionConstraint: DeflectionConstraintState;
  onDeflectionConstraintChange: (value: DeflectionConstraintState) => void;
  scenario: V2Scenario;
  onScenarioChange: (patch: Partial<V2Scenario>) => void;
  onResetScenario: () => void;
}) {
  const [metric, setMetric] = useState<V2LandscapeMetric>("FeqAvgIdeal");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<V2ShortlistEntry[]>([]);
  const lastSynchronizedSelectionRef = useRef<string | null>(null);

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

  // Optimize is the single source of truth for the current candidate. Keep the
  // mounted Engineering audit synchronized without requiring a transfer click.
  useEffect(() => {
    if (!selected) return;
    const synchronizationKey = `${selected.key}|${v2ScenarioSignature(scenario)}`;
    if (lastSynchronizedSelectionRef.current === synchronizationKey) return;
    lastSynchronizedSelectionRef.current = synchronizationKey;
    onSelectedCandidateChange(selected, scenario);
  }, [onSelectedCandidateChange, scenario, selected]);

  const patchScenario = (patch: Partial<V2Scenario>) => {
    if (patch.maxDeflectionUtilization !== undefined) {
      onDeflectionConstraintChange({
        ...deflectionConstraint,
        maxUtilization: patch.maxDeflectionUtilization,
      });
    }
    onScenarioChange(patch);
  };

  const resetScenario = () => {
    onResetScenario();
  };

  const currentScenarioSignature = useMemo(() => v2ScenarioSignature(scenario), [scenario]);
  const currentScenarioShortlistKeys = useMemo(
    () =>
      shortlist
        .filter((entry) => v2ScenarioSignature(entry.scenario) === currentScenarioSignature)
        .map((entry) => entry.candidateKey),
    [currentScenarioSignature, shortlist],
  );

  const toggleShortlist = (key: string) => {
    const candidate = byKey.get(key);
    if (!candidate) return;
    const id = v2ShortlistEntryId(key, scenario);

    setShortlist((prev) => {
      if (prev.some((entry) => entry.id === id)) {
        return prev.filter((entry) => entry.id !== id);
      }
      if (prev.length >= MAX_SHORTLIST) return prev;
      return [...prev, createV2ShortlistEntry(candidate, scenario)];
    });
  };

  const restoreShortlistEntry = (entry: V2ShortlistEntry) => {
    onScenarioChange(entry.scenario);
    onDeflectionConstraintChange({
      ...deflectionConstraint,
      maxUtilization: entry.scenario.maxDeflectionUtilization,
    });
    setSelectedKey(entry.candidateKey);
  };

  const selectedIsShortlisted =
    selected !== null &&
    shortlist.some((entry) => isV2ShortlistEntryActive(entry, selected.key, scenario));
  const activeShortlistId = selected ? v2ShortlistEntryId(selected.key, scenario) : null;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Hero relationships strip — the 15-second read */}
      <div className="sticky top-0 z-40 rounded-lg border border-zinc-200 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-sm">
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
          <span className="rounded bg-amber-700 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
            TS basis = {(scenario.stressBasisPsi / 1000).toFixed(0)} ksi
          </span>
          <span className="text-zinc-400">
            Searching wire diameter × active coils. Thinner wire → lower rate &amp; solid height →
            more hammer run-up, but higher stress.
          </span>
        </div>
      </div>

      {/* Scenario + constrained landscape + selected mechanism */}
      <div className="grid gap-3 xl:grid-cols-9">
        <div className="w-full xl:col-span-2">
          <V2ScenarioPanel
            scenario={scenario}
            material={material}
            onChange={patchScenario}
            onReset={resetScenario}
            deflectionConstraint={deflectionConstraint}
            onDeflectionConstraintChange={onDeflectionConstraintChange}
            referenceWorkingDeflection={selected?.x0}
            referenceShearStressPsi={selected?.tau}
            selectedCandidate={selected}
          />
        </div>
        <div
          className={
            selected
              ? "min-w-0 space-y-3 xl:col-span-3"
              : "min-w-0 xl:col-span-7"
          }
        >
          <V2DesignLandscape
            sweep={sweep}
            metric={metric}
            onMetricChange={setMetric}
            selectedKey={selected?.key ?? null}
            onSelect={setSelectedKey}
            shortlist={currentScenarioShortlistKeys}
            onToggleShortlist={toggleShortlist}
          />
          {selected && <V2ForceWorkChart candidate={selected} scenario={scenario} />}
        </div>
        {selected && (
          <div className="min-w-0 space-y-3 xl:col-span-4">
            <V2CandidateMechanism candidate={selected} />
            {shortlist.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Shortlist snapshots ({shortlist.length}/{MAX_SHORTLIST})
                </div>
                <div className="flex flex-wrap gap-2">
                  {shortlist.map((entry) => {
                    const c = entry.candidate;
                    const savedScenario = entry.scenario;
                    const isSelected = activeShortlistId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        onClick={() => restoreShortlistEntry(entry)}
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
                              restoreShortlistEntry(entry);
                            }}
                            className="font-mono text-[11px] font-semibold text-zinc-800 hover:text-blue-600"
                          >
                            d={c.d.toFixed(3)} · Na={c.Na.toFixed(2)}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShortlist((prev) => prev.filter((item) => item.id !== entry.id));
                            }}
                            className="text-zinc-400 hover:text-red-500"
                            aria-label="Remove from shortlist"
                          >
                            ×
                          </button>
                        </div>
                        <div className="mb-1 rounded bg-white/70 px-1.5 py-1 font-mono text-[9.5px] leading-4 text-zinc-500">
                          B={savedScenario.axialBudget.toFixed(3)} in · u≤{(savedScenario.maxDeflectionUtilization * 100).toFixed(0)}% · F₀≤{savedScenario.forceCap.toFixed(0)} lbf
                          <br />
                          OD≤{savedScenario.housingInnerDiameter.toFixed(3)} in · G={(savedScenario.shearModulusPsi / 1e6).toFixed(1)} Mpsi · TS={(savedScenario.stressBasisPsi / 1000).toFixed(0)} ksi
                        </div>
                        <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-zinc-500">
                          <dt>{canonicalName("FeqAvgIdeal")}</dt><dd className="text-right font-mono text-zinc-700">{fmtLbf(c.FeqAvgIdeal)}</dd>
                          <dt>{canonicalName("F3")} {canonicalSym("F3")}</dt><dd className="text-right font-mono text-zinc-700">{fmtLbf(c.F3)}</dd>
                          <dt>Stress %TS basis</dt><dd className="text-right font-mono text-zinc-700">{(c.stressPctBasis * 100).toFixed(0)}%</dd>
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

      {/* Selected candidate — full-width performance summary */}
      {selected ? (
        <V2PerformancePanel
          candidate={selected}
          scenario={scenario}
          material={material}
          shortlisted={selectedIsShortlisted}
          onToggleShortlist={() => toggleShortlist(selected.key)}
          onOpenEngineering={onOpenEngineering}
        />
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">
          No feasible candidate to display. Adjust the scenario or search bounds — see the
          feasibility summary below for the most common exclusions.
        </div>
      )}

      {/* Candidate table */}
      <V2CandidateTable
        sweep={sweep}
        scenario={scenario}
        selectedKey={selected?.key ?? null}
        onSelect={setSelectedKey}
        shortlist={currentScenarioShortlistKeys}
        onToggleShortlist={toggleShortlist}
      />

      {/* Model completeness + feasibility */}
      <V2AssumptionsPanel sweep={sweep} />
    </div>
  );
}
