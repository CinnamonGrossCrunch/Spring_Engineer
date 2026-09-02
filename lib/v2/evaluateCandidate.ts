import {
  springRate,
  wahlFactor,
  shearStress,
  solidHeight,
  springIndex,
  runUpWork,
} from "@/lib/engineering/spring";
import {
  requiredSolidClearance,
  workingDeflectionUtilization,
} from "@/lib/engineering/deflectionConstraint";
import { getV2Material } from "./materials";
import { nominalSpringOuterDiameter } from "./envelope";
import type {
  V2Candidate,
  V2ExclusionReason,
  V2Feasibility,
  V2Scenario,
  V2StressBand,
} from "./types";

/** Classify a stress fraction (τ / TS) into a Lee design-guidance band. */
export function classifyStressBand(stressFraction: number): V2StressBand {
  if (stressFraction > 0.6) return "redesign";
  if (stressFraction > 0.4) return "set";
  return "low";
}

/** Stable candidate key from the swept (d, Na) pair. */
export function candidateKey(d: number, Na: number): string {
  return `${d.toFixed(4)}|${Na.toFixed(3)}`;
}

/**
 * Evaluate ONE spring geometry candidate against a V2 scenario.
 *
 * Pure, deterministic, side-effect free. All spring physics is delegated to the
 * shared helpers in `lib/engineering/spring.ts` — no equation is re-implemented
 * here. Contains NO UI or sweep logic.
 *
 * With OD locked, the candidate is fully determined by (d, Na):
 *
 *   D  = OD − d           ID = OD − 2d          Nt = Na + 2
 *   C  = D / d            k  = G·d⁴ / (8·D³·Na)
 *   Hs_nom = Nt·d         Hs_max = (1+tol)·Hs_nom
 *   x0 = F0/k               c_solid = x0·(1/u_max − 1)
 *   Lc = Hs_max + c_solid   s = B − Lc     Lf = Lc + x0
 *   L2 = B (= Lc + s)     L3 = B + y_critical     L4 = B + y_total
 *   F2 = F0 − k·s         F3 = F2 − k·y_critical  F4 = F2 − k·y_total
 *   W_hammer = F0·s − ½·k·s²
 *   W_critical = F2·y_critical − ½·k·y_critical²
 *   W_release_ideal = W_hammer + W_critical
 *   F_eq_avg_ideal  = W_release_ideal / y_critical (historical release proxy)
 *   F_eq_tri_peak   = 2 · F_eq_avg_ideal        (ideal TRIANGULAR peak-equivalent proxy)
 */
export function evaluateV2Candidate(scenario: V2Scenario, d: number, Na: number): V2Candidate {
  const material = getV2Material(scenario.materialId);
  const G = scenario.shearModulusPsi;

  const OD = nominalSpringOuterDiameter(scenario);
  const B = scenario.axialBudget;
  const yCritical = scenario.latchTravel;
  const yTotal = scenario.totalLatchTravel;
  const F0 = scenario.forceCap;

  // ── Geometry (OD locked) ──
  const D = OD - d;
  const ID = OD - 2 * d;
  const Nt = Na + 2;
  const C = springIndex(D, d);

  // ── Spring rate ──
  const k = springRate(G, d, D, Na);

  // ── Solid height + working-deflection constraint ──
  const HsNom = solidHeight(Nt, d);
  const HsMax = (1 + scenario.solidHeightTolerance) * HsNom;

  // Candidates are evaluated at F0, so x0 is known before packaging. The
  // scenario holds u_max constant; each geometry receives the clearance it
  // needs to preserve that same fractional deflection reserve.
  const x0 = F0 / k;
  const solidClearance = requiredSolidClearance(x0, scenario.maxDeflectionUtilization);
  const Lc = HsMax + solidClearance;

  // ── Axial packaging: Lc + s = B ──
  const s = B - Lc;

  // ── Free length + achieved utilization ──
  const Lf = Lc + x0;
  const availableDeflection = Lf - HsMax;
  const deflectionUtilization = workingDeflectionUtilization(x0, Lf, HsMax);
  const deflectionReserve = 1 - deflectionUtilization;

  // ── State lengths ──
  const L2 = B; // Lc + s
  const L3 = B + yCritical;
  const L4 = B + yTotal;

  // ── Force states ──
  const F2 = F0 - k * s;
  const F3 = F0 - k * (s + yCritical);
  const F4 = F0 - k * (s + yTotal);
  const endForceMargin = F4 - scenario.minimumEndForce;
  const netEndForce = F4 - scenario.opposingPreload;

  // ── Work (ideal spring work; area under the force–travel line) ──
  const Whammer = runUpWork(F0, k, s); // F0·s − ½·k·s²
  const Wlatch = positiveReleaseWork(F2, k, yCritical);
  const Wcoupled = positiveReleaseWork(F2, k, yTotal);
  const WpostCritical = Math.max(0, Wcoupled - Wlatch);
  const Wopposing = Math.max(0, scenario.opposingPreload) * Math.max(0, yTotal - yCritical);
  const WpostCriticalNet = WpostCritical - Wopposing;
  const WthroughEnd = Whammer + Wcoupled;
  const WreleaseIdeal = Whammer + Wlatch;

  // ── Ideal force-equivalent metrics (NOT actual contact force) ──
  const FeqAvgIdeal = yCritical !== 0 ? WreleaseIdeal / yCritical : NaN;
  const FeqTriPeakIdeal = 2 * FeqAvgIdeal;

  // ── Wahl-corrected operating shear stress at F0 ──
  const Kw = wahlFactor(C);
  const tau = shearStress(Kw, F0, D, d);
  const stressPctConservative = tau / material.tensileMinPsi;
  const stressPctOptimistic = tau / material.tensileMaxPsi;
  const stressBasisPsi = scenario.stressBasisPsi;
  const stressPctBasis = stressBasisPsi > 0 ? tau / stressBasisPsi : Infinity;

  const feasibility = evaluateFeasibility({
    d,
    D,
    ID,
    Na,
    Nt,
    C,
    s,
    Lc,
    B,
    yCritical,
    yTotal,
    F2,
    F3,
    F4,
    minimumEndForce: scenario.minimumEndForce,
    opposingPreload: scenario.opposingPreload,
    armedHeightConstraintEnabled: scenario.armedHeightConstraintEnabled,
    armedHeightMin: scenario.armedHeightMin,
    armedHeightMax: scenario.armedHeightMax,
    stressPctBasis,
  });

  return {
    key: candidateKey(d, Na),
    d,
    D,
    OD,
    ID,
    Na,
    Nt,
    C,
    k,
    HsNom,
    HsMax,
    solidClearance,
    availableDeflection,
    deflectionUtilization,
    deflectionReserve,
    Lc,
    s,
    F0,
    x0,
    Lf,
    L2,
    L3,
    L4,
    F2,
    F3,
    F4,
    endForceMargin,
    netEndForce,
    Whammer,
    Wlatch,
    WpostCritical,
    Wopposing,
    WpostCriticalNet,
    Wcoupled,
    WthroughEnd,
    WreleaseIdeal,
    FeqAvgIdeal,
    FeqTriPeakIdeal,
    Kw,
    tau,
    stressPctConservative,
    stressPctOptimistic,
    stressPctBasis,
    stressBasisPsi,
    feasibility,
    pareto: false,
  };
}

interface FeasibilityInputs {
  d: number;
  D: number;
  ID: number;
  Na: number;
  Nt: number;
  C: number;
  s: number;
  Lc: number;
  B: number;
  yCritical: number;
  yTotal: number;
  F2: number;
  F3: number;
  F4: number;
  minimumEndForce: number;
  opposingPreload: number;
  armedHeightConstraintEnabled: boolean;
  armedHeightMin: number;
  armedHeightMax: number;
  stressPctBasis: number;
}

function evaluateFeasibility(i: FeasibilityInputs): V2Feasibility {
  const geometryValid =
    i.d > 0 &&
    i.D > i.d &&
    i.ID > 0 &&
    i.Na > 0 &&
    i.Nt > 2 &&
    Number.isFinite(i.C) &&
    i.C > 0;

  const positiveRunUp = geometryValid && i.s > 0;
  const fitsBudget = geometryValid && i.Lc < i.B;
  const travelOrderValid =
    Number.isFinite(i.yCritical) &&
    Number.isFinite(i.yTotal) &&
    i.yCritical > 0 &&
    i.yTotal >= i.yCritical;
  const armedHeightInRange =
    !i.armedHeightConstraintEnabled ||
    (Number.isFinite(i.armedHeightMin) &&
      Number.isFinite(i.armedHeightMax) &&
      i.armedHeightMin <= i.armedHeightMax &&
      i.Lc >= i.armedHeightMin - 1e-9 &&
      i.Lc <= i.armedHeightMax + 1e-9);
  const loadedAtContact = geometryValid && i.F2 > 0;
  const drivingAfterLatch = geometryValid && i.F3 > 0;
  const drivingAtEnd = geometryValid && travelOrderValid && i.F4 > 0;
  const endForceSufficient =
    drivingAtEnd && Number.isFinite(i.minimumEndForce) && i.F4 + 1e-9 >= i.minimumEndForce;
  const hasPostCriticalTravel = i.yTotal > i.yCritical + 1e-9;
  const overcomesOpposingPreload =
    !hasPostCriticalTravel ||
    (drivingAtEnd && Number.isFinite(i.opposingPreload) && i.F4 > i.opposingPreload);
  const stressBand = classifyStressBand(i.stressPctBasis);
  const springIndexAdvisoryOk = i.C >= 4 && i.C <= 12;

  const reasons: V2ExclusionReason[] = [];
  if (!geometryValid) reasons.push("invalid-geometry");
  else {
    if (!travelOrderValid) reasons.push("invalid-travel");
    if (!positiveRunUp || !fitsBudget) reasons.push("no-run-up");
    if (!armedHeightInRange) reasons.push("armed-height-out-of-range");
    if (!loadedAtContact) reasons.push("slack-at-contact");
    if (!drivingAtEnd) reasons.push("stops-driving");
    else if (!endForceSufficient || !overcomesOpposingPreload) reasons.push("insufficient-end-force");
    if (stressBand === "redesign") reasons.push("stress-redesign");
  }

  // The recommended feasible set: hard geometry + continuous-drive AND the
  // stress band is not the Lee redesign region (>60%). The spring-index range
  // is only ADVISORY and never removes a candidate from the feasible set.
  const feasible =
    geometryValid &&
    positiveRunUp &&
    fitsBudget &&
    travelOrderValid &&
    armedHeightInRange &&
    loadedAtContact &&
    drivingAfterLatch &&
    drivingAtEnd &&
    endForceSufficient &&
    overcomesOpposingPreload &&
    stressBand !== "redesign";

  return {
    geometryValid,
    positiveRunUp,
    fitsBudget,
    travelOrderValid,
    armedHeightInRange,
    loadedAtContact,
    drivingAfterLatch,
    drivingAtEnd,
    endForceSufficient,
    overcomesOpposingPreload,
    stressBand,
    springIndexAdvisoryOk,
    feasible,
    reasons,
  };
}

/** Positive spring work over an unloading interval, clipped when the spring goes slack. */
function positiveReleaseWork(startForce: number, springRateValue: number, travel: number): number {
  if (startForce <= 0 || springRateValue <= 0 || travel <= 0) return 0;
  const loadedTravel = Math.min(travel, startForce / springRateValue);
  return runUpWork(startForce, springRateValue, loadedTravel);
}
