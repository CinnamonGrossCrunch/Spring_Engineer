"use client";

import type { ParameterDefinition, ParameterState } from "@/lib/engineering/types";
import { StatusBadge, formatLengthValue, formatValue } from "./StatusBadge";

/**
 * Compact one-line parameter row: symbol · name · value · status · pin.
 * Used in lists (e.g. the energy lens). Clicking the row opens the inspector.
 */
export function ParameterControl({
  def,
  state,
  value,
  selected,
  violated,
  onSelect,
  onTogglePin,
}: {
  def: ParameterDefinition;
  state: ParameterState;
  value: number | undefined;
  selected: boolean;
  violated: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm transition-colors ${
        selected
          ? "border-zinc-800 bg-zinc-50"
          : violated
            ? "border-red-300 bg-red-50/60"
            : "border-zinc-200 bg-white hover:border-zinc-400"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(def.id)}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        title={def.description}
      >
        <span className="shrink-0 font-mono text-[13px] font-semibold text-zinc-800">
          {def.symbol}
        </span>
        <span className="truncate text-xs text-zinc-500">{def.name}</span>
        <span className={`ml-auto shrink-0 font-mono text-[13px] tabular-nums ${violated ? "text-red-600" : "text-zinc-900"}`}>
          {def.unit === "in" ? formatLengthValue(value) : formatValue(value)}
          {def.unit !== "—" && def.unit !== "in" && (
            <span className="ml-1 text-[10px] text-zinc-400">{def.unit}</span>
          )}
        </span>
      </button>
      <StatusBadge status={state.status} violated={violated} compact />
      <button
        type="button"
        onClick={() => onTogglePin(def.id)}
        title={state.status === "fixed" ? "Unpin (allow this value to be edited/derived)" : "Pin as FIXED (engine will never change it)"}
        className={`shrink-0 rounded border px-1 text-[11px] leading-4 ${
          state.status === "fixed"
            ? "border-blue-400 bg-blue-100 text-blue-700"
            : "border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
        }`}
      >
        ⏍
      </button>
    </div>
  );
}
