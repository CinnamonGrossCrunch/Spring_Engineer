/**
 * Canonical nomenclature used across V1 + V2 interfaces.
 *
 * This is presentation metadata only (plain names + display symbols). It does
 * not change solver ids, equations, or data-model keys.
 */
export interface CanonicalLabel {
  name: string;
  sym: string;
}

export const CANONICAL_NOMENCLATURE: Record<string, CanonicalLabel> = {
  // Geometry
  d: { name: "Wire Diameter", sym: "d" },
  D: { name: "Mean Coil Diameter", sym: "D" },
  OD: { name: "Outside Diameter", sym: "OD" },
  ID: { name: "Inside Diameter", sym: "ID" },
  Na: { name: "Active Coils", sym: "Nₐ" },
  Nt: { name: "Total Coils", sym: "Nₜ" },
  C: { name: "Spring Index", sym: "C" },
  Hs: { name: "Solid Height", sym: "Hₛ" },
  HsNom: { name: "Nominal Solid Height", sym: "Hₛ,nom" },
  HsMax: { name: "Max Solid Height", sym: "Hₛ,max" },

  // Length states
  L_free: { name: "Free Length", sym: "Lᶠ" },
  Lf: { name: "Free Length", sym: "Lᶠ" },
  L_min: { name: "Loaded Spring Length", sym: "L₁" },
  Lc: { name: "Compressed Spring Length", sym: "Lᶜ" },
  L2: { name: "Loaded Length at Hammer Contact", sym: "L₂" },
  L3: { name: "Loaded Length After Follow-Through", sym: "L₃" },

  // Travel
  s_h: { name: "Hammer Run-Up Stroke", sym: "sₕ" },
  s: { name: "Hammer Run-Up Stroke", sym: "s" },
  y_latch: { name: "Latch Follow-Through Travel", sym: "yₗ" },
  y: { name: "Latch Follow-Through Travel", sym: "y" },

  // Forces + behavior
  k: { name: "Spring Rate", sym: "k" },
  x1: { name: "Maximum Working Deflection", sym: "x₁" },
  x0: { name: "Starting Deflection", sym: "x₀" },
  F0: { name: "Starting Spring Force", sym: "F₀" },
  F1: { name: "Starting Spring Force", sym: "F₁" },
  F2: { name: "Spring Force at Hammer Contact", sym: "F₂" },
  F3: { name: "Spring Force After Follow-Through", sym: "F₃" },

  // Work / energy
  W_run: { name: "Hammer Run-Up Work", sym: "Wᵣᵤₙ" },
  Whammer: { name: "Hammer Run-Up Work", sym: "Wᵣᵤₙ" },
  Wlatch: { name: "Latch Follow-Through Work", sym: "Wₗ" },
  WreleaseIdeal: { name: "Ideal Release Work", sym: "W_release,ideal" },
  FeqAvgIdeal: { name: "Ideal Equivalent Average Release Force", sym: "F_eq,avg" },
  FeqTriPeakIdeal: { name: "Ideal Triangular Peak-Equivalent Force", sym: "F_eq,tri" },

  // Hammer lens
  m: { name: "Hammer Mass", sym: "m" },
  eta: { name: "Hammer Efficiency", sym: "η" },
  KE: { name: "Kinetic Energy at Contact", sym: "KE" },
  v: { name: "Hammer Velocity at Contact", sym: "v" },
  p: { name: "Hammer Momentum at Contact", sym: "p" },

  // Material / stress
  G: { name: "Shear Modulus", sym: "G" },
  Kw: { name: "Wahl Factor", sym: "K_w" },
  tau: { name: "Shear Stress", sym: "τ" },
  tau_allow: { name: "Allowable Shear Stress", sym: "τ_allow" },
  stressPctConservative: { name: "Stress Percent of TS (Conservative)", sym: "%TS" },
};

export function canonicalName(id: string, fallback = id): string {
  return CANONICAL_NOMENCLATURE[id]?.name ?? fallback;
}

export function canonicalSym(id: string, fallback = id): string {
  return CANONICAL_NOMENCLATURE[id]?.sym ?? fallback;
}
