import type { ModelState } from "@/lib/engineering/types";
import { buildInitialState } from "@/data/exampleModel";
import { getV2Material } from "./materials";
import type { V2Candidate, V2Scenario } from "./types";

/**
 * Map a selected V2 candidate into a compatible V1 `ModelState` so the existing
 * V1 dependency graph / parameter inspector can audit it.
 *
 * This is an EXPLICIT, user-initiated bridge — it overwrites V1 state and must
 * never run automatically while browsing V2 candidates.
 *
 * Strategy: start from the equation-consistent reconciled EXPLORE base (D as the
 * free radial diameter, OD/ID derived; N_t primary, N_a derived) and override
 * the geometry, travels and free length with the candidate's values. The V1
 * solver then re-derives k, the force states, loaded lengths, stress, etc. Free
 * length + max deflection are chosen so the derived F1 lands at the candidate's
 * starting force F0 without pinning it (avoids an artificial overconstraint):
 *
 *   x1 = x0 = F0 / k   →   F1 = k · x1 = F0
 *
 * The V1 material/limits (τ_allow, required clearance) intentionally remain V1's
 * historical assumptions — auditing the candidate under V1's own model is the
 * whole point of the bridge.
 */
export function candidateToV1Model(candidate: V2Candidate, scenario: V2Scenario): ModelState {
  const base = buildInitialState("explore", "reconciledCandidate");
  const material = getV2Material(scenario.materialId);

  const next: ModelState = { ...base };

  // Radial basis: D is the free variable; OD and ID derive from it.
  next.d = { value: candidate.d, status: "variable" };
  next.D = { value: candidate.D, status: "variable" };
  next.OD = { value: undefined, status: "derived" };
  next.ID = { value: undefined, status: "derived" };

  // Coil basis: N_t primary, N_a derived (closed & ground).
  next.Nt = { value: candidate.Nt, status: "variable" };
  next.Na = { value: undefined, status: "derived" };

  // Material shear modulus from the V2 benchmark material.
  next.G = { value: material.shearModulusPsi, status: "assumed" };

  // Travels + free length so the derived force states reproduce the candidate.
  next.x1 = { value: candidate.x0, status: "variable" };
  next.L_free = { value: candidate.Lf, status: "variable" };
  next.s_h = { value: candidate.s, status: "variable" };
  next.y_latch = { value: scenario.latchTravel, status: "variable" };

  return next;
}
