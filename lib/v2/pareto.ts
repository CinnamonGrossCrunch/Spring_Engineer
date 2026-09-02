import type { V2Candidate } from "./types";

/**
 * Compute the Pareto frontier over a set of candidates using the two V2
 * performance dimensions:
 *
 *   W_hammer  — energy released before hammer contact
 *   W_latch   — energy delivered through the critical release window
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

export interface V2Recommendations {
  keys: string[];
  roles: Record<string, "hammer" | "total" | "end-force">;
}

/**
 * Explainable three-candidate shortlist. First retain candidates within 1% of
 * the maximum total ideal work, then identify the hammer-work, total-work and
 * end-force-reserve leaders. This deliberately avoids a fabricated weighted
 * score and reproduces the earlier adjacent-knee comparison logic.
 */
export function recommendTopCandidates(feasible: V2Candidate[]): V2Recommendations {
  const finite = feasible.filter((c) => Number.isFinite(c.WreleaseIdeal));
  if (finite.length === 0) return { keys: [], roles: {} };
  const maxTotal = Math.max(...finite.map((c) => c.WreleaseIdeal));
  const nearMax = finite.filter((c) => c.WreleaseIdeal >= maxTotal * 0.99);
  const picks: Array<["hammer" | "total" | "end-force", V2Candidate | undefined]> = [
    ["hammer", [...nearMax].sort((a, b) => b.Whammer - a.Whammer || b.WreleaseIdeal - a.WreleaseIdeal)[0]],
    ["total", [...nearMax].sort((a, b) => b.WreleaseIdeal - a.WreleaseIdeal || b.Whammer - a.Whammer)[0]],
    ["end-force", [...nearMax].sort((a, b) => b.F4 - a.F4 || b.Wcoupled - a.Wcoupled)[0]],
  ];
  const keys: string[] = [];
  const roles: V2Recommendations["roles"] = {};
  for (const [role, candidate] of picks) {
    if (!candidate || keys.includes(candidate.key)) continue;
    keys.push(candidate.key);
    roles[candidate.key] = role;
  }
  for (const candidate of [...finite].sort((a, b) => b.WreleaseIdeal - a.WreleaseIdeal)) {
    if (keys.length >= 3) break;
    if (keys.includes(candidate.key)) continue;
    keys.push(candidate.key);
    roles[candidate.key] = "total";
  }
  return { keys, roles };
}
