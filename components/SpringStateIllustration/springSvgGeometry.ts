/**
 * Pure SVG geometry for the parametric compression-spring schematic.
 *
 * This module contains NO engineering equations — it only maps
 * already-solved engineering values (wire diameter, mean diameter, total
 * coils, current loaded length) into an SVG path. The engineering model
 * (lib/engineering) remains the single source of truth.
 */

export interface SpringPathSpec {
  /** Wire diameter d (engineering units, in). */
  wireDiameter: number;
  /** Mean coil diameter D (engineering units, in). */
  meanDiameter: number;
  /** Total coils N_t — fractional values are rendered faithfully. */
  totalCoils: number;
  /** Current loaded length of the spring (engineering units, in). */
  currentLength: number;
}

/** True when the spec can produce sensible geometry. */
export function isRenderableSpring(spec: SpringPathSpec): boolean {
  const { wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength: L } = spec;
  return (
    [d, D, Nt, L].every((n) => typeof n === "number" && Number.isFinite(n) && n > 0) && D > d
  );
}

export interface SpringPathResult {
  /** SVG path data for the spring centerline. */
  path: string;
  /**
   * Rendered wire thickness in px. Visual-only clamp: a minimum of 1.25 px
   * keeps very thin wire visible on screen. This clamp NEVER feeds back
   * into the engineering model — it is purely presentational.
   */
  strokeWidthPx: number;
}

/**
 * Build a stylized elevation of a compression spring as a sinusoidal
 * centerline:
 *
 *   x(φ) = centerX + (D/2)·px · sin(2π·φ)      φ ∈ [0, N_t]
 *   y(φ) = bottomY − height(φ)·px
 *
 * Closed/ground ends are schematically represented by compressing
 * ~0.75 coil at each end to near-solid pitch (≈ one wire diameter of
 * length each); interior coils share the remaining length uniformly.
 * The interior coil count is NOT distorted — the drawn turn count always
 * equals N_t.
 *
 * Returns null when the spec is invalid or would produce NaN/Infinity.
 */
export function buildSpringPath(
  spec: SpringPathSpec,
  centerX: number,
  bottomY: number,
  pxPerUnit: number,
): SpringPathResult | null {
  if (!isRenderableSpring(spec) || !Number.isFinite(pxPerUnit) || pxPerUnit <= 0) return null;
  const { wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength: L } = spec;

  const amplitude = (D / 2) * pxPerUnit;

  // Schematic closed/ground end treatment.
  const endCoils = Math.min(0.75, Nt / 4);
  const endHeight = Math.min(d, L / 4); // length consumed by each closed end
  const innerCoils = Nt - 2 * endCoils;
  const innerHeight = L - 2 * endHeight;

  const heightAt = (phi: number): number => {
    if (innerCoils <= 0 || innerHeight <= 0) return (phi / Nt) * L; // fallback: uniform pitch
    if (phi <= endCoils) return (phi / endCoils) * endHeight;
    if (phi >= Nt - endCoils) {
      return L - endHeight + ((phi - (Nt - endCoils)) / endCoils) * endHeight;
    }
    return endHeight + ((phi - endCoils) / innerCoils) * innerHeight;
  };

  const samples = Math.max(64, Math.ceil(Nt * 28));
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const phi = (i / samples) * Nt;
    const x = centerX + amplitude * Math.sin(2 * Math.PI * phi);
    const y = bottomY - heightAt(phi) * pxPerUnit;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return {
    path: `M ${pts.join(" L ")}`,
    strokeWidthPx: Math.max(1.25, d * pxPerUnit),
  };
}
