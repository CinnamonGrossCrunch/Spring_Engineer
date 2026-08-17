"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatLengthValue, formatValue } from "./StatusBadge";

/**
 * "Spring Force Through Mechanism Travel"
 * X: mechanism travel measured from maximum spring deflection.
 * Y: spring force. Shows F1 (start), F2 (hammer contact) and F3 (after latch
 * travel). F2 is deliberately labeled "spring force at hammer contact" —
 * NOT impact force.
 */
export function ForceTravelChart({
  F1,
  F2,
  F3,
  s_h,
  y_latch,
  F_latch_avg,
  onSelect,
}: {
  F1: number | undefined;
  F2: number | undefined;
  F3: number | undefined;
  s_h: number | undefined;
  y_latch: number | undefined;
  F_latch_avg: number | undefined;
  onSelect: (id: string) => void;
}) {
  const ready =
    F1 !== undefined &&
    F2 !== undefined &&
    F3 !== undefined &&
    s_h !== undefined &&
    y_latch !== undefined &&
    [F1, F2, F3, s_h, y_latch].every((n) => Number.isFinite(n));

  const total = ready ? s_h + y_latch : 1;
  const xTicks = ready
    ? [0, s_h, total].filter((tick, idx, arr) => {
        // Recharts can emit duplicate tick-label keys when two ticks overlap.
        // Keep only the first tick within a tiny tolerance.
        const EPS = 1e-9;
        return arr.findIndex((t) => Math.abs(t - tick) <= EPS) === idx;
      })
    : [0, 1];
  const data = ready
    ? [
        { travel: 0, force: F1 },
        { travel: s_h, force: F2 },
        { travel: total, force: F3 },
      ]
    : [];
  const yMax = ready ? Math.max(F1, 1) * 1.15 : 1;
  const yMin = ready ? Math.min(F3, 0) : 0;
  const hasLatch = F_latch_avg !== undefined && Number.isFinite(F_latch_avg) && F_latch_avg > 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800">
          Spring Force Through Mechanism Travel
        </h2>
        <p className="text-[11px] text-zinc-400">
          Spring force at contact ≠ dynamic impact force.
        </p>
      </div>

      {!ready ? (
        <p className="py-10 text-center text-sm text-zinc-400">
          Force states unresolved — check inputs and conflicts.
        </p>
      ) : (
        <>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 18, right: 30, bottom: 14, left: 8 }}>
                <CartesianGrid stroke="#f1f1f4" />
                <XAxis
                  dataKey="travel"
                  type="number"
                  domain={[0, total]}
                  ticks={xTicks}
                  tickFormatter={(t: number) => formatLengthValue(t)}
                  label={{
                    value: "Mechanism travel from max spring deflection (in / mm)",
                    position: "insideBottom",
                    offset: -8,
                    style: { fontSize: 11, fill: "#71717a" },
                  }}
                  tick={{ fontSize: 11, fill: "#71717a" }}
                  stroke="#d4d4d8"
                />
                <YAxis
                  type="number"
                  domain={[Math.min(0, yMin), yMax]}
                  tickFormatter={(t: number) => formatValue(t)}
                  label={{
                    value: "Spring force (lbf)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "#71717a" },
                  }}
                  tick={{ fontSize: 11, fill: "#71717a" }}
                  stroke="#d4d4d8"
                />
                <Tooltip
                  formatter={(val) => [`${formatValue(Number(val))} lbf`, "Spring force"]}
                  labelFormatter={(l) => `travel = ${formatLengthValue(Number(l))}`}
                  contentStyle={{ fontSize: 12 }}
                />
                {/* Latch-travel region */}
                <ReferenceArea
                  x1={s_h}
                  x2={total}
                  fill="#f59e0b"
                  fillOpacity={0.08}
                  label={{
                    value: "latch travel",
                    position: "insideTop",
                    style: { fontSize: 10, fill: "#b45309" },
                  }}
                />
                <ReferenceLine
                  x={s_h}
                  stroke="#a1a1aa"
                  strokeDasharray="4 3"
                  label={{
                    value: "2 · hammer contact",
                    position: "top",
                    style: { fontSize: 10, fill: "#52525b" },
                  }}
                />
                {F3 < 0 && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 2" />}
                {hasLatch && (
                  <ReferenceLine
                    y={F_latch_avg}
                    stroke="#7c3aed"
                    strokeDasharray="5 3"
                    label={{
                      value: `assumed latch resistance ≈ ${formatValue(F_latch_avg!)} lbf`,
                      position: "insideBottomRight",
                      style: { fontSize: 10, fill: "#6d28d9" },
                    }}
                  />
                )}
                <Line
                  type="linear"
                  dataKey="force"
                  stroke="#18181b"
                  strokeWidth={1.75}
                  dot={{ r: 3, fill: "#18181b" }}
                  isAnimationActive={false}
                />
                <ReferenceDot
                  x={0}
                  y={F1}
                  r={4}
                  fill="#2563eb"
                  stroke="#fff"
                  label={{
                    value: `F1 = ${formatValue(F1)} lbf (1 · max working deflection)`,
                    position: "right",
                    style: { fontSize: 10, fill: "#1e40af" },
                  }}
                />
                <ReferenceDot
                  x={s_h}
                  y={F2}
                  r={4}
                  fill="#059669"
                  stroke="#fff"
                  label={{
                    value: `F2 = ${formatValue(F2)} lbf (2 · spring force at hammer contact)`,
                    position: "top",
                    style: { fontSize: 10, fill: "#065f46" },
                  }}
                />
                <ReferenceDot
                  x={total}
                  y={F3}
                  r={4}
                  fill="#b45309"
                  stroke="#fff"
                  label={{
                    value: `F3 = ${formatValue(F3)} lbf (3 · latch follow-through)`,
                    position: "left",
                    style: { fontSize: 10, fill: "#92400e" },
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <button className="hover:text-zinc-800" onClick={() => onSelect("F1")} type="button">
              ● F1 · 1 max working deflection
            </button>
            <button className="hover:text-zinc-800" onClick={() => onSelect("F2")} type="button">
              ● F2 · 2 spring force at hammer contact
            </button>
            <button className="hover:text-zinc-800" onClick={() => onSelect("F3")} type="button">
              ● F3 · 3 latch follow-through
            </button>
            {hasLatch && (
              <button
                className="text-violet-600 hover:text-violet-800"
                onClick={() => onSelect("F_latch_avg")}
                type="button"
              >
                ╌ assumed latch resistance (not derived)
              </button>
            )}
            <span className="ml-auto italic">
              Slope = −k. Assumes 1:1 spring-to-hammer displacement, continuous drive.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
