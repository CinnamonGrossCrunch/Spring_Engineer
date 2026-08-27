import type { V2Scenario } from "./types";

export const MILLIMETERS_PER_INCH = 25.4;
export const DEFAULT_HOUSING_INNER_DIAMETER_MM = 28;
export const DEFAULT_OD_TOLERANCE_IN = 0.02;

export function inchesToMillimeters(inches: number): number {
  return inches * MILLIMETERS_PER_INCH;
}

export function millimetersToInches(millimeters: number): number {
  return millimeters / MILLIMETERS_PER_INCH;
}

/**
 * Nominal sweep OD that keeps the positive OD tolerance at or below the
 * housing bore. This intentionally assumes zero additional diametral fit
 * clearance; users can include that clearance in the allowance when needed.
 */
export function nominalSpringOuterDiameter(
  scenario: Pick<V2Scenario, "housingInnerDiameter" | "outerDiameterTolerance">,
): number {
  return scenario.housingInnerDiameter - Math.max(0, scenario.outerDiameterTolerance);
}

export function maximumFinishedSpringOuterDiameter(
  scenario: Pick<V2Scenario, "housingInnerDiameter" | "outerDiameterTolerance">,
): number {
  return nominalSpringOuterDiameter(scenario) + Math.max(0, scenario.outerDiameterTolerance);
}
