import {
  springRate,
  wahlFactor,
  shearStress,
  solidHeight,
  springIndex,
  runUpWork,
} from "@/lib/engineering/spring";
import { getV2Material, tensileBasisPsi } from "./materials";
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
 *   Lc = Hs_max + c_extra s  = B − Lc
 *   F0 = forceCap (evaluated AT the cap)   x0 = F0/k   Lf = Lc + x0
 *   L2 = B (= Lc + s)     L3 = B + y
 *   F2 = F0 − k·s         F3 = F0 − k·(s + y)
 *   W_hammer = F0·s − ½·k·s²        W_latch = F2·y − ½·k·y²
 *   W_release_ideal = W_hammer + W_latch
 *   F_eq_avg_ideal  = W_release_ideal / y       (ideal equivalent AVERAGE release force)
 *   F_eq_tri_peak   = 2 · F_eq_avg_ideal        (ideal TRIANGULAR peak-equivalent proxy)
 */
export function evaluateV2Candidate(scenario: V2Scenario, d: number, Na: number): V2Candidate {
  const material = getV2Material(scenario.materialId);
  const G = material.shearModulusPsi;

  const OD = scenario.outerDiameter;
  const B = scenario.axialBudget;
  const y = scenario.latchTravel;
  const F0 = scenario.forceCap;

  // ── Geometry (OD locked) ──
  const D = OD - d;
  const ID = OD - 2 * d;
  const Nt = Na + 2;
  const C = springIndex(D, d);

  // ── Spring rate ──
  const k = springRate(G, d, D, Na);

  // ── Solid height + armed length ──
  const HsNom = solidHeight(Nt, d);
  const HsMax = (1 + scenario.solidHeightTolerance) * HsNom;
  const Lc = HsMax + scenario.extraSolidClearance;

  // ── Axial packaging: Lc + s = B ──
  const s = B - Lc;

  // ── Starting deflection / free length ──
  const x0 = F0 / k;
  const Lf = Lc + x0;

  // ── State lengths ──
  const L2 = B; // Lc + s
  const L3 = B + y;

  // ── Force states ──
  const F2 = F0 - k * s;
  const F3 = F0 - k * (s + y);

  // ── Work (ideal spring work; area under the force–travel line) ──
  const Whammer = runUpWork(F0, k, s); // F0·s − ½·k·s²
  const Wlatch = runUpWork(F2, k, y); // F2·y − ½·k·y²
  const WreleaseIdeal = Whammer + Wlatch;

  // ── Ideal force-equivalent metrics (NOT actual contact force) ──
  const FeqAvgIdeal = y !== 0 ? WreleaseIdeal / y : NaN;
  const FeqTriPeakIdeal = 2 * FeqAvgIdeal;

  // ── Wahl-corrected operating shear stress at F0 ──
  const Kw = wahlFactor(C);
  const tau = shearStress(Kw, F0, D, d);
  const stressPctConservative = tau / material.tensileMinPsi;
  const stressPctOptimistic = tau / material.tensileMaxPsi;
  const stressPctBasis = tau / tensileBasisPsi(material, scenario.stressBasis);

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
    F2,
    F3,
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
    Lc,
    s,
    F0,
    x0,
    Lf,
    L2,
    L3,
    F2,
    F3,
    Whammer,
    Wlatch,
    WreleaseIdeal,
    FeqAvgIdeal,
    FeqTriPeakIdeal,
    Kw,
    tau,
    stressPctConservative,
    stressPctOptimistic,
    stressPctBasis,
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
  F2: number;
  F3: number;
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
  const loadedAtContact = geometryValid && i.F2 > 0;
  const drivingAfterLatch = geometryValid && i.F3 > 0;
  const stressBand = classifyStressBand(i.stressPctBasis);
  const springIndexAdvisoryOk = i.C >= 4 && i.C <= 12;

  const reasons: V2ExclusionReason[] = [];
  if (!geometryValid) reasons.push("invalid-geometry");
  else {
    if (!positiveRunUp || !fitsBudget) reasons.push("no-run-up");
    if (!loadedAtContact) reasons.push("slack-at-contact");
    if (!drivingAfterLatch) reasons.push("stops-driving");
    if (stressBand === "redesign") reasons.push("stress-redesign");
  }

  // The recommended feasible set: hard geometry + continuous-drive AND the
  // stress band is not the Lee redesign region (>60%). The spring-index range
  // is only ADVISORY and never removes a candidate from the feasible set.
  const feasible =
    geometryValid &&
    positiveRunUp &&
    fitsBudget &&
    loadedAtContact &&
    drivingAfterLatch &&
    stressBand !== "redesign";

  return {
    geometryValid,
    positiveRunUp,
    fitsBudget,
    loadedAtContact,
    drivingAfterLatch,
    stressBand,
    springIndexAdvisoryOk,
    feasible,
    reasons,
  };
}
