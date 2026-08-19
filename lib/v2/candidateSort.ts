import type { V2Candidate } from "./types";

export type V2CandidateSortKey =
  | "d"
  | "Na"
  | "Nt"
  | "k"
  | "Lc"
  | "solidClearance"
  | "deflectionUtilization"
  | "s"
  | "Lf"
  | "F2"
  | "F3"
  | "Whammer"
  | "Wlatch"
  | "FeqAvgIdeal"
  | "stressPctConservative";

export interface V2CandidateSortPriority {
  key: V2CandidateSortKey;
  direction: "asc" | "desc";
}

const DISPLAY_RESOLUTION: Record<V2CandidateSortKey, number> = {
  d: 0.001,
  Na: 0.01,
  Nt: 0.01,
  k: 0.01,
  Lc: 0.001,
  solidClearance: 0.001,
  deflectionUtilization: 0.001,
  s: 0.001,
  Lf: 0.001,
  F2: 0.01,
  F3: 0.01,
  Whammer: 0.01,
  Wlatch: 0.01,
  FeqAvgIdeal: 0.01,
  stressPctConservative: 0.001,
};

interface PreparedPriority extends V2CandidateSortPriority {
  best: number;
  bandWidth: number;
}

/**
 * Lexicographic multi-sort with stable, tolerance-aware priority bands.
 * Candidates within 1% of the best-scale value for one priority advance to
 * the next priority instead of being separated by insignificant decimals.
 */
export function sortV2CandidatesByPriorities(
  candidates: V2Candidate[],
  priorities: V2CandidateSortPriority[],
  nearEqualFraction = 0.01,
): V2Candidate[] {
  if (priorities.length === 0 || candidates.length === 0) return [...candidates];

  const prepared: PreparedPriority[] = priorities.slice(0, 3).map((priority) => {
    const finite = candidates
      .map((candidate) => candidate[priority.key])
      .filter(Number.isFinite);
    const best = priority.direction === "desc" ? Math.max(...finite) : Math.min(...finite);
    const bandWidth = Math.max(
      DISPLAY_RESOLUTION[priority.key],
      Math.abs(best) * nearEqualFraction,
    );
    return { ...priority, best, bandWidth };
  });

  const bandRank = (candidate: V2Candidate, priority: PreparedPriority) => {
    const value = candidate[priority.key];
    if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
    const distance = priority.direction === "desc" ? priority.best - value : value - priority.best;
    return Math.floor(Math.max(0, distance) / priority.bandWidth + 1e-9);
  };

  return [...candidates].sort((a, b) => {
    for (const priority of prepared) {
      const rankDifference = bandRank(a, priority) - bandRank(b, priority);
      if (rankDifference !== 0) return rankDifference;
    }

    // Preserve the requested directions inside a fully tied set of bands.
    for (const priority of prepared) {
      const difference = a[priority.key] - b[priority.key];
      if (difference !== 0) return priority.direction === "asc" ? difference : -difference;
    }

    return a.key.localeCompare(b.key);
  });
}
