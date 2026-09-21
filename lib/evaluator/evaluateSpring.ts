import {
  activeCoilsFromRate,
  runUpWork,
  shearStress,
  solidHeight,
  springIndex,
  wahlFactor,
} from "@/lib/engineering/spring";
import { classifyStressBand } from "@/lib/v2/evaluateCandidate";
import { getV2Material } from "@/lib/v2/materials";
import type { V2Candidate, V2ExclusionReason, V2Feasibility } from "@/lib/v2/types";
import type {
  EvaluatorForceRange,
  SpringEvaluatorInputs,
  SpringEvaluatorResult,
} from "./types";

const EPSILON = 1e-9;

function positiveReleaseWork(startForce: number, rate: number, travel: number): number {
  if (startForce <= 0 || rate <= 0 || travel <= 0) return 0;
  const loadedTravel = Math.min(travel, startForce / rate);
  return runUpWork(startForce, rate, loadedTravel);
}

function forceAtLength(rate: number, freeLength: number, length: number): number {
  return Math.max(0, rate * (freeLength - length));
}

function forceRangeAtLength(
  nominal: number,
  rate: number,
  freeLength: number,
  length: number,
  rateTolerance: number,
  freeLengthTolerance: number,
): EvaluatorForceRange {
  return {
    min: forceAtLength(
      rate * (1 - rateTolerance),
      freeLength - freeLengthTolerance,
      length,
    ),
    nominal,
    max: forceAtLength(
      rate * (1 + rateTolerance),
      freeLength + freeLengthTolerance,
      length,
    ),
  };
}

function candidateFeasibility(args: {
  geometryValid: boolean;
  runUp: number;
  criticalTravel: number;
  totalTravel: number;
  contactForce: number;
  criticalForce: number;
  endForce: number;
  minimumEndForce: number;
  opposingPreload: number;
  stressPctBasis: number;
  springIndex: number;
}): V2Feasibility {
  const positiveRunUp = args.runUp > 0;
  const travelOrderValid =
    args.criticalTravel > 0 && args.totalTravel >= args.criticalTravel;
  const loadedAtContact = args.contactForce > 0;
  const drivingAfterLatch = args.criticalForce > 0;
  const drivingAtEnd = args.endForce > 0;
  const endForceSufficient = args.endForce + EPSILON >= args.minimumEndForce;
  const overcomesOpposingPreload = args.endForce > args.opposingPreload;
  const stressBand = classifyStressBand(args.stressPctBasis);
  const springIndexAdvisoryOk = args.springIndex >= 4 && args.springIndex <= 12;
  const reasons: V2ExclusionReason[] = [];

  if (!args.geometryValid) reasons.push("invalid-geometry");
  if (!travelOrderValid) reasons.push("invalid-travel");
  if (!positiveRunUp) reasons.push("no-run-up");
  if (!loadedAtContact) reasons.push("slack-at-contact");
  if (!drivingAtEnd) reasons.push("stops-driving");
  else if (!endForceSufficient || !overcomesOpposingPreload) {
    reasons.push("insufficient-end-force");
  }
  if (stressBand === "redesign") reasons.push("stress-redesign");

  return {
    geometryValid: args.geometryValid,
    positiveRunUp,
    fitsBudget: positiveRunUp,
    travelOrderValid,
    armedHeightInRange: true,
    loadedAtContact,
    drivingAfterLatch,
    drivingAtEnd,
    endForceSufficient,
    overcomesOpposingPreload,
    stressBand,
    springIndexAdvisoryOk,
    feasible:
      args.geometryValid &&
      positiveRunUp &&
      travelOrderValid &&
      loadedAtContact &&
      drivingAfterLatch &&
      drivingAtEnd &&
      endForceSufficient &&
      overcomesOpposingPreload,
    reasons,
  };
}

/**
 * Solve one spring directly from two load-at-height points, then back-solve
 * coil count from the selected wire, material and mean diameter. Unlike the
 * Optimize sweep, armed height is an input and utilization is a reported check.
 */
export function evaluateSpringConstraints(
  inputs: SpringEvaluatorInputs,
): SpringEvaluatorResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const d = inputs.wireDiameter;
  const minimumOdForId = inputs.minimumSpringId + 2 * d;
  const centeredOd = (minimumOdForId + inputs.maximumSpringOd) / 2;
  const OD = inputs.centerSpringInEnvelope ? centeredOd : inputs.nominalSpringOd;
  const ID = OD - 2 * d;
  const D = OD - d;
  const innerRadialClearance = (ID - inputs.minimumSpringId) / 2;
  const outerRadialClearance = (inputs.maximumSpringOd - OD) / 2;
  const Lc = inputs.armedLength;
  const L2 = inputs.axialBudget;
  const L3 = L2 + inputs.criticalTravel;
  const L4 = L2 + inputs.totalCoupledTravel;
  const s = L2 - Lc;
  const forceDropTravel = L4 - Lc;
  const forceDrop = inputs.nominalArmedForce - inputs.targetEndForce;

  if (!(d > 0)) errors.push("Wire diameter must be greater than zero.");
  if (!(inputs.maximumSpringOd > inputs.minimumSpringId)) {
    errors.push("Maximum spring OD must be larger than minimum spring ID.");
  }
  if (minimumOdForId > inputs.maximumSpringOd + EPSILON) {
    errors.push("The selected wire cannot fit between the minimum ID and maximum OD.");
  }
  if (innerRadialClearance < -EPSILON) {
    errors.push("Calculated spring ID is smaller than the configured minimum ID.");
  }
  if (outerRadialClearance < -EPSILON) {
    errors.push("Calculated spring OD exceeds the configured maximum OD.");
  }
  if (!(s > 0)) errors.push("Armed length must be shorter than the axial budget.");
  if (!(inputs.criticalTravel > 0)) errors.push("Critical travel must be greater than zero.");
  if (inputs.totalCoupledTravel + EPSILON < inputs.criticalTravel) {
    errors.push("Total coupled travel cannot be shorter than critical travel.");
  }
  if (!(forceDropTravel > 0)) errors.push("Full-travel length must exceed armed length.");
  if (!(forceDrop > 0)) {
    errors.push("Armed force must be greater than the nominal full-travel force target.");
  }
  if (!(inputs.shearModulusPsi > 0)) errors.push("Shear modulus must be greater than zero.");
  if (!(inputs.stressBasisPsi > 0)) errors.push("Tensile screening basis must be greater than zero.");
  if (!(D > d)) errors.push("Mean coil diameter must be larger than wire diameter.");

  if (errors.length > 0) {
    return {
      candidate: null,
      errors,
      warnings,
      nominalSpringOd: OD,
      calculatedSpringId: ID,
      innerRadialClearance,
      outerRadialClearance,
      forceRanges: null,
    };
  }

  const k = forceDrop / forceDropTravel;
  const Na = activeCoilsFromRate(k, inputs.shearModulusPsi, d, D);
  const Nt = Na + inputs.inactiveEndCoils;
  const C = springIndex(D, d);
  const HsNom = solidHeight(Nt, d);
  const HsMax = HsNom * (1 + inputs.solidHeightTolerance);
  const x0 = inputs.nominalArmedForce / k;
  const Lf = Lc + x0;
  const solidClearance = Lc - HsMax;
  const availableDeflection = Lf - HsMax;
  const deflectionUtilization =
    availableDeflection > 0 ? x0 / availableDeflection : Number.POSITIVE_INFINITY;
  const deflectionReserve = 1 - deflectionUtilization;

  const F0 = inputs.nominalArmedForce;
  const F2 = F0 - k * s;
  const F3 = F0 - k * (s + inputs.criticalTravel);
  const F4 = F0 - k * (s + inputs.totalCoupledTravel);
  const endForceMargin = F4 - inputs.minimumEndForce;
  const netEndForce = F4 - inputs.opposingPreload;

  const Whammer = positiveReleaseWork(F0, k, s);
  const Wlatch = positiveReleaseWork(F2, k, inputs.criticalTravel);
  const Wcoupled = positiveReleaseWork(F2, k, inputs.totalCoupledTravel);
  const WpostCritical = Math.max(0, Wcoupled - Wlatch);
  const Wopposing =
    Math.max(0, inputs.opposingPreload) *
    Math.max(0, inputs.totalCoupledTravel - inputs.criticalTravel);
  const WpostCriticalNet = WpostCritical - Wopposing;
  const WthroughEnd = Whammer + Wcoupled;
  const WreleaseIdeal = Whammer + Wlatch;
  const FeqAvgIdeal =
    inputs.criticalTravel > 0 ? WreleaseIdeal / inputs.criticalTravel : Number.NaN;
  const FeqTriPeakIdeal = 2 * FeqAvgIdeal;

  const Kw = wahlFactor(C);
  const tau = shearStress(Kw, F0, D, d);
  const material = getV2Material(inputs.materialId);
  const stressPctConservative = tau / material.tensileMinPsi;
  const stressPctOptimistic = tau / material.tensileMaxPsi;
  const stressPctBasis = tau / inputs.stressBasisPsi;
  const geometryValid =
    d > 0 && D > d && ID > 0 && Na > 0 && Nt > inputs.inactiveEndCoils && C > 1;
  const feasibility = candidateFeasibility({
    geometryValid,
    runUp: s,
    criticalTravel: inputs.criticalTravel,
    totalTravel: inputs.totalCoupledTravel,
    contactForce: F2,
    criticalForce: F3,
    endForce: F4,
    minimumEndForce: inputs.minimumEndForce,
    opposingPreload: inputs.opposingPreload,
    stressPctBasis,
    springIndex: C,
  });

  if (innerRadialClearance < 0.005) {
    warnings.push("Inner radial clearance is below 0.005 in before manufacturing, bow or guide tolerance.");
  }
  if (outerRadialClearance < 0.005) {
    warnings.push("Outer radial clearance is below 0.005 in before manufacturing, bow or guide tolerance.");
  }
  if (solidClearance <= 0) {
    warnings.push("Armed height is at or below modeled maximum solid height.");
  }
  if (F4 + EPSILON < inputs.minimumEndForce) {
    warnings.push("Nominal full-travel force is below the required minimum.");
  }
  if (netEndForce <= 0) {
    warnings.push("Full-travel force does not overcome the opposing preload.");
  }
  if (Na < 2 || Na > 12) {
    warnings.push("Calculated active coil count is outside the usual first-pass range; request vendor review.");
  }
  if (!feasibility.springIndexAdvisoryOk) {
    warnings.push("Spring index is outside the usual 4–12 manufacturability range.");
  }
  if (inputs.presetHeight <= HsNom) {
    warnings.push("Configured preset compression height is at or below nominal solid height.");
  } else if (inputs.presetHeight >= Lc) {
    warnings.push("Preset compression height is not below the armed operating height; confirm the supplier's preset process.");
  }

  const candidate: V2Candidate = {
    key: `evaluator|${d.toFixed(5)}|${Na.toFixed(5)}`,
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
    stressBasisPsi: inputs.stressBasisPsi,
    feasibility,
    pareto: false,
  };

  const forceRanges = {
    armed: forceRangeAtLength(
      F0,
      k,
      Lf,
      Lc,
      inputs.springRateTolerance,
      inputs.freeLengthTolerance,
    ),
    contact: forceRangeAtLength(
      F2,
      k,
      Lf,
      L2,
      inputs.springRateTolerance,
      inputs.freeLengthTolerance,
    ),
    critical: forceRangeAtLength(
      F3,
      k,
      Lf,
      L3,
      inputs.springRateTolerance,
      inputs.freeLengthTolerance,
    ),
    end: forceRangeAtLength(
      F4,
      k,
      Lf,
      L4,
      inputs.springRateTolerance,
      inputs.freeLengthTolerance,
    ),
  };

  if (forceRanges.end.min + EPSILON < inputs.minimumEndForce) {
    warnings.push("Independent low tolerance corner falls below the required end force.");
  }

  return {
    candidate,
    errors,
    warnings,
    nominalSpringOd: OD,
    calculatedSpringId: ID,
    innerRadialClearance,
    outerRadialClearance,
    forceRanges,
  };
}

export function buildEvaluatorSummary(
  inputs: SpringEvaluatorInputs,
  result: SpringEvaluatorResult,
): string {
  const c = result.candidate;
  if (!c) return `Spring Evaluator\n\nNo valid candidate.\n${result.errors.join("\n")}`;
  const material = getV2Material(inputs.materialId);
  return `Spring Candidate — Constraint Evaluation

Mechanism
• Armed: ${c.Lc.toFixed(4)} in at ${c.F0.toFixed(1)} lbf nominal
• Hammer contact: ${c.L2.toFixed(4)} in at ${c.F2.toFixed(1)} lbf
• Critical release: ${c.L3.toFixed(4)} in at ${c.F3.toFixed(1)} lbf
• Coupled-travel end: ${c.L4.toFixed(4)} in at ${c.F4.toFixed(1)} lbf
• Hammer run-up: ${c.s.toFixed(4)} in

Spring
• Material assumption: ${material.name}${material.specification ? ` · ${material.specification}` : ""}
• Wire diameter: ${c.d.toFixed(4)} in
• Outside / inside diameter: ${c.OD.toFixed(4)} / ${c.ID.toFixed(4)} in
• Active / total coils: ${c.Na.toFixed(2)} / ${c.Nt.toFixed(2)}
• Free length: ${c.Lf.toFixed(4)} in
• Spring rate: ${c.k.toFixed(1)} lbf/in
• Preset compression height assumption: ${inputs.presetHeight.toFixed(4)} in (manufacturing process, not armed length)

Work
• Hammer run-up: ${c.Whammer.toFixed(2)} in·lbf
• Critical window: ${c.Wlatch.toFixed(2)} in·lbf
• Full post-contact travel: ${c.Wcoupled.toFixed(2)} in·lbf

Nominal calculation only. Confirm geometry, tolerances, presetting and load-at-height values with the spring supplier.`;
}
