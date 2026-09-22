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
    const legacyHammerMode = parsed.hammerVolumeIn3 !== null && parsed.hammerVolumeIn3 !== undefined
      ? "volume"
      : parsed.hammerMassLbm !== null && parsed.hammerMassLbm !== undefined
        ? "direct"
        : DEFAULT_V2_SCENARIO.hammerMassInputMode;
    const legacyLatchMode = parsed.latchVolumeIn3 !== null && parsed.latchVolumeIn3 !== undefined
      ? "volume"
      : parsed.latchMassLbm !== null && parsed.latchMassLbm !== undefined
        ? "direct"
        : DEFAULT_V2_SCENARIO.latchMassInputMode;
    merged.hammerMassInputMode = parsed.hammerMassInputMode === "direct" || parsed.hammerMassInputMode === "volume"
      ? parsed.hammerMassInputMode
      : legacyHammerMode;
    merged.latchMassInputMode = parsed.latchMassInputMode === "direct" || parsed.latchMassInputMode === "volume"
      ? parsed.latchMassInputMode
      : legacyLatchMode;
    if (parsed.hammerMassInputMode === undefined && parsed.hammerMassLbm == null && parsed.hammerVolumeIn3 == null) {
      merged.hammerBodyMaterialId = DEFAULT_V2_SCENARIO.hammerBodyMaterialId;
      merged.hammerVolumeIn3 = DEFAULT_V2_SCENARIO.hammerVolumeIn3;
    }
    if (parsed.latchMassInputMode === undefined && parsed.latchMassLbm == null && parsed.latchVolumeIn3 == null) {
      merged.latchBodyMaterialId = DEFAULT_V2_SCENARIO.latchBodyMaterialId;
      merged.latchVolumeIn3 = DEFAULT_V2_SCENARIO.latchVolumeIn3;
    }
    // Legacy scenarios used forceCap as both the nominal evaluation point and
    // the hard mechanism ceiling. Preserve the user's nominal value while
    // restoring independent headroom for the new absolute-cap field.
    if (!Number.isFinite(parsed.forceTarget) && Number.isFinite(parsed.forceCap)) {
      merged.forceTarget = parsed.forceCap as number;
      merged.forceCap = Math.max(DEFAULT_V2_SCENARIO.forceCap, parsed.forceCap as number);
    }
    const material = getV2Material(merged.materialId);
    merged.materialId = material.id;
    const numeric: Array<keyof V2Scenario> = [
      "forceTarget", "forceCap", "axialBudget", "latchTravel", "totalLatchTravel",
      "minimumEndForce", "opposingPreload", "armedHeightMin", "armedHeightMax",
      "housingInnerDiameter", "minimumSpringInnerDiameter",
      "outerDiameterTolerance", "shearModulusPsi", "solidHeightTolerance",
      "springRateTolerance", "freeLengthTolerance",
      "maxDeflectionUtilization", "wireMin", "wireMax", "wireStep",
      "activeCoilsMin", "activeCoilsMax", "activeCoilsStep", "stressBasisPsi",
      "impactEfficiency", "impactRestitution",
    ];
    if (numeric.some((key) => !Number.isFinite(merged[key] as number))) return null;
    merged.forceCap = Math.max(0, merged.forceCap);
    merged.forceTarget = Math.max(0, Math.min(merged.forceTarget, merged.forceCap));
    merged.impactEfficiency = Math.max(0, Math.min(1, merged.impactEfficiency));
    merged.impactRestitution = Math.max(0, Math.min(1, merged.impactRestitution));
    merged.latchTravel = Math.max(0.001, merged.latchTravel);
    merged.totalLatchTravel = Math.max(merged.latchTravel, merged.totalLatchTravel);
    merged.minimumEndForce = Math.max(0, merged.minimumEndForce);
    merged.opposingPreload = Math.max(0, merged.opposingPreload);
    merged.minimumSpringInnerDiameter = Math.max(0, merged.minimumSpringInnerDiameter);
    merged.armedHeightConstraintEnabled = merged.armedHeightConstraintEnabled === true;
    merged.armedHeightMin = Math.max(0, merged.armedHeightMin);
    merged.armedHeightMax = Math.max(merged.armedHeightMin, merged.armedHeightMax);
    merged.manufacturingToleranceEnabled = merged.manufacturingToleranceEnabled === true;
    merged.springRateTolerance = Math.max(0, Math.min(0.99, merged.springRateTolerance));
    merged.freeLengthTolerance = Math.max(0, merged.freeLengthTolerance);
    merged.hammerMassLbm = merged.hammerMassLbm !== null && Number.isFinite(merged.hammerMassLbm)
      ? Math.max(0, merged.hammerMassLbm)
      : null;
    merged.latchMassLbm = merged.latchMassLbm !== null && Number.isFinite(merged.latchMassLbm)
      ? Math.max(0, merged.latchMassLbm)
      : null;
    merged.hammerVolumeIn3 = merged.hammerVolumeIn3 !== null && Number.isFinite(merged.hammerVolumeIn3)
      ? Math.max(0, merged.hammerVolumeIn3)
      : null;
    merged.latchVolumeIn3 = merged.latchVolumeIn3 !== null && Number.isFinite(merged.latchVolumeIn3)
      ? Math.max(0, merged.latchVolumeIn3)
      : null;
    return merged;
  } catch {
    return null;
  }
}
