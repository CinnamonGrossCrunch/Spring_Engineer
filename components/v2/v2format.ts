import { formatValue, inchesToMm } from "../StatusBadge";
import type { V2StressBand } from "@/lib/v2/types";

/**
 * Presentation-only formatting + visual grammar for the V2 workbench.
 * No engineering math lives here — display helpers only.
 */

export function fmtLbf(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return `${formatValue(x)} lbf`;
}

export function fmtIn(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return `${formatValue(x)} in`;
}

export function fmtInMm(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return `${formatValue(x)} in / ${formatValue(inchesToMm(x))} mm`;
}

export function fmtWork(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return `${formatValue(x)} in·lbf`;
}

export function fmtRate(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return `${formatValue(x)} lbf/in`;
}

export function fmtPct(fraction: number | undefined): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(0)}%`;
}

export function fmtCoils(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

/** Visual + copy grammar for the Lee stress bands. */
export const STRESS_BAND_META: Record<
  V2StressBand,
  { label: string; short: string; badge: string; swatch: string; note: string }
> = {
  low: {
    label: "≤ 40% TS",
    short: "Low",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700",
    swatch: "#059669",
    note: "Normal / lower-stress region under Lee's set guidance.",
  },
  set: {
    label: "40–60% TS",
    short: "Set",
    badge: "border-amber-300 bg-amber-50 text-amber-700",
    swatch: "#d97706",
    note: "Set operation / allow-for-set should be considered.",
  },
  redesign: {
    label: "> 60% TS",
    short: "Redesign",
    badge: "border-red-300 bg-red-50 text-red-700",
    swatch: "#dc2626",
    note: "Lee redesign region — excluded from the recommended feasible set by default.",
  },
};

/**
 * Restrained sequential color ramp (light slate → deep blue). Takes a
 * normalized value t ∈ [0,1] and returns an rgb() string. Deliberately NOT a
 * rainbow scale. `invert` maps high values to the light end (useful when a
 * lower metric value is "better").
 */
export function sequentialColor(t: number, invert = false): string {
  const u = Math.max(0, Math.min(1, invert ? 1 - t : t));
  // Stops: #eef2ff → #93c5fd → #2563eb → #1e3a8a
  const stops: [number, number, number][] = [
    [238, 242, 255],
    [147, 197, 253],
    [37, 99, 235],
    [30, 58, 138],
  ];
  const seg = u * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i];
  const b = stops[i + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * f);
  const g = Math.round(a[1] + (b[1] - a[1]) * f);
  const bl = Math.round(a[2] + (b[2] - a[2]) * f);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Readable text color (dark/light) for a given ramp position. */
export function rampTextColor(t: number, invert = false): string {
  const u = invert ? 1 - t : t;
  return u > 0.55 ? "#ffffff" : "#1e293b";
}

/** Epistemic-source tag styles shared across the scenario panel + tables. */
export const SOURCE_TAG: Record<string, string> = {
  mechanism: "border-zinc-800 bg-zinc-800 text-white",
  study: "border-sky-300 bg-sky-50 text-sky-700",
  lee: "border-violet-300 bg-violet-50 text-violet-700",
  vendor: "border-amber-300 bg-amber-50 text-amber-700",
  derived: "border-emerald-300 bg-emerald-50 text-emerald-700",
  historical: "border-zinc-300 bg-zinc-100 text-zinc-600",
};
