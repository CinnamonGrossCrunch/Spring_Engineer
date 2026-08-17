import type { DesignMode, ModelState, ParameterStatus } from "@/lib/engineering/types";

/**
 * Example values — NOT design recommendations.
 *
 * Generic illustrative numbers chosen to produce a valid spring model.
 * They are deliberately NOT tied to any real project.
 */

type Preset = Record<string, { value?: number; status: ParameterStatus }>;

/**
 * "Bokaie Nominal — Functional Concept" preset.
 *
 * The FORCE / TRAVEL values are the primary nominal functional concept. The
 * rough whiteboard radial geometry (ID ≈ 0.780, OD ≈ 1.110, wire ≈ 0.17 in) is
 * intentionally NOT forced in — a 0.17 in wire cannot simultaneously satisfy
 * k ≈ 280 lbf/in AND clear solid height at the 0.900 in loaded length
 * (H_s ≈ N_t·d would exceed L_min → coil bind). The geometry below is therefore
 * RECONCILED to the spring equations, material properties, stress limit and
 * solid-height constraint. See PRESET_PROVENANCE for the explicit split between:
 *   1. functional requirement   (primary — force & travel targets)
 *   2. rough sketch geometry     (whiteboard radial targets, not authoritative)
 *   3. solver-reconciled geometry (what actually satisfies the equations)
 */
const BASE_INPUTS: Preset = {
  // ── (1) ASSUMED upstream latch resistance — NOT derived by this calculator ──
  F_latch_peak: { value: 900, status: "assumed" },
  F_latch_avg: { value: 450, status: "assumed" },

  // ── (1) FUNCTIONAL travel requirements ──
  y_latch: { value: 0.07, status: "assumed" }, // additional latch travel
  s_h: { value: 0.25, status: "variable" }, // hammer run-up before contact

  // Hammer / impact regime
  m: { value: 0.28, status: "variable" },
  eta: { value: 0.9, status: "assumed" },

  // ── (1) FUNCTIONAL installation / deflection requirements ──
  L_free: { value: 1.4, status: "variable" }, // free length
  x1: { value: 0.5, status: "variable" }, // max working deflection → L_min = 0.900 in

  // ── (3) RECONCILED spring geometry (see header note + PRESET_PROVENANCE) ──
  // Reconciled to hit k ≈ 280 lbf/in and F1 ≈ 140 lbf while keeping solid
  // height clear of the 0.900 in loaded length. The sketch wire (≈0.17 in) is
  // deliberately thinned to ≈0.147 in so the design is physically feasible.
  d: { value: 0.147, status: "variable" },
  D: { value: 0.88, status: "variable" },
  Na: { value: 3.5, status: "variable" },

  // Material / stress property
  G: { value: 11.5e6, status: "assumed" },
  tau_allow: { value: 150_000, status: "assumed" },

  // Constraint margin
  required_clearance: { value: 0.05, status: "variable" },
};

/** Everything computed by the engine. */
const DERIVED_IDS = [
  "k",
  "F1",
  "F2",
  "F3",
  "L_min",
  "L2",
  "L3",
  "OD",
  "ID",
  "C",
  "Nt",
  "Hs",
  "Kw",
  "tau",
  "utilization",
  "clearance",
  "W_run",
  "KE",
  "v",
  "p",
] as const;

function withDerived(preset: Preset): ModelState {
  const state: ModelState = {};
  for (const [id, p] of Object.entries(preset)) {
    state[id] = { value: p.value, status: p.status };
  }
  for (const id of DERIVED_IDS) {
    if (!state[id]) state[id] = { value: undefined, status: "derived" };
  }
  return state;
}

/**
 * Forward Design: enter geometry/material, derive rate, forces, stress,
 * solid height, clearance.
 */
function forwardPreset(): ModelState {
  return withDerived({ ...BASE_INPUTS });
}

/**
 * Reverse Design: pin mechanism requirements (force at contact, travels) and
 * let the engine work backward — here it solves k, then wire diameter d from
 * the rate equation given D, N_a and G.
 */
function reversePreset(): ModelState {
  const preset: Preset = {
    ...BASE_INPUTS,
    // Pin the primary functional requirements for the Bokaie concept.
    F2: { value: 70, status: "fixed" }, // spring force at hammer contact
    s_h: { value: 0.25, status: "fixed" }, // hammer run-up
    y_latch: { value: 0.07, status: "fixed" }, // additional latch travel
    // Wire diameter becomes derived: solved from the rate equation once the
    // engine has worked k backward from the pinned requirements.
    d: { status: "derived" },
  };
  return withDerived(preset);
}

/** Explore: nothing pinned — freely pin and vary to see sensitivities. */
function explorePreset(): ModelState {
  return withDerived({ ...BASE_INPUTS });
}

export function buildInitialState(mode: DesignMode): ModelState {
  switch (mode) {
    case "forward":
      return forwardPreset();
    case "reverse":
      return reversePreset();
    case "explore":
      return explorePreset();
  }
}

export const MODE_INFO: Record<DesignMode, { label: string; blurb: string }> = {
  forward: {
    label: "Forward Design",
    blurb:
      "Enter spring geometry and material → the engine derives rate, force states, stress, solid height and clearance.",
  },
  reverse: {
    label: "Reverse Design",
    blurb:
      "Pin mechanism requirements (F2 at contact, strokes) → the engine works backward where the equations permit, e.g. solving spring rate and wire diameter.",
  },
  explore: {
    label: "Explore",
    blurb:
      "Freely pin any parameters and vary others to expose sensitivities and tradeoffs. Conflicting pins raise an overconstraint warning.",
  },
};

export const EXAMPLE_DATA_LABEL =
  "Bokaie Nominal — Functional Concept — force/travel targets are primary; geometry reconciled to the spring equations";

/**
 * Explicit provenance for the concept preset, so the three tiers are never
 * conflated in the UI: functional requirement vs. rough sketch geometry vs.
 * solver-reconciled geometry (the live, equation-consistent values shown in the
 * illustration and Spring Details).
 */
export const PRESET_PROVENANCE = {
  title: "Bokaie Nominal — Functional Concept",
  functional: [
    { label: "Free length L_f", value: "1.400 in" },
    { label: "Max working deflection x₁", value: "0.500 in" },
    { label: "Starting loaded length L₁", value: "0.900 in" },
    { label: "Target spring rate k", value: "≈ 280 lbf/in" },
    { label: "Starting spring force F₁", value: "≈ 140 lbf" },
    { label: "Hammer run-up sₕ", value: "0.250 in" },
    { label: "Spring force at contact F₂", value: "≈ 70 lbf" },
    { label: "Additional latch travel y_latch", value: "0.070 in" },
    { label: "Spring force after latch F₃", value: "≈ 50.4 lbf" },
  ],
  assumed: [
    { label: "Peak latch resistance", value: "≈ 900 lbf" },
    { label: "Average latch resistance", value: "≈ 450 lbf" },
  ],
  sketch: [
    { label: "Inside diameter ID", value: "≈ 0.780 in" },
    { label: "Outside diameter OD", value: "≈ 1.110 in" },
    { label: "Wire diameter d", value: "≈ 0.17 in" },
  ],
  note:
    "Force and travel values are the primary nominal concept. The rough sketch diameters are whiteboard targets only: a 0.17 in wire cannot satisfy k ≈ 280 lbf/in and still clear solid height at the 0.900 in loaded length (with N_t ≈ N_a + 2), so the live geometry is reconciled to a thinner wire. The reconciled, equation-consistent geometry is what the illustration and Spring Details display.",
} as const;
