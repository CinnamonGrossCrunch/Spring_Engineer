"use client";

import type { V2Candidate } from "@/lib/v2/types";
import { formatValue, inchesToMm } from "../StatusBadge";
import { ParametricCompressionSpring } from "../SpringStateIllustration/ParametricCompressionSpring";
import { isRenderableSpring } from "../SpringStateIllustration/springSvgGeometry";
import { fmtWork } from "./v2format";

const SVG_W = 720;
const LEFT_PAD = 150;
const RIGHT_PAD = 16;
const STATE_W = (SVG_W - LEFT_PAD - RIGHT_PAD) / 3;
const SVG_H = 372;
const TOP_PAD = 8;
const BOTTOM_PAD = 92;

const FORCE_COLORS = ["#2563eb", "#059669", "#b45309"]; // F0 · F2 · F3

const COLORS = {
  springFront: "#52525b",
  springBack: "#71717a",
  hammerFill: "#ccfbf1",
  hammerStroke: "#0f766e",
  latchFill: "#ffedd5",
  latchStroke: "#c2410c",
  budget: "#0891b2",
  spring: "#334155",
  stroke: "#7c3aed",
  green: "#059669",
  od: "#18181b",
  ext: "#cbd5e1",
};

interface Props {
  candidate: V2Candidate;
}

function arrowHead(x: number, y: number, dir: "up" | "down" | "left" | "right", color: string, s = 4.5) {
  const dp =
    dir === "up"
      ? `M ${x - s} ${y + s} L ${x} ${y} L ${x + s} ${y + s}`
      : dir === "down"
        ? `M ${x - s} ${y - s} L ${x} ${y} L ${x + s} ${y - s}`
        : dir === "left"
          ? `M ${x + s} ${y - s} L ${x} ${y} L ${x + s} ${y + s}`
          : `M ${x - s} ${y - s} L ${x} ${y} L ${x - s} ${y + s}`;
  return <path d={dp} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />;
}

/**
 * V2 three-state mechanism. Reuses the shared parametric compression-spring
 * renderer (no drawing logic duplicated) and re-labels it for the V2
 * first-principles problem:
 *
 *   STATE 1 ARMED/COMPRESSED   spring = Lc, F0, visible hammer gap s, Lc + s = B
 *   STATE 2 HAMMER CONTACT      spring = L2 = B, F2, Whammer
 *   STATE 3 LATCH FOLLOW-THROUGH spring = L3 = B + y, F3, Wlatch
 */
export function V2CandidateMechanism({ candidate: c }: Props) {
  const { d, D, OD, ID, Nt, Na, Lc, s, L2, L3, F0, F2, F3, Whammer, Wlatch } = c;
  const B = c.L2; // axial budget (= Lc + s)
  const y = c.L3 - c.L2; // latch follow-through

  const inch = (x: number) => `${formatValue(x)} in`;
  const mm = (x: number) => `${formatValue(inchesToMm(x))} mm`;
  const lbf = (x: number) => `${Math.round(x)} lbf`;

  const ready =
    [Lc, L2, L3].every((L) => isRenderableSpring({ wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength: L })) &&
    s > 0;

  const stateTitles = [
    { n: 1, title: "Armed / Compressed", sub: "Maximum operating load", accent: FORCE_COLORS[0] },
    { n: 2, title: "Hammer Contact", sub: "After hammer run-up stroke", accent: FORCE_COLORS[1] },
    { n: 3, title: "Latch Follow-Through", sub: "After additional latch follow-through travel", accent: FORCE_COLORS[2] },
  ];

  const gridCols = `${LEFT_PAD}fr ${STATE_W}fr ${STATE_W}fr ${STATE_W}fr`;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800">Selected Candidate — Three-State Mechanism</h2>
        <p className="text-[11px] text-zinc-400">Spring force at contact ≠ dynamic impact force.</p>
      </div>

      {!ready ? (
        <p className="py-12 text-center text-sm text-zinc-400">
          This candidate cannot be rendered: geometry is invalid or the spring consumes the entire
          axial budget (no hammer stroke).
        </p>
      ) : (
        <>
          {/* Title row */}
          <div className="mt-2 grid items-end gap-0" style={{ gridTemplateColumns: gridCols }}>
            <div className="pr-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Axial Budget</div>
              <div className="text-[9.5px] leading-tight text-zinc-400">Lc + s = B</div>
            </div>
            {stateTitles.map((st) => (
              <div key={st.n} className="flex items-start gap-1.5 px-1">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: st.accent }}
                >
                  {st.n}
                </span>
                <div className="min-w-0">
                  <div className="text-[11.5px] font-semibold uppercase leading-tight tracking-tight text-zinc-800">
                    {st.title}
                  </div>
                  <div className="text-[10px] leading-tight text-zinc-400">{st.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="mt-0.5 block h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="V2 three-state mechanism: armed/compressed, hammer contact, latch follow-through"
          >
            {(() => {
              const hammerH = 0.1 * OD;
              const latchH = 0.1 * OD;
              const latchBase = B + hammerH; // latch bottom for states 1 and 2
              const envelope = latchBase + y + latchH;
              const availH = SVG_H - TOP_PAD - BOTTOM_PAD;
              const maxVisualWidthUnits = OD + d;
              const pxPerUnit = Math.min(availH / envelope, (STATE_W * 0.82) / maxVisualWidthUnits);
              const baselineY = SVG_H - BOTTOM_PAD;
              const toY = (u: number) => baselineY - u * pxPerUnit;
              const cx = (i: number) => LEFT_PAD + STATE_W * (i + 0.5);
              const strokePx = Math.max(1.25, d * pxPerUnit);
              const springW = OD * pxPerUnit + strokePx;

              const svgStates = [
                { L: Lc, hammerBottom: Lc, latchBottom: latchBase },
                { L: L2, hammerBottom: L2, latchBottom: latchBase },
                { L: L3, hammerBottom: L3, latchBottom: latchBase + y },
              ];

              // Below-datum dimension rows (State 1).
              const cx1 = cx(0);
              const odHalf = (OD / 2) * pxPerUnit;
              const springLeft = cx1 - odHalf;
              const yWire = baselineY + 16;
              const yID = baselineY + 36;
              const yOD = baselineY + 62;

              return (
                <>
                  {/* datum */}
                  <line x1={LEFT_PAD - 12} y1={baselineY} x2={SVG_W - 6} y2={baselineY} stroke="#d4d4d8" strokeWidth={1} strokeDasharray="6 4" />

                  {/* ── Axial-budget bracket (hero relationship) — left gutter ── */}
                  {(() => {
                    const bx = LEFT_PAD - 62;
                    const tick = 8;
                    const y0 = toY(0);
                    const yLc = toY(Lc);
                    const yB = toY(B);
                    const midLc = (y0 + yLc) / 2;
                    const midS = (yLc + yB) / 2;
                    const leaderX = cx1 - springW / 2 - 10;
                    return (
                      <g>
                        {/* main vertical line + end/mid ticks */}
                        <line x1={bx} y1={y0} x2={bx} y2={yB} stroke={COLORS.budget} strokeWidth={1.6} />
                        <line x1={bx} y1={y0} x2={bx + tick} y2={y0} stroke={COLORS.budget} strokeWidth={1.6} />
                        <line x1={bx} y1={yLc} x2={bx + tick} y2={yLc} stroke={COLORS.spring} strokeWidth={1.4} strokeDasharray="3 2" />
                        <line x1={bx} y1={yB} x2={bx + tick} y2={yB} stroke={COLORS.budget} strokeWidth={1.6} />
                        {/* leader extensions to State-1 geometry levels */}
                        <line x1={bx + tick} y1={y0} x2={leaderX} y2={y0} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={bx + tick} y1={yLc} x2={leaderX} y2={yLc} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={bx + tick} y1={yB} x2={leaderX} y2={yB} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        {/* Lc portion */}
                        <text x={bx - 6} y={midLc - 3} fontSize={9.5} textAnchor="end" fontWeight={700} fill={COLORS.budget} fontFamily="var(--font-geist-mono), monospace">
                          Lc = {inch(Lc)}
                        </text>
                        <text x={bx - 6} y={midLc + 8} fontSize={8} textAnchor="end" fill="#94a3b8">
                          compressed spring length
                        </text>
                        <text
                          x={bx - 6}
                          y={midLc + 20}
                          fontSize={9}
                          textAnchor="end"
                          fill={COLORS.budget}
                          fontFamily="var(--font-geist-mono), monospace"
                        >
                          Nₜ = {Nt.toFixed(2)}
                        </text>
                        <text
                          x={bx - 6}
                          y={midLc + 31}
                          fontSize={9}
                          textAnchor="end"
                          fill={COLORS.budget}
                          fontFamily="var(--font-geist-mono), monospace"
                        >
                          Nₐ = {Na.toFixed(2)}
                        </text>
                        {/* s portion */}
                        <text x={bx - 6} y={midS - 3} fontSize={9.5} textAnchor="end" fontWeight={700} fill={COLORS.budget} fontFamily="var(--font-geist-mono), monospace">
                          s = {inch(s)}
                        </text>
                        <text x={bx - 6} y={midS + 8} fontSize={8} textAnchor="end" fill="#94a3b8">
                          run-up stroke
                        </text>
                        {/* Total */}
                        <text x={bx - 6} y={yB - 8} fontSize={9.5} textAnchor="end" fontWeight={700} fill={COLORS.spring} fontFamily="var(--font-geist-mono), monospace">
                          B = {inch(B)}
                        </text>
                        <text x={bx - 6} y={yB + 2} fontSize={8} textAnchor="end" fill="#94a3b8">
                          axial budget total
                        </text>
                      </g>
                    );
                  })()}

                  {/* ── States ── */}
                  {svgStates.map((st, i) => {
                    const centerX = cx(i);
                    return (
                      <g key={i}>
                        <ParametricCompressionSpring
                          spec={{ wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength: st.L }}
                          centerX={centerX}
                          bottomY={baselineY}
                          pxPerUnit={pxPerUnit}
                          colors={{ front: COLORS.springFront, back: COLORS.springBack }}
                        />
                        {/* hammer */}
                        <rect
                          x={centerX - springW / 2}
                          y={toY(st.hammerBottom + hammerH)}
                          width={springW}
                          height={hammerH * pxPerUnit}
                          rx={2}
                          fill={COLORS.hammerFill}
                          stroke={COLORS.hammerStroke}
                          strokeWidth={1.2}
                        />
                        {/* latch */}
                        <rect
                          x={centerX - springW / 2}
                          y={toY(st.latchBottom + latchH)}
                          width={springW}
                          height={latchH * pxPerUnit}
                          rx={2}
                          fill={COLORS.latchFill}
                          stroke={COLORS.latchStroke}
                          strokeWidth={1.2}
                        />
                      </g>
                    );
                  })}

                  {/* Transition: hammer run-up stroke s (between state 1 and 2) */}
                  {(() => {
                    const xMid = (cx(0) + cx(1)) / 2;
                    const yTop = toY(B + hammerH);
                    const yBot = toY(Lc + hammerH);
                    const labelX = xMid;
                    const labelY = yTop - 34;
                    return (
                      <g>
                        <line x1={xMid} y1={yBot} x2={xMid} y2={yTop} stroke={COLORS.stroke} strokeWidth={2} />
                        {arrowHead(xMid, yTop, "up", COLORS.stroke, 4.8)}
                        {arrowHead(xMid, yBot, "down", COLORS.stroke, 4.8)}
                        <rect
                          x={labelX - 64}
                          y={labelY - 10}
                          width={128}
                          height={24}
                          rx={3}
                          fill="white"
                          fillOpacity={0.9}
                        />
                        <text x={labelX} y={labelY} fontSize={9} textAnchor="middle" fontWeight={700} fill={COLORS.stroke}>
                          Hammer Run-Up Stroke
                        </text>
                        <text x={labelX} y={labelY + 12} fontSize={9} textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fill={COLORS.stroke}>
                          s = B − Lc
                        </text>
                      </g>
                    );
                  })()}

                  {/* Transition: latch follow-through travel +y (between state 2 and 3) */}
                  {(() => {
                    const xMid = (cx(1) + cx(2)) / 2;
                    const yTop = toY(latchBase + y + latchH);
                    const yBot = toY(latchBase + latchH);
                    return (
                      <g>
                        <line x1={xMid} y1={yBot} x2={xMid} y2={yTop} stroke={COLORS.latchStroke} strokeWidth={2} />
                        {arrowHead(xMid, yTop, "up", COLORS.latchStroke, 4.8)}
                        <text x={xMid} y={yTop - 15} fontSize={9} textAnchor="middle" fontWeight={700} fill={COLORS.latchStroke}>
                          Latch Travel
                        </text>
                        <text x={xMid} y={yTop - 5} fontSize={9} textAnchor="middle" fontFamily="var(--font-geist-mono), monospace" fill={COLORS.latchStroke}>
                          + {inch(y)}
                        </text>
                      </g>
                    );
                  })()}

                  {/* ── State-1 geometry dimensions (below datum) ── */}
                  {/* wire d (green) */}
                  {(() => {
                    const xL = springLeft;
                    const xR = springLeft + strokePx;
                    return (
                      <g>
                        <line x1={xL} y1={baselineY} x2={xL} y2={yWire + 3} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={xR} y1={baselineY} x2={xR} y2={yWire + 3} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={xL} y1={yWire} x2={xR} y2={yWire} stroke={COLORS.green} strokeWidth={1.3} />
                        {arrowHead(xL, yWire, "left", COLORS.green, 3.2)}
                        {arrowHead(xR, yWire, "right", COLORS.green, 3.2)}
                        <text x={xR + 8} y={yWire + 3} fontSize={9} textAnchor="start" fill={COLORS.green} fontFamily="var(--font-geist-mono), monospace">
                          d = {inch(d)}
                        </text>
                      </g>
                    );
                  })()}
                  {/* ID (green) */}
                  {(() => {
                    const idHalf = (ID / 2) * pxPerUnit;
                    const xL = cx1 - idHalf;
                    const xR = cx1 + idHalf;
                    return (
                      <g>
                        <line x1={xL} y1={baselineY} x2={xL} y2={yID + 3} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={xR} y1={baselineY} x2={xR} y2={yID + 3} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={xL} y1={yID} x2={xR} y2={yID} stroke={COLORS.green} strokeWidth={1.3} />
                        {arrowHead(xL, yID, "left", COLORS.green)}
                        {arrowHead(xR, yID, "right", COLORS.green)}
                        <text x={cx1} y={yID - 4} fontSize={9} textAnchor="middle" fill={COLORS.green} fontFamily="var(--font-geist-mono), monospace">
                          ID = {inch(ID)}
                        </text>
                      </g>
                    );
                  })()}
                  {/* OD (black) */}
                  {(() => {
                    const xL = cx1 - odHalf;
                    const xR = cx1 + odHalf;
                    return (
                      <g>
                        <line x1={xL} y1={baselineY} x2={xL} y2={yOD + 3} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={xR} y1={baselineY} x2={xR} y2={yOD + 3} stroke={COLORS.ext} strokeWidth={1} strokeDasharray="3 3" />
                        <line x1={xL} y1={yOD} x2={xR} y2={yOD} stroke={COLORS.od} strokeWidth={1.3} />
                        {arrowHead(xL, yOD, "left", COLORS.od)}
                        {arrowHead(xR, yOD, "right", COLORS.od)}
                        <text x={cx1} y={yOD - 4} fontSize={9} textAnchor="middle" fill={COLORS.od} fontFamily="var(--font-geist-mono), monospace">
                          OD = {inch(OD)}
                        </text>
                      </g>
                    );
                  })()}
                </>
              );
            })()}
          </svg>

          {/* legend */}
          <div className="mt-1 flex items-center justify-end gap-3 text-[10px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-[2px] border border-teal-700 bg-teal-100" /> Hammer
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-[2px] border border-orange-600 bg-orange-100" /> HF latch
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-[1px] bg-zinc-400" /> Spring
            </span>
          </div>

          {/* Bottom callouts */}
          <div className="mt-1.5 grid items-start gap-0" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {[
              { n: 1, accent: FORCE_COLORS[0], Lsym: "L₁", L: Lc, Fsym: "F₀", F: F0, extra: undefined as string | undefined, note: "Starting force at the cap." },
              { n: 2, accent: FORCE_COLORS[1], Lsym: "L₂", L: L2, Fsym: "F₂", F: F2, extra: `Hammer run-up work ${fmtWork(Whammer)}`, note: "Spring force at contact ≠ impact force." },
              { n: 3, accent: FORCE_COLORS[2], Lsym: "L₃", L: L3, Fsym: "F₃", F: F3, extra: `Latch follow-through work ${fmtWork(Wlatch)}`, note: undefined },
            ].map((cst) => (
              <div key={cst.n} className="flex flex-col gap-1 px-1">
                <div className="flex flex-col items-start rounded border border-transparent px-1.5 py-0.5">
                  <span className="text-[9.5px] leading-tight text-zinc-500">Spring Length</span>
                  <span className="font-mono text-[12px] font-medium leading-tight text-zinc-700" title={mm(cst.L)}>
                    {cst.Lsym} = {inch(cst.L)}
                  </span>
                </div>
                <div
                  className="flex flex-col items-start rounded-md border bg-white px-2 py-1"
                  style={{ borderColor: "#e4e4e7", borderLeftWidth: 3, borderLeftColor: cst.accent }}
                >
                  <span className="text-[9.5px] leading-tight text-zinc-500">Spring Force</span>
                  <span className="font-mono text-[20px] font-bold leading-none" style={{ color: cst.accent }}>
                    <span className="text-[11px] font-bold">{cst.Fsym} = </span>
                    {lbf(cst.F)}
                  </span>
                </div>
                {cst.extra && (
                  <p className="px-0.5 text-[9.5px] font-medium leading-tight text-zinc-600">{cst.extra}</p>
                )}
                {cst.note && <p className="px-0.5 text-[9px] leading-tight text-zinc-400">{cst.note}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
