"use client";

import { useMemo, useState } from "react";
import type { ConstraintResult, ModelState, ParameterStatus } from "@/lib/engineering/types";
import { PARAMETER_MAP } from "@/lib/engineering/parameters";
import { STATUS_STYLES, formatLengthValue, formatValue } from "./StatusBadge";

interface ParamRow {
  id: string;
  symbol: string;
  name: string;
  display: string;
  unit: string;
  status: ParameterStatus;
  violated: boolean;
  selected: boolean;
  highlighted: boolean;
  muted: boolean;
}

type LogicGroupId =
  | "geometry"
  | "rate"
  | "installation"
  | "drive"
  | "hammer"
  | "impact"
  | "latch"
  | "stress-constraint"
  | "solid-constraint";

type WorkflowSectionId =
  | "spring-design"
  | "spring-behavior"
  | "hammer-dynamics";

interface GroupSpec {
  id: LogicGroupId;
  section: WorkflowSectionId;
  title: string;
  order: number;
  subtitle?: string;
  note?: string;
  paramIds: string[];
  kind: "block" | "constraint";
}

const GROUPS: GroupSpec[] = [
  {
    id: "geometry",
    section: "spring-design",
    title: "Spring Geometry / Material",
    order: 1,
    subtitle: "What gets manufactured",
    paramIds: ["d", "D", "OD", "ID", "Na", "G"],
    kind: "block",
  },
  {
    id: "stress-constraint",
    section: "spring-design",
    title: "Stress Constraint",
    order: 0,
    subtitle: "τ = K_w·8·F1·D/(π·d³), classify τ/TS_basis",
    paramIds: ["Kw", "tau", "TS_basis", "TS_conservative", "TS_upper", "utilization"],
    kind: "constraint",
  },
  {
    id: "solid-constraint",
    section: "spring-design",
    title: "Solid Height / Coil Bind",
    order: 0,
    subtitle: "H_s,max=(1+tol)·H_s,nom ; x₁/(L_f−H_s,max) ≤ u_max",
    paramIds: ["Nt", "Hs", "solid_tolerance", "Hs_max", "clearance", "available_deflection", "deflection_utilization", "deflection_utilization_max", "c_extra"],
    kind: "constraint",
  },
  {
    id: "rate",
    section: "spring-behavior",
    title: "Spring Rate",
    order: 2,
    subtitle: "k = G·d⁴ / (8·D³·N_a)",
    paramIds: ["k", "C"],
    kind: "block",
  },
  {
    id: "installation",
    section: "spring-behavior",
    title: "Spring Installation / Hooke's Law",
    order: 3,
    subtitle: "F = k·x · x = L_f − L · B = L_min + s_h",
    paramIds: ["F1", "F1_cap", "x1", "L_free", "L_min", "B"],
    kind: "block",
  },
  {
    id: "drive",
    section: "spring-behavior",
    title: "Spring Drives Hammer",
    order: 4,
    subtitle: "1:1 displacement assumed (V1)",
    paramIds: ["s_h", "L2", "L3", "F2", "F3", "W_run"],
    kind: "block",
  },
  {
    id: "hammer",
    section: "hammer-dynamics",
    title: "Hammer State at Impact",
    order: 5,
    paramIds: ["m", "v", "p", "KE"],
    kind: "block",
  },
  {
    id: "impact",
    section: "hammer-dynamics",
    title: "Hammer–Latch Impact",
    order: 6,
    subtitle: "Impact model — NOT solved in V1",
    note:
      "Peak dynamic contact force also depends on contact stiffness, collision duration, deformation, rebound, friction and effective moving masses. Spring force at contact (F2) is NOT the impact force.",
    paramIds: ["p", "KE"],
    kind: "block",
  },
  {
    id: "latch",
    section: "hammer-dynamics",
    title: "Latch Requirement",
    order: 7,
    subtitle: "Boundary travel y_latch with optional historical force references",
    paramIds: ["F_latch_peak", "F_latch_avg", "y_latch"],
    kind: "block",
  },
];

const SECTION_INFO: Array<{
  id: WorkflowSectionId;
  title: string;
  subtitle?: string;
}> = [
  { id: "spring-design", title: "SPRING DESIGN" },
  { id: "spring-behavior", title: "SPRING BEHAVIOR" },
  {
    id: "hammer-dynamics",
    title: "HAMMER DYNAMICS",
    subtitle: "currently unknown (speculative)",
  },
];

interface LogicMapProps {
  model: ModelState;
  values: Record<string, number | undefined>;
  selectedId: string | null;
  violatedParamIds: Set<string>;
  constraints: ConstraintResult[];
  mode: "forward" | "reverse" | "explore";
  onSelect: (id: string) => void;
}

interface BlockData {
  title: string;
  order: number;
  subtitle?: string;
  note?: string;
  params: ParamRow[];
  violated: boolean;
  kind: "block" | "constraint";
}

function buildData(g: GroupSpec, props: LogicMapProps): BlockData {
  const { model, values, selectedId, violatedParamIds, constraints } = props;
  const upstreamIds = new Set<string>();
  const downstreamIds = new Set<string>();
  if (selectedId) {
    const selectedDef = PARAMETER_MAP[selectedId];
    if (selectedDef?.dependencies) selectedDef.dependencies.forEach((dep) => upstreamIds.add(dep));
    for (const p of Object.values(PARAMETER_MAP)) {
      if (p.dependencies?.includes(selectedId)) downstreamIds.add(p.id);
    }
    if (selectedDef) {
      upstreamIds.add(selectedId);
      downstreamIds.add(selectedId);
    }
  }

  const params: ParamRow[] = g.paramIds
    .filter((id) => model[id] && PARAMETER_MAP[id])
    .map((id) => {
      const def = PARAMETER_MAP[id];
      const isConnected = selectedId ? upstreamIds.has(id) || downstreamIds.has(id) || id === selectedId : true;
      return {
        id,
        symbol: def.symbol,
        name: def.name,
        display: def.unit === "in" ? formatLengthValue(values[id]) : formatValue(values[id]),
        unit: def.unit,
        status: model[id].status,
        violated: violatedParamIds.has(id),
        selected: selectedId === id,
        highlighted: !selectedId || isConnected,
        muted: !!selectedId && !isConnected,
      };
    });

  const violated =
    g.kind === "constraint"
      ? constraints.some((c) => !c.ok && c.parameterIds.some((p) => g.paramIds.includes(p)))
      : params.some((p) => p.violated);

  return {
    title: g.title,
    order: g.order,
    subtitle: g.subtitle,
    note: g.note,
    params,
    violated,
    kind: g.kind,
  };
}

function getSelectedSection(selectedId: string | null): WorkflowSectionId | null {
  if (!selectedId) return null;
  const owning = GROUPS.find((g) => g.kind === "block" && g.paramIds.includes(selectedId));
  if (owning) return owning.section;
  const fallback = GROUPS.find((g) => g.paramIds.includes(selectedId));
  return fallback ? fallback.section : null;
}

function modeFlowSummary(mode: LogicMapProps["mode"]): string {
  if (mode === "forward") {
    return "Spring Design → Spring Behavior → Hammer Dynamics → Latch Requirement";
  }
  if (mode === "reverse") {
    return "Latch Requirement → Hammer Dynamics → Spring Behavior → Spring Design";
  }
  return "Spring Design ⇄ Spring Behavior ⇄ Hammer Dynamics ⇄ Latch Requirement";
}

function BlockCard({
  data,
  onSelect,
}: {
  data: BlockData;
  onSelect: (id: string) => void;
}) {
  const isConstraint = data.kind === "constraint";
  return (
    <div
      className={`rounded-lg border bg-white shadow-sm ${
        data.violated
          ? "border-red-400 ring-2 ring-red-100"
          : isConstraint
            ? "border-dashed border-zinc-300"
            : "border-zinc-300"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 rounded-t-lg border-b px-2.5 py-1.5 ${
          data.violated ? "border-red-100 bg-red-50" : "border-zinc-100 bg-zinc-50"
        }`}
      >
        {!isConstraint && (
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-[9px] font-bold text-white"
            title={`Design-reasoning step ${data.order}`}
          >
            {data.order}
          </span>
        )}
        <span
          className={`text-[11px] font-semibold leading-4 ${
            data.violated ? "text-red-700" : "text-zinc-800"
          }`}
        >
          {data.title}
        </span>
      </div>

      {data.subtitle && (
        <p className="border-b border-zinc-100 px-2.5 py-1 text-[9.5px] leading-3.5 text-zinc-400">
          {data.subtitle}
        </p>
      )}

      <div className="space-y-px px-1 py-1">
        {data.params.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            title={`${p.name} — click to inspect`}
            className={`flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left transition-opacity ${
              p.selected ? "bg-zinc-800 text-white" : p.highlighted ? "bg-zinc-100" : "hover:bg-zinc-100"
            } ${p.muted ? "opacity-45" : "opacity-100"}`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                p.violated ? "bg-red-500" : STATUS_STYLES[p.status].dot
              }`}
              title={p.violated ? "constraint violated" : STATUS_STYLES[p.status].label}
            />
            <span className="w-14 shrink-0 truncate font-mono text-[10px] font-semibold">
              {p.symbol}
            </span>
            <span
              className={`ml-auto font-mono text-[10px] tabular-nums ${
                p.selected ? "text-white" : p.violated ? "text-red-600" : "text-zinc-700"
              }`}
            >
              {p.display}
              {p.unit !== "—" && p.unit !== "in" && (
                <span className={p.selected ? "text-zinc-300" : "text-zinc-400"}> {p.unit}</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[9px] opacity-60">
              {STATUS_STYLES[p.status].glyph}
            </span>
          </button>
        ))}
      </div>

      {data.note && (
        <p className="border-t border-zinc-100 px-2.5 py-1.5 text-[9.5px] leading-3.5 text-zinc-500">
          {data.note}
        </p>
      )}
    </div>
  );
}

export function LogicMap(props: LogicMapProps) {
  const { selectedId, mode, onSelect } = props;
  const [legendOpen, setLegendOpen] = useState(false);
  const selectedSection = getSelectedSection(selectedId);

  const groupData = useMemo(() => {
    return Object.fromEntries(GROUPS.map((g) => [g.id, buildData(g, props)])) as Record<
      LogicGroupId,
      BlockData
    >;
  }, [props]);

  return (
    <div className="relative rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-3 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[10.5px] text-zinc-600">
        <span className="font-semibold text-zinc-800">Primary flow: </span>
        {modeFlowSummary(mode)}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTION_INFO.map((section, index) => {
          const groups = GROUPS.filter((g) => g.section === section.id);
          const active = selectedSection === section.id;
          return (
            <section
              key={section.id}
              className={`relative border px-2 pt-2 ${
                active ? "border-blue-200 bg-blue-50/50" : "border-zinc-200/80 bg-zinc-50/55"
              }`}
            >
              <div
                className={`mb-2 text-[10px] font-semibold tracking-[0.14em] ${
                  active ? "text-blue-700" : "text-zinc-400"
                }`}
              >
                {section.title}
              </div>
              {section.subtitle && (
                <div
                  className={`mb-2 text-[9px] tracking-[0.08em] ${
                    active ? "text-blue-500" : "text-zinc-400"
                  }`}
                >
                  {section.subtitle}
                </div>
              )}

              <div className="space-y-3">
                {groups.map((g) => (
                  <BlockCard key={g.id} data={groupData[g.id]} onSelect={onSelect} />
                ))}
              </div>

              {index < SECTION_INFO.length - 1 && (
                <div className="hidden xl:pointer-events-none xl:absolute xl:-right-6 xl:top-1/2 xl:block xl:-translate-y-1/2">
                  <span className="text-lg text-zinc-400" aria-hidden>
                    →
                  </span>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-3 xl:hidden">
        <div className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[10px] text-zinc-500">
          Engineering flow: {modeFlowSummary(mode)}
        </div>
      </div>

      <div className="absolute right-3 top-3">
        {legendOpen ? (
          <div className="w-[230px] rounded-md border border-zinc-200 bg-white/95 px-3 py-2 text-[10.5px] leading-4 text-zinc-600 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-800">Legend</span>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                className="rounded px-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Collapse legend"
              >
                ×
              </button>
            </div>
            <div>
              <span className="font-semibold text-zinc-800">Primary flow:</span>{" "}
              {mode === "forward"
                ? "forward causality emphasized"
                : mode === "reverse"
                  ? "reverse reasoning emphasized"
                  : "forward and reverse shown with balanced emphasis"}
            </div>
            <div>
              <span className="font-semibold text-zinc-800">Sections:</span> spring design, spring
              behavior, hammer dynamics, latch requirement.
            </div>
            {selectedId && (
              <div className="mt-0.5 text-zinc-500">
                <span className="font-semibold text-zinc-800">Selection:</span> connected parameters
                stay lit; unrelated ones dim.
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {(["fixed", "variable", "derived", "assumed"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                  {STATUS_STYLES[s].label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                Violation
              </span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            className="rounded-md border border-zinc-200 bg-white/95 px-2.5 py-1 text-[10.5px] font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            title="Show legend"
          >
            ⓘ Legend
          </button>
        )}
      </div>
    </div>
  );
}
