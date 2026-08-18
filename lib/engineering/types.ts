/**
 * Core type definitions for the spring mechanism engineering model.
 *
 * The model is a small declarative equation system: parameters carry a
 * status (fixed / variable / derived / assumed) and equations declare which
 * parameters they relate and how to solve for each one. A deterministic
 * propagation pass computes derived values and surfaces overconstraint
 * conflicts instead of silently overwriting pinned values.
 */

export type ParameterStatus = "fixed" | "variable" | "derived" | "assumed";

export type ParameterCategory =
  | "requirement"
  | "hammer"
  | "spring-state"
  | "spring-geometry"
  | "material"
  | "constraint";

export interface ParameterDefinition {
  id: string;
  /** Short engineering symbol, e.g. "k" or "N_a". */
  symbol: string;
  name: string;
  /** Plain-English explanation of what the parameter means. */
  description: string;
  unit: string;
  category: ParameterCategory;
  /** Provenance / confidence note, e.g. "vendor datasheet" or "measured upstream". */
  source?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Human-readable governing formula, if any. */
  formula?: string;
  /** Parameter ids this value depends on (for the derived direction). */
  dependencies?: string[];
  /** Sensitivity summary, e.g. "d ↑ → k ↑ strongly (4th power)". */
  sensitivity?: string;
  /** Plain-English "what happens if this increases?" note. */
  whatIfIncrease?: string;
  /** Extra epistemic note shown in the inspector. */
  note?: string;
}

/** Live state of one parameter inside the model. */
export interface ParameterState {
  /** Undefined for derived parameters that have not been resolved yet. */
  value: number | undefined;
  status: ParameterStatus;
}

/** Map of parameter id → live state. */
export type ModelState = Record<string, ParameterState>;

/**
 * A declarative equation. `variables` lists every participating parameter.
 * `solvers` maps a parameter id to a function that computes it from the
 * remaining (known) variables. An equation only solves when exactly one of
 * its variables is unknown; when all are known its residual is checked.
 */
export interface Equation {
  id: string;
  name: string;
  /** Display form, e.g. "k = G·d⁴ / (8·D³·N_a)". */
  expression: string;
  variables: string[];
  solvers: Partial<Record<string, (v: Record<string, number>) => number>>;
  /**
   * Relative residual when all variables are known. Defaults to comparing
   * the first solver's output against the stored value.
   */
  residual?: (v: Record<string, number>) => number;
  note?: string;
}

/** Overconstraint or inconsistency surfaced by the solver. */
export interface Conflict {
  equationId: string;
  expression: string;
  /** All parameters participating in the conflicting equation. */
  parameterIds: string[];
  /** The subset that is pinned (fixed) — candidates to unpin. */
  fixedParameterIds: string[];
  message: string;
  residual: number;
}

export type ConstraintSeverity = "error" | "warning" | "info";

export interface ConstraintResult {
  id: string;
  name: string;
  ok: boolean;
  severity: ConstraintSeverity;
  message: string;
  /** Parameter ids involved, so the UI can highlight them. */
  parameterIds: string[];
}

export interface SolveResult {
  /** Resolved value for every parameter (undefined when unresolvable). */
  values: Record<string, number | undefined>;
  conflicts: Conflict[];
  /** Derived parameters the engine could not resolve from current knowns. */
  unresolved: string[];
}

export type DesignMode = "forward" | "reverse" | "explore";

/**
 * Presentation mode — orthogonal to DesignMode. Controls how the shared model
 * is presented (distilled Overview vs. full Engineering workbench). Switching
 * this NEVER mutates the model, solver state, statuses, equations or pins.
 */
export type PresentationView = "overview" | "engineering";

/**
 * Top-level workspace version — orthogonal to both DesignMode and
 * PresentationView. V1 is the existing explorer (Overview / Engineering over a
 * shared ModelState); V2 is a separate optimization workbench with its own
 * scenario state (see lib/v2). Switching workspaces never mutates the other
 * workspace's state. NOTE: this is deliberately NOT part of PresentationView —
 * V2 is not a third presentation of the V1 ModelState.
 */
export type WorkspaceVersion = "v1" | "v2";
