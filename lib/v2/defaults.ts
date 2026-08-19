import { runUpWork } from "@/lib/engineering/spring";
import { DEFAULT_MATERIAL_ID } from "./materials";
import type { V2Candidate, V2LandscapeMetricInfo, V2Scenario } from "./types";

/**
 * The default V2 study scenario (Sweep #1).
 *
 * Epistemic tiers (see the scenario panel):
 *   · Actual mechanism boundaries — forceCap, axialBudget, latchTravel
 *   · Fixed for this study        — outerDiameter, material
 *   · Lee-derived model guidance  — solidHeightTolerance, stress bands
 *   · Vendor / design margin      — extraSolidClearance
 *   · Numerical search bounds     — wire/coil ranges (NOT manufacturing limits)
 */
export const DEFAULT_V2_SCENARIO: V2Scenario = {
  // Actual mechanism boundaries
  forceCap: 140, // F0 ≤ 140 lbf; evaluated AT the cap for Sweep #1
  axialBudget: 1.15, // B = compressed spring length + hammer run-up [in]
  latchTravel: 0.07, // y = HF latch follow-through [in]

  // Fixed for this study
  outerDiameter: 1.10, // OD ≈ 1.100 in (first-pass study assumption)
  lockOuterDiameter: true,
  materialId: DEFAULT_MATERIAL_ID,

  // Lee-derived model guidance
  solidHeightTolerance: 0.05, // Lee +5% → Hs_max = 1.05·Hs_nom

  // Vendor / design margin — Lee tolerance boundary, no extra vendor margin
  extraSolidClearance: 0,

  // Numerical search bounds (editable in Advanced Sweep Settings)
  wireMin: 0.12,
  wireMax: 0.18,
  wireStep: 0.001,
  activeCoilsMin: 2.0,
  activeCoilsMax: 5.0,
  activeCoilsStep: 0.1,

  stressBasis: "conservative",
};

/** Example additional-clearance SCENARIOS (not Lee requirements). */
export const EXTRA_CLEARANCE_SCENARIOS = [0.0, 0.01, 0.025, 0.05] as const;

/**
 * Historical whiteboard reference — reconstructed from the original nominal
 * spring work, NOT a requirement.
 *
 *   F0 = 140 lbf   k = 280 lbf/in   s = 0.250 in   y = 0.070 in
 *
 * The ideal release-energy proxy computed from these nominal values lands in the
 * neighborhood of Michael's rounded ~450 avg / ~900 triangular-peak numbers.
 */
export const HISTORICAL_WHITEBOARD = {
  F0: 140,
  k: 280,
  s: 0.25,
  y: 0.07,
  note: "Reconstructed from nominal spring work; exact original derivation not confirmed.",
} as const;

export interface HistoricalReferenceMetrics {
  F0: number;
  k: number;
  s: number;
  y: number;
  F2: number;
  F3: number;
  Whammer: number;
  Wlatch: number;
  WreleaseIdeal: number;
  FeqAvgIdeal: number;
  FeqTriPeakIdeal: number;
}

/** Compute the ideal release-energy proxy from the historical nominal values. */
export function computeHistoricalReference(
  h: { F0: number; k: number; s: number; y: number } = HISTORICAL_WHITEBOARD,
): HistoricalReferenceMetrics {
  const F2 = h.F0 - h.k * h.s;
  const F3 = h.F0 - h.k * (h.s + h.y);
  const Whammer = runUpWork(h.F0, h.k, h.s);
  const Wlatch = runUpWork(F2, h.k, h.y);
  const WreleaseIdeal = Whammer + Wlatch;
  const FeqAvgIdeal = WreleaseIdeal / h.y;
  return {
    F0: h.F0,
    k: h.k,
    s: h.s,
    y: h.y,
    F2,
    F3,
    Whammer,
    Wlatch,
    WreleaseIdeal,
    FeqAvgIdeal,
    FeqTriPeakIdeal: 2 * FeqAvgIdeal,
  };
}

/**
 * Optional reference markers overlaid on the design landscape. These trace the
 * evolution of the concept — they are NOT labeled as an optimum.
 */
export interface V2HistoricalMarker {
  id: string;
  label: string;
  d: number;
  Na: number;
  note: string;
}

export const V2_HISTORICAL_MARKERS: V2HistoricalMarker[] = [
  {
    id: "original-sketch",
    label: "Historical concept",
    d: 0.17,
    Na: 1.5, // corrected Nt ≈ 3.5 → Na ≈ 1.5
    note: "Bokaie original sketch geometry (Nt ≈ 3.5). Reference only — not an optimum.",
  },
  {
    id: "earlier-candidate",
    label: "Earlier candidate",
    d: 0.147,
    Na: 3.5, // Nt ≈ 5.5
    note: "Earlier reconciled candidate. Reference only — not an optimum.",
  },
];

/** Selectable design-landscape cell-color metrics. */
export const V2_LANDSCAPE_METRICS: V2LandscapeMetricInfo[] = [
  {
    id: "FeqAvgIdeal",
    label: "Ideal Equivalent Average Release",
    get: (c: V2Candidate) => c.FeqAvgIdeal,
    unit: "lbf",
    higherIsBetter: true,
  },
  {
    id: "Whammer",
    label: "Hammer Run-Up Work",
    get: (c: V2Candidate) => c.Whammer,
    unit: "in·lbf",
    higherIsBetter: true,
  },
  {
    id: "Wlatch",
    label: "Latch Follow-Through Work",
    get: (c: V2Candidate) => c.Wlatch,
    unit: "in·lbf",
    higherIsBetter: true,
  },
  {
    id: "F3",
    label: "Final Spring Force",
    get: (c: V2Candidate) => c.F3,
    unit: "lbf",
    higherIsBetter: true,
  },
  {
    id: "s",
    label: "Hammer Stroke",
    get: (c: V2Candidate) => c.s,
    unit: "in",
    higherIsBetter: true,
  },
  {
    id: "k",
    label: "Spring Rate",
    get: (c: V2Candidate) => c.k,
    unit: "lbf/in",
    higherIsBetter: false,
  },
  {
    id: "stress",
    label: "Stress % TS (conservative)",
    get: (c: V2Candidate) => c.stressPctConservative * 100,
    unit: "%",
    higherIsBetter: false,
  },
  {
    id: "Lf",
    label: "Free Length",
    get: (c: V2Candidate) => c.Lf,
    unit: "in",
    higherIsBetter: false,
  },
];
