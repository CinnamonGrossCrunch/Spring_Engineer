/**
 * V2 optimization-workbench type definitions.
 *
 * V2 uses a separate calculation representation from the Engineering equation
 * graph, but its selected candidate is the shared application source of truth.
 * It performs a pure design-space search over spring geometry under the actual
 * mechanism boundaries (see lib/v2/defaults.ts).
 *
 * Nothing in this module recomputes spring physics — the candidate evaluator
 * (evaluateCandidate.ts) reuses the shared pure helpers in
 * `lib/engineering/spring.ts`.
 *
 * Units are Imperial (in · lbf · psi · in·lbf), consistent with V1.
 */

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
  sourceUrl: string;
  /** Wire condition represented by the benchmark values. */
  condition: string;
  /** Scope caveat shown next to the preset. */
  note: string;
}

/**
 * A V2 study scenario: the fixed mechanism boundaries plus the numerical
 * search bounds. Values carry an explicit epistemic tier in the UI
 * (mechanism constraint / fixed-for-study / Lee guidance / design margin).
 */
export interface V2Scenario {
  // ── Actual mechanism boundaries ──
  /** Nominal starting spring-force target F0 [lbf]. Candidates are evaluated at this value. */
  forceTarget: number;
  /** Absolute maximum permitted starting spring force [lbf], including tolerance. */
  forceCap: number;
  /** Total axial budget B = compressed spring length + hammer run-up [in]. */
  axialBudget: number;
  /** Critical release travel y_critical [in] after hammer contact. */
  latchTravel: number;
  /** Total hammer/latch coupled travel y_total [in] after contact. */
  totalLatchTravel: number;
  /** Minimum nominal spring force required at B + y_total [lbf]. */
  minimumEndForce: number;
  /** Opposing preload force acting during post-critical travel [lbf]. */
  opposingPreload: number;
  /** Minimum acceptable nominal spring inside diameter around the central annulus [in]. */
  minimumSpringInnerDiameter: number;
  /** Whether the optimizer-derived armed spring height must fall within a mechanism range. */
  armedHeightConstraintEnabled: boolean;
  /** Minimum permitted armed/compressed spring height [in]. */
  armedHeightMin: number;
  /** Maximum permitted armed/compressed spring height [in]. */
  armedHeightMax: number;

  // ── Fixed for this study ──
  /** Housing inside diameter / absolute finished-spring OD ceiling [in]. */
  housingInnerDiameter: number;
  /** Positive OD manufacturing-tolerance allowance subtracted from the housing ceiling [in]. */
  outerDiameterTolerance: number;
  /** Derived nominal OD is held constant for Sweep #1. */
  lockOuterDiameter: boolean;
  /** Benchmark material id (see V2_MATERIALS). */
  materialId: string;
  /** Scenario shear modulus G [psi]; initialized from the benchmark material. */
  shearModulusPsi: number;

  // ── Impact-equivalent assumptions (shared by Engineer + Optimize) ──
  /** Hammer moving mass [lbm], or null when not supplied. */
  hammerMassLbm: number | null;
  /** HF latch moving mass [lbm], or null when not supplied. */
  latchMassLbm: number | null;
  /** Assumed spring-work transfer efficiency [0..1]. Default 1.0. */
  impactEfficiency: number;
  /** Optional body-material presets used only for density-based mass estimates. */
  hammerBodyMaterialId: string;
  latchBodyMaterialId: string;
  /** Modeled body volumes [in³], or null when mass is entered directly. */
  hammerVolumeIn3: number | null;
  latchVolumeIn3: number | null;
  /** 1-D coefficient of restitution [0..1]; empirical/advisory, not a spring property. */
  impactRestitution: number;

  // ── Derived model guidance ──
  /** Nominal-solid-height tolerance fraction. Hs_max = (1+tol)·Hs_nom. */
  solidHeightTolerance: number;

  // ── Optional manufacturing-tolerance estimate ──
  /** Whether advisory rate/free-length tolerance envelopes are shown. */
  manufacturingToleranceEnabled: boolean;
  /** Symmetric spring-rate tolerance fraction (for example, 0.10 = ±10%). */
  springRateTolerance: number;
  /** Symmetric free-length tolerance [in]. */
  freeLengthTolerance: number;

  // ── Working-deflection constraint ──
  /** Maximum x_work / (Lf − Hs,max), held constant across every candidate in the scenario. */
  maxDeflectionUtilization: number;

  // ── Numerical search bounds (NOT manufacturing limits) ──
  wireMin: number;
  wireMax: number;
  wireStep: number;
  activeCoilsMin: number;
  activeCoilsMax: number;
  activeCoilsStep: number;

  /** User-selected tensile-strength basis used to classify τ / TS [psi]. */
  stressBasisPsi: number;
}

/** Canonical exclusion reasons used for feasibility + the "why is it empty" summary. */
export type V2ExclusionReason =
  | "invalid-geometry"
  | "inside-diameter-too-small" // calculated nominal spring ID is below the annulus boundary
  | "invalid-travel" // total coupled travel is shorter than the critical window
  | "no-run-up" // spring consumes entire axial budget
  | "armed-height-out-of-range"
  | "slack-at-contact" // F2 ≤ 0
  | "stops-driving" // F4 ≤ 0 before full coupled travel completes
  | "insufficient-end-force" // F4 is below the configured end-force floor
  | "stress-redesign"; // > 60% conservative/basis TS

/** Explicit per-candidate feasibility record. Every check is surfaced, never fused. */
export interface V2Feasibility {
  /** d>0, D>d, ID>0, Na>0, Nt>2. */
  geometryValid: boolean;
  /** Nominal calculated spring ID clears the configured inner annulus boundary. */
  fitsInnerDiameter: boolean;
  /** Hammer run-up s = B − Lc > 0. */
  positiveRunUp: boolean;
  /** Compressed length fits the axial budget: Lc < B. */
  fitsBudget: boolean;
  /** Total coupled travel is at least as long as the critical release window. */
  travelOrderValid: boolean;
  /** Optimizer-derived armed height is inside the optional mechanism range. */
  armedHeightInRange: boolean;
  /** Spring still loaded at contact: F2 > 0. */
  loadedAtContact: boolean;
  /** Spring still driving at the critical release point: F3 > 0. */
  drivingAfterLatch: boolean;
  /** Spring remains loaded through the full coupled travel: F4 > 0. */
  drivingAtEnd: boolean;
  /** F4 meets the configured minimum nominal end-force requirement. */
  endForceSufficient: boolean;
  /** F4 remains above the modeled opposing preload. */
  overcomesOpposingPreload: boolean;
  /** Lee stress band from the selected basis. */
  stressBand: V2StressBand;
  /** Spring index within the ~4–12 manufacturability advisory. */
  springIndexAdvisoryOk: boolean;
  /**
   * Mathematically feasible in V2 for the recommended set: valid geometry,
   * configured annulus-ID fit, budget, continuous drive, and a stress band
   * other than `redesign` (>60%). This is NOT a claim of vendor validation.
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
  /** Candidate-specific clearance required to satisfy the scenario utilization constraint [in]. */
  solidClearance: number;
  /** Free-to-Hs,max travel [in]. */
  availableDeflection: number;
  /** x0 / availableDeflection. Equals the scenario constraint by construction. */
  deflectionUtilization: number;
  deflectionReserve: number;
  Lc: number;
  s: number;

  // Force states
  F0: number;
  x0: number;
  Lf: number;
  L2: number;
  /** Critical release point B + y_critical. */
  L3: number;
  /** Full coupled-travel endpoint B + y_total. */
  L4: number;
  F2: number;
  /** Spring force at the critical release point. */
  F3: number;
  /** Spring force at the full coupled-travel endpoint. */
  F4: number;
  /** Nominal spring-force margin above the configured end-force floor. */
  endForceMargin: number;
  /** Nominal net end force after subtracting the opposing preload. */
  netEndForce: number;

  // Work / release energy
  Whammer: number;
  /** Spring work from contact through the critical release window. */
  Wlatch: number;
  /** Spring work from the critical point through the full-travel endpoint. */
  WpostCritical: number;
  /** Work absorbed by the modeled constant opposing preload after critical release. */
  Wopposing: number;
  /** Post-critical spring work remaining after the modeled opposing preload. */
  WpostCriticalNet: number;
  /** Spring work over the complete post-contact coupled travel. */
  Wcoupled: number;
  /** Total spring work from armed through the full-travel endpoint. */
  WthroughEnd: number;
  WreleaseIdeal: number;

  // Historical metric language (ideal, NOT actual contact force)
  FeqAvgIdeal: number;
  FeqTriPeakIdeal: number;

  // Stress
  Kw: number;
  tau: number;
  stressPctConservative: number;
  stressPctOptimistic: number;
  /** Stress fraction against the scenario's selected tensile basis. */
  stressPctBasis: number;
  /** Tensile-strength basis used for stressPctBasis [psi]. */
  stressBasisPsi: number;

  feasibility: V2Feasibility;

  /** True when this candidate sits on the Pareto frontier (filled by the sweep). */
  pareto: boolean;
}

/**
 * A frozen comparison point. Unlike a landscape cell key, a shortlist entry
 * carries the complete scenario and evaluated result that existed when the
 * user saved it. This lets identical geometry be compared under different
 * mechanism constraints without silently re-evaluating older entries.
 */
export interface V2ShortlistEntry {
  /** Deterministic identity composed from the candidate key + scenario. */
  id: string;
  candidateKey: string;
  scenario: V2Scenario;
  candidate: V2Candidate;
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
  /** Three explainable near-maximum recommendations: hammer, total, end-force reserve. */
  recommendedKeys: string[];
  recommendedRoles: Record<string, "hammer" | "total" | "end-force">;
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
  | "F4"
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
