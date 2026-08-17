/**
 * Pure compression-spring math helpers (Imperial units).
 * Kept dependency-free so they are trivially testable.
 */

/** Spring rate k = G·d⁴ / (8·D³·N_a)  [lbf/in] */
export function springRate(G: number, d: number, D: number, Na: number): number {
  return (G * Math.pow(d, 4)) / (8 * Math.pow(D, 3) * Na);
}

/** Solve shear modulus from the rate equation. */
export function shearModulusFromRate(k: number, d: number, D: number, Na: number): number {
  return (8 * k * Math.pow(D, 3) * Na) / Math.pow(d, 4);
}

/** Solve wire diameter from the rate equation. */
export function wireDiameterFromRate(k: number, G: number, D: number, Na: number): number {
  return Math.pow((8 * k * Math.pow(D, 3) * Na) / G, 0.25);
}

/** Solve mean coil diameter from the rate equation. */
export function meanDiameterFromRate(k: number, G: number, d: number, Na: number): number {
  return Math.cbrt((G * Math.pow(d, 4)) / (8 * k * Na));
}

/** Solve active coils from the rate equation. */
export function activeCoilsFromRate(k: number, G: number, d: number, D: number): number {
  return (G * Math.pow(d, 4)) / (8 * Math.pow(D, 3) * k);
}

/** Spring index C = D/d. */
export function springIndex(D: number, d: number): number {
  return D / d;
}

/** Wahl correction factor K_w = (4C−1)/(4C−4) + 0.615/C. Valid for C > 1. */
export function wahlFactor(C: number): number {
  return (4 * C - 1) / (4 * C - 4) + 0.615 / C;
}

/**
 * Wahl-corrected shear stress τ = K_w · 8·F·D / (π·d³)  [psi].
 * F must be the spring's maximum AXIAL operating load — never a latch or
 * impact force.
 */
export function shearStress(Kw: number, F: number, D: number, d: number): number {
  return (Kw * 8 * F * D) / (Math.PI * Math.pow(d, 3));
}

/** Solid height for closed-and-ground ends (approximation): H_s ≈ N_t·d. */
export function solidHeight(Nt: number, d: number): number {
  return Nt * d;
}

/**
 * Work done by a linear spring over the hammer run-up stroke [in·lbf]:
 * W_run = F1·s_h − ½·k·s_h²
 */
export function runUpWork(F1: number, k: number, s_h: number): number {
  return F1 * s_h - 0.5 * k * s_h * s_h;
}

/** Spring energy change ΔU = ½·k·(x1² − x2²)  [in·lbf]. */
export function springEnergyChange(k: number, x1: number, x2: number): number {
  return 0.5 * k * (x1 * x1 - x2 * x2);
}
