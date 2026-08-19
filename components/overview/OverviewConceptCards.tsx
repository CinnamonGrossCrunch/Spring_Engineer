"use client";

import type { ReactNode } from "react";
import type { ConstraintResult } from "@/lib/engineering/types";
import { formatValue, formatLengthValue } from "../StatusBadge";
import { overviewName, overviewSym } from "./overviewLabels";

/**
 * Four plain-language concept cards for the Overview view. They replace the
 * full dependency graph (which lives in the Engineering view) with a
 * digestible summary of the mechanism. Every value is read from the shared
 * solver output; nothing is recomputed here. All rows are click-to-inspect.
 */

interface Props {
  values: Record<string, number | undefined>;
  constraints: ConstraintResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type StatusKind = "ok" | "warn" | "fail" | "na";

function statusOf(c: ConstraintResult | undefined): StatusKind {
  if (!c) return "na";
  if (!c.ok) return "fail";
  return c.severity === "warning" ? "warn" : "ok";
}

const STATUS_META: Record<StatusKind, { glyph: string; cls: string; label: string }> = {
  ok: { glyph: "✓", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", label: "OK" },
  warn: { glyph: "⚠", cls: "border-amber-300 bg-amber-50 text-amber-700", label: "Marginal" },
  fail: { glyph: "✕", cls: "border-red-300 bg-red-50 text-red-700", label: "Violated" },
  na: { glyph: "–", cls: "border-zinc-200 bg-zinc-50 text-zinc-400", label: "n/a" },
};

function fmt(id: string, value: number | undefined, unit: string): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (unit === "in") return formatLengthValue(value);
  if (unit === "") return formatValue(value);
  return `${formatValue(value)} ${unit}`;
}

/** Card shell with a small accented header. */
function Card({
  accent,
  eyebrow,
  title,
  question,
  children,
}: {
  accent: string;
  eyebrow: string;
  title: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="rounded-t-lg border-b border-zinc-100 px-3 py-2" style={{ borderTop: `3px solid ${accent}` }}>
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent }}>
          {eyebrow}
        </div>
        <div className="text-[13px] font-semibold text-zinc-800">{title}</div>
        <div className="text-[11px] leading-snug text-zinc-400">{question}</div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">{children}</div>
    </div>
  );
}

/** One clickable value row. */
function Row({
  id,
  values,
  unit,
  selectedId,
  onSelect,
}: {
  id: string;
  values: Record<string, number | undefined>;
  unit: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const sel = selectedId === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      title={`${overviewName(id)} — click to inspect`}
      className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors ${
        sel ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-zinc-50"
      }`}
    >
      <span className="text-[11.5px] text-zinc-600">
        {overviewName(id)}{" "}
        <span className="font-mono text-[10px] text-zinc-400">({overviewSym(id)})</span>
      </span>
      <span className="shrink-0 font-mono text-[11.5px] font-medium text-zinc-800">
        {fmt(id, values[id], unit)}
      </span>
    </button>
  );
}

function ConstraintChip({
  label,
  status,
  onClick,
}: {
  label: string;
  status: StatusKind;
  onClick?: () => void;
}) {
  const m = STATUS_META[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors hover:brightness-95 ${m.cls}`}
    >
      <span aria-hidden>{m.glyph}</span>
      {label}
    </button>
  );
}

export function OverviewConceptCards({ values, constraints, selectedId, onSelect }: Props) {
  const stress = constraints.find((c) => c.id === "stress");
  const coilBind = constraints.find((c) => c.id === "coil_bind");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Card 1 — Spring Design */}
      <Card accent="#0ea5e9" eyebrow="1 · Spring Design" title="Spring Design" question="What is the spring physically made like?">
        <Row id="d" values={values} unit="in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="OD" values={values} unit="in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="ID" values={values} unit="in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="Na" values={values} unit="coils" selectedId={selectedId} onSelect={onSelect} />
        <Row id="G" values={values} unit="psi" selectedId={selectedId} onSelect={onSelect} />
        <div className="mt-auto pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Constraint summary
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ConstraintChip label="Stress" status={statusOf(stress)} onClick={() => onSelect("tau")} />
            <ConstraintChip label="Coil bind" status={statusOf(coilBind)} onClick={() => onSelect("clearance")} />
          </div>
        </div>
      </Card>

      {/* Card 2 — Spring Behavior */}
      <Card accent="#2563eb" eyebrow="2 · Spring Behavior" title="Spring Behavior" question="What does the spring do when compressed?">
        <Row id="k" values={values} unit="lbf/in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="x1" values={values} unit="in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="F1" values={values} unit="lbf" selectedId={selectedId} onSelect={onSelect} />
        <div className="mt-auto rounded bg-zinc-50 px-2 py-1.5 pt-2">
          <div className="text-[11.5px] font-medium text-zinc-700">
            Spring Force = Spring Rate × Compression
          </div>
          <div className="font-mono text-[10.5px] text-zinc-400">F = k·x</div>
        </div>
      </Card>

      {/* Card 3 — Hammer Motion */}
      <Card accent="#059669" eyebrow="3 · Hammer Motion" title="Hammer Motion" question="What happens before the hammer reaches the latch?">
        <Row id="s_h" values={values} unit="in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="F2" values={values} unit="lbf" selectedId={selectedId} onSelect={onSelect} />
        <Row id="m" values={values} unit="lbm" selectedId={selectedId} onSelect={onSelect} />
        <details className="mt-auto pt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-zinc-500">
            Advanced Hammer Dynamics
          </summary>
          <div className="mt-1 flex flex-col gap-0.5">
            <Row id="v" values={values} unit="ft/s" selectedId={selectedId} onSelect={onSelect} />
            <Row id="p" values={values} unit="lbm·ft/s" selectedId={selectedId} onSelect={onSelect} />
            <Row id="KE" values={values} unit="ft·lbf" selectedId={selectedId} onSelect={onSelect} />
            <Row id="eta" values={values} unit="" selectedId={selectedId} onSelect={onSelect} />
            <Row id="W_run" values={values} unit="in·lbf" selectedId={selectedId} onSelect={onSelect} />
          </div>
        </details>
      </Card>

      {/* Card 4 — Latch Release */}
      <Card accent="#b45309" eyebrow="4 · Latch Release" title="Latch Release" question="What must the hammer ultimately accomplish?">
        <div className="mb-0.5 inline-flex w-fit items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-700">
          Historical / optional reference input
        </div>
        <Row id="F_latch_peak" values={values} unit="lbf" selectedId={selectedId} onSelect={onSelect} />
        <Row id="F_latch_avg" values={values} unit="lbf" selectedId={selectedId} onSelect={onSelect} />
        <Row id="y_latch" values={values} unit="in" selectedId={selectedId} onSelect={onSelect} />
        <Row id="F3" values={values} unit="lbf" selectedId={selectedId} onSelect={onSelect} />
        <p className="mt-auto pt-2 text-[10px] leading-snug text-zinc-400">
          Hammer dynamics bridge the spring-force regime and the latch-resistance regime. Peak
          transient impact force is not solved in V1.
        </p>
      </Card>
    </div>
  );
}
