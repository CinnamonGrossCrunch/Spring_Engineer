"use client";

import type { V2Candidate, V2Scenario } from "@/lib/v2/types";
import { NumberField } from "./V2ScenarioPanel";
import { fmtInMm, fmtLbf } from "./v2format";

export function MechanismConstraintContext({
  scenario,
  candidate,
  onChange,
}: {
  scenario: V2Scenario;
  candidate: V2Candidate | null;
  onChange: (patch: Partial<V2Scenario>) => void;
}) {
  const criticalLength = scenario.axialBudget + scenario.latchTravel;
  const endLength = scenario.axialBudget + scenario.totalLatchTravel;
  const endPass = candidate ? candidate.F4 + 1e-9 >= scenario.minimumEndForce : null;

  return (
    <section className="rounded-lg border border-blue-200 bg-white shadow-sm" data-testid="engineering-mechanism-context">
      <div className="border-b border-blue-100 bg-blue-50/60 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-blue-800">Shared mechanism constraints</h2>
            <p className="mt-0.5 text-[10.5px] text-blue-700/80">These same values govern the Engineer equations and every Optimize candidate.</p>
          </div>
          {candidate && (
            <span className={`rounded border px-2 py-1 font-mono text-[10.5px] font-semibold ${endPass ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}`}>
              F₄ {fmtLbf(candidate.F4)} · floor {fmtLbf(scenario.minimumEndForce)}
            </span>
          )}
        </div>
        <div className="mt-2 grid gap-1 text-[10.5px] text-zinc-600 sm:grid-cols-3">
          <div className="rounded border border-zinc-200 bg-white px-2 py-1.5"><strong className="block text-zinc-800">1 · Hammer contact</strong><span className="font-mono">L₂ = B = {fmtInMm(scenario.axialBudget)}</span></div>
          <div className="rounded border border-amber-200 bg-white px-2 py-1.5"><strong className="block text-amber-800">2 · Critical release</strong><span className="font-mono">L₃ = {fmtInMm(criticalLength)}</span></div>
          <div className="rounded border border-orange-200 bg-white px-2 py-1.5"><strong className="block text-orange-800">3 · Coupled-travel end</strong><span className="font-mono">L₄ = {fmtInMm(endLength)}</span></div>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-zinc-500">
          The first {scenario.latchTravel.toFixed(3)} in after contact is the critical point-of-no-return window. The hammer can then slow or stop dynamically; the model only requires positive residual spring drive through {scenario.totalLatchTravel.toFixed(3)} in total travel, with at least {scenario.minimumEndForce.toFixed(1)} lbf gross spring force at the end against a {scenario.opposingPreload.toFixed(1)} lbf modeled preload.
        </p>
      </div>

      <details>
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">Edit shared travel and end-force constraints</summary>
        <div className="grid gap-x-6 gap-y-2 border-t border-zinc-100 p-3 md:grid-cols-2">
          <NumberField label="Axial budget" symbol="B" value={scenario.axialBudget} step={0.01} min={0} unit="in" onChange={(value) => onChange({ axialBudget: value })} />
          <NumberField label="Critical release travel" symbol="ycritical" value={scenario.latchTravel} step={0.005} min={0.005} unit="in" onChange={(value) => onChange({ latchTravel: value, totalLatchTravel: Math.max(value, scenario.totalLatchTravel) })} />
          <NumberField label="Total coupled travel" symbol="ytotal" value={scenario.totalLatchTravel} step={0.005} min={scenario.latchTravel} unit="in" onChange={(value) => onChange({ totalLatchTravel: Math.max(scenario.latchTravel, value) })} />
          <NumberField label="Minimum spring force at end" symbol="Fend,min" value={scenario.minimumEndForce} step={0.5} min={0} unit="lbf" onChange={(value) => onChange({ minimumEndForce: value })} />
          <NumberField label="Opposing latch preload" symbol="Fopp" value={scenario.opposingPreload} step={0.1} min={0} unit="lbf" onChange={(value) => onChange({ opposingPreload: value })} />
          <label className="flex cursor-pointer items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[10.5px] text-zinc-600">
            <input type="checkbox" checked={scenario.armedHeightConstraintEnabled} onChange={(event) => onChange({ armedHeightConstraintEnabled: event.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />
            Constrain optimizer-derived armed height
          </label>
          {scenario.armedHeightConstraintEnabled && (
            <>
              <NumberField label="Minimum armed height" symbol="Larmed,min" value={scenario.armedHeightMin} step={0.005} min={0} max={scenario.armedHeightMax} unit="in" onChange={(value) => onChange({ armedHeightMin: Math.min(value, scenario.armedHeightMax) })} />
              <NumberField label="Maximum armed height" symbol="Larmed,max" value={scenario.armedHeightMax} step={0.005} min={scenario.armedHeightMin} max={scenario.axialBudget} unit="in" onChange={(value) => onChange({ armedHeightMax: Math.max(value, scenario.armedHeightMin) })} />
            </>
          )}
        </div>
      </details>
    </section>
  );
}
