export type DeflectionConstraintDisplayMode = "utilization" | "clearance";

export interface DeflectionConstraintState {
  /** Maximum working deflection as a fraction of free-to-maximum-solid travel. */
  maxUtilization: number;
  displayMode: DeflectionConstraintDisplayMode;
}

export const DEFAULT_MAX_DEFLECTION_UTILIZATION = 0.8;

export const DEFAULT_DEFLECTION_CONSTRAINT: DeflectionConstraintState = {
  maxUtilization: DEFAULT_MAX_DEFLECTION_UTILIZATION,
  displayMode: "utilization",
};

export function clampDeflectionUtilization(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_DEFLECTION_UTILIZATION;
  return Math.min(0.99, Math.max(0.05, value));
}

/** Required work-height clearance above Hs,max for a known working deflection. */
export function requiredSolidClearance(workingDeflection: number, maxUtilization: number): number {
  const u = clampDeflectionUtilization(maxUtilization);
  if (!Number.isFinite(workingDeflection) || workingDeflection < 0) return NaN;
  return workingDeflection * (1 / u - 1);
}

/** Convert an equivalent clearance for one reference spring back to the canonical utilization. */
export function utilizationFromClearance(workingDeflection: number, clearance: number): number {
  if (!Number.isFinite(workingDeflection) || workingDeflection <= 0) return NaN;
  if (!Number.isFinite(clearance) || clearance < 0) return NaN;
  return clampDeflectionUtilization(workingDeflection / (workingDeflection + clearance));
}

export function workingDeflectionUtilization(
  workingDeflection: number,
  freeLength: number,
  maximumSolidHeight: number,
): number {
  const available = freeLength - maximumSolidHeight;
  return available > 0 ? workingDeflection / available : Infinity;
}
