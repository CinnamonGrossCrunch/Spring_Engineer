import type { Equation } from "./types";
import {
  springRate,
  shearModulusFromRate,
  wireDiameterFromRate,
  meanDiameterFromRate,
  activeCoilsFromRate,
  wahlFactor,
  shearStress,
  runUpWork,
} from "./spring";
import { velocityFromKE, massFromKE, kineticEnergy, inLbfToFtLbf } from "./hammer";

/**
 * Declarative equation system.
 *
 * Each equation lists its participating parameters and a solver per
 * solvable variable. The solver engine (solver.ts):
 *   - computes a variable when it is the only unknown,
 *   - checks the residual when everything is known,
 *   - surfaces overconstraint conflicts instead of overwriting pinned values.
 *
 * Redundant composite forms (e.g. F2 = k·(x1 − s_h)) are included on purpose:
 * they let single-unknown propagation solve reverse-design cases that would
 * otherwise require simultaneous equations. They are algebraically implied by
 * the primary forms, so residual checks remain consistent.
 */
export const EQUATIONS: Equation[] = [
  // ── Hooke's law at the cocked state ─────────────────────────────────────
  {
    id: "hooke_F1",
    name: "Hooke's law (start state)",
    expression: "F1 = k·x1",
    variables: ["F1", "k", "x1"],
    solvers: {
      F1: (v) => v.k * v.x1,
      k: (v) => v.F1 / v.x1,
      x1: (v) => v.F1 / v.k,
    },
  },

  // ── Deflection / free length / loaded length ────────────────────────────
  {
    id: "deflection",
    name: "Deflection from free length",
    expression: "x1 = L_f − L_min",
    variables: ["x1", "L_free", "L_min"],
    solvers: {
      x1: (v) => v.L_free - v.L_min,
      L_free: (v) => v.L_min + v.x1,
      L_min: (v) => v.L_free - v.x1,
    },
  },
  {
    id: "loaded_length_contact",
    name: "Loaded length at hammer contact",
    expression: "L2 = L_min + s_h",
    variables: ["L2", "L_min", "s_h"],
    solvers: {
      L2: (v) => v.L_min + v.s_h,
      L_min: (v) => v.L2 - v.s_h,
      s_h: (v) => v.L2 - v.L_min,
    },
    note: "V1 assumes 1:1 spring-to-hammer displacement.",
  },
  {
    id: "loaded_length_release",
    name: "Loaded length after latch travel",
    expression: "L3 = L2 + y_latch",
    variables: ["L3", "L2", "y_latch"],
    solvers: {
      L3: (v) => v.L2 + v.y_latch,
      L2: (v) => v.L3 - v.y_latch,
      y_latch: (v) => v.L3 - v.L2,
    },
    note: "V1 assumes continuous spring drive through latch travel.",
  },

  // ── Force states through mechanism travel ───────────────────────────────
  {
    id: "force_contact",
    name: "Spring force at hammer contact",
    expression: "F2 = F1 − k·s_h",
    variables: ["F2", "F1", "k", "s_h"],
    solvers: {
      F2: (v) => v.F1 - v.k * v.s_h,
      F1: (v) => v.F2 + v.k * v.s_h,
      k: (v) => (v.F1 - v.F2) / v.s_h,
      s_h: (v) => (v.F1 - v.F2) / v.k,
    },
    note: "Assumes 1:1 spring-to-hammer displacement (V1).",
  },
  {
    id: "force_contact_composite",
    name: "Contact force (composite form)",
    expression: "F2 = k·(x1 − s_h)",
    variables: ["F2", "k", "x1", "s_h"],
    solvers: {
      F2: (v) => v.k * (v.x1 - v.s_h),
      k: (v) => v.F2 / (v.x1 - v.s_h),
      x1: (v) => v.s_h + v.F2 / v.k,
      s_h: (v) => v.x1 - v.F2 / v.k,
    },
    note: "Algebraically implied by F1 = k·x1 and F2 = F1 − k·s_h; enables reverse design.",
  },
  {
    id: "force_release",
    name: "Spring force after latch travel",
    expression: "F3 = F2 − k·y_latch",
    variables: ["F3", "F2", "k", "y_latch"],
    solvers: {
      F3: (v) => v.F2 - v.k * v.y_latch,
      F2: (v) => v.F3 + v.k * v.y_latch,
      k: (v) => (v.F2 - v.F3) / v.y_latch,
      y_latch: (v) => (v.F2 - v.F3) / v.k,
    },
    note: "Assumes continuous spring drive through latch travel (V1).",
  },
  {
    id: "force_release_composite",
    name: "Release force (composite form)",
    expression: "F3 = k·(x1 − s_h − y_latch)",
    variables: ["F3", "k", "x1", "s_h", "y_latch"],
    solvers: {
      F3: (v) => v.k * (v.x1 - v.s_h - v.y_latch),
      k: (v) => v.F3 / (v.x1 - v.s_h - v.y_latch),
      x1: (v) => v.s_h + v.y_latch + v.F3 / v.k,
    },
  },

  // ── Spring rate from geometry/material ──────────────────────────────────
  {
    id: "spring_rate",
    name: "Spring rate",
    expression: "k = G·d⁴ / (8·D³·N_a)",
    variables: ["k", "G", "d", "D", "Na"],
    solvers: {
      k: (v) => springRate(v.G, v.d, v.D, v.Na),
      G: (v) => shearModulusFromRate(v.k, v.d, v.D, v.Na),
      d: (v) => wireDiameterFromRate(v.k, v.G, v.D, v.Na),
      D: (v) => meanDiameterFromRate(v.k, v.G, v.d, v.Na),
      Na: (v) => activeCoilsFromRate(v.k, v.G, v.d, v.D),
    },
  },

  // ── Coil geometry ────────────────────────────────────────────────────────
  {
    id: "outer_diameter",
    name: "Outer diameter",
    expression: "OD = D + d",
    variables: ["OD", "D", "d"],
    solvers: {
      OD: (v) => v.D + v.d,
      D: (v) => v.OD - v.d,
      d: (v) => v.OD - v.D,
    },
  },
  {
    id: "inner_diameter",
    name: "Inner diameter",
    expression: "ID = D − d",
    variables: ["ID", "D", "d"],
    solvers: {
      ID: (v) => v.D - v.d,
      D: (v) => v.ID + v.d,
      d: (v) => v.D - v.ID,
    },
  },
  {
    id: "spring_index",
    name: "Spring index",
    expression: "C = D / d",
    variables: ["C", "D", "d"],
    solvers: {
      C: (v) => v.D / v.d,
      D: (v) => v.C * v.d,
      d: (v) => v.D / v.C,
    },
  },
  {
    id: "total_coils",
    name: "Total coils (closed & ground approx.)",
    expression: "N_t ≈ N_a + 2",
    variables: ["Nt", "Na"],
    solvers: {
      Nt: (v) => v.Na + 2,
      Na: (v) => v.Nt - 2,
    },
    note: "End-configuration dependent approximation, not a universal spring law.",
  },
  {
    id: "solid_height",
    name: "Solid height (closed & ground approx.)",
    expression: "H_s ≈ N_t·d",
    variables: ["Hs", "Nt", "d"],
    solvers: {
      Hs: (v) => v.Nt * v.d,
      Nt: (v) => v.Hs / v.d,
      d: (v) => v.Hs / v.Nt,
    },
  },
  {
    id: "solid_clearance",
    name: "Clearance above solid",
    expression: "c_solid = L_min − H_s",
    variables: ["clearance", "L_min", "Hs"],
    solvers: {
      clearance: (v) => v.L_min - v.Hs,
      L_min: (v) => v.clearance + v.Hs,
      Hs: (v) => v.L_min - v.clearance,
    },
  },

  // ── Stress ───────────────────────────────────────────────────────────────
  {
    id: "wahl_factor",
    name: "Wahl correction factor",
    expression: "K_w = (4C − 1)/(4C − 4) + 0.615/C",
    variables: ["Kw", "C"],
    solvers: {
      Kw: (v) => wahlFactor(v.C),
    },
  },
  {
    id: "shear_stress",
    name: "Corrected shear stress",
    expression: "τ = K_w·8·F1·D / (π·d³)",
    variables: ["tau", "Kw", "F1", "D", "d"],
    solvers: {
      tau: (v) => shearStress(v.Kw, v.F1, v.D, v.d),
      F1: (v) => (v.tau * Math.PI * Math.pow(v.d, 3)) / (v.Kw * 8 * v.D),
    },
    note: "Uses the spring's max axial operating load F1 — never latch/impact force.",
  },
  {
    id: "stress_utilization",
    name: "Stress utilization",
    expression: "utilization = τ / τ_allow",
    variables: ["utilization", "tau", "tau_allow"],
    solvers: {
      utilization: (v) => v.tau / v.tau_allow,
      tau_allow: (v) => v.tau / v.utilization,
    },
  },

  // ── Energy lens (optional, explicitly assumption-based) ─────────────────
  {
    id: "run_up_work",
    name: "Spring work over run-up",
    expression: "W_run = F1·s_h − ½·k·s_h²",
    variables: ["W_run", "F1", "k", "s_h"],
    solvers: {
      W_run: (v) => runUpWork(v.F1, v.k, v.s_h),
    },
  },
  {
    id: "impact_energy",
    name: "Hammer KE at contact (energy lens)",
    expression: "KE = η·W_run",
    variables: ["KE", "eta", "W_run"],
    solvers: {
      KE: (v) => v.eta * inLbfToFtLbf(v.W_run),
      eta: (v) => v.KE / inLbfToFtLbf(v.W_run),
      W_run: (v) => (12 * v.KE) / v.eta,
    },
    note: "The physical equation is KE = η·W_run. Unit conversion is handled internally in the implementation layer.",
  },
  {
    id: "kinetic_energy",
    name: "Kinetic energy ↔ velocity",
    expression: "KE = ½·(m/g_c)·v²",
    variables: ["KE", "m", "v"],
    solvers: {
      KE: (v) => kineticEnergy(v.m, v.v),
      v: (v) => velocityFromKE(v.KE, v.m),
      m: (v) => massFromKE(v.KE, v.v),
    },
  },
  {
    id: "momentum",
    name: "Momentum",
    expression: "p = m·v",
    variables: ["p", "m", "v"],
    solvers: {
      p: (v) => v.m * v.v,
      m: (v) => v.p / v.v,
      v: (v) => v.p / v.m,
    },
  },
];

export const EQUATION_MAP: Record<string, Equation> = Object.fromEntries(
  EQUATIONS.map((e) => [e.id, e]),
);

/** Equations a given parameter participates in (for the inspector). */
export function equationsFor(parameterId: string): Equation[] {
  return EQUATIONS.filter((e) => e.variables.includes(parameterId));
}
