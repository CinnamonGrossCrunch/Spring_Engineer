import { PARAMETER_MAP } from "@/lib/engineering/parameters";
import { canonicalName, canonicalSym } from "@/lib/engineering/nomenclature";

/**
 * Presentation-only labels for the Overview view.
 *
 * The Overview leads with plain-English parameter names and pretty
 * (subscripted) symbols. These are display strings ONLY — they never touch
 * the engineering model (`lib/engineering`), which keeps its own ASCII
 * symbols and names from the shared canonical nomenclature map. Nothing here
 * recomputes any value.
 */
export interface OverviewLabel {
  /** Human-readable primary label, e.g. "Wire Diameter". */
  name: string;
  /** Pretty symbol with unicode subscripts, e.g. "Nₐ" or "F₁". */
  sym: string;
}

export const OVERVIEW_LABELS: Record<string, OverviewLabel> = {
  // Geometry / construction
  d: { name: canonicalName("d"), sym: canonicalSym("d") },
  D: { name: canonicalName("D"), sym: canonicalSym("D") },
  OD: { name: canonicalName("OD"), sym: canonicalSym("OD") },
  ID: { name: canonicalName("ID"), sym: canonicalSym("ID") },
  Na: { name: canonicalName("Na"), sym: canonicalSym("Na") },
  Nt: { name: canonicalName("Nt"), sym: canonicalSym("Nt") },
  C: { name: canonicalName("C"), sym: canonicalSym("C") },
  Hs: { name: canonicalName("Hs"), sym: canonicalSym("Hs") },
  L_free: { name: canonicalName("L_free"), sym: canonicalSym("L_free") },

  // Behavior
  k: { name: canonicalName("k"), sym: canonicalSym("k") },
  x1: { name: canonicalName("x1"), sym: canonicalSym("x1") },

  // Spring-force states
  F1: { name: canonicalName("F1"), sym: canonicalSym("F1") },
  F2: { name: canonicalName("F2"), sym: canonicalSym("F2") },
  F3: { name: canonicalName("F3"), sym: canonicalSym("F3") },

  // Loaded lengths (per state)
  L_min: { name: canonicalName("L_min"), sym: canonicalSym("L_min") },
  L2: { name: canonicalName("L2"), sym: canonicalSym("L2") },
  L3: { name: canonicalName("L3"), sym: canonicalSym("L3") },

  // Travel between states
  s_h: { name: canonicalName("s_h"), sym: canonicalSym("s_h") },
  y_latch: { name: canonicalName("y_latch"), sym: canonicalSym("y_latch") },

  // Hammer / latch
  m: { name: canonicalName("m"), sym: canonicalSym("m") },
  F_latch_peak: { name: "Peak Latch Resistance", sym: "F_peak" },
  F_latch_avg: { name: "Average Latch Resistance", sym: "F_avg" },
  eta: { name: canonicalName("eta"), sym: canonicalSym("eta") },
  W_run: { name: canonicalName("W_run"), sym: canonicalSym("W_run") },
  KE: { name: canonicalName("KE"), sym: canonicalSym("KE") },
  v: { name: canonicalName("v"), sym: canonicalSym("v") },
  p: { name: canonicalName("p"), sym: canonicalSym("p") },

  // Material
  G: { name: canonicalName("G"), sym: canonicalSym("G") },
  TS_basis: { name: canonicalName("TS_basis"), sym: canonicalSym("TS_basis") },
};

/** Human-readable name for a parameter, falling back to the engineering name. */
export function overviewName(id: string): string {
  return OVERVIEW_LABELS[id]?.name ?? PARAMETER_MAP[id]?.name ?? id;
}

/** Pretty (subscripted) symbol for a parameter, falling back to the engineering symbol. */
export function overviewSym(id: string): string {
  return OVERVIEW_LABELS[id]?.sym ?? PARAMETER_MAP[id]?.symbol ?? id;
}
