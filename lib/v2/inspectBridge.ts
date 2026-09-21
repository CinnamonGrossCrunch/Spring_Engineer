import type { ModelState } from "@/lib/engineering/types";
import { buildInitialState } from "@/data/exampleModel";
import { DEFAULT_V2_SCENARIO } from "./defaults";
import { getV2Material } from "./materials";
import { sweepV2DesignSpace } from "./sweepDesignSpace";
import type { V2Candidate, V2Scenario } from "./types";

/**
 * Map a selected V2 candidate into a compatible V1 `ModelState` so the existing
 * V1 dependency graph / parameter inspector can audit it.
 *
 * Optimize owns the canonical selected candidate. This mapping runs whenever
 * that selection or its scenario changes so Engineering audits the same design
 * rather than retaining a second, stale default candidate.
 *
 * Strategy: start from the current EXPLORE role template (D as the free radial
 * diameter, OD/ID derived; N_t primary, N_a derived) and override every shared
 * scenario input plus the geometry, travels and free length. The V1
 * solver then re-derives k, the force states, loaded lengths, stress, etc. Free
 * length + max deflection are chosen so the derived F1 lands at the candidate's
 * starting force F0 without pinning it (avoids an artificial overconstraint):
 *
 *   x1 = x0 = F0 / k   →   F1 = k · x1 = F0
 *
 * The shared maximum-deflection-utilization scenario is carried into V1 so the
 * candidate is audited against the same governing packaging constraint.
 */
export function candidateToV1Model(candidate: V2Candidate, scenario: V2Scenario): ModelState {
  const base = buildInitialState("explore", "currentCandidate");
  const next: ModelState = { ...base };
  const material = getV2Material(scenario.materialId);

  // Radial basis: D is the free variable; OD and ID derive from it.
  next.d = { value: candidate.d, status: "variable" };
  next.D = { value: candidate.D, status: "variable" };
  next.OD = { value: undefined, status: "derived" };
  next.ID = { value: undefined, status: "derived" };

  // Coil basis: N_t primary, N_a derived (closed & ground).
  next.Nt = { value: candidate.Nt, status: "variable" };
  next.Na = { value: undefined, status: "derived" };

  // Material shear modulus from the V2 benchmark material.
  next.G = { value: scenario.shearModulusPsi, status: "assumed" };
  next.m = { value: scenario.hammerMassLbm ?? undefined, status: "variable" };
  next.eta = { value: scenario.impactEfficiency, status: "assumed" };

  // Shared mechanism limits and engineering guidance from the active scenario.
  next.B = { value: scenario.axialBudget, status: "fixed" };
  next.F1_cap = { value: scenario.forceCap, status: "fixed" };
  next.solid_tolerance = { value: scenario.solidHeightTolerance, status: "assumed" };
  next.TS_basis = { value: scenario.stressBasisPsi, status: "assumed" };
  next.TS_conservative = { value: material.tensileMinPsi, status: "assumed" };
  next.TS_upper = { value: material.tensileMaxPsi, status: "assumed" };

  // Travels + free length so the derived force states reproduce the candidate.
  next.x1 = { value: candidate.x0, status: "variable" };
  next.L_free = { value: candidate.Lf, status: "variable" };
  next.s_h = { value: candidate.s, status: "variable" };
  next.y_latch = { value: scenario.latchTravel, status: "fixed" };
  next.y_total = { value: scenario.totalLatchTravel, status: "fixed" };
  next.F_end_min = { value: scenario.minimumEndForce, status: "fixed" };
  next.F_opposing = { value: scenario.opposingPreload, status: "fixed" };
  next.L_armed_min = {
    value: scenario.armedHeightConstraintEnabled ? scenario.armedHeightMin : undefined,
    status: "fixed",
  };
  next.L_armed_max = {
    value: scenario.armedHeightConstraintEnabled ? scenario.armedHeightMax : undefined,
    status: "fixed",
  };
  next.deflection_utilization_max = { value: scenario.maxDeflectionUtilization, status: "variable" };

  return next;
}

/** Build the Engineer page's initial model from Optimize's actual default. */
export function defaultV2CandidateToV1Model(
  scenario: V2Scenario = DEFAULT_V2_SCENARIO,
): ModelState {
  const sweep = sweepV2DesignSpace(scenario);
  const feasibleCandidate = sweep.defaultKey
    ? sweep.candidates.find((item) => item.key === sweep.defaultKey)
    : undefined;
  // A fully constrained default may legitimately have no feasible point. The
  // Engineer page still needs a finite equation-audit seed before persisted
  // scenario state hydrates, so prefer a candidate that passes every hard
  // mechanism boundary and is excluded only by the stress-guidance band.
  const stressOnlyReference = sweep.candidates
    .filter((item) =>
      item.feasibility.reasons.length > 0 &&
      item.feasibility.reasons.every((reason) => reason === "stress-redesign"),
    )
    .sort((a, b) => b.FeqAvgIdeal - a.FeqAvgIdeal)[0];
  const candidate = feasibleCandidate ?? stressOnlyReference;

  if (!candidate) {
    throw new Error("The default V2 scenario did not produce a hard-geometry reference candidate.");
  }

  return candidateToV1Model(candidate, scenario);
}
