/**
 * CAD Generation Types and Request/Response Schemas
 *
 * Defines the clean boundary between the V2 TypeScript frontend and the
 * Python CAD service. All units in requests are INCHES (matching V2).
 * The CAD service converts to millimeters internally for B-rep generation
 * and exports STEP with explicit MM units.
 */

/**
 * Supported spring configurations.
 * These correspond to the four spring states in the V2 mechanism.
 */
export type SpringConfiguration = "free" | "armed" | "contact" | "release";

/**
 * Package mode for CAD output.
 */
export type CadPackageMode = "single" | "zip" | "assembly-step";

/**
 * End model version identifier.
 * Currently only "squared-ground-v1" is implemented.
 */
export type EndModelVersion = "squared-ground-v1";

/**
 * Spring handedness (winding direction).
 * Default is "right" for right-handed winding.
 */
export type Handedness = "right" | "left";

/**
 * Geometry specification derived from a V2 candidate.
 * All dimensions in INCHES.
 */
export interface SpringGeometry {
  /** Wire diameter [in] */
  wireDiameterIn: number;
  /** Mean coil diameter [in] */
  meanDiameterIn: number;
  /** Outside diameter [in] */
  outerDiameterIn: number;
  /** Inside diameter [in] */
  innerDiameterIn: number;
  /** Active coils */
  activeCoils: number;
  /** Total coils */
  totalCoils: number;
}

/**
 * Spring state lengths for the four configurations.
 * All dimensions in INCHES.
 */
export interface SpringStates {
  /** Free length [in] */
  freeLengthIn: number;
  /** Armed / compressed length [in] */
  armedLengthIn: number;
  /** Hammer contact length [in] */
  contactLengthIn: number;
  /** Latch follow-through length [in] */
  releaseLengthIn: number;
}

/**
 * CAD request sent to the Python service.
 * This is the complete specification needed to generate spring geometry.
 */
export interface CadSpringRequest {
  /** Unique candidate identifier from V2 */
  candidateKey: string;

  /** Spring geometry (redundant values are validated) */
  geometry: SpringGeometry;

  /** Spring state lengths */
  states: SpringStates;

  /** Which configurations to generate */
  configurations: SpringConfiguration[];

  /** End model version */
  endModel: EndModelVersion;

  /** Spring winding direction */
  handedness: Handedness;

  /** Output package mode */
  packageMode: CadPackageMode;

  /** Optional: V2 performance metadata for manifest (not used for geometry) */
  performance?: {
    k: number; // spring rate [lbf/in]
    F0: number; // starting force [lbf]
    F2: number; // force at contact [lbf]
    F3: number; // force after follow-through [lbf]
    Whammer: number; // hammer work [in·lbf]
    Wlatch: number; // latch work [in·lbf]
    WreleaseIdeal: number; // ideal release work [in·lbf]
    stressPctConservative: number; // stress as fraction of conservative TS
  };

  /** Optional: material name for manifest */
  materialName?: string;
}

/**
 * Single STEP file output.
 */
export interface CadStepFile {
  filename: string;
  /** Base64-encoded STEP file content */
  content: string;
  /** Configuration this file represents */
  configuration: SpringConfiguration;
}

/**
 * Metadata about the CAD generation.
 */
export interface CadGenerationMetadata {
  candidateKey: string;
  timestamp: string; // ISO 8601
  cadGeneratorVersion: string;
  endModelVersion: string;
  geometry: SpringGeometry;
  states: SpringStates;
  performance?: CadSpringRequest["performance"];
  materialName?: string;
  handedness: Handedness;
  configurations: SpringConfiguration[];
  validationNotes: string[];
  disclaimers: string[];
}

/**
 * Successful CAD generation response.
 */
export interface CadSpringResponse {
  success: true;
  candidateKey: string;
  configurations: SpringConfiguration[];
  files: CadStepFile[];
  /** When packageMode is "assembly-step", an assembly STEP file */
  assemblyFile?: CadStepFile;
  metadata: CadGenerationMetadata;
}

/**
 * Error response from CAD service.
 */
export interface CadErrorResponse {
  success: false;
  code: string;
  message: string;
  details: string[];
  candidateKey?: string;
}

export type CadResponse = CadSpringResponse | CadErrorResponse;

/**
 * Health check response from CAD service.
 */
export interface CadHealthResponse {
  status: "ok" | "degraded";
  cadKernel: string;
  library: string;
  libraryVersion: string;
  generatorVersion: string;
  timestamp: string;
}
