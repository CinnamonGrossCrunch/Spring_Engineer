/**
 * Hammer kinematics helpers (Imperial units).
 *
 * Mass is in lbm and velocity in ft/s, so kinetic energy uses the
 * gravitational conversion constant g_c = 32.174 lbm·ft/(lbf·s²):
 *   KE [ft·lbf] = ½ · (m/g_c) · v²
 *
 * NOTE: none of these relations determine peak dynamic contact force.
 * Peak impact force additionally depends on contact stiffness, collision
 * duration, deformation, rebound, friction and effective moving masses —
 * out of scope for V1.
 */

export const G_C = 32.174; // lbm·ft/(lbf·s²)

/** Kinetic energy [ft·lbf] from mass [lbm] and velocity [ft/s]. */
export function kineticEnergy(m: number, v: number): number {
  return (0.5 * m * v * v) / G_C;
}

/** Velocity [ft/s] from kinetic energy [ft·lbf] and mass [lbm]. */
export function velocityFromKE(KE: number, m: number): number {
  return Math.sqrt((2 * KE * G_C) / m);
}

/** Mass [lbm] from kinetic energy [ft·lbf] and velocity [ft/s]. */
export function massFromKE(KE: number, v: number): number {
  return (2 * KE * G_C) / (v * v);
}

/** Momentum [lbm·ft/s] = m [lbm] · v [ft/s]. */
export function momentum(m: number, v: number): number {
  return m * v;
}

/** Convert spring work [in·lbf] to [ft·lbf]. */
export function inLbfToFtLbf(w: number): number {
  return w / 12;
}
