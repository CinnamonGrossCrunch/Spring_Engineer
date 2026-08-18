import type { V2Candidate } from "./types";

/**
 * Compute the Pareto frontier over a set of candidates using the two V2
 * performance dimensions:
 *
 *   W_hammer  — energy released before hammer contact
 *   W_latch   — energy / force retained through latch follow-through
 *
 * Candidate A DOMINATES B when A is at least as good in both dimensions and
 * strictly better in at least one. A candidate is on the frontier when no other
 * candidate dominates it. This deliberately avoids collapsing the trade into a
 * single fabricated "performance score".
 *
 * Pure and deterministic: the input order is preserved and never mutated.
 * Returns the set of frontier keys.
 */
export function computePareto(candidates: V2Candidate[]): Set<string> {
  const frontier = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (!Number.isFinite(a.Whammer) || !Number.isFinite(a.Wlatch)) continue;

    let dominated = false;
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const b = candidates[j];
      if (!Number.isFinite(b.Whammer) || !Number.isFinite(b.Wlatch)) continue;
      if (dominates(b, a)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) frontier.add(a.key);
  }

  return frontier;
}

/** True when `a` dominates `b` (≥ in both dimensions, strictly > in at least one). */
export function dominates(a: V2Candidate, b: V2Candidate): boolean {
  const geBoth = a.Whammer >= b.Whammer && a.Wlatch >= b.Wlatch;
  const strictOne = a.Whammer > b.Whammer || a.Wlatch > b.Wlatch;
  return geBoth && strictOne;
}
