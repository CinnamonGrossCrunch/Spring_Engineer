import type { Conflict, Equation, ModelState, SolveResult } from "./types";
import { EQUATIONS } from "./equations";
import { PARAMETER_MAP } from "./parameters";

const MAX_ITERATIONS = 25;
const RELATIVE_TOLERANCE = 1e-3;

/**
 * Deterministic single-unknown propagation solver.
 *
 * Rules:
 *  1. Parameters whose status is NOT "derived" are treated as knowns
 *     (their values are never modified — fixed values are never overwritten).
 *  2. An equation fires when exactly one of its variables is unknown, that
 *     variable has status "derived", and a solver exists for it.
 *  3. After propagation converges, every fully-known equation is checked for
 *     consistency. A residual above tolerance produces an overconstraint
 *     Conflict naming the pinned parameters, instead of silently correcting.
 *  4. Iteration is capped, so no infinite update loops are possible.
 */
export function solveModel(state: ModelState, equations: Equation[] = EQUATIONS): SolveResult {
  const values: Record<string, number | undefined> = {};
  const derivedIds = new Set<string>();
  /** For each solved derived parameter, the input parameters it was computed from. */
  const provenance: Record<string, string[]> = {};

  for (const [id, ps] of Object.entries(state)) {
    if (ps.status === "derived") {
      derivedIds.add(id);
      values[id] = undefined;
    } else {
      values[id] = ps.value;
    }
  }

  // Phase 1 — propagation (only ever writes derived parameters).
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    for (const eq of equations) {
      const unknowns = eq.variables.filter((v) => values[v] === undefined);
      if (unknowns.length !== 1) continue;
      const target = unknowns[0];
      if (!derivedIds.has(target)) continue; // never write non-derived params
      const solver = eq.solvers[target];
      if (!solver) continue;
      const inputs: Record<string, number> = {};
      for (const v of eq.variables) {
        if (v !== target) inputs[v] = values[v] as number;
      }
      let result: number;
      try {
        result = solver(inputs);
      } catch {
        continue;
      }
      if (!Number.isFinite(result)) continue;
      values[target] = result;
      provenance[target] = eq.variables.filter((v) => v !== target);
      changed = true;
    }
    if (!changed) break;
  }

  /**
   * Trace a parameter back to the pinned (fixed) inputs that fed it, so a
   * conflict names the actual user pins causing the inconsistency — even
   * when they entered through a chain of derived values.
   */
  const fixedAncestors = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    if (state[id]?.status === "fixed") return [id];
    const inputs = provenance[id];
    if (!inputs) return [];
    return inputs.flatMap((input) => fixedAncestors(input, visited));
  };

  // Phase 2 — consistency check on fully-known equations.
  const conflicts: Conflict[] = [];
  const seenVariableSets = new Set<string>();
  for (const eq of equations) {
    if (eq.variables.some((v) => values[v] === undefined)) continue;
    const residual = equationResidual(eq, values as Record<string, number>);
    if (residual === undefined || residual <= RELATIVE_TOLERANCE) continue;

    const key = [...eq.variables].sort().join("|");
    if (seenVariableSets.has(key)) continue;
    seenVariableSets.add(key);

    const fixedIds = [...new Set(eq.variables.flatMap((v) => fixedAncestors(v)))];
    const symbols = eq.variables.map((v) => PARAMETER_MAP[v]?.symbol ?? v).join(", ");
    const fixedSymbols = fixedIds.map((v) => PARAMETER_MAP[v]?.symbol ?? v).join(", ");
    const message =
      fixedIds.length > 0
        ? `Conflict: ${symbols} do not satisfy ${eq.expression}. Pinned values (${fixedSymbols}) are mutually inconsistent — unpin one value.`
        : `Inconsistency: ${symbols} do not satisfy ${eq.expression}. Check the input values.`;

    conflicts.push({
      equationId: eq.id,
      expression: eq.expression,
      parameterIds: [...eq.variables],
      fixedParameterIds: fixedIds,
      message,
      residual,
    });
  }

  const unresolved = [...derivedIds].filter((id) => values[id] === undefined);
  return { values, conflicts, unresolved };
}

/**
 * Relative residual of a fully-known equation: recompute one variable from
 * the others and compare with its stored value.
 */
function equationResidual(eq: Equation, values: Record<string, number>): number | undefined {
  for (const [target, solver] of Object.entries(eq.solvers)) {
    if (!solver) continue;
    const inputs: Record<string, number> = {};
    for (const v of eq.variables) {
      if (v !== target) inputs[v] = values[v];
    }
    let expected: number;
    try {
      expected = solver(inputs);
    } catch {
      continue;
    }
    if (!Number.isFinite(expected)) continue;
    const actual = values[target];
    const scale = Math.max(Math.abs(actual), Math.abs(expected), 1e-9);
    return Math.abs(actual - expected) / scale;
  }
  return undefined;
}
