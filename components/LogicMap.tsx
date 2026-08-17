"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  MarkerType,
} from "@xyflow/react";
// React Flow base styles are imported globally in app/globals.css.

import type { ConstraintResult, ModelState, ParameterStatus } from "@/lib/engineering/types";
import { PARAMETER_MAP } from "@/lib/engineering/parameters";
import {
  CANONICAL_NODE_LAYOUT,
  getCanonicalPositions,
  getLaneSpecs,
  type EngineeringLane,
  type LogicGroupId,
} from "@/lib/layout/engineeringWorkbenchLayout";
import { STATUS_STYLES, formatLengthValue, formatValue } from "./StatusBadge";

/* ── node data ──────────────────────────────────────────────────────────── */

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

interface BlockData extends Record<string, unknown> {
  title: string;
  /** Design-reasoning order badge (1 = latch requirement … 7 = geometry). */
  order: number;
  subtitle?: string;
  note?: string;
  params: ParamRow[];
  violated: boolean;
  onSelect: (id: string) => void;
  kind: "block" | "constraint";
}

type BlockNodeType = Node<BlockData, "block">;

interface LaneData extends Record<string, unknown> {
  title: string;
  active: boolean;
  width: number;
  height: number;
}

type LaneNodeType = Node<LaneData, "lane">;

/* ── custom node ────────────────────────────────────────────────────────── */

function BlockNode({ data }: NodeProps<BlockNodeType>) {
  const isConstraint = data.kind === "constraint";
  return (
    <div
      className={`w-[215px] rounded-lg border bg-white shadow-sm ${
        data.violated
          ? "border-red-400 ring-2 ring-red-100"
          : isConstraint
            ? "border-dashed border-zinc-300"
            : "border-zinc-300"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-400" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-400" />
      <Handle id="top-target" type="target" position={Position.Top} className="!bg-zinc-300" />
      <Handle id="top-source" type="source" position={Position.Top} className="!bg-zinc-300" />
      <Handle id="bottom-source" type="source" position={Position.Bottom} className="!bg-zinc-300" />
      <Handle id="bottom-target" type="target" position={Position.Bottom} className="!bg-zinc-300" />

      <div
        className={`flex items-center gap-1.5 rounded-t-lg border-b px-2.5 py-1.5 ${
          data.violated
            ? "border-red-100 bg-red-50"
            : isConstraint
              ? "border-zinc-100 bg-zinc-50"
              : "border-zinc-100 bg-zinc-50"
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
            onClick={() => data.onSelect(p.id)}
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

function LaneNode({ data }: NodeProps<LaneNodeType>) {
  return (
    <div
      className={`rounded-xl border px-2 pt-2 ${
        data.active
          ? "border-blue-200 bg-blue-50/50"
          : "border-zinc-200/80 bg-zinc-50/55"
      }`}
      style={{ width: data.width, height: data.height }}
    >
      <div
        className={`text-[10px] font-semibold tracking-[0.14em] ${
          data.active ? "text-blue-700" : "text-zinc-400"
        }`}
      >
        {data.title}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { block: BlockNode, lane: LaneNode };

/* ── graph definition ───────────────────────────────────────────────────── */

interface GroupSpec {
  id: LogicGroupId;
  title: string;
  order: number;
  subtitle?: string;
  note?: string;
  paramIds: string[];
  kind: "block" | "constraint";
}

const GROUPS: GroupSpec[] = [
  // Main chain, laid out in PHYSICAL-CAUSALITY order (left → right).
  // Design-reasoning order runs the other way (badges 1…7, right → left).
  {
    id: "geometry",
    title: "Spring Geometry / Material",
    order: 7,
    subtitle: "What gets manufactured",
    paramIds: ["d", "D", "OD", "ID", "Na", "G"],
    kind: "block",
  },
  {
    id: "rate",
    title: "Spring Rate",
    order: 6,
    subtitle: "k = G·d⁴ / (8·D³·N_a)",
    paramIds: ["k", "C"],
    kind: "block",
  },
  {
    id: "installation",
    title: "Spring Installation / Hooke's Law",
    order: 5,
    subtitle: "F = k·x · x = L_f − L",
    paramIds: ["F1", "x1", "L_free", "L_min"],
    kind: "block",
  },
  {
    id: "drive",
    title: "Spring Drives Hammer",
    order: 4,
    subtitle: "1:1 displacement assumed (V1)",
    paramIds: ["s_h", "L2", "L3", "F2", "F3", "W_run"],
    kind: "block",
  },
  {
    id: "hammer",
    title: "Hammer State at Impact",
    order: 3,
    paramIds: ["m", "v", "p", "KE"],
    kind: "block",
  },
  {
    id: "impact",
    title: "Hammer–Latch Impact",
    order: 2,
    subtitle: "Impact model — NOT solved in V1",
    note:
      "Peak dynamic contact force also depends on contact stiffness, collision duration, deformation, rebound, friction and effective moving masses. Spring force at contact (F2) is NOT the impact force.",
    paramIds: ["p", "KE"],
    kind: "block",
  },
  {
    id: "latch",
    title: "Latch Requirement",
    order: 1,
    subtitle: "Upstream requirement — assumed, not derived",
    paramIds: ["F_latch_peak", "F_latch_avg", "y_latch"],
    kind: "block",
  },
  // Constraint nodes underneath.
  {
    id: "stress-constraint",
    title: "Stress Constraint",
    order: 0,
    subtitle: "τ = K_w·8·F1·D/(π·d³) < τ_allow",
    paramIds: ["Kw", "tau", "tau_allow", "utilization"],
    kind: "constraint",
  },
  {
    id: "solid-constraint",
    title: "Solid Height / Coil Bind",
    order: 0,
    subtitle: "L_min > H_s + c_req",
    paramIds: ["Nt", "Hs", "clearance", "required_clearance"],
    kind: "constraint",
  },
];

const LANES = getLaneSpecs();
const CANONICAL_POSITIONS = getCanonicalPositions();

const PHYSICAL_CHAIN: Array<{ source: LogicGroupId; target: LogicGroupId; sourceHandle?: string; targetHandle?: string }> = [
  { source: "geometry", target: "rate" },
  { source: "rate", target: "installation", sourceHandle: "bottom-source", targetHandle: "top-target" },
  { source: "installation", target: "drive" },
  { source: "drive", target: "hammer", sourceHandle: "bottom-source", targetHandle: "top-target" },
  { source: "hammer", target: "impact", sourceHandle: "bottom-source", targetHandle: "top-target" },
  { source: "impact", target: "latch" },
];

const REVERSE_REASONING_CHAIN: Array<{ source: LogicGroupId; target: LogicGroupId }> = [
  { source: "latch", target: "impact" },
  { source: "impact", target: "hammer" },
  { source: "hammer", target: "drive" },
  { source: "drive", target: "installation" },
  { source: "installation", target: "rate" },
  { source: "rate", target: "geometry" },
];

const CONSTRAINT_EDGES: Array<{ source: LogicGroupId; target: LogicGroupId }> = [
  { source: "stress-constraint", target: "installation" },
  { source: "stress-constraint", target: "geometry" },
  { source: "solid-constraint", target: "geometry" },
  { source: "solid-constraint", target: "installation" },
];

/* ── component ──────────────────────────────────────────────────────────── */

interface LogicMapProps {
  model: ModelState;
  values: Record<string, number | undefined>;
  selectedId: string | null;
  violatedParamIds: Set<string>;
  constraints: ConstraintResult[];
  mode: "forward" | "reverse" | "explore";
  onSelect: (id: string) => void;
}

function buildData(g: GroupSpec, props: LogicMapProps): BlockData {
  const { model, values, selectedId, violatedParamIds, constraints, onSelect } = props;
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
      const highlighted = selectedId ? isConnected : true;
      const muted = selectedId ? !isConnected : false;
      return {
        id,
        symbol: def.symbol,
        name: def.name,
        display: def.unit === "in" ? formatLengthValue(values[id]) : formatValue(values[id]),
        unit: def.unit,
        status: model[id].status,
        violated: violatedParamIds.has(id),
        selected: selectedId === id,
        highlighted,
        muted,
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
    onSelect,
    kind: g.kind,
  };
}

function getSelectedLane(selectedId: string | null): EngineeringLane | null {
  if (!selectedId) return null;
  const owning = GROUPS.find((g) => g.kind === "block" && g.paramIds.includes(selectedId));
  if (owning) return CANONICAL_NODE_LAYOUT[owning.id].lane;
  const fallback = GROUPS.find((g) => g.paramIds.includes(selectedId));
  return fallback ? CANONICAL_NODE_LAYOUT[fallback.id].lane : null;
}

function buildLaneNodes(selectedLane: EngineeringLane | null): LaneNodeType[] {
  return LANES.map((lane) => ({
    id: `lane-${lane.id}`,
    type: "lane" as const,
    position: { x: lane.x, y: lane.y },
    draggable: false,
    selectable: false,
    zIndex: 0,
    data: {
      title: lane.title,
      active: selectedLane === lane.id,
      width: lane.width,
      height: lane.height,
    },
  }));
}

function buildGraphNodes(
  props: LogicMapProps,
  positions: Partial<Record<LogicGroupId, { x: number; y: number }>>,
): BlockNodeType[] {
  return GROUPS.map((g) => {
    const layout = positions[g.id] ?? CANONICAL_POSITIONS[g.id];
    return {
      id: g.id,
      type: "block" as const,
      position: { x: layout.x, y: layout.y },
      draggable: false,
      zIndex: 10,
      data: buildData(g, props),
    };
  });
}

export function LogicMap(props: LogicMapProps) {
  const { model, values, selectedId, violatedParamIds, constraints, onSelect, mode } = props;
  const [rfInstance, setRfInstance] =
    useState<ReactFlowInstance<BlockNodeType | LaneNodeType, Edge> | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedLane = getSelectedLane(selectedId);
  const initialNodes = [
    ...buildLaneNodes(selectedLane),
    ...buildGraphNodes(props, CANONICAL_POSITIONS),
  ] as Array<BlockNodeType | LaneNodeType>;
  const [nodes, setNodes, onNodesChange] =
    useNodesState<BlockNodeType | LaneNodeType>(initialNodes);

  useEffect(() => {
    const next = { model, values, selectedId, violatedParamIds, constraints, mode, onSelect };
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type === "lane") {
          const lane = LANES.find((l) => `lane-${l.id}` === n.id);
          if (!lane) return n;
          return {
            ...n,
            data: {
              title: lane.title,
              active: selectedLane === lane.id,
              width: lane.width,
              height: lane.height,
            },
          };
        }
        const spec = GROUPS.find((g) => g.id === n.id);
        return spec ? { ...n, data: buildData(spec, next) } : n;
      }),
    );
  }, [model, values, selectedId, violatedParamIds, constraints, mode, onSelect, selectedLane, setNodes]);

  // Static graph: refit whenever the container resizes so the diagram always
  // fills the panel without any manual pan or zoom.
  useEffect(() => {
    if (!rfInstance) return;
    const el = wrapperRef.current;
    if (!el) return;
    const refit = () => void rfInstance.fitView({ padding: 0.06 });
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rfInstance]);

  const edges = useMemo<Edge[]>(() => {
    const physicalStyleByMode =
      mode === "forward"
        ? { stroke: "#3f3f46", strokeWidth: 1.8, opacity: 0.96, strokeDasharray: undefined }
        : mode === "reverse"
          ? { stroke: "#a1a1aa", strokeWidth: 1.15, opacity: 0.35, strokeDasharray: "4 3" }
          : { stroke: "#52525b", strokeWidth: 1.45, opacity: 0.8, strokeDasharray: undefined };

    const reverseStyleByMode =
      mode === "reverse"
        ? { stroke: "#1d4ed8", strokeWidth: 1.75, opacity: 0.95, strokeDasharray: undefined }
        : mode === "forward"
          ? { stroke: "#94a3b8", strokeWidth: 1, opacity: 0.22, strokeDasharray: "3 3" }
          : { stroke: "#64748b", strokeWidth: 1.1, opacity: 0.3, strokeDasharray: "3 3" };

    const physicalEdges: Edge[] = PHYSICAL_CHAIN.map(({ source, target, sourceHandle, targetHandle }) => ({
      id: `physical-${source}-${target}`,
      source,
      sourceHandle,
      target,
      targetHandle,
      animated: mode === "forward",
      style: physicalStyleByMode,
      markerEnd: { type: MarkerType.ArrowClosed, color: String(physicalStyleByMode.stroke), width: 16, height: 16 },
    }));

    const reverseEdges: Edge[] = REVERSE_REASONING_CHAIN.map(({ source, target }) => ({
      id: `reverse-${source}-${target}`,
      source,
      target,
      animated: mode === "reverse",
      style: reverseStyleByMode,
      markerEnd: { type: MarkerType.ArrowClosed, color: String(reverseStyleByMode.stroke), width: 14, height: 14 },
    }));

    const constraintEdges: Edge[] = CONSTRAINT_EDGES.map(({ source, target }) => ({
      id: `constraint-${source}-${target}`,
      source,
      sourceHandle: "top-source",
      target,
      targetHandle: "bottom-target",
      style: { stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "2 4", opacity: 0.72 },
      markerEnd: { type: MarkerType.Arrow, color: "#94a3b8" },
    }));

    return [...physicalEdges, ...reverseEdges, ...constraintEdges];
  }, [mode]);

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-zinc-200 bg-white"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(instance) => setRfInstance(instance)}
        onNodesChange={(changes) => onNodesChange(changes as Parameters<typeof onNodesChange>[0])}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.06 }}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      >
        <Background color="#e4e4e7" gap={18} />
        <Panel position="top-left">
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
                ? "physical causality (left → right) emphasized"
                : mode === "reverse"
                  ? "reverse design reasoning (right → left) emphasized"
                  : "forward and reverse relationships shown with balanced emphasis"}
            </div>
            <div>
              <span className="font-semibold text-zinc-800">Lanes:</span> spring design,
              spring behavior, hammer dynamics, latch requirement.
            </div>
            {selectedId && (
              <div className="mt-0.5 text-zinc-500">
                <span className="font-semibold text-zinc-800">selection:</span> connected
                parameters stay lit; unrelated ones dim.
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
        </Panel>
      </ReactFlow>
    </div>
  );
}
