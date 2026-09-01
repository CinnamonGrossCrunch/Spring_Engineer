import { inLbfToFtLbf, velocityFromKE, momentum, kineticEnergy } from "@/lib/engineering/hammer";
import type { V2Candidate, V2Scenario } from "./types";

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
  /** Latch kinetic energy immediately after the assumed 1-D collision [ft·lbf]. */
  latchPostImpactKE: number | undefined;
  /** Hammer kinetic energy immediately after the assumed 1-D collision [ft·lbf]. */
  hammerPostImpactKE: number | undefined;
  /** Total translational KE of hammer + latch immediately after collision [ft·lbf]. */
  combinedPostImpactKE: number | undefined;
  /** Total post-impact translational KE plus follow-through spring work [in·lbf]. */
  coupledDriveWork: number | undefined;
  /** Coupled-drive energy divided by the known latch travel [lbf]. */
  coupledAverageEquivalent: number | undefined;
  /** 2× coupled average, only for a triangular force-over-travel assumption [lbf]. */
  coupledTriangularPeakEquivalent: number | undefined;
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
  hammerMass: number | undefined,
  latchMass?: number | undefined,
  restitution = 0,
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
      latchPostImpactKE: undefined,
      hammerPostImpactKE: undefined,
      combinedPostImpactKE: undefined,
      coupledDriveWork: undefined,
      coupledAverageEquivalent: undefined,
      coupledTriangularPeakEquivalent: undefined,
    };
  }

  const WhammerAvailable = eta * candidate.Whammer;
  const WreleaseEta = eta * candidate.WreleaseIdeal;
  const KE = inLbfToFtLbf(WhammerAvailable); // ft·lbf
  const hasHammerMass = hammerMass !== undefined && Number.isFinite(hammerMass) && hammerMass > 0;
  const hasLatchMass = latchMass !== undefined && Number.isFinite(latchMass) && latchMass > 0;
  const velocity = hasHammerMass && KE > 0 ? velocityFromKE(KE, hammerMass!) : undefined;
  const p = velocity !== undefined ? momentum(hammerMass!, velocity) : undefined;
  const e = Math.max(0, Math.min(1, restitution));
  const latchVelocity = velocity !== undefined && hasLatchMass
    ? ((1 + e) * hammerMass! / (hammerMass! + latchMass!)) * velocity
    : undefined;
  const hammerVelocityAfterImpact = velocity !== undefined && hasLatchMass
    ? ((hammerMass! - e * latchMass!) / (hammerMass! + latchMass!)) * velocity
    : undefined;
  const latchPostImpactKE = latchVelocity === undefined
    ? undefined
    : kineticEnergy(latchMass!, latchVelocity);
  const hammerPostImpactKE = hammerVelocityAfterImpact === undefined
    ? undefined
    : kineticEnergy(hammerMass!, hammerVelocityAfterImpact);
  const combinedPostImpactKE = latchPostImpactKE === undefined || hammerPostImpactKE === undefined
    ? undefined
    : latchPostImpactKE + hammerPostImpactKE;
  const coupledDriveWork = combinedPostImpactKE === undefined
    ? undefined
    : combinedPostImpactKE * 12 + eta * candidate.Wlatch;
  const coupledAverageEquivalent =
    coupledDriveWork !== undefined && candidate.L3 > candidate.L2
      ? coupledDriveWork / (candidate.L3 - candidate.L2)
      : undefined;

  return {
    etaMode,
    eta,
    WhammerAvailable,
    WreleaseEta,
    KE,
    velocity,
    momentum: p,
    latchPostImpactKE,
    hammerPostImpactKE,
    combinedPostImpactKE,
    coupledDriveWork,
    coupledAverageEquivalent,
    coupledTriangularPeakEquivalent:
      coupledAverageEquivalent === undefined ? undefined : 2 * coupledAverageEquivalent,
  };
}

/** Shared-scenario convenience wrapper (100% efficiency is the default scenario assumption). */
export function applyScenarioImpactLens(candidate: V2Candidate, scenario: V2Scenario): V2ImpactLens {
  return applyImpactLens(
    candidate,
    "assumed",
    Math.max(0, Math.min(1, scenario.impactEfficiency)),
    scenario.hammerMassLbm ?? undefined,
    scenario.latchMassLbm ?? undefined,
    scenario.impactRestitution,
  );
}
