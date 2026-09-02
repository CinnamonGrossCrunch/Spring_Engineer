import type { V2Candidate, V2Material, V2Scenario } from "@/lib/v2/types";
import { applyScenarioImpactLens } from "@/lib/v2/impactLens";
import { calculateManufacturingToleranceEnvelope } from "@/lib/v2/toleranceEnvelope";

function Spring({ x, length, label, force, color }: { x: number; length: number; label: string; force: number; color: string }) {
  const top = 38;
  const bottom = top + 56 + 62 * length;
  const points = Array.from({ length: 18 }, (_, i) => {
    const y = top + ((bottom - top) * i) / 17;
    const px = x + (i === 0 || i === 17 ? 0 : i % 2 ? 28 : -28);
    return `${px},${y}`;
  }).join(" ");
  return (
    <g>
      <line x1={x - 42} y1={top - 8} x2={x + 42} y2={top - 8} stroke="#18181b" strokeWidth="5" strokeLinecap="round" />
      <polyline points={points} fill="none" stroke="#71717a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={x - 42} y1={bottom + 8} x2={x + 42} y2={bottom + 8} stroke="#18181b" strokeWidth="5" strokeLinecap="round" />
      <text x={x} y={18} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{label}</text>
      <text x={x} y={bottom + 27} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#27272a">{force.toFixed(1)} lbf</text>
    </g>
  );
}

export function CandidateDataSheetHero({ candidate: c, scenario, material }: { candidate: V2Candidate; scenario: V2Scenario; material: V2Material }) {
  const lens = applyScenarioImpactLens(c, scenario);
  const tolerance = calculateManufacturingToleranceEnvelope(c, scenario);
  const base = Math.max(c.L4, 0.001);
  return (
    <section className="border-b border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-blue-950 px-5 py-5 text-white">
      <div className="grid items-center gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Selected compression spring candidate</div>
          <h3 className="mt-1 text-2xl font-semibold">d {c.d.toFixed(3)} in · Na {c.Na.toFixed(2)} · {material.name}</h3>
          <p className="mt-1 text-xs text-zinc-300">Four operating states, one glance. Nominal model output—not vendor validation or measured impact force.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Hammer travel", `${c.s.toFixed(3)} in`],
              ["Hammer work", `${c.Whammer.toFixed(2)} in·lbf`],
              ["Contact force", `${c.F2.toFixed(1)} lbf`],
              ["End force / floor", `${c.F4.toFixed(1)} / ${scenario.minimumEndForce.toFixed(1)} lbf`],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-white/15 bg-white/10 p-2"><div className="text-[9px] uppercase tracking-wide text-zinc-400">{label}</div><div className="mt-0.5 font-mono text-sm font-semibold">{value}</div></div>)}
          </div>
          {lens.coupledAverageEquivalent === undefined && <p className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-200">Hammer and latch masses are incomplete, so this sheet shows spring work and ideal force equivalents only.</p>}
          {lens.coupledAverageEquivalent !== undefined && <p className="mt-2 text-[9px] leading-snug text-zinc-400">Coupled average equivalent uses combined post-impact hammer+latch KE plus spring work through the full {scenario.totalLatchTravel.toFixed(3)} in travel; not peak contact force.</p>}
          {tolerance && <p className="mt-2 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[10px] text-amber-100">Manufacturing estimate enabled: armed force {tolerance.forces.armed.min.toFixed(1)}–{tolerance.forces.armed.max.toFixed(1)} lbf. Nominal graphics remain centered on the calculated candidate.</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white p-3 text-zinc-900 shadow-xl">
          <svg viewBox="0 0 520 220" className="h-auto w-full" role="img" aria-label="Spring at armed, hammer-contact, critical-release and full-travel-end lengths">
            <Spring x={65} length={c.Lc / base} label="ARMED" force={c.F0} color="#2563eb" />
            <Spring x={195} length={c.L2 / base} label="CONTACT" force={c.F2} color="#059669" />
            <Spring x={325} length={c.L3 / base} label="CRITICAL" force={c.F3} color="#d97706" />
            <Spring x={455} length={c.L4 / base} label="TRAVEL END" force={c.F4} color="#c2410c" />
          </svg>
          <div className="grid grid-cols-4 gap-1 text-center text-[9px] text-zinc-500">
            <span>L₁ {c.Lc.toFixed(3)} in</span><span>L₂ {c.L2.toFixed(3)} in</span><span>L₃ {c.L3.toFixed(3)} in</span><span>L₄ {c.L4.toFixed(3)} in</span>
          </div>
        </div>
      </div>
    </section>
  );
}
