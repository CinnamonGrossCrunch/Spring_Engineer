"use client";

import { useMemo, useRef, useState } from "react";
import type {
  V2Candidate,
  V2LandscapeMetric,
  V2SweepResult,
} from "@/lib/v2/types";
import { canonicalName, canonicalSym } from "@/lib/engineering/nomenclature";
import { V2_LANDSCAPE_METRICS } from "@/lib/v2/defaults";
import { formatValue } from "../StatusBadge";
import {
  STRESS_BAND_META,
  sequentialColor,
  fmtLbf,
  fmtIn,
  fmtWork,
  fmtRate,
  fmtPct,
  fmtCoils,
} from "./v2format";

interface Props {
  sweep: V2SweepResult;
  metric: V2LandscapeMetric;
  onMetricChange: (m: V2LandscapeMetric) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  shortlist: string[];
  onToggleShortlist: (key: string) => void;
}

const PAD = { left: 46, right: 14, top: 8, bottom: 30 };
const BASE_PLOT_W = 660;
const PLOT_H = 320;
const SVG_H = PLOT_H + PAD.top + PAD.bottom;

/** A candidate is "alive" when it passes every HARD constraint (stress aside). */
function isAlive(c: V2Candidate): boolean {
  const f = c.feasibility;
  return (
    f.geometryValid &&
    f.positiveRunUp &&
    f.fitsBudget &&
    f.loadedAtContact &&
    f.drivingAfterLatch
  );
}

/**
 * V2 design landscape: wire diameter (X) × active coils (Y). Each cell is one
 * spring geometry. Cell FILL encodes the selected performance metric on a
 * restrained sequential scale; feasibility is layered with separate visual
 * channels (gray = disabled, amber corner = 40–60% stress, red hatch = >60%,
 * dark outline = Pareto, blue ring = selection).
 */
export function V2DesignLandscape({
  sweep,
  metric,
  onMetricChange,
  selectedKey,
  onSelect,
  shortlist,
  onToggleShortlist,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);

  const metricInfo = V2_LANDSCAPE_METRICS.find((m) => m.id === metric) ?? V2_LANDSCAPE_METRICS[0];

  const { wireValues, coilValues, candidates } = sweep;
  const nCols = wireValues.length;
  const nRows = coilValues.length;
  const baseCellW = nCols > 0 ? BASE_PLOT_W / nCols : BASE_PLOT_W;
  const idxToRC = (i: number) => ({ row: Math.floor(i / nCols), col: i % nCols });

  // Visual constraint window: keep only two columns on each side of the
  // 40–60% TS "set" region so the landscape panel narrows while preserving
  // per-cell proportions.
  const setCols = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.feasibility.stressBand === "set" && isAlive(c))
    .map(({ i }) => idxToRC(i).col);
  const hasSetCols = setCols.length > 0;
  const minSetCol = hasSetCols ? Math.min(...setCols) : 0;
  const maxSetCol = hasSetCols ? Math.max(...setCols) : Math.max(0, nCols - 1);
  const viewMinCol = Math.max(0, minSetCol - 2);
  const viewMaxCol = Math.min(Math.max(0, nCols - 1), maxSetCol + 2);
  const visibleColCount = Math.max(1, viewMaxCol - viewMinCol + 1);

  const PLOT_W = visibleColCount * baseCellW;
  const SVG_W = PLOT_W + PAD.left + PAD.right;
  const cellW = baseCellW;
  const cellH = nRows > 0 ? PLOT_H / nRows : PLOT_H;

  // Normalize the metric over the alive candidates so the ramp spans the
  // meaningful region rather than being crushed by disabled cells.
  const range = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candidates) {
      if (!isAlive(c)) continue;
      const val = metricInfo.get(c);
      if (!Number.isFinite(val)) continue;
      if (val < lo) lo = val;
      if (val > hi) hi = val;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
    if (hi === lo) hi = lo + 1;
    return { lo, hi };
  }, [candidates, metricInfo]);

  const byKey = useMemo(() => {
    const m = new Map<string, V2Candidate>();
    for (const c of candidates) m.set(c.key, c);
    return m;
  }, [candidates]);

  const hoverCandidate = hover ? byKey.get(hover.key) : undefined;
  const shortlistSet = useMemo(() => new Set(shortlist), [shortlist]);

  const isVisibleCol = (col: number) => col >= viewMinCol && col <= viewMaxCol;
  const colX = (col: number) => PAD.left + (col - viewMinCol) * cellW;
  const rowY = (row: number) => PAD.top + (nRows - 1 - row) * cellH; // min Na at bottom

  const handlePoint = (e: React.PointerEvent<SVGRectElement>) => {
    const idxAttr = (e.target as SVGElement).getAttribute("data-idx");
    if (idxAttr === null) return;
    const cand = candidates[Number(idxAttr)];
    if (!cand) return;
    const rect = containerRef.current?.getBoundingClientRect();
    setHover({
      key: cand.key,
      x: rect ? e.clientX - rect.left : 0,
      y: rect ? e.clientY - rect.top : 0,
    });
  };

  // Axis ticks — a few evenly spaced labels.
  const xTicks = pickTicks(wireValues.slice(viewMinCol, viewMaxCol + 1), 6);
  const yTicks = pickTicks(coilValues, 6);

  const selected = selectedKey ? byKey.get(selectedKey) : undefined;
  const selCol = selected ? nearestIndex(wireValues, selected.d) : -1;
  const selRow = selected ? nearestIndex(coilValues, selected.Na) : -1;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">Design Landscape</h2>
          <p className="text-[11px] text-zinc-400">
            Wire diameter × active coils · {sweep.feasibleCount} of {sweep.totalCount} feasible
            <span className="ml-2">
              (showing {visibleColCount} of {nCols} wire columns around 40–60% TS)
            </span>
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          Color metric
          <select
            value={metric}
            onChange={(e) => onMetricChange(e.target.value as V2LandscapeMetric)}
            className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-[11px] text-zinc-700 focus:border-blue-500 focus:outline-none"
          >
            {V2_LANDSCAPE_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div ref={containerRef} className="relative">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Design landscape heatmap of wire diameter versus active coils"
        >
          <defs>
            <pattern id="v2-redhatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="#fee2e2" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="#dc2626" strokeWidth="1.1" />
            </pattern>
          </defs>

          {/* Cells */}
          {candidates.map((c, i) => {
            const { row, col } = idxToRC(i);
            if (!isVisibleCol(col)) return null;
            const x = colX(col);
            const y = rowY(row);
            const alive = isAlive(c);
            const val = metricInfo.get(c);
            const t = (val - range.lo) / (range.hi - range.lo);
            const redesign = c.feasibility.stressBand === "redesign";
            const fill = !alive
              ? "#f4f4f5"
              : redesign
                ? "url(#v2-redhatch)"
                : Number.isFinite(t)
                  ? sequentialColor(t)
                  : "#f4f4f5";
            return (
              <rect
                key={c.key}
                data-idx={i}
                x={x}
                y={y}
                width={cellW + 0.5}
                height={cellH + 0.5}
                fill={fill}
                onPointerMove={alive ? handlePoint : undefined}
                onPointerEnter={alive ? handlePoint : () => setHover(null)}
                onPointerLeave={() => setHover(null)}
                onClick={alive ? () => onSelect(c.key) : undefined}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!alive) return;
                  onToggleShortlist(c.key);
                }}
                style={{ cursor: alive ? "pointer" : "default" }}
              />
            );
          })}

          {/* Shortlisted marker — yellow X */}
          {candidates.map((c, i) => {
            if (!shortlistSet.has(c.key)) return null;
            const { row, col } = idxToRC(i);
            if (!isVisibleCol(col)) return null;
            const x = colX(col);
            const y = rowY(row);
            const pad = Math.max(1.5, Math.min(cellW, cellH) * 0.2);
            return (
              <g key={`sx-${c.key}`} pointerEvents="none">
                <line
                  x1={x + pad}
                  y1={y + pad}
                  x2={x + cellW - pad}
                  y2={y + cellH - pad}
                  stroke="#eab308"
                  strokeWidth={1.9}
                />
                <line
                  x1={x + cellW - pad}
                  y1={y + pad}
                  x2={x + pad}
                  y2={y + cellH - pad}
                  stroke="#eab308"
                  strokeWidth={1.9}
                />
              </g>
            );
          })}

          {/* Amber corner marker for 40–60% (set) band on alive cells */}
          {candidates.map((c, i) => {
            if (c.feasibility.stressBand !== "set" || !isAlive(c)) return null;
            const { row, col } = idxToRC(i);
            if (!isVisibleCol(col)) return null;
            const x = colX(col);
            const y = rowY(row);
            const s = Math.min(cellW, cellH) * 0.5;
            return (
              <path
                key={`set-${c.key}`}
                d={`M ${x + cellW - s} ${y} L ${x + cellW} ${y} L ${x + cellW} ${y + s} Z`}
                fill="#d97706"
                pointerEvents="none"
              />
            );
          })}

          {/* Pareto frontier — strong dark outline */}
          {candidates.map((c, i) => {
            if (!c.pareto) return null;
            const { row, col } = idxToRC(i);
            if (!isVisibleCol(col)) return null;
            return (
              <rect
                key={`p-${c.key}`}
                x={colX(col) + 0.5}
                y={rowY(row) + 0.5}
                width={cellW - 1}
                height={cellH - 1}
                fill="none"
                stroke="#111827"
                strokeWidth={1.4}
                pointerEvents="none"
              />
            );
          })}

          {/* Selection ring */}
          {selected && selCol >= 0 && selRow >= 0 && isVisibleCol(selCol) && (
            <rect
              x={colX(selCol) - 1}
              y={rowY(selRow) - 1}
              width={cellW + 2}
              height={cellH + 2}
              fill="none"
              stroke="#eab308"
              strokeWidth={2.4}
              pointerEvents="none"
            />
          )}

          {/* Axes frame */}
          <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="none" stroke="#d4d4d8" strokeWidth={1} />

          {/* X ticks — wire diameter */}
          {xTicks.map((t) => {
            const x = PAD.left + (t.index + 0.5) * cellW;
            return (
              <g key={`x${t.index}`}>
                <line x1={x} y1={PAD.top + PLOT_H} x2={x} y2={PAD.top + PLOT_H + 4} stroke="#a1a1aa" strokeWidth={1} />
                <text x={x} y={PAD.top + PLOT_H + 13} fontSize={5} textAnchor="middle" fill="#71717a" fontFamily="var(--font-geist-mono), monospace">
                  {t.value.toFixed(3)}
                </text>
              </g>
            );
          })}
          <text x={PAD.left + PLOT_W / 2} y={SVG_H - 4} fontSize={5.5} textAnchor="middle" fill="#52525b" fontWeight={600}>
            Wire Diameter d (in)
          </text>

          {/* Y ticks — active coils */}
          {yTicks.map((t) => {
            const y = PAD.top + (nRows - 1 - t.index + 0.5) * cellH;
            return (
              <g key={`y${t.index}`}>
                <line x1={PAD.left - 4} y1={y} x2={PAD.left} y2={y} stroke="#a1a1aa" strokeWidth={1} />
                <text x={PAD.left - 6} y={y + 2} fontSize={5} textAnchor="end" fill="#71717a" fontFamily="var(--font-geist-mono), monospace">
                  {t.value.toFixed(2)}
                </text>
              </g>
            );
          })}
          <text
            x={12}
            y={PAD.top + PLOT_H / 2}
            fontSize={5.5}
            textAnchor="middle"
            fill="#52525b"
            fontWeight={600}
            transform={`rotate(-90 12 ${PAD.top + PLOT_H / 2})`}
          >
            Active Coils Na
          </text>
        </svg>

        {/* Hover tooltip */}
        {hover && hoverCandidate && (
          <LandscapeTooltip candidate={hoverCandidate} x={hover.x} y={hover.y} maxX={SVG_W} />
        )}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-zinc-500">
        <div className="flex items-center gap-1.5">
          <span>{metricInfo.higherIsBetter ? "lower" : "higher"}</span>
          <span
            className="h-2.5 w-24 rounded-sm"
            style={{
              background: `linear-gradient(to right, ${sequentialColor(0)}, ${sequentialColor(0.5)}, ${sequentialColor(1)})`,
            }}
          />
          <span>{metricInfo.higherIsBetter ? "higher (better)" : "higher"}</span>
          <span className="ml-1 font-mono text-zinc-400">
            {formatValue(range.lo)}–{formatValue(range.hi)} {metricInfo.unit}
          </span>
        </div>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0 w-0" style={{ borderLeft: "6px solid transparent", borderTop: "6px solid #d97706" }} /> {STRESS_BAND_META.set.label} set
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 border border-red-500" style={{ background: "url(#v2-redhatch)", backgroundColor: "#fee2e2" }} /> &gt;60% redesign
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 border-[1.4px] border-zinc-900 bg-white" /> Pareto
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 border-2 border-yellow-500 bg-white" /> selected
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 text-yellow-500 font-semibold leading-none">×</span> shortlisted (right-click cell)
        </span>
      </div>
    </div>
  );
}

function LandscapeTooltip({ candidate: c, x, y, maxX }: { candidate: V2Candidate; x: number; y: number; maxX: number }) {
  const band = STRESS_BAND_META[c.feasibility.stressBand];
  const status = c.feasibility.feasible
    ? "Feasible in V2"
    : c.feasibility.reasons[0]
      ? REASON_LABEL[c.feasibility.reasons[0]]
      : "Excluded";
  return (
    <div
      className="pointer-events-none absolute z-20 w-[190px] rounded-md border border-zinc-300 bg-white/95 p-2 text-[10.5px] shadow-lg backdrop-blur-sm"
      style={{
        left: Math.min(x + 12, maxX - 40),
        top: y + 12,
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono font-semibold text-zinc-800">
          d={c.d.toFixed(3)} · Na={fmtCoils(c.Na)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-zinc-600">
        <dt>Total coils</dt><dd className="text-right font-mono">{fmtCoils(c.Nt)}</dd>
        <dt>Rate k</dt><dd className="text-right font-mono">{fmtRate(c.k)}</dd>
        <dt>Compressed Lc</dt><dd className="text-right font-mono">{fmtIn(c.Lc)}</dd>
        <dt>{canonicalName("s")} {canonicalSym("s")}</dt><dd className="text-right font-mono">{fmtIn(c.s)}</dd>
        <dt>Hammer work</dt><dd className="text-right font-mono">{fmtWork(c.Whammer)}</dd>
        <dt>Latch work</dt><dd className="text-right font-mono">{fmtWork(c.Wlatch)}</dd>
        <dt>{canonicalName("FeqAvgIdeal")}</dt><dd className="text-right font-mono">{fmtLbf(c.FeqAvgIdeal)}</dd>
        <dt>{canonicalName("F3")} {canonicalSym("F3")}</dt><dd className="text-right font-mono">{fmtLbf(c.F3)}</dd>
        <dt>Stress %TS</dt><dd className="text-right font-mono">{fmtPct(c.stressPctConservative)}</dd>
      </dl>
      <div className="mt-1 flex items-center justify-between border-t border-zinc-100 pt-1">
        <span className={`rounded border px-1 py-px text-[9px] font-semibold ${band.badge}`}>{band.short}</span>
        <span className={c.feasibility.feasible ? "text-emerald-600" : "text-zinc-500"}>{status}</span>
      </div>
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  "invalid-geometry": "Invalid geometry",
  "no-run-up": "No hammer stroke",
  "slack-at-contact": "Slack at contact",
  "stops-driving": "Stops driving (F3≤0)",
  "stress-redesign": ">60% stress",
};

function pickTicks(values: number[], count: number): { index: number; value: number }[] {
  if (values.length === 0) return [];
  if (values.length <= count) return values.map((value, index) => ({ index, value }));
  const out: { index: number; value: number }[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i / (count - 1)) * (values.length - 1));
    out.push({ index, value: values[index] });
  }
  return out;
}

function nearestIndex(values: number[], target: number): number {
  if (values.length === 0) return -1;
  const min = values[0];
  const max = values[values.length - 1];
  if (target < min - 1e-9 || target > max + 1e-9) return -1;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < values.length; i++) {
    const dd = Math.abs(values[i] - target);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  }
  return best;
}
