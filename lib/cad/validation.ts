/**
 * CAD Request Validation
 *
 * Validates that a CAD spring request has geometrically consistent values
 * before sending to the Python service.
 */

import type { SpringGeometry, SpringStates } from "./types";

const TOLERANCE_FRACTION = 0.02; // 2% tolerance for redundant checks

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate the geometric consistency of a spring geometry.
 */
export function validateSpringGeometry(geometry: SpringGeometry): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic range checks
  if (geometry.wireDiameterIn <= 0) {
    errors.push("Wire diameter must be positive");
  }
  if (geometry.meanDiameterIn <= geometry.wireDiameterIn) {
    errors.push("Mean diameter must be greater than wire diameter");
  }
  if (geometry.activeCoils <= 0) {
    errors.push("Active coils must be positive");
  }
  if (geometry.totalCoils <= 2) {
    errors.push("Total coils must be greater than 2");
  }
  if (geometry.totalCoils < geometry.activeCoils) {
    errors.push("Total coils must be >= active coils");
  }

  // Redundant consistency checks
  // OD ≈ D + d
  const expectedOD = geometry.meanDiameterIn + geometry.wireDiameterIn;
  if (Math.abs(expectedOD - geometry.outerDiameterIn) > TOLERANCE_FRACTION * geometry.outerDiameterIn) {
    errors.push(
      `OD inconsistency: provided OD (${geometry.outerDiameterIn.toFixed(4)}) does not match D + d (${expectedOD.toFixed(4)})`
    );
  }

  // ID ≈ D - d
  const expectedID = geometry.meanDiameterIn - geometry.wireDiameterIn;
  if (Math.abs(expectedID - geometry.innerDiameterIn) > TOLERANCE_FRACTION * geometry.innerDiameterIn) {
    errors.push(
      `ID inconsistency: provided ID (${geometry.innerDiameterIn.toFixed(4)}) does not match D - d (${expectedID.toFixed(4)})`
    );
  }

  // Nt ≈ Na + 2 (closed and ground)
  const expectedNt = geometry.activeCoils + 2;
  if (Math.abs(expectedNt - geometry.totalCoils) > 0.1) {
    errors.push(
      `Total coils inconsistency: for closed/ground ends, Nt should be Na + 2 (${expectedNt.toFixed(2)}), but got ${geometry.totalCoils.toFixed(2)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate that spring states are physically reasonable.
 */
export function validateSpringStates(
  states: SpringStates,
  geometry: SpringGeometry
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // All states must be positive
  if (states.freeLengthIn <= 0) errors.push("Free length must be positive");
  if (states.armedLengthIn <= 0) errors.push("Armed length must be positive");
  if (states.contactLengthIn <= 0) errors.push("Contact length must be positive");
  if (states.releaseLengthIn <= 0) errors.push("Release length must be positive");

  // Logical ordering: armed ≤ contact ≤ release ≤ free
  if (states.armedLengthIn > states.freeLengthIn) {
    errors.push("Armed length must not exceed free length");
  }
  if (states.contactLengthIn < states.armedLengthIn) {
    errors.push("Contact length must be >= armed length");
  }
  if (states.releaseLengthIn < states.contactLengthIn) {
    errors.push("Release length must be >= contact length");
  }

  // Minimum physical height: solid height ≈ Nt * d
  const solidHeightNom = geometry.totalCoils * geometry.wireDiameterIn;
  if (states.armedLengthIn < solidHeightNom * 0.95) {
    warnings.push(
      `Armed length (${states.armedLengthIn.toFixed(4)}) is below nominal solid height (${solidHeightNom.toFixed(4)}), spring may be over-compressed`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
