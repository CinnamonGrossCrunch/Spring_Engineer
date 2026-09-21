import type { SpringEvaluatorInputs } from "./types";

export const EVALUATOR_STORAGE_KEY = "sigma-spring-engine:evaluator:v1";

export const DEFAULT_EVALUATOR_INPUTS: SpringEvaluatorInputs = {
  nominalArmedForce: 140,
  armedLength: 0.9,
  axialBudget: 1.3,
  criticalTravel: 0.07,
  totalCoupledTravel: 0.2,
  targetEndForce: 20,
  minimumEndForce: 10,
  opposingPreload: 0.6,

  wireDiameter: 0.138,
  minimumSpringId: 0.82,
  maximumSpringOd: 1.1024,
  centerSpringInEnvelope: true,
  radialOdBias: 0.5,
  nominalSpringOd: 1.0992,

  materialId: "stainless177Ph",
  shearModulusPsi: 11_000_000,
  stressBasisPsi: 230_000,
  inactiveEndCoils: 2,
  solidHeightTolerance: 0.05,
  presetHeight: 0.8,

  springRateTolerance: 0.1,
  freeLengthTolerance: 0.03,
};

const NUMERIC_KEYS: ReadonlyArray<keyof SpringEvaluatorInputs> = [
  "nominalArmedForce",
  "armedLength",
  "axialBudget",
  "criticalTravel",
  "totalCoupledTravel",
  "targetEndForce",
  "minimumEndForce",
  "opposingPreload",
  "wireDiameter",
  "minimumSpringId",
  "maximumSpringOd",
  "radialOdBias",
  "nominalSpringOd",
  "shearModulusPsi",
  "stressBasisPsi",
  "inactiveEndCoils",
  "solidHeightTolerance",
  "presetHeight",
  "springRateTolerance",
  "freeLengthTolerance",
];

export function parseStoredEvaluatorInputs(raw: string | null): SpringEvaluatorInputs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SpringEvaluatorInputs>;
    if (!parsed || typeof parsed !== "object") return null;
    const merged = { ...DEFAULT_EVALUATOR_INPUTS, ...parsed };
    if (NUMERIC_KEYS.some((key) => !Number.isFinite(merged[key] as number))) return null;
    if (typeof merged.materialId !== "string") return null;

    return {
      ...merged,
      nominalArmedForce: Math.max(0, merged.nominalArmedForce),
      armedLength: Math.max(0, merged.armedLength),
      axialBudget: Math.max(0, merged.axialBudget),
      criticalTravel: Math.max(0, merged.criticalTravel),
      totalCoupledTravel: Math.max(merged.criticalTravel, merged.totalCoupledTravel),
      targetEndForce: Math.max(0, merged.targetEndForce),
      minimumEndForce: Math.max(0, merged.minimumEndForce),
      opposingPreload: Math.max(0, merged.opposingPreload),
      wireDiameter: Math.max(0, merged.wireDiameter),
      minimumSpringId: Math.max(0, merged.minimumSpringId),
      maximumSpringOd: Math.max(0, merged.maximumSpringOd),
      centerSpringInEnvelope: merged.centerSpringInEnvelope !== false,
      radialOdBias: Math.max(0, Math.min(1, merged.radialOdBias)),
      nominalSpringOd: Math.max(0, merged.nominalSpringOd),
      shearModulusPsi: Math.max(0, merged.shearModulusPsi),
      stressBasisPsi: Math.max(0, merged.stressBasisPsi),
      inactiveEndCoils: Math.max(0, merged.inactiveEndCoils),
      solidHeightTolerance: Math.max(0, merged.solidHeightTolerance),
      presetHeight: Math.max(0, merged.presetHeight),
      springRateTolerance: Math.max(0, Math.min(0.99, merged.springRateTolerance)),
      freeLengthTolerance: Math.max(0, merged.freeLengthTolerance),
    };
  } catch {
    return null;
  }
}
