"use client";

import type { ReactNode } from "react";
import type { ConstraintResult } from "@/lib/engineering/types";
import { PARAMETER_MAP } from "@/lib/engineering/parameters";
import { formatValue, inchesToMm } from "../StatusBadge";
import { ParametricCompressionSpring } from "../SpringStateIllustration/ParametricCompressionSpring";
import { isRenderableSpring } from "../SpringStateIllustration/springSvgGeometry";
import { overviewName, overviewSym } from "./overviewLabels";
import { PRESET_PROVENANCE, PRESET_INFO, type PresetId } from "@/data/exampleModel";

/**
 * Overview three-state mechanism illustration.
 *
 * This is a PRESENTATION component: every number is read from the shared
 * solver output (`values`) — no engineering equations live here. It reuses
 * the same deterministic parametric spring renderer as the engineering
 * `SpringStateIllustration`, so the drawn spring reacts to wire diameter,
 * mean/OD/ID diameter, coil count, loaded length, pitch, hammer and latch
 * positions exactly as before.
 *
 * Layout goals (per product spec):
 *  - A vertical SPRING GEOMETRY specification column sits immediately LEFT of
 *    State 1, connected by restrained leader lines to the State-1 spring.
 *  - The three operating states are pushed close together so they read as a
 *    single mechanism sequence: State 1 → State 2 → State 3.
 *  - Per-state bottom callouts show loaded length + spring force (force
 *    dominant). Compact transition arrows carry the travel between states.
 */

// ── SVG figure geometry ────────────────────────────────────────────────────
const SVG_W = 720;
const LEFT_PAD = 150; // left annotation gutter: State-1 loaded-length + coil-count callouts
const RIGHT_PAD = 16;
const STATE_W = (SVG_W - LEFT_PAD - RIGHT_PAD) / 3; // three tightly-grouped state columns
const SVG_H = 392;
const TOP_PAD = 30;
const BOTTOM_PAD = 100; // OD / ID / wire-diameter dimensions live below the datum (State 1)

const FORCE_COLORS = ["#2563eb", "#059669", "#b45309"]; // F1 blue · F2 green/teal · F3 orange

// Professional dimension color grammar (per product spec):
//  · OD           → black / neutral
//  · ID + wire d  → green
//  · axial length → cyan / blue
const DIM = {
  od: "#18181b",
  green: "#059669",
  axial: "#0891b2",
  coil: "#52525b",
  ext: "#cbd5e1", // dashed extension / projection lines
};

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
  leader: "#a1a1aa",
  leaderSelected: "#1d4ed8",
  hammerFill: "#ccfbf1",
  hammerStroke: "#0f766e",
  latchFill: "#ffedd5",
  latchStroke: "#c2410c",
};

interface Props {
  values: Record<string, number | undefined>;
  selectedId: string | null;
  constraints: ConstraintResult[];
  onSelect: (id: string) => void;
  presetId: PresetId;
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
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Select ${overviewName(paramId)}`}
      onClick={() => onSelect(paramId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(paramId);
        }
      }}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <title>{`${overviewName(paramId)} — click to inspect`}</title>
      {children}
    </g>
  );
}

export function OverviewMechanism({ values, selectedId, constraints, onSelect, presetId }: Props) {
  const num = (id: string): number | undefined => {
    const v = values[id];
    return v !== undefined && Number.isFinite(v) ? v : undefined;
  };

  const inch = (x?: number) => (x === undefined || !Number.isFinite(x) ? "—" : `${formatValue(x)} in`);
  const lbf = (x?: number) => (x === undefined || !Number.isFinite(x) ? "—" : `${Math.round(x)} lbf`);
  const coils = (x?: number) => (x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(2));
  const mm = (x?: number) => (x === undefined || !Number.isFinite(x) ? "" : `${formatValue(inchesToMm(x))} mm`);

  const d = num("d");
  const D = num("D");
  const OD = num("OD");
  const ID = num("ID");
  const Nt = num("Nt");
  const L1 = num("L_min");
  const L2 = num("L2");
  const L3 = num("L3");
  const s_h = num("s_h");
  const y_latch = num("y_latch");
  const F1 = num("F1");
  const F2 = num("F2");
  const F3 = num("F3");
  const Hs = num("Hs");
  const reqClear = num("required_clearance") ?? 0;

  const coilBind = constraints.find((c) => c.id === "coil_bind");
  const stress = constraints.find((c) => c.id === "stress");

  const ready =
    d !== undefined &&
    D !== undefined &&
    OD !== undefined &&
    ID !== undefined &&
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

  // Near-solid-height advisory (display only). A near-limit spring is NOT
  // repainted bright amber — it stays neutral steel and surfaces a small badge.
  const solidMargin = L1 !== undefined && Hs !== undefined ? L1 - Hs : undefined;
  const nearSolid =
    (!coilBind || coilBind.ok) && solidMargin !== undefined && solidMargin < 2 * reqClear;

  // Default is neutral steel with cylindrical depth shading. Only a real
  // coil-bind failure (red) or an active geometry selection (blue) recolors it.
  const springSelectedIds = ["d", "D", "OD", "ID", "Nt", "Na"];
  const springPalette = (() => {
    if (coilBind && !coilBind.ok)
      return { front: COLORS.springViolated, back: COLORS.springViolatedBack };
    if (selectedId && springSelectedIds.includes(selectedId))
      return { front: COLORS.springSelected, back: COLORS.springSelectedBack };
    return { front: COLORS.springSteelFront, back: COLORS.springSteelBack };
  })();

  // Grid column template shared by the title / callout rows so they align
  // exactly with the SVG's internal spec + state columns (the SVG fills the
  // full width with a preserved aspect ratio, so x-fractions match).
  const gridCols = `${LEFT_PAD}fr ${STATE_W}fr ${STATE_W}fr ${STATE_W}fr`;

  const stateTitles = [
    { n: 1, title: "Maximum Working Deflection", sub: "Starting state", accent: FORCE_COLORS[0] },
    { n: 2, title: "Hammer Contact", sub: "After hammer run-up", accent: FORCE_COLORS[1] },
    { n: 3, title: "HF Latch Follow-Through", sub: "After additional latch travel", accent: FORCE_COLORS[2] },
  ];

  const stateCallouts = [
    { n: 1, accent: FORCE_COLORS[0], Lid: "L_min", L: L1, Fid: "F1", F: F1, note: undefined as string | undefined },
    { n: 2, accent: FORCE_COLORS[1], Lid: "L2", L: L2, Fid: "F2", F: F2, note: "Spring force at contact ≠ dynamic impact force." },
    { n: 3, accent: FORCE_COLORS[2], Lid: "L3", L: L3, Fid: "F3", F: F3, note: undefined },
  ];

  // Shared spring-construction values shown once, beside State 1.
  const Na = num("Na");

  const detailRows = [
    { id: "D", value: inch(D) },
    { id: "k", value: `${formatValue(num("k"))} lbf/in` },
    { id: "L_free", value: inch(num("L_free")) },
    { id: "C", value: formatValue(num("C")) },
    { id: "Hs", value: inch(Hs) },
    { id: "G", value: `${formatValue(num("G"))} psi` },
  ];

  // Small SVG arrowhead helper (presentation only).
  const arrowHead = (
    x: number,
    y: number,
    dir: "up" | "down" | "left" | "right",
    color: string,
    s = 4.5,
  ) => {
    const dp =
      dir === "up"
        ? `M ${x - s} ${y + s} L ${x} ${y} L ${x + s} ${y + s}`
        : dir === "down"
          ? `M ${x - s} ${y - s} L ${x} ${y} L ${x + s} ${y - s}`
          : dir === "left"
            ? `M ${x + s} ${y - s} L ${x} ${y} L ${x + s} ${y + s}`
            : `M ${x - s} ${y - s} L ${x} ${y} L ${x - s} ${y + s}`;
    return (
      <path d={dp} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    );
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      {/* Header */}
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

      {!ready ? (
        <p className="py-12 text-center text-sm text-zinc-400">
          Cannot render spring: current geometry is physically invalid or unresolved. Switch to the
          Engineering view for the constraint panel.
        </p>
      ) : (
        <div className="mt-3">
          {/* Title row — spec header + 3 state titles, aligned to figure columns */}
          <div className="grid items-end gap-0" style={{ gridTemplateColumns: gridCols }}>
            <div className="pr-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                Spring Geometry
              </div>
              <div className="text-[9.5px] leading-tight text-zinc-400">Detailed on State 1</div>
            </div>
            {stateTitles.map((s) => (
              <div key={s.n} className="flex items-start gap-1.5 px-1">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: s.accent }}
                >
                  {s.n}
                </span>
                <div className="min-w-0">
                  <div className="text-[11.5px] font-semibold uppercase leading-tight tracking-tight text-zinc-800">
                    {s.title}
                  </div>
                  <div className="text-[10px] leading-tight text-zinc-400">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* SVG figure — spec column, three tightly-grouped states, transitions */}
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="mt-1 block h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Three-state mechanism sequence: maximum working deflection, hammer contact, latch follow-through"
          >
            {(() => {
              const hammerH = 0.42 * OD!;
              const hammerW = 1.6 * OD!;
              const latchH = 0.34 * OD!;
              const latchW = 2.0 * OD!;
              const envelope = L3! + hammerH + latchH;
              const availH = SVG_H - TOP_PAD - BOTTOM_PAD;
              const pxPerUnit = Math.min(availH / envelope, (STATE_W * 0.84) / Math.max(latchW, OD!));
              const baselineY = SVG_H - BOTTOM_PAD;
              const toY = (units: number) => baselineY - units * pxPerUnit;
              const cx = (i: number) => LEFT_PAD + STATE_W * (i + 0.5);
              const latchBottom0 = L1! + hammerH + s_h!;

              const svgStates = [
                { L: L1!, Lid: "L_min", hammerBottom: L1!, latchBottom: latchBottom0 },
                { L: L2!, Lid: "L2", hammerBottom: L2!, latchBottom: latchBottom0 },
                { L: L3!, Lid: "L3", hammerBottom: L3!, latchBottom: latchBottom0 + y_latch! },
              ];

              const cx1 = cx(0);
              const odHalf = (OD! / 2) * pxPerUnit;
              const idHalf = (ID! / 2) * pxPerUnit;
              const strokePx = Math.max(1.25, d! * pxPerUnit);
              const springTopY = toY(L1!);
              const springLeft = cx1 - odHalf;
              const springRight = cx1 + odHalf;
              const coilSel = selectedId === "Na" || selectedId === "Nt";

              // Dimension-line offsets below the datum (State 1 only).
              const yWire = baselineY + 16;
              const yID = baselineY + 38;
              const yOD = baselineY + 70;

              return (
                <>
                  {/* shared fixed spring datum */}
                  <line
                    x1={LEFT_PAD - 10}
                    y1={baselineY}
                    x2={SVG_W - 6}
                    y2={baselineY}
                    stroke="#d4d4d8"
                    strokeWidth={1}
                    strokeDasharray="6 4"
                  />

                  {/* ── Three tightly-grouped mechanism states ── */}
                  {svgStates.map((s, i) => {
                    const centerX = cx(i);
                    return (
                      <g key={i}>
                        <g>
                          <title>
                            {`Spring — OD ${inch(OD)} · ID ${inch(ID)} · wire ${inch(d)} · ${coils(Nt)} coils`}
                          </title>
                          <ParametricCompressionSpring
                            spec={{ wireDiameter: d!, meanDiameter: D!, totalCoils: Nt!, currentLength: s.L }}
                            centerX={centerX}
                            bottomY={baselineY}
                            pxPerUnit={pxPerUnit}
                            colors={springPalette}
                            highlighted={selectedId === s.Lid}
                          />
                        </g>

                        {/* hammer (identical geometry; only position changes) */}
                        <rect
                          x={centerX - (hammerW / 2) * pxPerUnit}
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
                          x={centerX - (latchW / 2) * pxPerUnit}
                          y={toY(s.latchBottom + latchH)}
                          width={latchW * pxPerUnit}
                          height={latchH * pxPerUnit}
                          rx={2}
                          fill={COLORS.latchFill}
                          stroke={COLORS.latchStroke}
                          strokeWidth={1.2}
                        />
                      </g>
                    );
                  })}

                  {/* ══ STATE-1 PROFESSIONAL DIMENSIONS ══ */}

                  {/* Coil-count bracket — N_t primary (editable), N_a derived */}
                  <SvgButton paramId="Nt" onSelect={onSelect}>
                    {(() => {
                      const bx = springLeft - 78;
                      const tick = 7;
                      const mid = (springTopY + baselineY) / 2;
                      const col = coilSel ? COLORS.springSelected : DIM.coil;
                      return (
                        <g>
                          <rect x={2} y={springTopY - 6} width={bx + tick} height={baselineY - springTopY + 12} fill="transparent" />
                          <path
                            d={`M ${bx + tick} ${springTopY} L ${bx} ${springTopY} L ${bx} ${baselineY} L ${bx + tick} ${baselineY}`}
                            fill="none"
                            stroke={col}
                            strokeWidth={coilSel ? 1.8 : 1.3}
                            strokeLinejoin="round"
                          />
                          <line x1={bx} y1={mid} x2={bx + tick} y2={mid} stroke={col} strokeWidth={coilSel ? 1.8 : 1.3} />
                          <text x={bx - 7} y={mid - 9} fontSize={10.5} textAnchor="end" fontWeight={700} fill={col} fontFamily="var(--font-geist-mono), monospace">
                            Nₜ = {coils(Nt)}
                          </text>
                          <text x={bx - 7} y={mid + 2} fontSize={8} textAnchor="end" fill="#94a3b8">
                            total coils · editable
                          </text>
                          <text x={bx - 7} y={mid + 16} fontSize={9} textAnchor="end" fill={col} fontFamily="var(--font-geist-mono), monospace">
                            Nₐ = Nₜ−2 ≈ {coils(Na)}
                          </text>
                          <text x={bx - 7} y={mid + 27} fontSize={8} textAnchor="end" fontStyle="italic" fill="#94a3b8">
                            derived · closed &amp; ground
                          </text>
                        </g>
                      );
                    })()}
                  </SvgButton>

                  {/* Loaded Length — axial (cyan) */}
                  <SvgButton paramId="L_min" onSelect={onSelect}>
                    {(() => {
                      const dimX = springLeft - 30;
                      const sel = selectedId === "L_min";
                      const col = sel ? COLORS.springSelected : DIM.axial;
                      const mid = (springTopY + baselineY) / 2;
                      return (
                        <g>
                          <rect x={dimX - 26} y={springTopY - 6} width={40} height={baselineY - springTopY + 12} fill="transparent" />
                          <line x1={springLeft} y1={springTopY} x2={dimX} y2={springTopY} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={springLeft} y1={baselineY} x2={dimX} y2={baselineY} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={dimX} y1={springTopY} x2={dimX} y2={baselineY} stroke={col} strokeWidth={sel ? 1.8 : 1.3} />
                          {arrowHead(dimX, springTopY, "up", col)}
                          {arrowHead(dimX, baselineY, "down", col)}
                          <text x={dimX - 6} y={mid} fontSize={9.5} textAnchor="middle" fontWeight={700} fill={col} fontFamily="var(--font-geist-mono), monospace" transform={`rotate(-90 ${dimX - 6} ${mid})`}>
                            L₁ = {inch(L1)}
                          </text>
                          <text x={dimX - 18} y={mid} fontSize={8} textAnchor="middle" fill="#94a3b8" transform={`rotate(-90 ${dimX - 18} ${mid})`}>
                            Loaded Length
                          </text>
                        </g>
                      );
                    })()}
                  </SvgButton>

                  {/* Wire diameter d (green) */}
                  <SvgButton paramId="d" onSelect={onSelect}>
                    {(() => {
                      const sel = selectedId === "d";
                      const col = sel ? COLORS.springSelected : DIM.green;
                      const xL = springLeft;
                      const xR = springLeft + strokePx;
                      return (
                        <g>
                          <rect x={xL - 66} y={yWire - 10} width={strokePx + 74} height={26} fill="transparent" />
                          <line x1={xL} y1={baselineY} x2={xL} y2={yWire + 3} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={xR} y1={baselineY} x2={xR} y2={yWire + 3} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={xL} y1={yWire} x2={xR} y2={yWire} stroke={col} strokeWidth={sel ? 1.8 : 1.3} />
                          {arrowHead(xL, yWire, "left", col, 3.5)}
                          {arrowHead(xR, yWire, "right", col, 3.5)}
                          <text x={xL - 6} y={yWire + 3} fontSize={9.5} textAnchor="end" fontWeight={700} fill={col} fontFamily="var(--font-geist-mono), monospace">
                            d = {inch(d)}
                          </text>
                        </g>
                      );
                    })()}
                  </SvgButton>

                  {/* Inside diameter ID (green) */}
                  <SvgButton paramId="ID" onSelect={onSelect}>
                    {(() => {
                      const sel = selectedId === "ID";
                      const col = sel ? COLORS.springSelected : DIM.green;
                      const xL = cx1 - idHalf;
                      const xR = cx1 + idHalf;
                      return (
                        <g>
                          <rect x={xL - 6} y={yID - 8} width={xR - xL + 12} height={26} fill="transparent" />
                          <line x1={xL} y1={baselineY} x2={xL} y2={yID + 3} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={xR} y1={baselineY} x2={xR} y2={yID + 3} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={xL} y1={yID} x2={xR} y2={yID} stroke={col} strokeWidth={sel ? 1.8 : 1.3} />
                          {arrowHead(xL, yID, "left", col)}
                          {arrowHead(xR, yID, "right", col)}
                          <text x={cx1} y={yID + 14} fontSize={10} textAnchor="middle" fontWeight={700} fill={col} fontFamily="var(--font-geist-mono), monospace">
                            ID = {inch(ID)}
                          </text>
                        </g>
                      );
                    })()}
                  </SvgButton>

                  {/* Outside diameter OD (black / neutral) */}
                  <SvgButton paramId="OD" onSelect={onSelect}>
                    {(() => {
                      const sel = selectedId === "OD";
                      const col = sel ? COLORS.springSelected : DIM.od;
                      return (
                        <g>
                          <rect x={springLeft - 6} y={yOD - 8} width={springRight - springLeft + 12} height={26} fill="transparent" />
                          <line x1={springLeft} y1={baselineY} x2={springLeft} y2={yOD + 3} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={springRight} y1={baselineY} x2={springRight} y2={yOD + 3} stroke={DIM.ext} strokeWidth={1} strokeDasharray="3 3" />
                          <line x1={springLeft} y1={yOD} x2={springRight} y2={yOD} stroke={col} strokeWidth={sel ? 1.8 : 1.3} />
                          {arrowHead(springLeft, yOD, "left", col)}
                          {arrowHead(springRight, yOD, "right", col)}
                          <text x={cx1} y={yOD + 14} fontSize={10} textAnchor="middle" fontWeight={700} fill={col} fontFamily="var(--font-geist-mono), monospace">
                            OD = {inch(OD)}
                          </text>
                        </g>
                      );
                    })()}
                  </SvgButton>

                  {/* ── Transition arrows in the gaps between states ── */}
                  {[
                    { id: "s_h", label: "Hammer Run-Up", value: `${overviewSym("s_h")} = ${inch(s_h)}`, boundary: 1 },
                    { id: "y_latch", label: "Additional Latch Travel", value: `+ ${inch(y_latch)}`, boundary: 2 },
                  ].map((t) => {
                    const bx = LEFT_PAD + STATE_W * t.boundary;
                    const midY = toY(envelope * 0.5);
                    const sel = selectedId === t.id;
                    const stroke = sel ? COLORS.dimSelected : "#52525b";
                    return (
                      <SvgButton key={t.id} paramId={t.id} onSelect={onSelect}>
                        <g>
                          <rect x={bx - 40} y={midY - 30} width={80} height={54} fill="transparent" />
                          <text
                            x={bx}
                            y={midY - 16}
                            fontSize={9.5}
                            textAnchor="middle"
                            fontWeight={sel ? 700 : 600}
                            fill={sel ? COLORS.dimSelected : "#71717a"}
                          >
                            {t.label}
                          </text>
                          <text
                            x={bx}
                            y={midY - 4}
                            fontSize={10.5}
                            textAnchor="middle"
                            fontFamily="var(--font-geist-mono), monospace"
                            fontWeight={700}
                            fill={stroke}
                          >
                            {t.value}
                          </text>
                          <line x1={bx - 22} y1={midY + 8} x2={bx + 18} y2={midY + 8} stroke={stroke} strokeWidth={sel ? 2.4 : 1.8} />
                          <path
                            d={`M ${bx + 12} ${midY + 4} L ${bx + 20} ${midY + 8} L ${bx + 12} ${midY + 12}`}
                            fill="none"
                            stroke={stroke}
                            strokeWidth={sel ? 2.4 : 1.8}
                          />
                        </g>
                      </SvgButton>
                    );
                  })}
                </>
              );
            })()}
          </svg>

          {/* Body legend */}
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

          {/* Bottom callouts — loaded length (secondary) + spring force (dominant) */}
          <div className="mt-1.5 grid items-start gap-0" style={{ gridTemplateColumns: gridCols }}>
            <div /> {/* spec column has no state-specific callout */}
            {stateCallouts.map((c) => {
              const lSel = selectedId === c.Lid;
              const fSel = selectedId === c.Fid;
              return (
                <div key={c.n} className="flex flex-col gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => onSelect(c.Lid)}
                    title={`${overviewName(c.Lid)}${mm(c.L) ? ` = ${mm(c.L)}` : ""} — click to inspect`}
                    className={`flex flex-col items-start rounded border px-1.5 py-0.5 text-left transition-colors hover:border-zinc-400 ${
                      lSel ? "border-blue-400 bg-blue-50" : "border-transparent"
                    }`}
                  >
                    <span className="text-[9.5px] leading-tight text-zinc-500">Loaded Spring Length</span>
                    <span className="font-mono text-[12px] font-medium leading-tight text-zinc-700">
                      {overviewSym(c.Lid)} = {inch(c.L)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelect(c.Fid)}
                    title={`${overviewName(c.Fid)} — click to inspect`}
                    className={`flex flex-col items-start rounded-md border bg-white px-2 py-1 text-left transition-colors hover:border-zinc-400 ${
                      fSel ? "ring-1 ring-blue-200" : ""
                    }`}
                    style={{
                      borderColor: fSel ? c.accent : "#e4e4e7",
                      borderLeftWidth: 3,
                      borderLeftColor: c.accent,
                    }}
                  >
                    <span className="text-[9.5px] leading-tight text-zinc-500">{overviewName(c.Fid)}</span>
                    <span className="font-mono text-[20px] font-bold leading-none" style={{ color: c.accent }}>
                      <span className="text-[11px] font-bold">{overviewSym(c.Fid)} = </span>
                      {lbf(c.F)}
                    </span>
                  </button>

                  {c.note && (
                    <p className="px-0.5 text-[9px] leading-tight text-zinc-400">{c.note}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Concept provenance — three tiers kept explicit and un-conflated:
              original sketch value · solver-derived value · reconciled candidate value */}
          <details className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5">
            <summary className="cursor-pointer text-[11.5px] font-semibold text-amber-800">
              Provenance — original sketch vs. what the equations imply vs. reconciled candidate
            </summary>
            <p className="mt-1.5 text-[10px] text-zinc-600">
              Currently showing:{" "}
              <span className="font-semibold text-zinc-800">{PRESET_INFO[presetId].label}</span>
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {/* Tier 1 — exactly what the whiteboard says */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-700">
                  1 · Original sketch value
                </div>
                <div className="text-[9px] leading-tight text-zinc-400">As written on the whiteboard</div>
                <dl className="mt-1 space-y-0.5">
                  {[
                    ...PRESET_PROVENANCE.sketch.geometry,
                    ...PRESET_PROVENANCE.sketch.performance,
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between gap-2">
                      <dt className="text-[10px] text-zinc-600">{r.label}</dt>
                      <dd className="shrink-0 font-mono text-[10px] text-zinc-800">{r.value}</dd>
                    </div>
                  ))}
                  {PRESET_PROVENANCE.sketch.assumed.map((r) => (
                    <div key={r.label} className="flex justify-between gap-2">
                      <dt className="text-[10px] text-zinc-500">{r.label} (assumed)</dt>
                      <dd className="shrink-0 font-mono text-[10px] text-zinc-700">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Tier 2 — what the equations imply from that literal geometry */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-700">
                  2 · What the equations imply
                </div>
                <div className="text-[9px] leading-tight text-zinc-400">Solver-derived from the literal geometry</div>
                <dl className="mt-1 space-y-1">
                  {PRESET_PROVENANCE.implications.map((r) => (
                    <div key={r.label} className="flex flex-col">
                      <dt className="text-[10px] font-medium text-zinc-700">{r.label}</dt>
                      <dd className="font-mono text-[9.5px] leading-tight text-zinc-500">
                        sketch: {r.sketch}
                      </dd>
                      <dd className="font-mono text-[9.5px] font-medium leading-tight text-amber-700">
                        model: {r.model}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Tier 3 — an equation-consistent alternative */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  3 · Reconciled candidate value
                </div>
                <div className="text-[9px] leading-tight text-zinc-400">Equation-consistent alternative (not the sketch)</div>
                <dl className="mt-1 space-y-0.5">
                  {PRESET_PROVENANCE.reconciled.map((r) => (
                    <div key={r.label} className="flex justify-between gap-2">
                      <dt className="text-[10px] text-zinc-600">{r.label}</dt>
                      <dd className="shrink-0 font-mono text-[10px] font-medium text-emerald-700">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <p className="mt-2 border-t border-amber-200/70 pt-1.5 text-[10px] leading-snug text-zinc-600">
              {PRESET_PROVENANCE.conclusion}
            </p>
          </details>

          {/* Optional spring details */}
          <details className="mt-3 border-t border-zinc-100 pt-2">
            <summary className="cursor-pointer text-[12px] font-medium text-zinc-600">
              Show Spring Details
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
              {detailRows.map((g) => {
                const def = PARAMETER_MAP[g.id];
                const tip = def?.formula ? `${overviewName(g.id)}: ${def.formula}` : overviewName(g.id);
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
                      {overviewName(g.id)}{" "}
                      <span className="font-mono text-[10px] text-zinc-400">({overviewSym(g.id)})</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] font-medium text-zinc-800">{g.value}</span>
                  </button>
                );
              })}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
