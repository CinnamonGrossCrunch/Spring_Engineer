import { calculateManufacturingToleranceEnvelope } from "./toleranceEnvelope";
import { evaluateV2Candidate } from "./evaluateCandidate";
import { getV2Material } from "./materials";
import { buildRange } from "./sweepDesignSpace";
import type { V2Candidate, V2Scenario } from "./types";

export type PackageRecommendationRole = "density" | "knee" | "punch";

export interface PackageDiscoverySettings {
  forceTarget: number;
  forceCap: number;
  minimumEndForce: number;
  criticalTravel: number;
  totalCoupledTravel: number;
  housingInnerDiameter: number;
  outerDiameterTolerance: number;
  springRateTolerance: number;
  freeLengthTolerance: number;
  packageMin: number;
  packageMax: number;
  packageStep: number;
  preferredWireDiameter: number;
  minimumInnerDiameter: number;
  includeSolidHeightAllowance: boolean;
  maxDeflectionUtilization: number;
  maximumStressRatio: number;
  enforceManufacturingTolerance: boolean;
  includePresetReviewStress: boolean;
}

export interface PackageDiscoveryPoint {
  key: string;
  axialBudget: number;
  workDensity: number;
  candidate: V2Candidate;
  scenario: V2Scenario;
}

export interface PackageDiscoveryExclusions {
  hardConstraint: number;
  stressReview: number;
  armedForceTolerance: number;
  endForceTolerance: number;
}

export interface PackageDiscoveryResult {
  frontier: PackageDiscoveryPoint[];
  bestByBudget: PackageDiscoveryPoint[];
  recommendations: Partial<Record<PackageRecommendationRole, PackageDiscoveryPoint>>;
  recommendationRoles: Record<string, PackageRecommendationRole>;
  searchedCount: number;
  acceptedCount: number;
  exclusions: PackageDiscoveryExclusions;
}

export const DEFAULT_PACKAGE_DISCOVERY_SETTINGS: PackageDiscoverySettings = {
  forceTarget: 140,
  forceCap: 160,
  minimumEndForce: 10,
  criticalTravel: 0.07,
  totalCoupledTravel: 0.2,
  housingInnerDiameter: 28 / 25.4,
  outerDiameterTolerance: 0.02,
  springRateTolerance: 0.1,
  freeLengthTolerance: 0.03,
  packageMin: 0.8,
  packageMax: 1.4,
  packageStep: 0.01,
  preferredWireDiameter: 0.138,
  // The prior 0.820 in feature is a CAD preference, not an immutable spring
  // boundary in spring-first mode. Keep the smaller assumption visible and editable.
  minimumInnerDiameter: 0.8,
  // Historical Lee stock guidance used for the package screen. Custom vendor
  // approval may allow the nominal solid-height reference to be used instead.
  includeSolidHeightAllowance: true,
  // Mirrors the quoted 17-7 geometry as a screening assumption. It is not a
  // universal presetting limit and remains user-editable in the UI.
  maxDeflectionUtilization: 0.84,
  maximumStressRatio: 0.8,
  enforceManufacturingTolerance: true,
  includePresetReviewStress: true,
};

const EPSILON = 1e-9;

/**
 * Search spring geometry and axial package together.
 *
 * For each package length B, retain the geometry with the greatest hammer
 * run-up work. Then remove package points dominated by a shorter package with
 * equal or greater work. The result is the actual package-vs-punch frontier.
 */
export function discoverPackageFrontier(
  baseScenario: V2Scenario,
  settings: PackageDiscoverySettings,
): PackageDiscoveryResult {
  const material = getV2Material("stainless177Ph");
  const base: V2Scenario = {
    ...baseScenario,
    forceTarget: Math.max(0, settings.forceTarget),
    forceCap: Math.max(settings.forceTarget, settings.forceCap),
    minimumEndForce: Math.max(0, settings.minimumEndForce),
    latchTravel: Math.max(0.001, settings.criticalTravel),
    totalLatchTravel: Math.max(settings.criticalTravel, settings.totalCoupledTravel),
    housingInnerDiameter: Math.max(0, settings.housingInnerDiameter),
    outerDiameterTolerance: Math.max(0, settings.outerDiameterTolerance),
    springRateTolerance: clamp(settings.springRateTolerance, 0, 0.99),
    freeLengthTolerance: Math.max(0, settings.freeLengthTolerance),
    // Spring-first mode derives the armed height. A remembered CAD-height
    // constraint from Fixed Package must not silently constrain this search.
    armedHeightConstraintEnabled: false,
    materialId: material.id,
    shearModulusPsi: material.shearModulusPsi,
    stressBasisPsi: material.tensileMinPsi,
    minimumSpringInnerDiameter: Math.max(0, settings.minimumInnerDiameter),
    solidHeightTolerance: settings.includeSolidHeightAllowance ? 0.05 : 0,
    maxDeflectionUtilization: clamp(settings.maxDeflectionUtilization, 0.05, 0.99),
    manufacturingToleranceEnabled: settings.enforceManufacturingTolerance,
  };

  const budgets = buildRange(
    Math.max(0, settings.packageMin),
    Math.max(settings.packageMin, settings.packageMax),
    Math.max(0.001, settings.packageStep),
  );
  const wires = buildRange(base.wireMin, base.wireMax, base.wireStep);
  const coils = buildRange(base.activeCoilsMin, base.activeCoilsMax, base.activeCoilsStep);
  const bestByBudget: PackageDiscoveryPoint[] = [];
  const exclusions: PackageDiscoveryExclusions = {
    hardConstraint: 0,
    stressReview: 0,
    armedForceTolerance: 0,
    endForceTolerance: 0,
  };
  let searchedCount = 0;
  let acceptedCount = 0;

  for (const axialBudget of budgets) {
    const scenario = { ...base, axialBudget };
    let best: PackageDiscoveryPoint | null = null;

    for (const Na of coils) {
      for (const d of wires) {
        searchedCount += 1;
        const candidate = evaluateV2Candidate(scenario, d, Na);
        const nonStressReasons = candidate.feasibility.reasons.filter(
          (reason) => reason !== "stress-redesign",
        );
        if (nonStressReasons.length > 0) {
          exclusions.hardConstraint += 1;
          continue;
        }
        if (
          candidate.feasibility.stressBand === "redesign" &&
          !settings.includePresetReviewStress
        ) {
          exclusions.stressReview += 1;
          continue;
        }
        if (candidate.stressPctBasis > settings.maximumStressRatio + EPSILON) {
          exclusions.stressReview += 1;
          continue;
        }

        if (settings.enforceManufacturingTolerance) {
          const tolerance = calculateManufacturingToleranceEnvelope(candidate, scenario);
          if (!tolerance?.worstCaseForceCapPass) {
            exclusions.armedForceTolerance += 1;
            continue;
          }
          if (!tolerance.worstCaseEndForcePass) {
            exclusions.endForceTolerance += 1;
            continue;
          }
        } else if (candidate.F0 > scenario.forceCap + EPSILON) {
          exclusions.armedForceTolerance += 1;
          continue;
        }

        acceptedCount += 1;
        const point: PackageDiscoveryPoint = {
          key: `${axialBudget.toFixed(4)}|${candidate.key}`,
          axialBudget,
          workDensity: axialBudget > 0 ? candidate.Whammer / axialBudget : 0,
          candidate: { ...candidate, key: `${axialBudget.toFixed(4)}|${candidate.key}` },
          scenario,
        };
        if (!best || comparePackagePoints(point, best, settings.preferredWireDiameter) < 0) {
          best = point;
        }
      }
    }

    if (best) bestByBudget.push(best);
  }

  const frontier = buildPackageFrontier(bestByBudget);
  const recommendations = recommendPackagePoints(frontier);
  const recommendationRoles: Record<string, PackageRecommendationRole> = {};
  for (const [role, point] of Object.entries(recommendations) as Array<
    [PackageRecommendationRole, PackageDiscoveryPoint | undefined]
  >) {
    if (point) recommendationRoles[point.key] = role;
  }

  return {
    frontier,
    bestByBudget,
    recommendations,
    recommendationRoles,
    searchedCount,
    acceptedCount,
    exclusions,
  };
}

function comparePackagePoints(
  a: PackageDiscoveryPoint,
  b: PackageDiscoveryPoint,
  preferredWireDiameter: number,
): number {
  if (Math.abs(a.candidate.Whammer - b.candidate.Whammer) > 1e-7) {
    return b.candidate.Whammer - a.candidate.Whammer;
  }
  if (Math.abs(a.candidate.Wlatch - b.candidate.Wlatch) > 1e-7) {
    return b.candidate.Wlatch - a.candidate.Wlatch;
  }
  const aWireDistance = Math.abs(a.candidate.d - preferredWireDiameter);
  const bWireDistance = Math.abs(b.candidate.d - preferredWireDiameter);
  if (Math.abs(aWireDistance - bWireDistance) > 1e-9) return aWireDistance - bWireDistance;
  if (Math.abs(a.candidate.stressPctBasis - b.candidate.stressPctBasis) > 1e-9) {
    return a.candidate.stressPctBasis - b.candidate.stressPctBasis;
  }
  return a.candidate.key.localeCompare(b.candidate.key);
}

function buildPackageFrontier(points: PackageDiscoveryPoint[]): PackageDiscoveryPoint[] {
  const sorted = [...points].sort(
    (a, b) => a.axialBudget - b.axialBudget || b.candidate.Whammer - a.candidate.Whammer,
  );
  const frontier: PackageDiscoveryPoint[] = [];
  let bestWork = -Infinity;
  for (const point of sorted) {
    if (point.candidate.Whammer <= bestWork + 1e-7) continue;
    frontier.push(point);
    bestWork = point.candidate.Whammer;
  }
  return frontier;
}

function recommendPackagePoints(
  frontier: PackageDiscoveryPoint[],
): Partial<Record<PackageRecommendationRole, PackageDiscoveryPoint>> {
  if (frontier.length === 0) return {};
  const punch = maxBy(frontier, (point) => point.candidate.Whammer);
  const density = frontier.find(
    (point) => point.candidate.Whammer >= punch.candidate.Whammer * 0.9,
  ) ?? frontier[0];
  const knee = pickKnee(frontier);
  return {
    density,
    knee,
    punch,
  };
}

function pickKnee(frontier: PackageDiscoveryPoint[]): PackageDiscoveryPoint {
  if (frontier.length < 3) return frontier[Math.floor((frontier.length - 1) / 2)];
  const first = frontier[0];
  const last = frontier[frontier.length - 1];
  const dx = Math.max(EPSILON, last.axialBudget - first.axialBudget);
  const dy = Math.max(EPSILON, last.candidate.Whammer - first.candidate.Whammer);
  let best = frontier[0];
  let bestGain = -Infinity;
  for (const point of frontier) {
    const x = (point.axialBudget - first.axialBudget) / dx;
    const y = (point.candidate.Whammer - first.candidate.Whammer) / dy;
    const gain = y - x;
    if (gain > bestGain) {
      best = point;
      bestGain = gain;
    }
  }
  return best;
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  let best = items[0];
  let bestScore = score(best);
  for (let index = 1; index < items.length; index += 1) {
    const nextScore = score(items[index]);
    if (nextScore > bestScore) {
      best = items[index];
      bestScore = nextScore;
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
