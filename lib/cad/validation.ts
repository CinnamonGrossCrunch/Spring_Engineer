/**
 * Client-side pre-flight for a CAD request.
 *
 * The service re-runs all of this authoritatively — this copy exists so the UI
 * can gate the button and explain a problem without a round trip. The
 * tolerances deliberately mirror `cad-service/app/tolerances.py`; if you change
 * one, change both.
 */

import type { SpringConfiguration, SpringGeometry, SpringStates } from "./types";
import { CONFIGURATION_LABELS } from "./types";

/** Relative tolerance for the redundant checks. Mirrors GEOMETRY_CONSISTENCY_REL_TOL. */
const CONSISTENCY_REL_TOL = 0.02;

/** Absolute tolerance on Nt vs Na + 2, in turns. Mirrors COIL_COUNT_ABS_TOL. */
const COIL_COUNT_ABS_TOL = 0.1;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Nominal solid height for squared-and-ground ends, Hs = Nt * d [in].
 *
 * With the CAD end model's default heuristics this is exactly the shortest
 * state the generator can build, so the UI and the kernel agree on the limit.
 */
export function nominalSolidHeightIn(geometry: SpringGeometry): number {
  return geometry.totalCoils * geometry.wireDiameterIn;
}

/**
 * Cross-check the redundant geometry a V2 candidate carries. Returns every
 * disagreement rather than the first, so the user sees the whole picture.
 */
export function validateSpringGeometry(geometry: SpringGeometry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { wireDiameterIn: d, meanDiameterIn: D, outerDiameterIn: OD } = geometry;
  const { innerDiameterIn: ID, activeCoils: Na, totalCoils: Nt } = geometry;

  const finite = (x: number) => Number.isFinite(x);
  if (![d, D, OD, ID, Na, Nt].every(finite)) {
    return { valid: false, errors: ["Candidate geometry contains non-finite values."], warnings };
  }

  if (d <= 0) errors.push("Wire diameter must be positive.");
  if (Na <= 0) errors.push("Active coils must be positive.");
  if (Nt <= 2) errors.push("Total coils must exceed 2 for closed and ground ends.");
  if (D <= d) errors.push("Mean diameter must be greater than wire diameter.");

  const relOff = (actual: number, expected: number) =>
    Math.abs(actual - expected) > CONSISTENCY_REL_TOL * Math.max(Math.abs(expected), 1e-9);

  if (relOff(D, OD - d)) {
    errors.push(
      `Mean diameter disagrees with OD − d: D = ${D.toFixed(4)} in, OD − d = ${(OD - d).toFixed(4)} in.`,
    );
  }
  if (relOff(ID, D - d)) {
    errors.push(
      `Inside diameter disagrees with D − d: ID = ${ID.toFixed(4)} in, D − d = ${(D - d).toFixed(4)} in.`,
    );
  }
  if (Math.abs(Nt - (Na + 2)) > COIL_COUNT_ABS_TOL) {
    errors.push(
      `Total coils disagrees with Na + 2 for closed/ground ends: Nt = ${Nt.toFixed(2)}, Na + 2 = ${(Na + 2).toFixed(2)}.`,
    );
  }

  const springIndex = D / d;
  if (springIndex < 4 || springIndex > 12) {
    warnings.push(
      `Spring index C = ${springIndex.toFixed(2)} sits outside the usual 4–12 manufacturability advisory.`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Which of the four states can actually be built.
 *
 * A state below nominal solid height would require wire to pass through wire,
 * so it is unbuildable rather than merely unusual. Everything else is allowed.
 */
export function stateBuildability(
  states: SpringStates,
  geometry: SpringGeometry,
): Record<SpringConfiguration, { buildable: boolean; lengthIn: number; reason?: string }> {
  const solidHeight = nominalSolidHeightIn(geometry);

  const lengths: Record<SpringConfiguration, number> = {
    free: states.freeLengthIn,
    armed: states.armedLengthIn,
    contact: states.contactLengthIn,
    release: states.releaseLengthIn,
  };

  const out = {} as Record<
    SpringConfiguration,
    { buildable: boolean; lengthIn: number; reason?: string }
  >;

  for (const key of Object.keys(lengths) as SpringConfiguration[]) {
    const lengthIn = lengths[key];
    if (!Number.isFinite(lengthIn) || lengthIn <= 0) {
      out[key] = { buildable: false, lengthIn, reason: "Length is not a positive number." };
    } else if (lengthIn < solidHeight) {
      out[key] = {
        buildable: false,
        lengthIn,
        reason: `Below nominal solid height (${solidHeight.toFixed(3)} in) — the coils are already touching.`,
      };
    } else {
      out[key] = { buildable: true, lengthIn };
    }
  }

  return out;
}

/** Aggregate state check, for messaging rather than gating. */
export function validateSpringStates(
  states: SpringStates,
  geometry: SpringGeometry,
): ValidationResult {
  const buildability = stateBuildability(states, geometry);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of Object.keys(buildability) as SpringConfiguration[]) {
    const entry = buildability[key];
    if (!entry.buildable) {
      warnings.push(`${CONFIGURATION_LABELS[key].label}: ${entry.reason}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Gate for the Generate CAD Model button.
 *
 * Geometry validity only. A candidate is NOT blocked for being high-stress,
 * off-Pareto, unshortlisted or excluded from the recommended feasible set —
 * those are engineering judgements, not geometric impossibilities.
 */
export function canGenerateCad(geometry: SpringGeometry): boolean {
  return validateSpringGeometry(geometry).valid;
}
