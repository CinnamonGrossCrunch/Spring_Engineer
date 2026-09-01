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
      "forceCap", "axialBudget", "latchTravel", "housingInnerDiameter",
      "outerDiameterTolerance", "shearModulusPsi", "solidHeightTolerance",
      "maxDeflectionUtilization", "wireMin", "wireMax", "wireStep",
      "activeCoilsMin", "activeCoilsMax", "activeCoilsStep", "stressBasisPsi",
      "impactEfficiency", "impactRestitution",
    ];
    if (numeric.some((key) => !Number.isFinite(merged[key] as number))) return null;
    merged.impactEfficiency = Math.max(0, Math.min(1, merged.impactEfficiency));
    merged.impactRestitution = Math.max(0, Math.min(1, merged.impactRestitution));
    return merged;
  } catch {
    return null;
  }
}
