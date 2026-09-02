import type { V2Candidate, V2Scenario } from "./types";

export interface MinNominalMax {
  min: number;
  nominal: number;
  max: number;
}

export interface ManufacturingToleranceCorner {
  springRate: number;
  freeLength: number;
  armedForce: number;
  contactForce: number;
  criticalForce: number;
  endForce: number;
  /** @deprecated Alias for criticalForce retained for export compatibility. */
  releasedForce: number;
  hammerWork: number;
  criticalWork: number;
  postCriticalWork: number;
  coupledWork: number;
  throughEndWork: number;
  /** @deprecated Alias for criticalWork. */
  latchWork: number;
  /** @deprecated Armed-through-critical work. */
  totalWork: number;
}

export interface ManufacturingToleranceEnvelope {
  springRate: MinNominalMax;
  freeLength: MinNominalMax;
  forces: {
    armed: MinNominalMax;
    contact: MinNominalMax;
    critical: MinNominalMax;
    end: MinNominalMax;
    /** @deprecated Alias for critical. */
    released: MinNominalMax;
  };
  work: {
    hammer: MinNominalMax;
    critical: MinNominalMax;
    postCritical: MinNominalMax;
    coupled: MinNominalMax;
    throughEnd: MinNominalMax;
    /** @deprecated Alias for critical. */
    latch: MinNominalMax;
    /** @deprecated Armed-through-critical work. */
    total: MinNominalMax;
  };
  corners: ManufacturingToleranceCorner[];
  nominalForceCapPass: boolean;
  worstCaseForceCapPass: boolean;
  worstCaseForceCapExcess: number;
  nominalEndForcePass: boolean;
  worstCaseEndForcePass: boolean;
  worstCaseEndForceShortfall: number;
}

const EPSILON = 1e-9;

/** Compression-spring force at a fixed installed height. A spring cannot pull. */
export function forceAtHeight(springRate: number, freeLength: number, height: number): number {
  return Math.max(0, springRate) * Math.max(0, freeLength - height);
}

/**
 * Positive spring work released while installed height increases from start to end.
 * The integral is clipped at free length so a tolerance corner that goes slack
 * never produces negative force or work.
 */
export function workBetweenHeights(
  springRate: number,
  freeLength: number,
  startHeight: number,
  endHeight: number,
): number {
  const k = Math.max(0, springRate);
  const start = Math.min(startHeight, endHeight);
  const end = Math.max(startHeight, endHeight);
  const loadedEnd = Math.min(end, freeLength);
  if (k === 0 || freeLength <= start || loadedEnd <= start) return 0;
  const startDeflection = freeLength - start;
  const endDeflection = Math.max(0, freeLength - loadedEnd);
  return 0.5 * k * (startDeflection ** 2 - endDeflection ** 2);
}

function range(nominal: number, values: number[]): MinNominalMax {
  return {
    min: Math.min(...values),
    nominal,
    max: Math.max(...values),
  };
}

/**
 * Advisory independent worst-case envelope for the two enabled manufacturing
 * assumptions: spring rate and free length. It deliberately does not alter the
 * nominal candidate, Pareto ranking, feasibility, stress, or CAD geometry.
 */
export function calculateManufacturingToleranceEnvelope(
  candidate: V2Candidate,
  scenario: V2Scenario,
): ManufacturingToleranceEnvelope | null {
  if (!scenario.manufacturingToleranceEnabled) return null;

  const rateTolerance = Math.max(0, Math.min(0.99, scenario.springRateTolerance));
  const lengthTolerance = Math.max(0, scenario.freeLengthTolerance);
  const rateValues = [
    Math.max(0, candidate.k * (1 - rateTolerance)),
    candidate.k * (1 + rateTolerance),
  ];
  const lengthValues = [
    Math.max(0, candidate.Lf - lengthTolerance),
    candidate.Lf + lengthTolerance,
  ];

  const corners: ManufacturingToleranceCorner[] = [];
  for (const springRate of rateValues) {
    for (const freeLength of lengthValues) {
      const armedForce = forceAtHeight(springRate, freeLength, candidate.Lc);
      const contactForce = forceAtHeight(springRate, freeLength, candidate.L2);
      const criticalForce = forceAtHeight(springRate, freeLength, candidate.L3);
      const endForce = forceAtHeight(springRate, freeLength, candidate.L4);
      const hammerWork = workBetweenHeights(
        springRate,
        freeLength,
        candidate.Lc,
        candidate.L2,
      );
      const criticalWork = workBetweenHeights(
        springRate,
        freeLength,
        candidate.L2,
        candidate.L3,
      );
      const postCriticalWork = workBetweenHeights(
        springRate,
        freeLength,
        candidate.L3,
        candidate.L4,
      );
      const coupledWork = criticalWork + postCriticalWork;
      corners.push({
        springRate,
        freeLength,
        armedForce,
        contactForce,
        criticalForce,
        endForce,
        releasedForce: criticalForce,
        hammerWork,
        criticalWork,
        postCriticalWork,
        coupledWork,
        throughEndWork: hammerWork + coupledWork,
        latchWork: criticalWork,
        totalWork: hammerWork + criticalWork,
      });
    }
  }

  const armed = range(candidate.F0, corners.map((corner) => corner.armedForce));
  const contact = range(candidate.F2, corners.map((corner) => corner.contactForce));
  const critical = range(candidate.F3, corners.map((corner) => corner.criticalForce));
  const end = range(candidate.F4, corners.map((corner) => corner.endForce));
  const hammer = range(candidate.Whammer, corners.map((corner) => corner.hammerWork));
  const criticalWork = range(candidate.Wlatch, corners.map((corner) => corner.criticalWork));
  const postCritical = range(candidate.WpostCritical, corners.map((corner) => corner.postCriticalWork));
  const coupled = range(candidate.Wcoupled, corners.map((corner) => corner.coupledWork));
  const throughEnd = range(candidate.WthroughEnd, corners.map((corner) => corner.throughEndWork));
  const total = range(candidate.WreleaseIdeal, corners.map((corner) => corner.totalWork));

  return {
    springRate: range(candidate.k, rateValues),
    freeLength: range(candidate.Lf, lengthValues),
    forces: { armed, contact, critical, end, released: critical },
    work: {
      hammer,
      critical: criticalWork,
      postCritical,
      coupled,
      throughEnd,
      latch: criticalWork,
      total,
    },
    corners,
    nominalForceCapPass: armed.nominal <= scenario.forceCap + EPSILON,
    worstCaseForceCapPass: armed.max <= scenario.forceCap + EPSILON,
    worstCaseForceCapExcess: Math.max(0, armed.max - scenario.forceCap),
    nominalEndForcePass: end.nominal + EPSILON >= scenario.minimumEndForce,
    worstCaseEndForcePass: end.min + EPSILON >= scenario.minimumEndForce,
    worstCaseEndForceShortfall: Math.max(0, scenario.minimumEndForce - end.min),
  };
}
