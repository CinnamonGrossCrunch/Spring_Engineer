/**
 * Pure SVG geometry for the parametric compression-spring schematic.
 *
 * This module contains NO engineering equations — it only maps
 * already-solved engineering values (wire diameter, mean diameter, total
 * coils, current loaded length) into SVG path segments. The engineering model
 * (lib/engineering) remains the single source of truth.
 *
 * The helix is decomposed into alternating FRONT and BACK half-turn segments so
 * the renderer can draw the back-facing wire first and the front-facing wire on
 * top — giving a woven, overlapping look with real depth. A closed-and-ground
 * compression spring contains NO straight wire spanning the diameter, so no
 * horizontal full-width "seat" element is produced; flat ground faces come from
 * clipping the terminal coils at the seating planes (see topSeatY / bottomSeatY).
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
   * Half-turn segments whose wire faces AWAY from the viewer (depth z > 0).
   * Drawn FIRST so the front-facing wire overlaps them.
   */
  backSegments: string[];
  /**
   * Half-turn segments whose wire faces the viewer (depth z < 0).
   * Drawn AFTER the back segments so overlapping turns read correctly.
   */
  frontSegments: string[];
  /**
   * Rendered wire thickness in px. Visual-only clamp: a minimum of 1.25 px
   * keeps very thin wire visible on screen. This clamp NEVER feeds back into
   * the engineering model — it is purely presentational.
   */
  strokeWidthPx: number;
  /** Y of the top seating plane (top of the spring at the current length). */
  topSeatY: number;
  /** Y of the bottom seating plane (the datum the spring rests on). */
  bottomSeatY: number;
  /** Left edge x of the clip band (coil left extreme minus wire radius). */
  leftX: number;
  /** Right edge x of the clip band (coil right extreme plus wire radius). */
  rightX: number;
}

const sgn = (z: number): 1 | -1 => (z >= 0 ? 1 : -1);

/**
 * Build a stylized elevation of a closed-and-ground compression spring.
 *
 * Helix centerline:
 *
 *   x(φ) = centerX + (D/2)·px · sin(2π·φ)          φ ∈ [0, N_t]
 *   y(φ) = bottomY − cumulativePitch(φ)·px
 *   z(φ) = cos(2π·φ)         (depth: >0 back, <0 front)
 *
 * The pitch is reduced over the first and last ~0.75 turn so the closed-and-
 * ground terminal coils nest toward the seating planes. The bottom terminal
 * coil centerline reaches the datum (bottomY) and the top terminal coil reaches
 * the top plane (bottomY − L·px); the renderer clips at those planes to produce
 * flat ground faces WITHOUT drawing any horizontal diameter-spanning wire. The
 * drawn turn count always equals N_t (never distorted).
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
  if (!Number.isFinite(amplitude) || !Number.isFinite(totalH) || totalH <= 0) return null;
  const strokeWidthPx = Math.max(1.25, d * pxPerUnit);

  // Reduced-pitch closed-and-ground ends: ~0.75 turn at each end winds down to
  // a low residual pitch so the terminal coils sit close together (nested).
  const endCoils = Math.min(0.75, Nt / 4);
  const END_PITCH = 0.18; // residual pitch fraction inside the end regions
  const pitchAt = (phi: number): number => {
    if (Nt <= 2 * endCoils || endCoils <= 0) return 1;
    if (phi < endCoils) return END_PITCH + (1 - END_PITCH) * (phi / endCoils);
    if (phi > Nt - endCoils)
      return END_PITCH + (1 - END_PITCH) * ((Nt - phi) / endCoils);
    return 1;
  };

  const samples = Math.max(120, Math.ceil(Nt * 36));
  const dphi = Nt / samples;

  // Trapezoidal cumulative pitch, normalized so y spans exactly [top, datum].
  const cum: number[] = new Array(samples + 1);
  cum[0] = 0;
  let prevP = pitchAt(0);
  for (let i = 1; i <= samples; i++) {
    const p = pitchAt(i * dphi);
    cum[i] = cum[i - 1] + ((prevP + p) / 2) * dphi;
    prevP = p;
  }
  const totalCum = cum[samples];
  if (!Number.isFinite(totalCum) || totalCum <= 0) return null;

  const pointAt = (i: number): { x: number; y: number; z: number } => {
    const phi = i * dphi;
    const x = centerX + amplitude * Math.sin(2 * Math.PI * phi);
    const y = bottomY - (cum[i] / totalCum) * totalH;
    const z = Math.cos(2 * Math.PI * phi);
    return { x, y, z };
  };

  // Crossing point where depth changes sign (z = 0) between samples i-1 and i.
  const crossing = (i: number, z0: number, z1: number) => {
    const t = z0 / (z0 - z1);
    const phi0 = (i - 1) * dphi;
    const phiC = phi0 + t * dphi;
    const hC = cum[i - 1] + t * (cum[i] - cum[i - 1]);
    return {
      x: centerX + amplitude * Math.sin(2 * Math.PI * phiC),
      y: bottomY - (hC / totalCum) * totalH,
    };
  };

  const backSegments: string[] = [];
  const frontSegments: string[] = [];

  const first = pointAt(0);
  if (!Number.isFinite(first.x) || !Number.isFinite(first.y)) return null;

  let curSign = sgn(first.z);
  let curPts: string[] = [`${first.x.toFixed(2)},${first.y.toFixed(2)}`];

  const flush = (sign: 1 | -1, pts: string[]) => {
    if (pts.length < 2) return; // a lone point draws nothing
    const path = `M ${pts.join(" L ")}`;
    (sign > 0 ? backSegments : frontSegments).push(path);
  };

  let prev = first;
  for (let i = 1; i <= samples; i++) {
    const p = pointAt(i);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const s = sgn(p.z);
    if (s !== curSign) {
      // Insert the exact depth-crossing point so segments meet seamlessly.
      const c = crossing(i, prev.z, p.z);
      const cStr = `${c.x.toFixed(2)},${c.y.toFixed(2)}`;
      curPts.push(cStr);
      flush(curSign, curPts);
      curSign = s;
      curPts = [cStr, `${p.x.toFixed(2)},${p.y.toFixed(2)}`];
    } else {
      curPts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
    prev = p;
  }
  flush(curSign, curPts);

  return {
    backSegments,
    frontSegments,
    strokeWidthPx,
    topSeatY: bottomY - totalH,
    bottomSeatY: bottomY,
    leftX: centerX - amplitude - strokeWidthPx,
    rightX: centerX + amplitude + strokeWidthPx,
  };
}
