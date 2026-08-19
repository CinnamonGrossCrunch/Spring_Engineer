"use client";

import type { V2ExclusionReason, V2SweepResult } from "@/lib/v2/types";

const REASON_LABEL: Record<V2ExclusionReason, string> = {
  "invalid-geometry": "Invalid geometry",
  "no-run-up": "Spring consumes the axial budget (no hammer stroke)",
  "slack-at-contact": "Spring slack at contact (F₂ ≤ 0)",
  "stops-driving": "Spring stops driving before latch release (F₃ ≤ 0)",
  "stress-redesign": "Above 60% stress guidance (Lee redesign region)",
};

const MODELED = [
  "Linear helical spring rate",
  "Geometry (OD locked, D/ID/index derived)",
  "Closed-and-ground coil relation (Nt = Na + 2)",
  "Nominal solid height (Nt · d)",
  "Lee +5% solid-height tolerance",
  "Scenario maximum-deflection utilization and candidate-specific solid clearance",
  "Wahl-corrected operating shear stress at F₀",
  "Lee stress-to-tensile guidance bands (40 / 60%)",
  "Axial packaging trade (Lc + s = B)",
  "Spring force through the stroke",
  "Ideal spring work (hammer + latch)",
];

const NOT_MODELED = [
  "Exact material condition / wire tensile certification",
  "Fatigue life · relaxation · preset process",
  "Compressed OD growth under load (radial housing fit)",
  "Detailed pitch / coiling manufacturability",
  "Dynamic contact force · impact duration · contact stiffness",
  "Rebound / contact compliance",
  "Transfer efficiency unless supplied",
  "Full production tolerance stack",
];

/**
 * V2 model-completeness disclosure + no-silent-failure feasibility summary.
 * A candidate can be "mathematically feasible in V2" without being "vendor
 * validated" — this panel makes that boundary explicit.
 */
export function V2AssumptionsPanel({ sweep }: { sweep: V2SweepResult }) {
  const total = sweep.totalCount;
  const excluded = total - sweep.feasibleCount;

  const reasonRows = (Object.entries(sweep.exclusionStats) as [V2ExclusionReason, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-800">What V2 does / does not know</h2>
      </div>

      {/* Feasibility summary — never an empty result without explanation */}
      <div className="border-b border-zinc-100 px-3 py-2.5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
            Feasibility summary
          </span>
          <span className="text-[11px] text-zinc-500">
            <span className="font-semibold text-emerald-600">{sweep.feasibleCount}</span> feasible ·{" "}
            {excluded} excluded of {total}
          </span>
        </div>
        {sweep.feasibleCount === 0 && (
          <p className="mb-1.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
            No candidate in the current sweep satisfies all selected boundaries. Adjust the scenario
            (OD, budget, deflection utilization) or the search bounds.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {reasonRows.length === 0 ? (
            <li className="text-[11px] text-zinc-400">All candidates feasible.</li>
          ) : (
            reasonRows.map(([reason, n]) => {
              const pct = total > 0 ? Math.round((n / total) * 100) : 0;
              return (
                <li key={reason} className="flex items-center gap-2">
                  <span className="w-9 text-right font-mono text-[10.5px] text-zinc-500">{pct}%</span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-zinc-100">
                    <span className="block h-full rounded bg-zinc-400" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="min-w-0 flex-[2] text-[10.5px] text-zinc-500">{REASON_LABEL[reason]}</span>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Modeled / not modeled */}
      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b border-zinc-100 px-3 py-2.5 sm:border-b-0 sm:border-r">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Modeled</div>
          <ul className="flex flex-col gap-0.5">
            {MODELED.map((m) => (
              <li key={m} className="flex gap-1.5 text-[10.5px] leading-tight text-zinc-600">
                <span className="text-emerald-500">✓</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-3 py-2.5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
            Not yet modeled — vendor validation required
          </div>
          <ul className="flex flex-col gap-0.5">
            {NOT_MODELED.map((m) => (
              <li key={m} className="flex gap-1.5 text-[10.5px] leading-tight text-zinc-600">
                <span className="text-amber-500">•</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
