"use client";

import type { ReactNode } from "react";
import type { ConstraintResult } from "@/lib/engineering/types";
import { PARAMETER_MAP } from "@/lib/engineering/parameters";
import { formatValue, inchesToMm } from "../StatusBadge";
import { ParametricCompressionSpring } from "./ParametricCompressionSpring";
import { isRenderableSpring } from "./springSvgGeometry";

/**
 * Parametric three-state elevation schematic of the spring/hammer/latch
 * mechanism. Every displayed value is consumed from the solver output —
 * no engineering equations live in this component. Only unit→pixel
 * mapping and schematic body sizing happen here.
 *
 * Visual conventions documented inline:
 *  - ONE uniform pxPerUnit scale is used for both axes and all 3 states,
 *    so spring width vs. height is proportionally meaningful.
 *  - Force-arrow length scales modestly with F/F1 (base 18 px + up to
 *    16 px) — qualitative, not a quantitative force scale.
 *  - Hammer/latch silhouettes are sized relative to OD and are purely
 *    illustrative, not design-controlled dimensions.
 */

const SVG_W = 760;
const SVG_H = 300;
const TOP_PAD = 18;
const BOTTOM_PAD = 46;

const COLORS = {
  spring: "#3f3f46",
  springSteelFront: "#52525b",
  springSteelBack: "#71717a",
  springNear: "#d97706",
  springViolated: "#dc2626",
  springViolatedBack: "#f87171",
  springSelected: "#1d4ed8",
  springSelectedBack: "#60a5fa",
  dim: "#71717a",
  dimSelected: "#1d4ed8",
  hammerFill: "#ccfbf1",
  hammerStroke: "#0f766e",
  latchFill: "#ffedd5",
  latchStroke: "#c2410c",
  force: ["#2563eb", "#059669", "#b45309"],
};

interface Props {
  values: Record<string, number | undefined>;
  selectedId: string | null;
  constraints: ConstraintResult[];
  onSelect: (id: string) => void;
}

/** Accessible clickable SVG callout group. */
function SvgButton({
  paramId,
  onSelect,
  children,
}: {
  paramId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const def = PARAMETER_MAP[paramId];
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select ${def?.name ?? paramId}`}
      onClick={() => onSelect(paramId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(paramId);
        }
      }}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <title>{def ? `${def.name} — click to inspect` : paramId}</title>
      {children}
    </g>
  );
}

export function SpringStateIllustration({ values, selectedId, constraints, onSelect }: Props) {
  const num = (id: string): number | undefined => {
    const v = values[id];
    return v !== undefined && Number.isFinite(v) ? v : undefined;
  };

  // Imperial-first display helpers (metric stays available via tooltip / inspector).
  const inch = (x?: number) => (x === undefined || !Number.isFinite(x) ? "—" : `${formatValue(x)} in`);
  const lbf = (x?: number) => (x === undefined || !Number.isFinite(x) ? "—" : `${Math.round(x)} lbf`);
  const coils = (x?: number) => (x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(2));
  const mm = (x?: number) => (x === undefined || !Number.isFinite(x) ? "" : `${formatValue(inchesToMm(x))} mm`);

  const d = num("d");
  const D = num("D");
  const OD = num("OD");
  const Nt = num("Nt");
  const L1 = num("L_min");
  const L2 = num("L2");
  const L3 = num("L3");
  const s_h = num("s_h");
  const y_latch = num("y_latch");
  const x1 = num("x1");
  const F1 = num("F1");
  const F2 = num("F2");
  const F3 = num("F3");
  const HsMax = num("Hs_max");
  const cExtra = num("c_extra") ?? 0;

  const coilBind = constraints.find((c) => c.id === "coil_bind");
  const stress = constraints.find((c) => c.id === "stress");

  const ready =
    d !== undefined &&
    D !== undefined &&
    OD !== undefined &&
    Nt !== undefined &&
    L1 !== undefined &&
    L2 !== undefined &&
    L3 !== undefined &&
    s_h !== undefined &&
    y_latch !== undefined &&
    F1 !== undefined &&
    F2 !== undefined &&
    F3 !== undefined &&
    [L1, L2, L3].every((L) => isRenderableSpring({ wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength: L }));

  const layout = (() => {
    if (!ready) return null;
    // Schematic body sizes (engineering units, relative to OD — illustrative only).
    const hammerH = 0.5 * OD!;
    const hammerW = 1.7 * OD!;
    const latchH = 0.42 * OD!;
    const latchW = 2.1 * OD!;
    // Tallest stack: state 3 → L3 + hammer + latch.
    const envelope = L3! + hammerH + latchH;
    const colW = SVG_W / 3;
    const availH = SVG_H - TOP_PAD - BOTTOM_PAD;
    // ONE uniform engineering-unit → px scale for both axes / all states.
    const pxPerUnit = Math.min(availH / envelope, (colW * 0.62) / Math.max(latchW, OD!));
    const baselineY = SVG_H - BOTTOM_PAD;
    return { hammerH, hammerW, latchH, latchW, colW, pxPerUnit, baselineY };
  })();

  // Near-solid-height advisory (display only). A near-limit spring is NOT
  // recolored bright amber — it stays neutral steel and surfaces a small badge.
  const solidMargin = L1 !== undefined && HsMax !== undefined ? L1 - HsMax : undefined;
  const nearSolid =
    (!coilBind || coilBind.ok) &&
    solidMargin !== undefined &&
    solidMargin < Math.max(0.01, 2 * cExtra);

  // Default is neutral steel with cylindrical depth shading. Only an actual
  // coil-bind failure (red) or an active geometry selection (blue) recolors it.
  const springPalette = (() => {
    if (coilBind && !coilBind.ok)
      return { front: COLORS.springViolated, back: COLORS.springViolatedBack };
    if (selectedId && ["d", "D", "OD", "ID", "Nt", "Na"].includes(selectedId))
      return { front: COLORS.springSelected, back: COLORS.springSelectedBack };
    return { front: COLORS.springSteelFront, back: COLORS.springSteelBack };
  })();

  const geometryItems = [
    { id: "d", name: "Wire diameter", sym: "d", value: inch(d) },
    { id: "OD", name: "Outer diameter", sym: "OD", value: inch(OD) },
    { id: "ID", name: "Inner diameter", sym: "ID", value: inch(num("ID")) },
    { id: "Nt", name: "Total coils", sym: "N_t", value: coils(Nt) },
    { id: "Na", name: "Active coils", sym: "N_a", value: coils(num("Na")) },
    { id: "k", name: "Spring rate", sym: "k", value: `${formatValue(num("k"))} lbf/in` },
    { id: "L_free", name: "Free length", sym: "L_f", value: inch(num("L_free")) },
  ];

  const stateCards = ready
    ? [
        { n: 1, title: "Maximum Working Deflection", sub: "Starting state", accent: COLORS.force[0], forceLabel: "Starting force", F: F1, Fid: "F1", Fsym: "F1", L: L1, Lid: "L_min", Lsym: "L1" },
        { n: 2, title: "Hammer Contact", sub: "after sₕ run-up stroke", accent: COLORS.force[1], forceLabel: "Spring force at contact", F: F2, Fid: "F2", Fsym: "F2", L: L2, Lid: "L2", Lsym: "L2" },
        { n: 3, title: "HF Latch Follow-Through", sub: "additional yₗ follow-through travel", accent: COLORS.force[2], forceLabel: "After latch follow-through", F: F3, Fid: "F3", Fsym: "F3", L: L3, Lid: "L3", Lsym: "L3" },
      ]
    : [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      {/* Header — title + constraint status only */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800">Spring Mechanism States</h2>
        <div className="flex items-center gap-2">
          {stress && !stress.ok && (
            <span className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              Stress constraint exceeded
            </span>
          )}
          {coilBind && !coilBind.ok && (
            <span className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              Coil bind
            </span>
          )}
          {nearSolid && solidMargin !== undefined && (
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              Solid-height margin: {formatValue(solidMargin)} in
            </span>
          )}
        </div>
      </div>

      {!ready || !layout ? (
        <p className="py-12 text-center text-sm text-zinc-400">
          Cannot render spring: current geometry is physically invalid or unresolved. See the
          constraint panel for details.
        </p>
      ) : (
        <>
          {/* State headers — strong, readable titles */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {stateCards.map((s) => (
              <div key={s.n} className="flex items-start gap-1.5">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: s.accent }}
                >
                  {s.n}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold leading-tight text-zinc-800">{s.title}</div>
                  <div className="text-[10.5px] leading-tight text-zinc-400">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Drawing — fills width, no desktop scrollbar */}
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="mt-2 block h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Three-state elevation schematic: maximum working deflection, hammer contact, latch follow-through"
          >
            {(() => {
              const { hammerH, hammerW, latchH, latchW, colW, pxPerUnit, baselineY } = layout;
              const toY = (units: number) => baselineY - units * pxPerUnit;
              const latchBottom0 = L1! + hammerH + s_h!; // latch stationary until contact
              const maxF = Math.max(F1!, 1e-9);
              const dimC = (sel: boolean) => (sel ? COLORS.dimSelected : COLORS.dim);

              const svgStates = [
                { L: L1!, F: F1!, Fid: "F1", Lid: "L_min", color: COLORS.force[0], hammerBottom: L1!, latchBottom: latchBottom0 },
                { L: L2!, F: F2!, Fid: "F2", Lid: "L2", color: COLORS.force[1], hammerBottom: L2!, latchBottom: latchBottom0 },
                { L: L3!, F: F3!, Fid: "F3", Lid: "L3", color: COLORS.force[2], hammerBottom: L3!, latchBottom: latchBottom0 + y_latch! },
              ];

              return (
                <>
                  {/* shared fixed spring datum */}
                  <line
                    x1={8}
                    y1={baselineY}
                    x2={SVG_W - 8}
                    y2={baselineY}
                    stroke="#d4d4d8"
                    strokeWidth={1}
                    strokeDasharray="6 4"
                  />

                  {svgStates.map((s, i) => {
                    const cx = colW * (i + 0.5);
                    const springHalf = (OD! / 2) * pxPerUnit;
                    const forceX = cx + springHalf + 12;
                    const forceLen = 16 + 14 * Math.max(0, Math.min(1, s.F / maxF));
                    const fSel = selectedId === s.Fid;

                    return (
                      <g key={i}>
                        {/* spring — same d / D / N_t in all states; only length & pitch change */}
                        <g>
                          <title>
                            {`Spring — OD ${inch(OD)} · ID ${inch(num("ID"))} · wire ${inch(d)} · ${coils(Nt)} coils`}
                          </title>
                          <ParametricCompressionSpring
                            spec={{ wireDiameter: d!, meanDiameter: D!, totalCoils: Nt!, currentLength: s.L }}
                            centerX={cx}
                            bottomY={baselineY}
                            pxPerUnit={pxPerUnit}
                            colors={springPalette}
                            highlighted={selectedId === s.Lid}
                          />
                        </g>

                        {/* hammer (identical geometry in all states; only position changes) */}
                        <rect
                          x={cx - (hammerW / 2) * pxPerUnit}
                          y={toY(s.hammerBottom + hammerH)}
                          width={hammerW * pxPerUnit}
                          height={hammerH * pxPerUnit}
                          rx={2}
                          fill={COLORS.hammerFill}
                          stroke={COLORS.hammerStroke}
                          strokeWidth={1.2}
                        />

                        {/* HF latch (identical geometry; stationary until contact) */}
                        <rect
                          x={cx - (latchW / 2) * pxPerUnit}
                          y={toY(s.latchBottom + latchH)}
                          width={latchW * pxPerUnit}
                          height={latchH * pxPerUnit}
                          rx={2}
                          fill={COLORS.latchFill}
                          stroke={COLORS.latchStroke}
                          strokeWidth={1.2}
                        />

                        {/* subtle qualitative spring-force cue — the readable value lives in the callout below */}
                        <SvgButton paramId={s.Fid} onSelect={onSelect}>
                          <g>
                            <line
                              x1={forceX}
                              y1={baselineY - 2}
                              x2={forceX}
                              y2={baselineY - 2 - forceLen}
                              stroke={s.color}
                              strokeWidth={fSel ? 2.6 : 1.8}
                              opacity={fSel ? 1 : 0.85}
                            />
                            <path
                              d={`M ${forceX - 3.5} ${baselineY - 2 - forceLen + 6} L ${forceX} ${baselineY - 2 - forceLen} L ${forceX + 3.5} ${baselineY - 2 - forceLen + 6}`}
                              fill="none"
                              stroke={s.color}
                              strokeWidth={fSel ? 2.6 : 1.8}
                              opacity={fSel ? 1 : 0.85}
                            />
                          </g>
                        </SvgButton>

                        {/* At most two geometry leaders on the drawing: OD + wire d (state 1 only). */}
                        {i === 0 && (
                          <>
                            <SvgButton paramId="OD" onSelect={onSelect}>
                              <g>
                                <line x1={cx - springHalf} y1={baselineY + 22} x2={cx + springHalf} y2={baselineY + 22} stroke={dimC(selectedId === "OD")} strokeWidth={selectedId === "OD" ? 1.6 : 1} />
                                <line x1={cx - springHalf} y1={baselineY + 18} x2={cx - springHalf} y2={baselineY + 26} stroke={dimC(selectedId === "OD")} strokeWidth={1} />
                                <line x1={cx + springHalf} y1={baselineY + 18} x2={cx + springHalf} y2={baselineY + 26} stroke={dimC(selectedId === "OD")} strokeWidth={1} />
                                <text x={cx} y={baselineY + 35} fontSize={12} fill={dimC(selectedId === "OD")} textAnchor="middle" fontWeight={selectedId === "OD" ? 700 : 600} textDecoration={selectedId === "OD" ? "underline" : undefined} fontFamily="var(--font-geist-mono), monospace">
                                  OD
                                </text>
                              </g>
                            </SvgButton>
                            <SvgButton paramId="d" onSelect={onSelect}>
                              <g>
                                <line x1={cx - (D! / 2) * pxPerUnit} y1={toY(s.L * 0.45)} x2={cx - springHalf - 22} y2={toY(s.L * 0.45) - 12} stroke={dimC(selectedId === "d")} strokeWidth={selectedId === "d" ? 1.6 : 1} />
                                <text x={cx - springHalf - 24} y={toY(s.L * 0.45) - 15} fontSize={12} fill={dimC(selectedId === "d")} textAnchor="end" fontWeight={selectedId === "d" ? 700 : 600} textDecoration={selectedId === "d" ? "underline" : undefined} fontFamily="var(--font-geist-mono), monospace">
                                  d
                                </text>
                              </g>
                            </SvgButton>
                          </>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>

          {/* Body legend */}
          <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-zinc-400">
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

          {/* Level 1 (force outcome) + Level 2 (loaded length / deflection) */}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {stateCards.map((s) => (
              <div key={s.n} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.Fid)}
                  title={`${PARAMETER_MAP[s.Fid]?.name ?? s.Fid} — click to inspect`}
                  className={`flex flex-col items-start rounded-md border bg-white px-2.5 py-1.5 text-left transition-colors hover:border-zinc-400 ${
                    selectedId === s.Fid ? "ring-1 ring-blue-200" : ""
                  }`}
                  style={{
                    borderColor: selectedId === s.Fid ? s.accent : "#e4e4e7",
                    borderLeftWidth: 3,
                    borderLeftColor: s.accent,
                  }}
                >
                  <span className="text-[10px] leading-none">
                    <span className="font-mono font-bold" style={{ color: s.accent }}>{s.Fsym}</span>
                    <span className="text-zinc-400"> · {s.forceLabel}</span>
                  </span>
                  <span className="mt-1 font-mono text-[18px] font-bold leading-none" style={{ color: s.accent }}>
                    {lbf(s.F)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelect(s.Lid)}
                  title={`${PARAMETER_MAP[s.Lid]?.name ?? s.Lid}${mm(s.L) ? ` = ${mm(s.L)}` : ""} — click to inspect`}
                  className={`flex items-baseline justify-between gap-2 rounded border px-2 py-1 text-left transition-colors hover:border-zinc-400 ${
                    selectedId === s.Lid ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <span className="text-[10px] text-zinc-500">Loaded length</span>
                  <span className="font-mono text-[11.5px] font-medium text-zinc-800">
                    {s.Lsym} = {inch(s.L)}
                  </span>
                </button>

                {s.n === 1 && (
                  <button
                    type="button"
                    onClick={() => onSelect("x1")}
                    title={`${PARAMETER_MAP["x1"]?.name ?? "x1"}${mm(x1) ? ` = ${mm(x1)}` : ""} — click to inspect`}
                    className={`flex items-baseline justify-between gap-2 rounded border px-2 py-1 text-left transition-colors hover:border-zinc-400 ${
                      selectedId === "x1" ? "border-blue-400 bg-blue-50" : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <span className="text-[10px] text-zinc-500">Max deflection</span>
                    <span className="font-mono text-[11.5px] font-medium text-zinc-800">x1 = {inch(x1)}</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Transition travel: sₕ run-up stroke (1→2) and yₗ follow-through travel (2→3) */}
          <div className="relative mt-1.5 h-7">
            <button
              type="button"
              onClick={() => onSelect("s_h")}
              title={`${PARAMETER_MAP["s_h"]?.name ?? "s_h"} — click to inspect`}
              style={{ left: "33.333%" }}
              className={`absolute top-0 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors hover:border-zinc-400 ${
                selectedId === "s_h" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-600"
              }`}
            >
              <span className="text-zinc-400">─</span>
              <span className="font-mono">s_h = {inch(s_h)}</span>
              <span aria-hidden className="text-zinc-400">▶</span>
            </button>
            <button
              type="button"
              onClick={() => onSelect("y_latch")}
              title={`${PARAMETER_MAP["y_latch"]?.name ?? "y_latch"} — click to inspect`}
              style={{ left: "66.666%" }}
              className={`absolute top-0 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors hover:border-zinc-400 ${
                selectedId === "y_latch" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-600"
              }`}
            >
              <span className="text-zinc-400">─</span>
              <span className="font-mono">+ yₗ = {inch(y_latch)}</span>
              <span aria-hidden className="text-zinc-400">▶</span>
            </button>
          </div>

          {/* Subtle disambiguation note — kept out of the main visual story */}
          <p className="mt-1 text-[10px] leading-4 text-zinc-400">
            Spring force at contact (F2) is not the dynamic impact force — peak impact also depends on
            contact stiffness and collision duration.
          </p>

          {/* Level 3 — shared spring geometry (shown once, not repeated per state) */}
          <div className="mt-3 border-t border-zinc-100 pt-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Spring geometry
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
              {geometryItems.map((g) => {
                const def = PARAMETER_MAP[g.id];
                const tip = def?.formula ? `${def.name}: ${def.formula}` : (def?.name ?? g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelect(g.id)}
                    title={tip}
                    className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                      selectedId === g.id ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-zinc-50"
                    }`}
                  >
                    <span className="text-[11.5px] text-zinc-600">
                      {g.name} <span className="font-mono text-[10px] text-zinc-400">({g.sym})</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] font-medium text-zinc-800">{g.value}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model assumptions — available but subdued */}
          <details className="mt-2 border-t border-zinc-100 pt-2">
            <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">Model assumptions</summary>
            <ul className="mt-1 grid list-disc grid-cols-1 gap-x-4 pl-4 text-[10.5px] leading-4 text-zinc-400 sm:grid-cols-2">
              <li>1:1 spring/hammer displacement</li>
              <li>continuous spring drive</li>
              <li>hammer / latch bodies illustrative</li>
              <li>spring geometry proportional</li>
              <li>force-arrow length qualitative</li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
