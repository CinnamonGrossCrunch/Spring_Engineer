import { DEFAULT_V2_SCENARIO } from "./defaults";
import { getV2Material } from "./materials";
import type { V2Scenario } from "./types";

export const V2_SCENARIO_STORAGE_KEY = "sigma-spring-engine:v2-scenario:v1";

export function parseStoredV2Scenario(raw: string | null): V2Scenario | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<V2Scenario>;
    if (!parsed || typeof parsed !== "object") return null;
    const merged = { ...DEFAULT_V2_SCENARIO, ...parsed };
    const material = getV2Material(merged.materialId);
    merged.materialId = material.id;
    const numeric: Array<keyof V2Scenario> = [
      "forceCap", "axialBudget", "latchTravel", "totalLatchTravel",
      "minimumEndForce", "opposingPreload", "armedHeightMin", "armedHeightMax",
      "housingInnerDiameter",
      "outerDiameterTolerance", "shearModulusPsi", "solidHeightTolerance",
      "springRateTolerance", "freeLengthTolerance",
      "maxDeflectionUtilization", "wireMin", "wireMax", "wireStep",
      "activeCoilsMin", "activeCoilsMax", "activeCoilsStep", "stressBasisPsi",
      "impactEfficiency", "impactRestitution",
    ];
    if (numeric.some((key) => !Number.isFinite(merged[key] as number))) return null;
    merged.impactEfficiency = Math.max(0, Math.min(1, merged.impactEfficiency));
    merged.impactRestitution = Math.max(0, Math.min(1, merged.impactRestitution));
    merged.latchTravel = Math.max(0.001, merged.latchTravel);
    merged.totalLatchTravel = Math.max(merged.latchTravel, merged.totalLatchTravel);
    merged.minimumEndForce = Math.max(0, merged.minimumEndForce);
    merged.opposingPreload = Math.max(0, merged.opposingPreload);
    merged.armedHeightConstraintEnabled = merged.armedHeightConstraintEnabled === true;
    merged.armedHeightMin = Math.max(0, merged.armedHeightMin);
    merged.armedHeightMax = Math.max(merged.armedHeightMin, merged.armedHeightMax);
    merged.manufacturingToleranceEnabled = merged.manufacturingToleranceEnabled === true;
    merged.springRateTolerance = Math.max(0, Math.min(0.99, merged.springRateTolerance));
    merged.freeLengthTolerance = Math.max(0, merged.freeLengthTolerance);
    return merged;
  } catch {
    return null;
  }
}
