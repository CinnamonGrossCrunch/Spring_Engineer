"use client";

import { buildSpringPath, type SpringPathSpec } from "./springSvgGeometry";

/**
 * Dumb renderer for one compression spring elevation. All values are
 * consumed from the engineering model upstream — this component only draws.
 *
 * Depth is faked with drawing order: the BACK half-turns are drawn first in a
 * lighter steel, then the FRONT half-turns on top in the base steel, then a
 * subtle top-left highlight. Everything is clipped to the seating band so the
 * closed-and-ground terminal coils read as flat ground faces (no horizontal
 * diameter-spanning wire, no wire below the datum).
 */
export function ParametricCompressionSpring({
  spec,
  centerX,
  bottomY,
  pxPerUnit,
  colors,
  highlight = true,
  highlighted = false,
}: {
  spec: SpringPathSpec;
  centerX: number;
  bottomY: number;
  pxPerUnit: number;
  /** Cylindrical wire shading: `front` is the near steel, `back` the far steel. */
  colors: { front: string; back: string };
  /** Draw the subtle top-left specular highlight on the front turns. */
  highlight?: boolean;
  highlighted?: boolean;
}) {
  const geo = buildSpringPath(spec, centerX, bottomY, pxPerUnit);
  if (!geo) return null;

  const clipId = `spring-clip-${Math.round(centerX)}-${Math.round(bottomY)}-${Math.round(
    geo.topSeatY,
  )}`;
  const hi = Math.max(0.6, geo.strokeWidthPx * 0.34);
  const hiShift = geo.strokeWidthPx * 0.16;

  return (
    <g opacity={highlighted ? 1 : 0.92}>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={geo.leftX}
            y={geo.topSeatY}
            width={geo.rightX - geo.leftX}
            height={geo.bottomSeatY - geo.topSeatY}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* BACK half-turns first (further from viewer, lighter steel). */}
        {geo.backSegments.map((d, i) => (
          <path
            key={`b${i}`}
            d={d}
            fill="none"
            stroke={colors.back}
            strokeWidth={geo.strokeWidthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* FRONT half-turns on top (nearer viewer, base steel). */}
        {geo.frontSegments.map((d, i) => (
          <path
            key={`f${i}`}
            d={d}
            fill="none"
            stroke={colors.front}
            strokeWidth={geo.strokeWidthPx}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {/* Subtle top-left specular highlight to give the wire a round cross-section. */}
        {highlight &&
          geo.frontSegments.map((d, i) => (
            <path
              key={`h${i}`}
              d={d}
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={hi}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={`translate(${-hiShift} ${-hiShift})`}
            />
          ))}
      </g>
    </g>
  );
}
