import { inLbfToFtLbf, velocityFromKE, momentum } from "@/lib/engineering/hammer";
import type { V2Candidate } from "./types";

/**
 * OPTIONAL Advanced Impact Lens — NOT part of the primary V2 optimization.
 *
 * The default V2 metric operates on IDEAL spring work. This lens layers an
 * assumed/measured hammer transfer efficiency and (secondarily) hammer mass on
 * top of an already-selected candidate. The ideal and efficiency-adjusted
 * numbers are always kept visually distinct so an assumed η never looks like a
 * measured result.
 */
export type V2EtaMode = "unspecified" | "ideal" | "assumed" | "measured";

export interface V2ImpactLens {
  etaMode: V2EtaMode;
  /** Effective efficiency (1.0 for ideal; the entered value for assumed/measured). */
  eta: number | undefined;
  /** η · W_hammer — energy available to the hammer before contact [in·lbf]. */
  WhammerAvailable: number | undefined;
  /** η · W_hammer + W_latch — efficiency-adjusted release proxy [in·lbf]. */
  WreleaseEta: number | undefined;
  /** Hammer kinetic energy from the available run-up work [ft·lbf]. */
  KE: number | undefined;
  /** Hammer velocity at contact [ft/s] (requires mass). */
  velocity: number | undefined;
  /** Hammer momentum at contact [lbm·ft/s] (requires mass). */
  momentum: number | undefined;
}

/**
 * Apply the impact lens to a candidate. `mass` (lbm) is only needed for the
 * secondary velocity/momentum outputs — it is NOT required to evaluate the
 * spring geometry or the ideal release metrics.
 */
export function applyImpactLens(
  candidate: V2Candidate,
  etaMode: V2EtaMode,
  etaValue: number,
  mass: number | undefined,
): V2ImpactLens {
  const eta = etaMode === "ideal" ? 1.0 : etaMode === "unspecified" ? undefined : etaValue;

  if (eta === undefined) {
    return {
      etaMode,
      eta: undefined,
      WhammerAvailable: undefined,
      WreleaseEta: undefined,
      KE: undefined,
      velocity: undefined,
      momentum: undefined,
    };
  }

  const WhammerAvailable = eta * candidate.Whammer;
  const WreleaseEta = WhammerAvailable + candidate.Wlatch;
  const KE = inLbfToFtLbf(WhammerAvailable); // ft·lbf
  const hasMass = mass !== undefined && Number.isFinite(mass) && mass > 0;
  const velocity = hasMass && KE > 0 ? velocityFromKE(KE, mass!) : undefined;
  const p = velocity !== undefined ? momentum(mass!, velocity) : undefined;

  return {
    etaMode,
    eta,
    WhammerAvailable,
    WreleaseEta,
    KE,
    velocity,
    momentum: p,
  };
}
