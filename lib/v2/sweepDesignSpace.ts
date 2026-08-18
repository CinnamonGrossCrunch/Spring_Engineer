import { evaluateV2Candidate } from "./evaluateCandidate";
import { computePareto } from "./pareto";
import type {
  V2Candidate,
  V2ExclusionReason,
  V2ExclusionStats,
  V2Scenario,
  V2SweepResult,
} from "./types";

/**
 * Build an inclusive numeric range [min, max] stepped by `step`, robust to
 * floating-point drift (values are rounded to the step's decimal precision).
 * Returns ascending values. Guards against non-positive / non-finite steps.
 */
export function buildRange(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) return [];
  if (step <= 0 || max < min) return [];
  const decimals = decimalPlaces(step);
  const count = Math.floor((max - min) / step + 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(round(min + i * step, decimals));
  }
  // Ensure the max endpoint is represented when it lands just past the last step.
  const last = out[out.length - 1];
  if (last !== undefined && round(max, decimals) - last > step * 0.5) {
    out.push(round(max, decimals));
  }
  return out;
}

function decimalPlaces(step: number): number {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function round(x: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

function emptyStats(): V2ExclusionStats {
  return {
    "invalid-geometry": 0,
    "no-run-up": 0,
    "slack-at-contact": 0,
    "stops-driving": 0,
    "stress-redesign": 0,
  };
}

/**
 * Sweep the wire-diameter × active-coil design space for a scenario.
 *
 * Pure and DETERMINISTIC: candidates are emitted in a fixed order (outer loop
 * active coils ascending, inner loop wire diameter ascending), so the same
 * scenario always produces identical results and ordering. The default grid is
 * only a few thousand points and runs comfortably client-side.
 */
export function sweepV2DesignSpace(scenario: V2Scenario): V2SweepResult {
  const wireValues = buildRange(scenario.wireMin, scenario.wireMax, scenario.wireStep);
  const coilValues = buildRange(
    scenario.activeCoilsMin,
    scenario.activeCoilsMax,
    scenario.activeCoilsStep,
  );

  const candidates: V2Candidate[] = [];
  for (const Na of coilValues) {
    for (const d of wireValues) {
      candidates.push(evaluateV2Candidate(scenario, d, Na));
    }
  }

  // Pareto frontier is computed over the recommended feasible set only.
  const feasible = candidates.filter((c) => c.feasibility.feasible);
  const paretoSet = computePareto(feasible);
  for (const c of candidates) c.pareto = paretoSet.has(c.key);

  // Exclusion accounting: attribute each excluded candidate to its primary
  // reason (priority order matches the design narrative).
  const exclusionStats = emptyStats();
  const REASON_PRIORITY: V2ExclusionReason[] = [
    "invalid-geometry",
    "no-run-up",
    "slack-at-contact",
    "stops-driving",
    "stress-redesign",
  ];
  for (const c of candidates) {
    if (c.feasibility.feasible) continue;
    const primary = REASON_PRIORITY.find((r) => c.feasibility.reasons.includes(r));
    if (primary) exclusionStats[primary] += 1;
  }

  const defaultKey = pickDefaultCandidate(feasible);

  return {
    candidates,
    wireValues,
    coilValues,
    feasible,
    paretoKeys: [...paretoSet],
    exclusionStats,
    totalCount: candidates.length,
    feasibleCount: feasible.length,
    defaultKey,
  };
}

/**
 * Choose a sensible default selection: among the feasible set (already excludes
 * invalid geometry, non-continuous drive, and the Lee >60% redesign region),
 * pick the highest ideal equivalent average release force.
 *
 * This is "Best by Ideal Release Equivalent" — NOT "the optimal spring".
 */
export function pickDefaultCandidate(feasible: V2Candidate[]): string | null {
  let best: V2Candidate | null = null;
  for (const c of feasible) {
    if (!Number.isFinite(c.FeqAvgIdeal)) continue;
    if (!best || c.FeqAvgIdeal > best.FeqAvgIdeal) best = c;
  }
  return best?.key ?? null;
}
