/**
 * Contract between the V2 UI and the companion Python CAD service.
 *
 * Mirrors `cad-service/app/schemas.py`. Requests carry INCHES, because that is
 * what V2 speaks; the service converts to millimetres once at its boundary and
 * exports STEP in mm.
 *
 * The service does not need k, F0, F2, F3 or stress to build geometry. Those
 * ride along in `performance` for the manifest only, so CAD can never be
 * accused of recomputing the optimisation physics.
 */

/** The four mechanism states a candidate can be rendered in. */
export type SpringConfiguration = "free" | "armed" | "contact" | "release";

/**
 * How the output should be delivered.
 * - `single` — one STEP per state; falls back to a ZIP when several states
 *   are selected, so a request can never succeed with nothing to download.
 * - `zip` — always a ZIP (STEP files + manifest + README).
 * - `assembly-step` — one STEP assembly with the states side by side.
 */
export type CadPackageMode = "single" | "zip" | "assembly-step";

/** Only one end model exists today; the field keeps later ones additive. */
export type EndModelVersion = "squared-ground-v1";

/** Winding direction. Explicit so left-hand springs need no schema change. */
export type Handedness = "right" | "left";

/** Candidate geometry, inches. Redundant values are cross-checked both sides. */
export interface SpringGeometry {
  /** Wire diameter d [in] */
  wireDiameterIn: number;
  /** Mean coil diameter D [in] */
  meanDiameterIn: number;
  /** Outside diameter OD [in] */
  outerDiameterIn: number;
  /** Inside diameter ID [in] */
  innerDiameterIn: number;
  /** Active coils Na */
  activeCoils: number;
  /** Total coils Nt */
  totalCoils: number;
}

/** The four state lengths, inches. Computed by V2, never recomputed downstream. */
export interface SpringStates {
  /** Free length Lf [in] */
  freeLengthIn: number;
  /** Armed / compressed length Lc [in] */
  armedLengthIn: number;
  /** Hammer contact length L2 [in] */
  contactLengthIn: number;
  /** Latch follow-through length L3 [in] */
  releaseLengthIn: number;
}

/** V2 performance values. Manifest provenance only — never drives geometry. */
export interface CadPerformanceMeta {
  k: number;
  F0: number;
  F2: number;
  F3: number;
  Whammer: number;
  Wlatch: number;
  WreleaseIdeal: number;
  stressPctConservative: number;
}

export interface CadSpringRequest {
  candidateKey: string;
  geometry: SpringGeometry;
  states: SpringStates;
  configurations: SpringConfiguration[];
  endModel: EndModelVersion;
  handedness: Handedness;
  packageMode: CadPackageMode;
  performance?: CadPerformanceMeta;
  materialName?: string;
}

/**
 * One artifact to hand the user.
 *
 * The service decides what the download should be, so the client never has to
 * infer it from the package mode. Download every entry in `files`.
 */
export interface CadFile {
  filename: string;
  /** Base64-encoded file bytes. */
  content: string;
  /** MIME type to use for the Blob, e.g. `application/step`. */
  contentType: string;
  /** Present when the file is a single-state STEP. */
  configuration?: SpringConfiguration | null;
  byteLength: number;
}

export interface CadSpringResponse {
  success: true;
  candidateKey: string;
  configurations: SpringConfiguration[];
  packageMode: CadPackageMode;
  files: CadFile[];
  /** Full provenance: geometry, tolerances, end-model params, validation. */
  manifest: Record<string, unknown>;
  /** Non-fatal notes worth showing, e.g. a state sitting at solid height. */
  warnings: string[];
}

export interface CadErrorResponse {
  success: false;
  code: string;
  message: string;
  details: string[];
  candidateKey?: string;
}

export type CadResponse = CadSpringResponse | CadErrorResponse;

export interface CadHealthResponse {
  status: "ok" | "degraded";
  cadKernel: string;
  library: string;
  libraryVersion: string;
  generatorVersion: string;
  endModelVersion: string;
  timestamp: string;
}

/** Display copy for each configuration, shared by the modal and downloads. */
export const CONFIGURATION_LABELS: Record<
  SpringConfiguration,
  { label: string; symbol: string; description: string }
> = {
  free: { label: "Free", symbol: "Lf", description: "Unloaded spring" },
  armed: {
    label: "Armed / Compressed",
    symbol: "Lc",
    description: "Maximum operating load state",
  },
  contact: { label: "Hammer Contact", symbol: "L2", description: "After hammer run-up" },
  release: {
    label: "Latch Follow-Through",
    symbol: "L3",
    description: "After release travel",
  },
};

export const ALL_CONFIGURATIONS: SpringConfiguration[] = [
  "free",
  "armed",
  "contact",
  "release",
];

/**
 * End-model heuristics shown read-only in Advanced CAD Options.
 *
 * These mirror `CAD_END_MODEL_V1` in the service. They are CAD representation
 * settings, not mechanism optimisation inputs, and not vendor requirements.
 */
export const END_MODEL_V1_DISPLAY = {
  version: "squared-ground-v1" as const,
  endTurnsPerSide: 1.0,
  closedTurns: 0.75,
  transitionTurns: 0.25,
  grindDepthFraction: 0.5,
};

/** Shown wherever the four states are presented, per the epistemic policy. */
export const STATE_REPRESENTATION_DISCLAIMER =
  "Geometric configuration representation — not nonlinear spring deformation simulation.";
