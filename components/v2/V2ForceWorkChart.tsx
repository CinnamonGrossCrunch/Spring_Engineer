"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { V2Candidate, V2Scenario } from "@/lib/v2/types";
import { calculateManufacturingToleranceEnvelope } from "@/lib/v2/toleranceEnvelope";
import { formatLengthValue, formatValue } from "../StatusBadge";
import { fmtWork } from "./v2format";

/**
 * V2 force / work chart. Spring force vs. mechanism travel, with the AREA UNDER
 * the force–travel line shaded to teach that area = available spring work. The
 * run-up, critical-release, and remaining coupled-travel phases are delineated
 * and labeled with their work integrals. There is deliberately NO 450/900 lbf latch line —
 * those numbers are not requirements.
 */
export function V2ForceWorkChart({ candidate: c, scenario }: { candidate: V2Candidate; scenario: V2Scenario }) {
  const { s, F0, F2, F3, F4, Whammer, Wlatch, WpostCritical } = c;
  const yCritical = c.L3 - c.L2;
  const yTotal = c.L4 - c.L2;
  const critical = s + yCritical;
  const total = s + yTotal;

  const ready = [s, F0, F2, F3, F4, yCritical, yTotal].every((n) => Number.isFinite(n)) && s > 0 && yCritical > 0 && yTotal >= yCritical;

  const data = ready
    ? [
        { travel: 0, force: F0 },
        { travel: s, force: F2 },
        { travel: critical, force: F3 },
        { travel: total, force: F4 },
      ]
    : [];

  const yMax = ready ? Math.max(F0, 1) * 1.12 : 1;
  const yMin = ready ? Math.min(F4, 0) : 0;
  const xTicks = ready ? uniqueTicks([0, s, critical, total]) : [0, 1];
  const tolerance = calculateManufacturingToleranceEnvelope(c, scenario);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800">Force / Work Through Travel</h2>
        <p className="text-[11px] text-zinc-400">Area under the line = available spring work.</p>
      </div>

      {!ready ? (
        <p className="py-10 text-center text-sm text-zinc-400">
          Force / work unavailable — candidate has no positive hammer stroke.
        </p>
      ) : (
        <>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 18, right: 30, bottom: 14, left: 8 }}>
                <defs>
                  <linearGradient id="v2-work-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f1f4" />
                <XAxis
                  dataKey="travel"
                  type="number"
                  domain={[0, total]}
                  ticks={xTicks}
                  tickFormatter={(t: number) => formatLengthValue(t)}
                  label={{ value: "Mechanism travel (in / mm)", position: "insideBottom", offset: -8, style: { fontSize: 11, fill: "#71717a" } }}
                  tick={{ fontSize: 11, fill: "#71717a" }}
                  stroke="#d4d4d8"
                />
                <YAxis
                  type="number"
                  domain={[Math.min(0, yMin), yMax]}
                  tickFormatter={(t: number) => formatValue(t)}
                  label={{ value: "Spring force (lbf)", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#71717a" } }}
                  tick={{ fontSize: 11, fill: "#71717a" }}
                  stroke="#d4d4d8"
                />
                <Tooltip
                  formatter={(val) => [`${formatValue(Number(val))} lbf`, "Spring force"]}
                  labelFormatter={(l) => `travel = ${formatLengthValue(Number(l))}`}
                  contentStyle={{ fontSize: 12 }}
                />

                {/* Hammer run-up phase */}
                <ReferenceArea
                  x1={0}
                  x2={s}
                  fill="#3b82f6"
                  fillOpacity={0.06}
                  label={{ value: "Hammer run-up stroke", position: "insideTop", style: { fontSize: 10, fill: "#1d4ed8" } }}
                />
                {/* Critical release window */}
                <ReferenceArea
                  x1={s}
                  x2={critical}
                  fill="#f59e0b"
                  fillOpacity={0.09}
                  label={{ value: "Critical release", position: "insideTop", style: { fontSize: 10, fill: "#b45309" } }}
                />
                {/* Remaining coupled travel */}
                <ReferenceArea
                  x1={critical}
                  x2={total}
                  fill="#f97316"
                  fillOpacity={0.06}
                  label={{ value: "Remaining coupled travel", position: "insideTop", style: { fontSize: 10, fill: "#c2410c" } }}
                />
                <ReferenceLine x={s} stroke="#a1a1aa" strokeDasharray="4 3" label={{ value: "Hammer contact", position: "top", style: { fontSize: 10, fill: "#52525b" } }} />
                <ReferenceLine x={critical} stroke="#d97706" strokeDasharray="4 3" label={{ value: "+critical", position: "top", style: { fontSize: 9, fill: "#92400e" } }} />
                <ReferenceLine y={scenario.minimumEndForce} stroke="#059669" strokeDasharray="5 4" label={{ value: `end floor ${formatValue(scenario.minimumEndForce)} lbf`, position: "insideBottomRight", style: { fontSize: 9, fill: "#047857" } }} />
                {scenario.opposingPreload > 0 && <ReferenceLine y={scenario.opposingPreload} stroke="#71717a" strokeDasharray="2 3" label={{ value: `opposing preload ${formatValue(scenario.opposingPreload)} lbf`, position: "insideBottomLeft", style: { fontSize: 9, fill: "#52525b" } }} />}
                {F4 < 0 && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 2" />}

                {/* Area under the line = spring work */}
                <Area type="linear" dataKey="force" stroke="#18181b" strokeWidth={1.75} fill="url(#v2-work-fill)" isAnimationActive={false} dot={{ r: 3, fill: "#18181b" }} />

                <ReferenceDot x={0} y={F0} r={4} fill="#2563eb" stroke="#fff" label={{ value: `F₀ = ${formatValue(F0)} lbf`, position: "right", style: { fontSize: 10, fill: "#1e40af" } }} />
                <ReferenceDot x={s} y={F2} r={4} fill="#059669" stroke="#fff" label={{ value: `F₂ = ${formatValue(F2)} lbf`, position: "top", style: { fontSize: 10, fill: "#065f46" } }} />
                <ReferenceDot x={critical} y={F3} r={4} fill="#d97706" stroke="#fff" label={{ value: `F₃ = ${formatValue(F3)} lbf`, position: "top", style: { fontSize: 10, fill: "#92400e" } }} />
                <ReferenceDot x={total} y={F4} r={4} fill="#b45309" stroke="#fff" label={{ value: `F₄ = ${formatValue(F4)} lbf`, position: "left", style: { fontSize: 10, fill: "#92400e" } }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-blue-500/20" /> Hammer run-up work = {fmtWork(Whammer)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-amber-500/25" /> Critical-window work = {fmtWork(Wlatch)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-orange-500/20" /> Remaining-travel work = {fmtWork(WpostCritical)} gross / {fmtWork(c.WpostCriticalNet)} after preload
            </span>
            <span className="ml-auto italic">Slope = −k. Spring force at contact is not impact force.</span>
          </div>
          {tolerance && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9.5px] leading-snug text-amber-900">
              Nominal line shown. Manufacturing estimate: F₀ {fmtForceRange(tolerance.forces.armed)}, F₂ {fmtForceRange(tolerance.forces.contact)}, F₃ {fmtForceRange(tolerance.forces.critical)}, F₄ {fmtForceRange(tolerance.forces.end)}. The nominal end-force constraint {tolerance.nominalEndForcePass ? "passes" : "fails"}; the independent low-corner estimate {tolerance.worstCaseEndForcePass ? "also passes" : `falls short by ${formatValue(tolerance.worstCaseEndForceShortfall)} lbf`}. Not a peak contact-force range.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function fmtForceRange(range: { min: number; max: number }): string {
  return `${formatValue(range.min)}–${formatValue(range.max)} lbf`;
}

function uniqueTicks(ticks: number[]): number[] {
  const EPS = 1e-9;
  return ticks.filter((t, idx, arr) => arr.findIndex((o) => Math.abs(o - t) <= EPS) === idx);
}
