"use client";

import { CommitNumberInput } from "@/components/CommitNumberInput";
import { applyScenarioImpactLens } from "@/lib/v2/impactLens";
import type { V2Candidate, V2Scenario } from "@/lib/v2/types";
import { ImpactBodyControl, type ImpactBodyPatch } from "./ImpactBodyControl";

function approximate(value: number | undefined, digits: number, unit: string): string {
  return value === undefined || !Number.isFinite(value)
    ? "—"
    : `~${value.toFixed(digits)} ${unit}`;
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border px-2.5 py-2 ${emphasis ? "border-orange-200 bg-orange-50/70" : "border-zinc-200 bg-white"}`}>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-0.5 break-words font-mono font-bold leading-tight ${emphasis ? "text-[17px] text-orange-700" : "text-[13px] text-zinc-800"}`}>
        {value}
      </div>
    </div>
  );
}

function Stage({
  number,
  title,
  accent,
  children,
}: {
  number: number;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: accent }}>
          {number}
        </span>
        <h4 className="text-[10.5px] font-bold uppercase tracking-wide text-zinc-700">{title}</h4>
      </div>
      <div className="grid gap-1.5">{children}</div>
    </div>
  );
}

export function V2ImpactLensPanel({
  candidate,
  scenario,
  onChange,
}: {
  candidate: V2Candidate;
  scenario: V2Scenario;
  onChange: (patch: Partial<V2Scenario>) => void;
}) {
  const lens = applyScenarioImpactLens(candidate, scenario);

  const patchHammer = (patch: ImpactBodyPatch) => onChange({
    ...(patch.mode !== undefined ? { hammerMassInputMode: patch.mode } : {}),
    ...(patch.materialId !== undefined ? { hammerBodyMaterialId: patch.materialId } : {}),
    ...(patch.volumeIn3 !== undefined ? { hammerVolumeIn3: patch.volumeIn3 } : {}),
    ...(patch.massLbm !== undefined ? { hammerMassLbm: patch.massLbm } : {}),
  });
  const patchLatch = (patch: ImpactBodyPatch) => onChange({
    ...(patch.mode !== undefined ? { latchMassInputMode: patch.mode } : {}),
    ...(patch.materialId !== undefined ? { latchBodyMaterialId: patch.materialId } : {}),
    ...(patch.volumeIn3 !== undefined ? { latchVolumeIn3: patch.volumeIn3 } : {}),
    ...(patch.massLbm !== undefined ? { latchMassLbm: patch.massLbm } : {}),
  });

  return (
    <section className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50/70 via-white to-orange-50/60 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-700">Idealized impact lens</div>
          <h3 className="mt-0.5 text-sm font-semibold text-zinc-800">Approx. motion and impact transfer</h3>
        </div>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50">
            Assumptions
          </summary>
          <div className="mt-2 w-full rounded-md border border-zinc-200 bg-white p-2.5 text-[9.5px] text-zinc-500 sm:absolute sm:right-0 sm:z-20 sm:w-[360px] sm:shadow-lg">
            <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-600">
              <label>
                Energy transfer η
                <CommitNumberInput min={0} max={1} step={0.05} value={scenario.impactEfficiency} onCommit={(value) => onChange({ impactEfficiency: Math.max(0, Math.min(1, value)) })} className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-right font-mono" />
              </label>
              <label>
                Restitution e
                <CommitNumberInput min={0} max={1} step={0.05} value={scenario.impactRestitution} onCommit={(value) => onChange({ impactRestitution: Math.max(0, Math.min(1, value)) })} className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-right font-mono" />
              </label>
            </div>
            <div className="mt-2 space-y-1 leading-snug">
              <p>~ 1-D axial collision; e = 0 models the hammer and latch moving together after contact.</p>
              <p>~ Critical and full-travel equivalents divide available moving energy by the corresponding travel.</p>
              <p>~ Peak contact force still depends on contact stiffness and duration.</p>
            </div>
          </div>
        </details>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <ImpactBodyControl label="Hammer" mode={scenario.hammerMassInputMode} materialId={scenario.hammerBodyMaterialId} volumeIn3={scenario.hammerVolumeIn3} massLbm={scenario.hammerMassLbm} defaultVolumeIn3={0.31} onChange={patchHammer} />
        <ImpactBodyControl label="HF latch" mode={scenario.latchMassInputMode} materialId={scenario.latchBodyMaterialId} volumeIn3={scenario.latchVolumeIn3} massLbm={scenario.latchMassLbm} defaultVolumeIn3={0.16} onChange={patchLatch} />
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Stage number={1} title="Hammer at contact" accent="#059669">
          <Metric label="Speed" value={approximate(lens.velocity, 1, "ft/s")} />
          <div className="grid grid-cols-2 gap-1.5">
            <Metric label="Kinetic energy" value={approximate(lens.KE, 2, "ft·lbf")} />
            <Metric label="Momentum" value={approximate(lens.momentum, 2, "lbm·ft/s")} />
          </div>
        </Stage>

        <Stage number={2} title="Immediate transfer" accent="#0f766e">
          <Metric label="Impulse to latch" value={approximate(lens.impactImpulse, 3, "lbf·s")} emphasis />
          <div className="grid grid-cols-2 gap-1.5">
            <Metric label="Latch speed" value={approximate(lens.latchPostImpactVelocity, 1, "ft/s")} />
            <Metric label="Combined KE" value={approximate(lens.combinedPostImpactKE, 2, "ft·lbf")} />
          </div>
        </Stage>

        <Stage number={3} title="Critical release" accent="#d97706">
          <Metric label={`${(candidate.L3 - candidate.L2).toFixed(3)} in force equivalent`} value={approximate(lens.criticalAverageEquivalent, 0, "lbf")} emphasis />
          <div className="grid grid-cols-2 gap-1.5">
            <Metric label="Coupled speed" value={approximate(lens.criticalCoupledVelocity, 1, "ft/s")} />
            <Metric label="Combined KE" value={approximate(lens.criticalCoupledKE, 2, "ft·lbf")} />
          </div>
        </Stage>

        <Stage number={4} title="Coupled travel end" accent="#b45309">
          <Metric label={`${(candidate.L4 - candidate.L2).toFixed(3)} in drive equivalent`} value={approximate(lens.coupledAverageEquivalent, 0, "lbf")} emphasis />
          <div className="grid grid-cols-2 gap-1.5">
            <Metric label="Speed before stop" value={approximate(lens.endCoupledVelocity, 1, "ft/s")} />
            <Metric label="Drive work" value={approximate(lens.coupledDriveWork, 2, "in·lbf")} />
          </div>
        </Stage>
      </div>
    </section>
  );
}
