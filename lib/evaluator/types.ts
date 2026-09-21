import type { V2Candidate } from "@/lib/v2/types";

export interface SpringEvaluatorInputs {
  nominalArmedForce: number;
  armedLength: number;
  axialBudget: number;
  criticalTravel: number;
  totalCoupledTravel: number;
  targetEndForce: number;
  minimumEndForce: number;
  opposingPreload: number;

  wireDiameter: number;
  minimumSpringId: number;
  maximumSpringOd: number;
  centerSpringInEnvelope: boolean;
  nominalSpringOd: number;

  materialId: string;
  shearModulusPsi: number;
  stressBasisPsi: number;
  inactiveEndCoils: number;
  solidHeightTolerance: number;
  presetHeight: number;

  springRateTolerance: number;
  freeLengthTolerance: number;
}

export interface EvaluatorForceRange {
  min: number;
  nominal: number;
  max: number;
}

export interface SpringEvaluatorResult {
  candidate: V2Candidate | null;
  errors: string[];
  warnings: string[];
  nominalSpringOd: number;
  calculatedSpringId: number;
  innerRadialClearance: number;
  outerRadialClearance: number;
  forceRanges: {
    armed: EvaluatorForceRange;
    contact: EvaluatorForceRange;
    critical: EvaluatorForceRange;
    end: EvaluatorForceRange;
  } | null;
}
