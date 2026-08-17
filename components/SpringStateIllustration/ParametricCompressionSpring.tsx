"use client";

import { buildSpringPath, type SpringPathSpec } from "./springSvgGeometry";

/**
 * Dumb renderer for one compression spring elevation. All values are
 * consumed from the engineering model upstream — this component only draws.
 */
export function ParametricCompressionSpring({
  spec,
  centerX,
  bottomY,
  pxPerUnit,
  stroke,
  highlighted = false,
}: {
  spec: SpringPathSpec;
  centerX: number;
  bottomY: number;
  pxPerUnit: number;
  stroke: string;
  highlighted?: boolean;
}) {
  const geo = buildSpringPath(spec, centerX, bottomY, pxPerUnit);
  if (!geo) return null;
  return (
    <path
      d={geo.path}
      fill="none"
      stroke={stroke}
      strokeWidth={geo.strokeWidthPx}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={highlighted ? 1 : 0.9}
    />
  );
}
