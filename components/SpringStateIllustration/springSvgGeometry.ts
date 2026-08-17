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
  /**
   * SVG path data for the active (interior) helix. Rendered with round joins
   * and caps so the wire reads as a continuous coil.
   */
  interiorPath: string;
  /**
   * Flat, closed-and-ground terminal seats: [bottomSeat, topSeat]. Rendered
   * with BUTT line caps so the ends read as squared ground faces rather than
   * bulbous rounded tips. The bottom seat lies exactly on the datum (bottomY).
   */
  seatPaths: string[];
  /**
   * Rendered wire thickness in px. Visual-only clamp: a minimum of 1.25 px
   * keeps very thin wire visible on screen. This clamp NEVER feeds back
   * into the engineering model — it is purely presentational.
   */
  strokeWidthPx: number;
}

/**
 * Build a stylized elevation of a compression spring.
 *
 * The active coils are drawn as a sinusoidal centerline:
 *
 *   x(φ) = centerX + (D/2)·px · sin(2π·φ)      φ ∈ [0, N_t]
 *   y(φ) = bottomY − height(φ)·px
 *
 * inset from the extreme ends by a small `seatRise`. Closed-and-ground ends
 * are then represented by SEPARATE flat terminal seats: a horizontal ground
 * face at the datum (bottom) and at the top plane, each finished with a butt
 * cap so the ends look squared/flat rather than rounded. The drawn turn count
 * always equals N_t (never distorted), and the bottom seat sits on the datum.
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
  const totalH = L * pxPerUnit;
  if (totalH <= 0) return null;
  const strokeWidthPx = Math.max(1.25, d * pxPerUnit);

  // Vertical span consumed by each flat ground seat (near-solid terminal coil).
  // Kept small so the seats hug the datum / top plane.
  const seatRise = Math.min(Math.max(strokeWidthPx * 0.9, 3), totalH * 0.16);
  const bodyH = Math.max(totalH - 2 * seatRise, totalH * 0.4);

  // Active-coil easing: compress ~0.75 coil at each end toward the seat so the
  // helix transitions smoothly into the flat ground faces. Interior coils share
  // the remaining body height uniformly. Turn count stays N_t.
  const endCoils = Math.min(0.75, Nt / 4);
  const endH = Math.min(strokeWidthPx, bodyH / 4);
  const innerCoils = Nt - 2 * endCoils;
  const innerH = bodyH - 2 * endH;

  const easeH = (phi: number): number => {
    if (innerCoils <= 0 || innerH <= 0) return (phi / Nt) * bodyH; // fallback: uniform pitch
    if (phi <= endCoils) return (phi / endCoils) * endH;
    if (phi >= Nt - endCoils) {
      return bodyH - endH + ((phi - (Nt - endCoils)) / endCoils) * endH;
    }
    return endH + ((phi - endCoils) / innerCoils) * innerH;
  };

  const samples = Math.max(64, Math.ceil(Nt * 28));
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const phi = (i / samples) * Nt;
    const x = centerX + amplitude * Math.sin(2 * Math.PI * phi);
    const y = bottomY - (seatRise + easeH(phi)); // height in px above datum
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  const bottomSeatY = bottomY; // flat ground face on the datum
  const topSeatY = bottomY - totalH; // flat ground face at the top plane
  const bodyBottomY = bottomY - seatRise;
  const bodyTopY = topSeatY + seatRise;
  const xTop = centerX + amplitude * Math.sin(2 * Math.PI * Nt); // body top endpoint x

  const left = (centerX - amplitude).toFixed(2);
  const right = (centerX + amplitude).toFixed(2);
  const cx = centerX.toFixed(2);

  // Each seat = a flat ground face + a short curl connecting it to the body.
  const bottomSeatPath =
    `M ${left} ${bottomSeatY.toFixed(2)} L ${right} ${bottomSeatY.toFixed(2)} ` +
    `M ${right} ${bottomSeatY.toFixed(2)} Q ${right} ${bodyBottomY.toFixed(2)} ${cx} ${bodyBottomY.toFixed(2)}`;
  const topSeatPath =
    `M ${left} ${topSeatY.toFixed(2)} L ${right} ${topSeatY.toFixed(2)} ` +
    `M ${right} ${topSeatY.toFixed(2)} Q ${right} ${bodyTopY.toFixed(2)} ${xTop.toFixed(2)} ${bodyTopY.toFixed(2)}`;

  return {
    interiorPath: `M ${pts.join(" L ")}`,
    seatPaths: [bottomSeatPath, topSeatPath],
    strokeWidthPx,
  };
}
