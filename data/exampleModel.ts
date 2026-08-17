import type { DesignMode, ModelState, ParameterStatus } from "@/lib/engineering/types";

/**
 * Example values — NOT design recommendations.
 *
 * Generic illustrative numbers chosen to produce a valid spring model.
 * They are deliberately NOT tied to any real project.
 */

type Preset = Record<string, { value?: number; status: ParameterStatus }>;

/** Impact-latch example — a coherent spring-driven mechanism example with clearly
 * separate assumed latch requirements and spring-force states. */
const BASE_INPUTS: Preset = {
  // Upstream latch requirement — assumed, not derived by this calculator
  F_latch_peak: { value: 27, status: "assumed" },
  F_latch_avg: { value: 18, status: "assumed" },
  y_latch: { value: 0.08, status: "assumed" },

  // Hammer / impact regime
  m: { value: 0.28, status: "variable" },
  s_h: { value: 0.18, status: "variable" },
  eta: { value: 0.9, status: "assumed" },

  // Spring installation / force state
  L_free: { value: 1.65, status: "variable" },
  x1: { value: 0.35, status: "variable" },

  // Geometry near a feasible impact-latch regime: k ≈ 130 lbf/in, C ≈ 5, τ < τ_allow.
  d: { value: 0.09, status: "variable" },
  D: { value: 0.45, status: "variable" },
  Na: { value: 8, status: "variable" },

  // Material / stress property
  G: { value: 11.5e6, status: "assumed" },
  tau_allow: { value: 120_000, status: "assumed" },

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
    F2: { value: 20, status: "fixed" },
    s_h: { value: 0.18, status: "fixed" },
    y_latch: { value: 0.08, status: "fixed" },
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

export const EXAMPLE_DATA_LABEL = "Impact Latch Example — example assumed latch requirement — not derived by this calculator";
