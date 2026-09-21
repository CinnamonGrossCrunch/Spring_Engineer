import type { V2Candidate, V2Scenario, V2ShortlistEntry } from "./types";

/** Stable, explicit identity for every input that can change a V2 result. */
export function v2ScenarioSignature(scenario: V2Scenario): string {
  return JSON.stringify([
    scenario.forceTarget,
    scenario.forceCap,
    scenario.axialBudget,
    scenario.latchTravel,
    scenario.totalLatchTravel,
    scenario.minimumEndForce,
    scenario.opposingPreload,
    scenario.armedHeightConstraintEnabled,
    scenario.armedHeightMin,
    scenario.armedHeightMax,
    scenario.housingInnerDiameter,
    scenario.outerDiameterTolerance,
    scenario.lockOuterDiameter,
    scenario.materialId,
    scenario.shearModulusPsi,
    scenario.hammerMassLbm,
    scenario.latchMassLbm,
    scenario.impactEfficiency,
    scenario.hammerBodyMaterialId,
    scenario.latchBodyMaterialId,
    scenario.hammerVolumeIn3,
    scenario.latchVolumeIn3,
    scenario.impactRestitution,
    scenario.solidHeightTolerance,
    scenario.manufacturingToleranceEnabled,
    scenario.springRateTolerance,
    scenario.freeLengthTolerance,
    scenario.maxDeflectionUtilization,
    scenario.wireMin,
    scenario.wireMax,
    scenario.wireStep,
    scenario.activeCoilsMin,
    scenario.activeCoilsMax,
    scenario.activeCoilsStep,
    scenario.stressBasisPsi,
  ]);
}

export function v2ShortlistEntryId(candidateKey: string, scenario: V2Scenario): string {
  return `${candidateKey}::${v2ScenarioSignature(scenario)}`;
}

/** Capture immutable copies so later scenario sweeps cannot rewrite history. */
export function createV2ShortlistEntry(
  candidate: V2Candidate,
  scenario: V2Scenario,
): V2ShortlistEntry {
  const scenarioSnapshot = { ...scenario };
  const candidateSnapshot = {
    ...candidate,
    feasibility: { ...candidate.feasibility, reasons: [...candidate.feasibility.reasons] },
  };

  return {
    id: v2ShortlistEntryId(candidate.key, scenarioSnapshot),
    candidateKey: candidate.key,
    scenario: scenarioSnapshot,
    candidate: candidateSnapshot,
  };
}

export function isV2ShortlistEntryActive(
  entry: V2ShortlistEntry,
  candidateKey: string,
  scenario: V2Scenario,
): boolean {
  return entry.id === v2ShortlistEntryId(candidateKey, scenario);
}
