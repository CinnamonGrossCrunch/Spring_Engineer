import { PARAMETER_MAP } from "@/lib/engineering/parameters";

/**
 * Presentation-only labels for the Overview view.
 *
 * The Overview leads with plain-English parameter names and pretty
 * (subscripted) symbols. These are display strings ONLY — they never touch
 * the engineering model (`lib/engineering`), which keeps its own ASCII
 * symbols and names as the single source of truth. Nothing here recomputes
 * any value.
 */
export interface OverviewLabel {
  /** Human-readable primary label, e.g. "Wire Diameter". */
  name: string;
  /** Pretty symbol with unicode subscripts, e.g. "Nₐ" or "F₁". */
  sym: string;
}

export const OVERVIEW_LABELS: Record<string, OverviewLabel> = {
  // Geometry / construction
  d: { name: "Wire Diameter", sym: "d" },
  D: { name: "Mean Coil Diameter", sym: "D" },
  OD: { name: "Outside Diameter", sym: "OD" },
  ID: { name: "Inside Diameter", sym: "ID" },
  Na: { name: "Active Coils", sym: "Nₐ" },
  Nt: { name: "Total Coils", sym: "Nₜ" },
  C: { name: "Spring Index", sym: "C" },
  Hs: { name: "Solid Height", sym: "Hₛ" },
  L_free: { name: "Free Length", sym: "L_f" },

  // Behavior
  k: { name: "Spring Rate / Stiffness", sym: "k" },
  x1: { name: "Maximum Working Deflection", sym: "x₁" },

  // Spring-force states
  F1: { name: "Starting Spring Force", sym: "F₁" },
  F2: { name: "Spring Force at Hammer Contact", sym: "F₂" },
  F3: { name: "Spring Force After Latch Travel", sym: "F₃" },

  // Loaded lengths (per state)
  L_min: { name: "Loaded Spring Length", sym: "L₁" },
  L2: { name: "Loaded Spring Length", sym: "L₂" },
  L3: { name: "Loaded Spring Length", sym: "L₃" },

  // Travel between states
  s_h: { name: "Hammer Run-Up", sym: "sₕ" },
  y_latch: { name: "Additional Latch Travel", sym: "y_latch" },

  // Hammer / latch
  m: { name: "Hammer Mass", sym: "m" },
  F_latch_peak: { name: "Peak Latch Resistance", sym: "F_peak" },
  F_latch_avg: { name: "Average Latch Resistance", sym: "F_avg" },
  eta: { name: "Hammer Efficiency", sym: "η" },
  W_run: { name: "Spring Work Over Run-Up", sym: "W_run" },
  KE: { name: "Kinetic Energy at Contact", sym: "KE" },
  v: { name: "Hammer Velocity at Contact", sym: "v" },
  p: { name: "Hammer Momentum at Contact", sym: "p" },

  // Material
  G: { name: "Shear Modulus", sym: "G" },
  tau_allow: { name: "Allowable Shear Stress", sym: "τ_allow" },
};

/** Human-readable name for a parameter, falling back to the engineering name. */
export function overviewName(id: string): string {
  return OVERVIEW_LABELS[id]?.name ?? PARAMETER_MAP[id]?.name ?? id;
}

/** Pretty (subscripted) symbol for a parameter, falling back to the engineering symbol. */
export function overviewSym(id: string): string {
  return OVERVIEW_LABELS[id]?.sym ?? PARAMETER_MAP[id]?.symbol ?? id;
}
