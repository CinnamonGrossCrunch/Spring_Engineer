import type { ParameterStatus } from "@/lib/engineering/types";

/**
 * Visual language for parameter epistemic status:
 *   Fixed = blue · Variable = neutral · Derived = green · Assumed = amber
 *   Constraint violation = red (applied on top by callers).
 */
export const STATUS_STYLES: Record<
  ParameterStatus,
  { badge: string; dot: string; label: string; glyph: string; explain: string }
> = {
  fixed: {
    badge: "bg-blue-50 text-blue-700 border-blue-300",
    dot: "bg-blue-500",
    label: "Fixed",
    glyph: "📌",
    explain: "Fixed — a design requirement. The solver may not change this value.",
  },
  variable: {
    badge: "bg-white text-zinc-600 border-zinc-300",
    dot: "bg-zinc-400",
    label: "Variable",
    glyph: "✎",
    explain: "Variable — a user-controlled design input.",
  },
  derived: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-300",
    dot: "bg-emerald-500",
    label: "Derived",
    glyph: "ƒ",
    explain: "Derived — calculated from other parameters by the equation engine.",
  },
  assumed: {
    badge: "bg-amber-50 text-amber-700 border-amber-300",
    dot: "bg-amber-500",
    label: "Assumed",
    glyph: "A",
    explain: "Assumed — an upstream or empirical value not derived by this model.",
  },
};

export function StatusBadge({
  status,
  violated = false,
  compact = false,
}: {
  status: ParameterStatus;
  violated?: boolean;
  compact?: boolean;
}) {
  const s = STATUS_STYLES[status];
  const cls = violated ? "bg-red-50 text-red-700 border-red-300" : s.badge;
  return (
    <span
      title={violated ? "Involved in a violated constraint" : s.explain}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] leading-4 ${cls}`}
    >
      <span aria-hidden>{s.glyph}</span>
      {!compact && <span className="uppercase tracking-wide">{s.label}</span>}
    </span>
  );
}

/** Compact number formatting without fake precision. */
export function formatValue(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  const ax = Math.abs(x);
  if (ax >= 100_000) return Math.round(x).toLocaleString("en-US");
  if (ax >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (ax >= 100) return x.toFixed(1);
  if (ax >= 10) return x.toFixed(2);
  if (ax >= 1) return x.toFixed(3);
  if (ax === 0) return "0";
  return x.toPrecision(3);
}

export function inchesToMm(x: number): number {
  return x * 25.4;
}

export function formatLengthValue(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return "—";
  return `${formatValue(x)} in / ${formatValue(inchesToMm(x))} mm`;
}
