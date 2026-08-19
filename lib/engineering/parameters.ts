import type { ParameterDefinition } from "./types";
import { canonicalName, canonicalSym } from "./nomenclature";

/**
 * Parameter catalog for the spring-driven hammer/latch mechanism.
 * Units are Imperial (V1). Values live separately in ModelState.
 *
 * Unit conventions:
 *  - forces: lbf          - lengths: in         - spring rate: lbf/in
 *  - stress/modulus: psi  - mass: lbm           - velocity: ft/s
 *  - energy: W_run in in·lbf, KE in ft·lbf      - momentum: lbm·ft/s
 */
export const PARAMETERS: ParameterDefinition[] = [
  // ── Latch requirement (upstream mechanism inputs) ────────────────────────
  {
    id: "F_latch_peak",
    symbol: "F_latch,peak",
    name: "Peak latch resistance",
    description:
      "Peak/breakaway force the latch presents during release. This is an upstream mechanism requirement — it is NOT derived from spring geometry, and it is NOT the dynamic impact force.",
    unit: "lbf",
    category: "requirement",
    source: "Assumed / measured upstream — not derived by this calculator",
    min: 0,
    max: 1200,
    step: 10,
    whatIfIncrease:
      "A higher breakaway resistance means the hammer event must deliver more momentum/energy margin. This tool cannot verify sufficiency because peak dynamic contact force is not uniquely determined by spring force.",
    note: "Treated as ASSUMED. Verify by test or upstream analysis.",
  },
  {
    id: "F_latch_avg",
    symbol: "F_latch,avg",
    name: "Average latch resistance",
    description:
      "Average force resisting motion over the latch release travel. Upstream requirement, not derived from the spring equations.",
    unit: "lbf",
    category: "requirement",
    source: "Assumed / measured upstream",
    min: 0,
    max: 600,
    step: 5,
    whatIfIncrease:
      "More work must be done across the latch travel; the spring must keep enough residual force (F3) and the hammer enough energy through the stroke.",
    note: "Treated as ASSUMED.",
  },
  {
    id: "y_latch",
    symbol: canonicalSym("y_latch"),
    name: canonicalName("y_latch"),
    description:
      "Additional travel after hammer contact needed to fully release the latch. The spring is assumed to keep driving the hammer through this travel (V1 assumption).",
    unit: "in",
    category: "requirement",
    min: 0.01,
    max: 0.5,
    step: 0.005,
    formula: "F3 = F2 − k·y_latch",
    dependencies: [],
    whatIfIncrease:
      "The spring relaxes further before release completes, so residual force F3 drops. If F3 reaches zero the spring stops driving before the latch is released.",
  },
  {
    id: "F1_cap",
    symbol: "F1_cap",
    name: "Starting force cap",
    description:
      "Maximum allowed starting spring force at maximum working deflection for the current mechanism boundary study.",
    unit: "lbf",
    category: "requirement",
    source: "Mechanism boundary",
    min: 0,
    max: 500,
    step: 1,
    formula: "F1 ≤ F1_cap",
    whatIfIncrease:
      "Looser cap allows higher spring preload and more run-up work but raises stress and packaging demands.",
  },
  {
    id: "B",
    symbol: "B",
    name: "Axial budget",
    description:
      "Total axial budget for compressed spring length plus hammer run-up: B = L_min + s_h.",
    unit: "in",
    category: "requirement",
    source: "Mechanism boundary",
    min: 0.2,
    max: 3,
    step: 0.005,
    formula: "B = L_min + s_h",
    dependencies: ["L_min", "s_h"],
    whatIfIncrease:
      "More travel budget allows either a longer compressed length margin or more hammer run-up.",
  },

  // ── Hammer ───────────────────────────────────────────────────────────────
  {
    id: "m",
    symbol: "m",
    name: "Hammer mass",
    description:
      "Effective moving mass of the hammer. Optional/speculative unless measured for the current mechanism.",
    unit: "lbm",
    category: "hammer",
    min: 0.05,
    max: 2,
    step: 0.01,
    whatIfIncrease:
      "For the same run-up work, a heavier hammer moves slower (v ↓) but carries more momentum per unit velocity. KE at contact is unchanged in the energy lens; momentum p = m·v rises with √m.",
  },
  {
    id: "s_h",
    symbol: canonicalSym("s_h"),
    name: canonicalName("s_h"),
    description:
      "Distance the spring accelerates the hammer before it reaches the latch contact point. V1 assumes 1:1 spring-to-hammer displacement.",
    unit: "in",
    category: "hammer",
    min: 0.05,
    max: 1.5,
    step: 0.01,
    formula: "F2 = F1 − k·s_h",
    whatIfIncrease:
      "More run-up extracts more spring work (more KE at contact) but the spring force remaining at contact (F2) is lower.",
  },
  {
    id: "eta",
    symbol: "η",
    name: "Hammer efficiency (assumption)",
    description:
      "Fraction of spring run-up work converted to hammer kinetic energy. Placeholder for friction, guide losses and effective-mass effects. This is an explicit assumption, NOT a measured value.",
    unit: "—",
    category: "hammer",
    source: "Assumed — not measured",
    min: 0.1,
    max: 1,
    step: 0.05,
    formula: "KE = η·W_run / 12",
    whatIfIncrease:
      "More of the spring's work reaches the hammer: higher velocity and momentum at contact.",
    note: "If unknown, leave unset; do not treat assumed values as measured truth.",
  },
  {
    id: "W_run",
    symbol: canonicalSym("W_run"),
    name: canonicalName("W_run"),
    description:
      "Work done by the (linear) spring on the hammer during the run-up stroke: the area under the force-deflection line from F1 to F2.",
    unit: "in·lbf",
    category: "hammer",
    formula: "W_run = F1·s_h − ½·k·s_h²",
    dependencies: ["F1", "k", "s_h"],
    sensitivity: "F1 ↑ → W_run ↑ · s_h ↑ → W_run ↑ (until spring relaxes) · k ↑ → less work per stroke at same F1",
    whatIfIncrease: "More energy is available to the hammer at contact.",
  },
  {
    id: "KE",
    symbol: "KE",
    name: "Hammer kinetic energy at contact",
    description:
      "Kinetic energy of the hammer when it reaches the latch, per the optional energy lens (KE = η·W_run). Does NOT determine peak contact force by itself.",
    unit: "ft·lbf",
    category: "hammer",
    formula: "KE = ½·(m/g_c)·v²  =  η·W_run/12",
    dependencies: ["eta", "W_run", "m", "v"],
    whatIfIncrease:
      "More energy is delivered into the impact event — but how that maps to peak force depends on contact stiffness, duration, deformation and rebound, which are out of scope in V1.",
  },
  {
    id: "v",
    symbol: "v",
    name: "Hammer velocity at contact",
    description: "Hammer speed at the instant it reaches the latch contact point.",
    unit: "ft/s",
    category: "hammer",
    formula: "v = √(2·KE·g_c / m),  g_c = 32.174",
    dependencies: ["KE", "m"],
    whatIfIncrease: "Momentum and kinetic energy at contact both rise.",
  },
  {
    id: "p",
    symbol: "p",
    name: "Hammer momentum at contact",
    description: "Linear momentum of the hammer at contact: p = m·v.",
    unit: "lbm·ft/s",
    category: "hammer",
    formula: "p = m·v",
    dependencies: ["m", "v"],
    whatIfIncrease:
      "A larger impulse is available to the latch — but converting momentum to peak force requires an impact model (contact stiffness, duration), which V1 does not attempt.",
  },

  // ── Spring force states ──────────────────────────────────────────────────
  {
    id: "F1",
    symbol: "F1",
    name: "Spring force at max deflection (start)",
    description:
      "Axial spring force at maximum working deflection — the cocked/start state, and the spring's maximum operating load used for stress.",
    unit: "lbf",
    category: "spring-state",
    formula: "F1 = k·x1",
    dependencies: ["k", "x1"],
    sensitivity: "k ↑ → F1 ↑ · x1 ↑ → F1 ↑",
    whatIfIncrease:
      "More stored force and energy, but shear stress τ rises proportionally — check stress utilization.",
    min: 0,
    max: 250,
    step: 0.1,
  },
  {
    id: "F2",
    symbol: "F2",
    name: "Spring force at hammer contact",
    description:
      "Spring force remaining when the hammer reaches the latch contact point. This is NOT the dynamic impact force — peak contact force also depends on contact stiffness, collision duration, deformation, rebound and effective masses.",
    unit: "lbf",
    category: "spring-state",
    formula: "F2 = F1 − k·s_h = k·(x1 − s_h)",
    dependencies: ["F1", "k", "s_h"],
    whatIfIncrease:
      "More sustained push at the moment of contact and through latch travel. Note: raising F2 does not linearly raise peak impact force.",
    note: "Spring force at contact ≠ dynamic impact force.",
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    id: "F3",
    symbol: "F3",
    name: "Spring force after latch travel",
    description:
      "Residual spring force after the additional latch release travel. Must stay positive for the spring to keep driving the hammer through release (V1 assumption of continuous drive).",
    unit: "lbf",
    category: "spring-state",
    formula: "F3 = F2 − k·y_latch",
    dependencies: ["F2", "k", "y_latch"],
    whatIfIncrease: "More force margin at end of release.",
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    id: "k",
    symbol: "k",
    name: "Spring rate",
    description:
      "Stiffness of the compression spring: force change per unit deflection.",
    unit: "lbf/in",
    category: "spring-state",
    formula: "k = G·d⁴ / (8·D³·N_a)",
    dependencies: ["G", "d", "D", "Na"],
    sensitivity: "G ↑ → k ↑ · d ↑ → k ↑ strongly (4th power) · D ↑ → k ↓ (3rd power, inverse) · N_a ↑ → k ↓",
    whatIfIncrease:
      "Force falls off faster with travel (steeper F–x line): higher F1 for the same deflection, but F2 and F3 drop faster over the stroke. Wire diameter dominates: doubling d multiplies k by 16; increasing mean diameter D softens the spring with a cube-power effect.",
    min: 1,
    max: 400,
    step: 0.5,
  },
  {
    id: "x1",
    symbol: "x1",
    name: "Max working deflection",
    description:
      "Spring deflection from free length at the cocked/start state (maximum working deflection).",
    unit: "in",
    category: "spring-state",
    formula: "x1 = L_f − L_min",
    dependencies: ["L_free", "L_min"],
    whatIfIncrease:
      "More stored force and energy (F1 = k·x1 rises) but the spring compresses closer to solid height — watch coil-bind clearance and stress.",
    min: 0.05,
    max: 2,
    step: 0.01,
  },
  {
    id: "L_free",
    symbol: "L_f",
    name: "Free length",
    description: "Unloaded length of the spring.",
    unit: "in",
    category: "spring-state",
    formula: "L_f = L_min + x1",
    dependencies: [],
    whatIfIncrease:
      "At the same installed (minimum) length, deflection and preload force increase.",
    min: 0.5,
    max: 4,
    step: 0.05,
  },
  {
    id: "L_min",
    symbol: "L_min",
    name: "Min loaded length",
    description:
      "Spring length at maximum working deflection (the most compressed operating state).",
    unit: "in",
    category: "spring-state",
    formula: "L_min = L_f − x1",
    dependencies: ["L_free", "x1"],
    whatIfIncrease: "More clearance above solid height; less stored force.",
    min: 0.2,
    max: 4,
    step: 0.05,
  },
  {
    id: "L2",
    symbol: "L2",
    name: "Loaded length at hammer contact",
    description:
      "Spring length when the hammer reaches the latch contact point, after extending through the run-up stroke: L2 = L_min + s_h (V1 1:1 displacement).",
    unit: "in",
    category: "spring-state",
    formula: "L2 = L_min + s_h",
    dependencies: ["L_min", "s_h"],
    whatIfIncrease: "The spring is longer (more relaxed) at contact, so F2 is lower.",
  },
  {
    id: "L3",
    symbol: "L3",
    name: "Loaded length after latch travel",
    description:
      "Spring length after the additional latch follow-through travel: L3 = L2 + y_latch (V1 continuous-drive assumption).",
    unit: "in",
    category: "spring-state",
    formula: "L3 = L2 + y_latch",
    dependencies: ["L2", "y_latch"],
    whatIfIncrease: "The spring ends the stroke more relaxed, so residual force F3 is lower.",
  },

  // ── Spring geometry ──────────────────────────────────────────────────────
  {
    id: "d",
    symbol: "d",
    name: "Wire diameter",
    description: "Diameter of the spring wire.",
    unit: "in",
    category: "spring-geometry",
    formula: "k ∝ d⁴ · τ ∝ 1/d³",
    sensitivity: "d ↑ → k ↑ strongly (4th power) · d ↑ → τ ↓ (cube, inverse) · d ↑ → H_s ↑",
    whatIfIncrease:
      "Spring rate rises with the FOURTH power of wire diameter — a 10% thicker wire is ~46% stiffer. Stress drops (∝1/d³) but solid height grows.",
    min: 0.02,
    max: 0.25,
    step: 0.001,
  },
  {
    id: "D",
    symbol: "D",
    name: "Mean coil diameter",
    description: "Diameter measured to the center of the wire: D = OD − d = ID + d.",
    unit: "in",
    category: "spring-geometry",
    formula: "D = OD − d = ID + d",
    sensitivity: "D ↑ → k ↓ (3rd power, inverse) · D ↑ → τ ↑",
    whatIfIncrease:
      "Spring softens with the CUBE of mean diameter (10% larger D ≈ 25% softer) and shear stress rises linearly.",
    min: 0.15,
    max: 1,
    step: 0.005,
  },
  {
    id: "OD",
    symbol: "OD",
    name: "Outer diameter",
    description: "Outside diameter of the coil: OD = D + d.",
    unit: "in",
    category: "spring-geometry",
    formula: "OD = D + d",
    dependencies: ["D", "d"],
    whatIfIncrease: "Larger envelope; at fixed d, mean diameter D grows and the spring softens.",
    min: 0.15,
    max: 1.2,
    step: 0.005,
  },
  {
    id: "ID",
    symbol: "ID",
    name: "Inner diameter",
    description: "Inside diameter of the coil: ID = D − d. Governs fit over a guide rod.",
    unit: "in",
    category: "spring-geometry",
    formula: "ID = D − d",
    dependencies: ["D", "d"],
    whatIfIncrease: "More rod clearance; at fixed d, the spring softens.",
  },
  {
    id: "C",
    symbol: "C",
    name: "Spring index",
    description:
      "Ratio of mean coil diameter to wire diameter. Typical manufacturable range is roughly 4–12; low index concentrates stress and is hard to wind.",
    unit: "—",
    category: "spring-geometry",
    formula: "C = D / d",
    dependencies: ["D", "d"],
    whatIfIncrease:
      "Easier manufacturing and lower curvature stress correction (K_w → 1), but a proportionally larger, softer coil.",
  },
  {
    id: "Na",
    symbol: "N_a",
    name: "Active coils",
    description:
      "Number of coils free to deflect. For closed-and-ground ends this is DERIVED from the total coil count: N_a ≈ N_t − 2.",
    unit: "coils",
    category: "spring-geometry",
    formula: "N_a ≈ N_t − 2  (closed & ground ends)",
    dependencies: ["Nt"],
    sensitivity: "N_a ↑ → k ↓ (inverse, linear) · N_a ↑ → H_s ↑",
    whatIfIncrease:
      "Spring softens proportionally and solid height grows (more coils stacked when compressed flat).",
    note: "Closed & ground approximation: active coils ≈ total coils − 2. Not a universal relationship.",
    min: 1,
    max: 30,
    step: 0.5,
  },
  {
    id: "Nt",
    symbol: "N_t",
    name: "Total coils",
    description:
      "Total coil count including inactive end coils — the primary coil quantity. V1 uses the closed-and-ground approximation N_a ≈ N_t − 2 to derive the active coils; this depends on end configuration and is not a universal spring law.",
    unit: "coils",
    category: "spring-geometry",
    formula: "N_t ≈ N_a + 2  (closed & ground ends)",
    sensitivity: "N_t ↑ → N_a ↑ → k ↓ · N_t ↑ → H_s ↑",
    whatIfIncrease:
      "More active coils (N_a = N_t − 2), so the spring softens and the solid height grows.",
    note: "End-configuration dependent approximation, not a universal relationship.",
    min: 2.5,
    max: 32,
    step: 0.5,
  },
  {
    id: "Hs",
    symbol: "H_s",
    name: "Nominal solid height",
    description:
      "Nominal stack height when fully compressed (coil bind), for closed-and-ground ends: H_s,nom ≈ N_t·d.",
    unit: "in",
    category: "spring-geometry",
    formula: "H_s,nom ≈ N_t·d  (closed & ground)",
    dependencies: ["Nt", "d"],
    whatIfIncrease: "Raises the Lee maximum solid height and reduces run-up budget at fixed L_min.",
    note: "Nominal value only. Use H_s,max with tolerance for boundary checks.",
  },

  // ── Material ─────────────────────────────────────────────────────────────
  {
    id: "G",
    symbol: "G",
    name: "Shear modulus",
    description:
      "Torsional (shear) modulus of the wire material. Compression spring deflection is torsion of the wire, so G — not E — governs the rate.",
    unit: "psi",
    category: "material",
    source: "Vendor / material datasheet (Elgiloy baseline shown)",
    min: 1e6,
    max: 2e7,
    step: 1e5,
    sensitivity: "G ↑ → k ↑ (linear)",
    whatIfIncrease: "Spring rate rises proportionally.",
  },
  {
    id: "TS_conservative",
    symbol: "TS_low",
    name: "Conservative tensile strength basis",
    description:
      "Conservative tensile-strength basis for stress guidance (default 270 ksi for Elgiloy). This is tensile strength, NOT allowable shear stress.",
    unit: "psi",
    category: "material",
    source: "Material/vendor reference (Lee-style guidance basis)",
    min: 1e5,
    max: 5e5,
    step: 1e3,
    whatIfIncrease: "If used as TS basis, τ/TS drops proportionally.",
    note: "Used as conservative TS basis by default for stress-band guidance.",
  },
  {
    id: "TS_upper",
    symbol: "TS_high",
    name: "Upper tensile strength reference",
    description:
      "Upper tensile-strength reference for the same material family (default 300 ksi for Elgiloy reference range).",
    unit: "psi",
    category: "material",
    source: "Material/vendor reference",
    min: 1e5,
    max: 5e5,
    step: 1e3,
    whatIfIncrease: "Wider gap between conservative and upper reference strengths.",
  },
  {
    id: "TS_basis",
    symbol: "TS_basis",
    name: "Active tensile-strength basis",
    description:
      "Tensile-strength basis currently used for stress ratio display: utilization = τ / TS_basis. Not an allowable shear-stress value.",
    unit: "psi",
    category: "material",
    source: "User-selected guidance basis",
    min: 1e5,
    max: 5e5,
    step: 1e3,
    whatIfIncrease: "Displayed τ/TS ratio decreases proportionally.",
    note: "Default uses conservative 270 ksi for Elgiloy first-pass screening.",
  },

  // ── Constraint / derived checks ──────────────────────────────────────────
  {
    id: "Kw",
    symbol: "K_w",
    name: "Wahl correction factor",
    description:
      "Correction for wire curvature and direct shear, applied to the nominal torsional stress. Grows as the spring index gets small.",
    unit: "—",
    category: "constraint",
    formula: "K_w = (4C − 1)/(4C − 4) + 0.615/C",
    dependencies: ["C"],
    whatIfIncrease: "Corrected stress rises for the same load.",
  },
  {
    id: "tau",
    symbol: "τ",
    name: "Corrected shear stress",
    description:
      "Wahl-corrected shear stress in the wire at the spring's maximum axial operating load F1. (Uses F1 — never a latch/impact force.)",
    unit: "psi",
    category: "constraint",
    formula: "τ = K_w · 8·F1·D / (π·d³)",
    dependencies: ["Kw", "F1", "D", "d"],
    sensitivity: "F1 ↑ → τ ↑ · D ↑ → τ ↑ · d ↑ → τ ↓ strongly (cube)",
    whatIfIncrease: "Higher τ/TS ratio and less room before the redesign band.",
  },
  {
    id: "utilization",
    symbol: "τ/TS_basis",
    name: "Stress ratio vs TS basis",
    description:
      "Ratio of corrected shear stress to the selected tensile-strength basis. Guidance bands: ≤40% low, 40–60% set/preset, >60% redesign.",
    unit: "—",
    category: "constraint",
    formula: "utilization = τ / TS_basis",
    dependencies: ["tau", "TS_basis"],
    whatIfIncrease:
      "Crossing above 60% indicates redesign territory for this first-pass Elgiloy guidance basis.",
  },
  {
    id: "solid_tolerance",
    symbol: "tol_solid",
    name: "Solid-height tolerance factor",
    description:
      "Manufacturing allowance applied to nominal solid height when defining maximum solid height. Default 0.05 gives H_s,max = 1.05·H_s,nom.",
    unit: "—",
    category: "constraint",
    min: 0,
    max: 0.25,
    step: 0.005,
    formula: "H_s,max = (1 + tol_solid)·H_s,nom",
    dependencies: ["Hs", "Hs_max"],
    whatIfIncrease: "Raises the Lee maximum solid boundary and reduces remaining run-up room.",
  },
  {
    id: "Hs_max",
    symbol: "H_s,max",
    name: "Maximum solid height (Lee boundary)",
    description:
      "Maximum solid-height boundary including tolerance: H_s,max = (1 + tol_solid)·H_s,nom.",
    unit: "in",
    category: "constraint",
    formula: "H_s,max = (1 + tol_solid)·H_s,nom",
    dependencies: ["Hs", "solid_tolerance"],
    whatIfIncrease: "Less remaining compression margin at fixed L_min.",
  },
  {
    id: "clearance",
    symbol: "c_solid",
    name: "Clearance above solid",
    description:
      "Gap between the most-compressed operating length and Lee maximum solid height: c_solid = L_min − H_s,max.",
    unit: "in",
    category: "constraint",
    formula: "c_solid = L_min − H_s,max",
    dependencies: ["L_min", "Hs_max"],
    whatIfIncrease: "More margin above the Lee maximum solid-height boundary.",
  },
  {
    id: "c_extra",
    symbol: "c_extra",
    name: "Additional operating/vendor clearance",
    description:
      "Additional clearance margin above the Lee maximum solid-height boundary. c_extra = 0 is a theoretical tolerance boundary, not a finished aerospace margin recommendation.",
    unit: "in",
    category: "constraint",
    min: 0,
    max: 0.5,
    step: 0.01,
    formula: "L_min >= H_s,max + c_extra",
    whatIfIncrease: "Stricter bind margin; the design needs more installed compression room.",
  },
];

export const PARAMETER_MAP: Record<string, ParameterDefinition> = Object.fromEntries(
  PARAMETERS.map((p) => [p.id, p]),
);

export function getParameter(id: string): ParameterDefinition {
  const def = PARAMETER_MAP[id];
  if (!def) throw new Error(`Unknown parameter id: ${id}`);
  return def;
}
