import type { DesignMode, ModelState, ParameterStatus } from "@/lib/engineering/types";

/**
 * Example values — NOT design recommendations.
 *
 * Two side-by-side concepts are provided and never conflated:
 *
 *   A. "Bokaie Original Sketch — Literal"  (default, historical reference)
 *      The whiteboard read faithfully. Geometry is fed literally and the
 *      spring RATE / FORCES are DERIVED from it. The separately-written
 *      performance targets (k ≈ 280 lbf/in, F₁ ≈ 140 lbf) are intentionally
 *      NOT pinned, so the tool can expose whether the literal geometry
 *      actually produces them — it does not.
 *
 *   B. "Reconciled Candidate"
 *      One equation-consistent design that DOES meet the performance targets
 *      within the stress and solid-height limits (thinner wire, more coils).
 *      This is NOT "what Michael sketched"; it is one feasible candidate.
 *
 * See PRESET_PROVENANCE for the explicit three-tier split (original sketch
 * value vs. solver-derived value vs. reconciled-candidate value).
 */

type Preset = Record<string, { value?: number; status: ParameterStatus }>;

export type PresetId = "literalSketch" | "reconciledCandidate";
export const DEFAULT_PRESET: PresetId = "literalSketch";

/** Upstream / installation assumptions shared by both concepts. */
const COMMON_INPUTS: Preset = {
  // ── ASSUMED upstream latch resistance — NOT derived by this calculator ──
  F_latch_peak: { value: 900, status: "assumed" },
  F_latch_avg: { value: 450, status: "assumed" },

  // ── Travel requirements ──
  y_latch: { value: 0.07, status: "variable" }, // additional latch travel
  s_h: { value: 0.25, status: "variable" }, // hammer run-up before contact

  // Hammer / impact regime
  m: { value: 0.28, status: "variable" },
  eta: { value: 0.9, status: "assumed" },

  // ── Installation / deflection requirements ──
  L_free: { value: 1.4, status: "variable" }, // free length
  x1: { value: 0.5, status: "variable" }, // max working deflection → L_min = 0.900 in

  // Material / stress property
  G: { value: 11.5e6, status: "assumed" },
  tau_allow: { value: 150_000, status: "assumed" },

  // Constraint margin
  required_clearance: { value: 0.05, status: "variable" },
};

/**
 * A — BOKAIE ORIGINAL SKETCH (LITERAL).
 *
 * Radial source of truth: wire d + inside diameter ID → D = ID + d, and OD is
 * DERIVED (OD ≈ 1.120 in vs the sketched ≈ 1.110 in — the three rough
 * diameters do not round-trip exactly; the small discrepancy is surfaced
 * rather than distorting the spring).
 *
 * Coil source of truth: TOTAL coils N_t ≈ 3.5 (as sketched). Under the
 * closed-&-ground approximation N_t ≈ N_a + 2, the ACTIVE coils are DERIVED as
 * N_a ≈ 1.5. (The earlier interpretation error treated N_a ≈ 3.5 → N_t ≈ 5.5;
 * that is corrected here.)
 *
 * k, F₁, F₂, F₃ are all DERIVED from the literal geometry. They will NOT match
 * the stated ≈280 / ≈140 targets — that inconsistency is the point.
 */
const LITERAL_SKETCH: Preset = {
  ...COMMON_INPUTS,
  d: { value: 0.17, status: "variable" }, // rough sketch wire diameter
  ID: { value: 0.78, status: "variable" }, // radial source of truth (with d)
  // D and OD are derived: D = ID + d, OD = D + d.
  Nt: { value: 3.5, status: "variable" }, // TOTAL coils — coil source of truth
  // N_a is derived: N_a ≈ N_t − 2 (closed & ground).
};

/**
 * B — RECONCILED CANDIDATE.
 *
 * Equation-consistent geometry that meets k ≈ 280 lbf/in and F₁ ≈ 140 lbf
 * within the stress and solid-height limits. It needs a THINNER wire
 * (≈0.147 in) and MORE coils (N_t ≈ 5.5) than the literal sketch.
 */
const RECONCILED_CANDIDATE: Preset = {
  ...COMMON_INPUTS,
  d: { value: 0.147, status: "variable" },
  D: { value: 0.88, status: "variable" }, // radial source of truth
  // OD and ID are derived: OD = D + d, ID = D − d.
  Nt: { value: 5.5, status: "variable" }, // TOTAL coils primary; N_a ≈ 3.5 derived
};

function baseInputs(preset: PresetId): Preset {
  return preset === "reconciledCandidate"
    ? { ...RECONCILED_CANDIDATE }
    : { ...LITERAL_SKETCH };
}

/** Everything computed by the engine. */
const DERIVED_IDS = [
  "k",
  "F1",
  "F2",
  "F3",
  "L_min",
  "L2",
  "L3",
  "D",
  "OD",
  "ID",
  "C",
  "Nt",
  "Na",
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
function forwardPreset(preset: PresetId): ModelState {
  return withDerived(baseInputs(preset));
}

/**
 * Reverse Design: pin mechanism requirements (force at contact, travels) and
 * let the engine work backward — here it solves k, then wire diameter d from
 * the rate equation given D, N_a and G.
 *
 * Reverse always uses the reconciled radial basis (D as the free diameter,
 * wire d derived) because the literal sketch fixes ID → D = ID + d, which would
 * make "solve d from the rate" circular. Coils stay N_t-primary / N_a-derived.
 */
function reversePreset(): ModelState {
  const preset: Preset = {
    ...RECONCILED_CANDIDATE,
    // Pin the primary functional requirements for the concept.
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
function explorePreset(preset: PresetId): ModelState {
  return withDerived(baseInputs(preset));
}

export function buildInitialState(
  mode: DesignMode,
  preset: PresetId = DEFAULT_PRESET,
): ModelState {
  switch (mode) {
    case "forward":
      return forwardPreset(preset);
    case "reverse":
      return reversePreset();
    case "explore":
      return explorePreset(preset);
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

/** Preset picker metadata — the two concepts are kept explicitly separate. */
export const PRESET_INFO: Record<
  PresetId,
  { label: string; short: string; blurb: string }
> = {
  literalSketch: {
    label: "Bokaie Original Sketch — Literal",
    short: "Original sketch",
    blurb:
      "The whiteboard read faithfully: N_t ≈ 3.5 total coils, 0.170 in wire, ID ≈ 0.780 in. Rate and forces are DERIVED from this geometry, so the tool exposes that it does not match the separately stated ≈280 lbf/in / ≈140 lbf.",
  },
  reconciledCandidate: {
    label: "Reconciled Candidate",
    short: "Reconciled candidate",
    blurb:
      "One equation-consistent design that meets k ≈ 280 lbf/in and F₁ ≈ 140 lbf within the stress and solid-height limits — it needs a thinner 0.147 in wire and more coils (N_t ≈ 5.5). Not what was sketched; one feasible candidate.",
  },
};

export function exampleDataLabel(preset: PresetId): string {
  return preset === "reconciledCandidate"
    ? "Reconciled Candidate — equation-consistent geometry that meets the ≈280 lbf/in / ≈140 lbf targets"
    : "Bokaie Original Sketch (Literal) — geometry read faithfully; rate & forces derived, inconsistencies exposed";
}

/** @deprecated use exampleDataLabel(presetId) */
export const EXAMPLE_DATA_LABEL = exampleDataLabel(DEFAULT_PRESET);

/**
 * Explicit provenance so the three tiers are never conflated in the UI:
 *   1. ORIGINAL SKETCH VALUE     — exactly what the whiteboard says
 *   2. SOLVER-DERIVED VALUE      — what the equations produce from that literal geometry
 *   3. RECONCILED CANDIDATE VALUE — an equation-consistent alternative
 *
 * Discrepancies are surfaced, not hidden.
 */
export const PRESET_PROVENANCE = {
  sketchTitle: "Bokaie original sketch (literal)",
  reconciledTitle: "Reconciled candidate",

  // ── Tier 1: exactly what the whiteboard says ──
  sketch: {
    performance: [
      { label: "Stated spring rate k", value: "≈ 280 lbf/in" },
      { label: "Stated starting force F₁", value: "≈ 140 lbf" },
      { label: "Force at contact F₂", value: "≈ 70 lbf" },
      { label: "Force after latch F₃", value: "≈ 50.4 lbf" },
    ],
    travel: [
      { label: "Free length L_f", value: "≈ 1.400 in" },
      { label: "Max working deflection x₁", value: "≈ 0.500 in" },
      { label: "Starting loaded length L₁", value: "≈ 0.900 in" },
      { label: "Hammer run-up sₕ", value: "0.250 in" },
      { label: "Additional latch travel y_latch", value: "0.070 in" },
    ],
    geometry: [
      { label: "Wire diameter d", value: "≈ 0.170 in" },
      { label: "Inside diameter ID", value: "≈ 0.780 in" },
      { label: "Outside diameter OD", value: "≈ 1.110 in" },
      { label: "Total coils N_t", value: "≈ 3.5" },
    ],
    assumed: [
      { label: "Peak latch resistance", value: "≈ 900 lbf" },
      { label: "Average latch resistance", value: "≈ 450 lbf" },
    ],
  },

  // ── Tier 2: what the equations imply from that LITERAL geometry ──
  implications: [
    { label: "Active coils N_a", sketch: "—", model: "≈ 1.5  (N_t − 2, closed & ground)" },
    { label: "Mean diameter D", sketch: "—", model: "≈ 0.950 in  (ID + d)" },
    { label: "Outside diameter OD", sketch: "≈ 1.110 in", model: "≈ 1.120 in  (D + d)" },
    { label: "Spring rate k", sketch: "≈ 280 lbf/in", model: "≈ 934 lbf/in  (G·d⁴ / 8D³N_a)" },
    { label: "Starting force F₁", sketch: "≈ 140 lbf", model: "≈ 467 lbf  (k·x₁)" },
    { label: "Shear stress τ", sketch: "—", model: "≈ 293,000 psi → ~195% of τ_allow" },
  ],

  // ── Tier 3: an equation-consistent alternative ──
  reconciled: [
    { label: "Wire diameter d", value: "0.147 in" },
    { label: "Mean diameter D", value: "0.880 in" },
    { label: "Outside diameter OD", value: "1.027 in" },
    { label: "Inside diameter ID", value: "0.733 in" },
    { label: "Total coils N_t", value: "≈ 5.5  (N_a ≈ 3.5)" },
    { label: "Spring rate k", value: "≈ 281 lbf/in" },
    { label: "Starting force F₁", value: "≈ 141 lbf" },
  ],

  conclusion:
    "The original sketch assumptions are not mutually consistent under the closed-and-ground linear spring model. The sketched geometry (0.170 in wire, N_t ≈ 3.5 → N_a ≈ 1.5) implies a spring rate of roughly 934 lbf/in and ~195% stress utilization — it does NOT match the separately stated ≈280 lbf/in / ≈140 lbf. Achieving the stated performance within the stress and solid-height limits requires a thinner wire and more coils (the Reconciled Candidate). Both concepts are kept side by side rather than silently merged.",
} as const;
