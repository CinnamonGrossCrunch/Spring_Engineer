import type { V2Candidate, V2Scenario } from "@/lib/v2/types";
import { calculateManufacturingToleranceEnvelope, type MinNominalMax } from "@/lib/v2/toleranceEnvelope";
import { fmtLbf, fmtWork } from "./v2format";

function RangeRow({ label, values, format }: { label: string; values: MinNominalMax; format: (value: number) => string }) {
  return (
    <tr className="border-t border-zinc-100">
      <th scope="row" className="px-2 py-1 text-left font-medium text-zinc-600">{label}</th>
      <td className="px-2 py-1 text-right font-mono text-zinc-700">{format(values.min)}</td>
      <td className="bg-white px-2 py-1 text-right font-mono font-semibold text-zinc-900">{format(values.nominal)}</td>
      <td className="px-2 py-1 text-right font-mono text-zinc-700">{format(values.max)}</td>
    </tr>
  );
}

export function ManufacturingToleranceSummary({ candidate, scenario }: { candidate: V2Candidate; scenario: V2Scenario }) {
  const envelope = calculateManufacturingToleranceEnvelope(candidate, scenario);
  if (!envelope) return null;

  return (
    <section className="border-t border-zinc-100 bg-amber-50/35 px-3 py-2.5" data-testid="manufacturing-tolerance-summary">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Manufacturing Tolerance Estimate</h3>
          <p className="mt-0.5 text-[9.5px] text-zinc-500">
            ±{(scenario.springRateTolerance * 100).toFixed(1)}% rate and ±{scenario.freeLengthTolerance.toFixed(3)} in free length, stacked independently at fixed mechanism heights.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <span className={`rounded border px-2 py-1 text-[9.5px] font-semibold ${envelope.worstCaseForceCapPass ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-900"}`}>
            {envelope.worstCaseForceCapPass
              ? `Estimated armed maximum ≤ ${scenario.forceCap.toFixed(1)} lbf cap`
              : `Estimated armed maximum is ${envelope.worstCaseForceCapExcess.toFixed(1)} lbf over cap`}
          </span>
          <span className={`rounded border px-2 py-1 text-[9.5px] font-semibold ${envelope.worstCaseEndForcePass ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-900"}`}>
            {envelope.worstCaseEndForcePass
              ? `Estimated end minimum ≥ ${scenario.minimumEndForce.toFixed(1)} lbf floor`
              : `Estimated end minimum is ${envelope.worstCaseEndForceShortfall.toFixed(1)} lbf short`}
          </span>
        </div>
      </div>
      <div className="mt-2 grid gap-2 xl:grid-cols-2">
        <div className="overflow-hidden rounded border border-zinc-200 bg-white/80">
          <table className="w-full text-[9.5px]">
            <thead className="bg-zinc-100 text-zinc-500">
              <tr><th className="px-2 py-1 text-left">State force</th><th className="px-2 py-1 text-right">Min</th><th className="px-2 py-1 text-right">Nominal</th><th className="px-2 py-1 text-right">Max</th></tr>
            </thead>
            <tbody>
              <RangeRow label="Armed" values={envelope.forces.armed} format={fmtLbf} />
              <RangeRow label="Hammer contact" values={envelope.forces.contact} format={fmtLbf} />
              <RangeRow label="Critical release" values={envelope.forces.critical} format={fmtLbf} />
              <RangeRow label="Coupled-travel end" values={envelope.forces.end} format={fmtLbf} />
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded border border-zinc-200 bg-white/80">
          <table className="w-full text-[9.5px]">
            <thead className="bg-zinc-100 text-zinc-500">
              <tr><th className="px-2 py-1 text-left">Released work</th><th className="px-2 py-1 text-right">Min</th><th className="px-2 py-1 text-right">Nominal</th><th className="px-2 py-1 text-right">Max</th></tr>
            </thead>
            <tbody>
              <RangeRow label="Hammer run-up" values={envelope.work.hammer} format={fmtWork} />
              <RangeRow label="Critical window" values={envelope.work.critical} format={fmtWork} />
              <RangeRow label="Remaining travel" values={envelope.work.postCritical} format={fmtWork} />
              <RangeRow label="Full coupled travel" values={envelope.work.coupled} format={fmtWork} />
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-1.5 text-[9px] leading-snug text-zinc-400">
        Advisory independent-corner estimate, not a statistical confidence interval or supplier-guaranteed load. It covers only rate and free-length tolerance—not operating-height tolerance, temperature, friction, nonlinearity, solid-height variation beyond the separate modeled Hₛ,max allowance, or correlated production data. Stress, deflection/utilization, impact-equivalent values, Pareto ranking, and feasibility remain nominal.
      </p>
    </section>
  );
}
