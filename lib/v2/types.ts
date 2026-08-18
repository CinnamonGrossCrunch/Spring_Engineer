/**
 * V2 optimization-workbench type definitions.
 *
 * V2 is a SEPARATE engineering workflow from the V1 explorer. It does NOT
 * reuse the V1 `ModelState` / equation-graph representation; instead it is a
 * pure design-space search over spring geometry under the *actual* mechanism
 * boundaries (see lib/v2/defaults.ts).
 *
 * Nothing in this module recomputes spring physics — the candidate evaluator
 * (evaluateCandidate.ts) reuses the shared pure helpers in
 * `lib/engineering/spring.ts`.
 *
 * Units are Imperial (in · lbf · psi · in·lbf), consistent with V1.
 */

/** Which end of the material tensile range classifies the stress band. */
export type V2StressBasis = "conservative" | "mid" | "upper";

/**
 * Lee stress-guidance band, classified from the operating shear stress as a
 * fraction of tensile strength. These are DESIGN-GUIDANCE thresholds
 * (set / redesign), NOT yield or ultimate-failure limits.
 */
export type V2StressBand =
  | "low" // ≤ 40% TS — normal / lower-stress region
  | "set" // 40–60% TS — set operation / allow-for-set should be considered
  | "redesign"; // > 60% TS — Lee redesign region

/** A benchmark spring material model (properties are vendor-published, not certified). */
export interface V2Material {
  id: string;
  name: string;
  specification?: string;
  /** Shear modulus G [psi]. */
  shearModulusPsi: number;
  /** Conservative (low) end of the published tensile-strength range [psi]. */
  tensileMinPsi: number;
  /** Optimistic (high) end of the published tensile-strength range [psi]. */
  tensileMaxPsi: number;
  sourceLabel: string;
}

/**
 * A V2 study scenario: the fixed mechanism boundaries plus the numerical
 * search bounds. Values carry an explicit epistemic tier in the UI
 * (mechanism constraint / fixed-for-study / Lee guidance / vendor margin).
 */
export interface V2Scenario {
  // ── Actual mechanism boundaries ──
  /** Maximum starting spring force F0 [lbf]. Candidates are evaluated AT this cap. */
  forceCap: number;
  /** Total axial budget B = compressed spring length + hammer run-up [in]. */
  axialBudget: number;
  /** HF latch follow-through y [in] — extra mechanism movement after contact. */
  latchTravel: number;

  // ── Fixed for this study ──
  /** Nominal spring outside diameter OD [in]. */
  outerDiameter: number;
  /** OD is held constant for Sweep #1 (study assumption, not a hard constraint). */
  lockOuterDiameter: boolean;
  /** Benchmark material id (see V2_MATERIALS). */
  materialId: string;

  // ── Lee-derived model guidance ──
  /** Nominal-solid-height tolerance fraction (Lee +5% → 0.05). Hs_max = (1+tol)·Hs_nom. */
  solidHeightTolerance: number;

  // ── Vendor / design margin ──
  /** Additional design/vendor clearance above the Lee maximum solid height [in]. */
  extraSolidClearance: number;

  // ── Numerical search bounds (NOT manufacturing limits) ──
  wireMin: number;
  wireMax: number;
  wireStep: number;
  activeCoilsMin: number;
  activeCoilsMax: number;
  activeCoilsStep: number;

  /** Which tensile-range end classifies the stress band (default conservative). */
  stressBasis: V2StressBasis;
}

/** Canonical exclusion reasons used for feasibility + the "why is it empty" summary. */
export type V2ExclusionReason =
  | "invalid-geometry"
  | "no-run-up" // spring consumes entire axial budget
  | "slack-at-contact" // F2 ≤ 0
  | "stops-driving" // F3 ≤ 0
  | "stress-redesign"; // > 60% conservative/basis TS

/** Explicit per-candidate feasibility record. Every check is surfaced, never fused. */
export interface V2Feasibility {
  /** d>0, D>d, ID>0, Na>0, Nt>2. */
  geometryValid: boolean;
  /** Hammer run-up s = B − Lc > 0. */
  positiveRunUp: boolean;
  /** Compressed length fits the axial budget: Lc < B. */
  fitsBudget: boolean;
  /** Spring still loaded at contact: F2 > 0. */
  loadedAtContact: boolean;
  /** Spring still driving after latch travel: F3 > 0. */
  drivingAfterLatch: boolean;
  /** Lee stress band from the selected basis. */
  stressBand: V2StressBand;
  /** Spring index within the ~4–12 manufacturability advisory. */
  springIndexAdvisoryOk: boolean;
  /**
   * Mathematically feasible in V2 for the recommended set: geometry + budget +
   * continuous drive AND stress band is not `redesign` (>60%). This is NOT a
   * claim of vendor validation.
   */
  feasible: boolean;
  /** Machine-readable reasons a candidate is excluded from the feasible set. */
  reasons: V2ExclusionReason[];
}

/** A fully-evaluated candidate spring geometry. Pure output of evaluateV2Candidate. */
export interface V2Candidate {
  key: string;

  // Geometry
  d: number;
  D: number;
  OD: number;
  ID: number;
  Na: number;
  Nt: number;
  C: number;

  // Behavior
  k: number;

  // Package
  HsNom: number;
  HsMax: number;
  Lc: number;
  s: number;

  // Force states
  F0: number;
  x0: number;
  Lf: number;
  L2: number;
  L3: number;
  F2: number;
  F3: number;

  // Work / release energy
  Whammer: number;
  Wlatch: number;
  WreleaseIdeal: number;

  // Michael's historical metric language (ideal, NOT actual contact force)
  FeqAvgIdeal: number;
  FeqTriPeakIdeal: number;

  // Stress
  Kw: number;
  tau: number;
  stressPctConservative: number;
  stressPctOptimistic: number;
  /** Stress fraction against the scenario's selected tensile basis. */
  stressPctBasis: number;

  feasibility: V2Feasibility;

  /** True when this candidate sits on the Pareto frontier (filled by the sweep). */
  pareto: boolean;
}

/** Counts of why candidates were excluded, for the no-silent-failure panel. */
export type V2ExclusionStats = Record<V2ExclusionReason, number>;

/** Result of a full design-space sweep. */
export interface V2SweepResult {
  candidates: V2Candidate[];
  /** Distinct wire diameters (grid columns), ascending. */
  wireValues: number[];
  /** Distinct active-coil counts (grid rows), ascending. */
  coilValues: number[];
  /** Candidates that pass the recommended feasible set. */
  feasible: V2Candidate[];
  /** Keys of the Pareto-frontier candidates. */
  paretoKeys: string[];
  /** How many candidates were excluded and why. */
  exclusionStats: V2ExclusionStats;
  totalCount: number;
  feasibleCount: number;
  /** Suggested default selection key ("Best by Ideal Release Equivalent"), or null. */
  defaultKey: string | null;
}

/** Landscape cell-color metrics the user can select. */
export type V2LandscapeMetric =
  | "FeqAvgIdeal"
  | "Whammer"
  | "Wlatch"
  | "F3"
  | "s"
  | "k"
  | "stress"
  | "Lf";

export interface V2LandscapeMetricInfo {
  id: V2LandscapeMetric;
  label: string;
  /** Accessor returns the metric value for a candidate. */
  get: (c: V2Candidate) => number;
  unit: string;
  /** Higher is "better" (only affects legend hinting, not the color ramp). */
  higherIsBetter: boolean;
}
