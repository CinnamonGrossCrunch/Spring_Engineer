"use client";

import { type ReactNode, useMemo, useState } from "react";
import type { V2Candidate, V2SweepResult } from "@/lib/v2/types";
import { canonicalName, canonicalSym } from "@/lib/engineering/nomenclature";
import { STRESS_BAND_META, fmtCoils } from "./v2format";
import { formatValue } from "../StatusBadge";
import { candidateCsvFilename, generateCandidateCsv } from "@/lib/v2/candidateCsv";
import { CandidateCsvButton } from "./CandidateCsvButton";
import {
  sortV2CandidatesByPriorities,
  type V2CandidateSortKey,
  type V2CandidateSortPriority,
} from "@/lib/v2/candidateSort";

interface Props {
  sweep: V2SweepResult;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  shortlist: string[];
  onToggleShortlist: (key: string) => void;
}

interface Col {
  key: V2CandidateSortKey;
  plainLabel: string;
  label: string;
  fmt: (c: V2Candidate) => string;
}

function renderSymbol(sym: string): ReactNode {
  const i = sym.indexOf("_");
  if (i < 0) return sym;
  const base = sym.slice(0, i);
  const sub = sym.slice(i + 1);
  return (
    <>
      {base}
      <sub className="text-[0.72em]">{sub}</sub>
    </>
  );
}

const COLS: Col[] = [
  { key: "d", plainLabel: canonicalName("d"), label: canonicalSym("d"), fmt: (c) => c.d.toFixed(3) },
  { key: "Na", plainLabel: canonicalName("Na"), label: canonicalSym("Na"), fmt: (c) => fmtCoils(c.Na) },
  { key: "Nt", plainLabel: canonicalName("Nt"), label: canonicalSym("Nt"), fmt: (c) => fmtCoils(c.Nt) },
  { key: "k", plainLabel: canonicalName("k"), label: canonicalSym("k"), fmt: (c) => formatValue(c.k) },
  { key: "Lc", plainLabel: canonicalName("Lc"), label: canonicalSym("Lc"), fmt: (c) => c.Lc.toFixed(3) },
  { key: "solidClearance", plainLabel: "Clearance above maximum solid", label: "c_req", fmt: (c) => c.solidClearance.toFixed(3) },
  { key: "deflectionUtilization", plainLabel: "Scenario max deflection utilization", label: "u_max", fmt: (c) => (c.deflectionUtilization * 100).toFixed(0) },
  { key: "s", plainLabel: canonicalName("s"), label: canonicalSym("s"), fmt: (c) => c.s.toFixed(3) },
  { key: "Lf", plainLabel: canonicalName("Lf"), label: canonicalSym("Lf"), fmt: (c) => c.Lf.toFixed(3) },
  { key: "F2", plainLabel: canonicalName("F2"), label: canonicalSym("F2"), fmt: (c) => formatValue(c.F2) },
  { key: "F3", plainLabel: canonicalName("F3"), label: canonicalSym("F3"), fmt: (c) => formatValue(c.F3) },
  { key: "Whammer", plainLabel: canonicalName("Whammer"), label: canonicalSym("Whammer"), fmt: (c) => formatValue(c.Whammer) },
  { key: "Wlatch", plainLabel: canonicalName("Wlatch"), label: canonicalSym("Wlatch"), fmt: (c) => formatValue(c.Wlatch) },
  { key: "FeqAvgIdeal", plainLabel: canonicalName("FeqAvgIdeal"), label: canonicalSym("FeqAvgIdeal"), fmt: (c) => formatValue(c.FeqAvgIdeal) },
  { key: "stressPctConservative", plainLabel: "Stress pct", label: "%TS", fmt: (c) => `${(c.stressPctConservative * 100).toFixed(0)}` },
];

/**
 * V2 candidate table. Default rows are the Pareto frontier; a toggle switches to
 * the top feasible candidates by the selected sort. Header is "Best by selected
 * metric", never "the answer".
 */
export function V2CandidateTable({ sweep, selectedKey, onSelect, shortlist, onToggleShortlist }: Props) {
  const [mode, setMode] = useState<"pareto" | "feasible">("pareto");
  const [sortPriorities, setSortPriorities] = useState<V2CandidateSortPriority[]>([
    { key: "FeqAvgIdeal", direction: "desc" },
  ]);
  const [sortIsDefault, setSortIsDefault] = useState(true);

  const rows = useMemo(() => {
    const source =
      mode === "pareto"
        ? sweep.candidates.filter((c) => c.pareto)
        : sweep.feasible;
    const sorted = sortV2CandidatesByPriorities(source, sortPriorities);
    return sorted.slice(0, 60);
  }, [sweep, mode, sortPriorities]);

  const setSort = (key: V2CandidateSortKey) => {
    if (sortIsDefault) {
      setSortIsDefault(false);
      setSortPriorities([{ key, direction: "desc" }]);
      return;
    }
    setSortPriorities((current) => {
      const existing = current.findIndex((priority) => priority.key === key);
      if (existing >= 0) {
        return current.map((priority, index) =>
          index === existing
            ? { ...priority, direction: priority.direction === "asc" ? "desc" : "asc" }
            : priority,
        );
      }
      const next = [...current, { key, direction: "desc" as const }];
      return next.length <= 3 ? next : [...next.slice(0, 2), next[next.length - 1]];
    });
  };

  const removeSort = (key: V2CandidateSortKey) => {
    setSortIsDefault(false);
    setSortPriorities((current) => current.filter((priority) => priority.key !== key));
  };

  const columnFor = (key: V2CandidateSortKey) => COLS.find((column) => column.key === key)!;

  const exportCsv = () => {
    const csv = generateCandidateCsv(rows, shortlist);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = candidateCsvFilename(mode);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">
            Candidates — best by selected metric
          </h2>
          <p className="text-[10.5px] text-zinc-400">Ranked list, not &quot;the answer&quot;.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CandidateCsvButton disabled={rows.length === 0} onClick={exportCsv} />
          <div className="flex overflow-hidden rounded-md border border-zinc-300 text-[11px]">
            {(["pareto", "feasible"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 py-1 font-medium transition-colors ${
                  mode === m ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {m === "pareto" ? `Pareto (${sweep.paretoKeys.length})` : `Feasible (${sweep.feasibleCount})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/60 px-3 py-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Sort priority</span>
        {sortPriorities.length === 0 ? (
          <span className="text-[10.5px] text-zinc-400">None — click a column heading to begin</span>
        ) : (
          sortPriorities.map((priority, index) => (
            <span key={priority.key} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] text-blue-800">
              <span className="font-bold">{index + 1}</span>
              <span>{columnFor(priority.key).plainLabel}</span>
              {sortIsDefault && <span className="text-[9px] text-blue-400">default</span>}
              <span aria-label={priority.direction === "asc" ? "ascending" : "descending"}>{priority.direction === "asc" ? "↑" : "↓"}</span>
              <button type="button" onClick={() => removeSort(priority.key)} className="ml-0.5 text-blue-400 hover:text-red-600" aria-label={`Remove ${columnFor(priority.key).plainLabel} from sort priorities`}>×</button>
            </span>
          ))
        )}
        {sortPriorities.length > 0 && (
          <button type="button" onClick={() => { setSortIsDefault(false); setSortPriorities([]); }} className="ml-auto text-[10px] font-medium text-zinc-400 hover:text-zinc-700">Clear sorting</button>
        )}
        <span className="basis-full text-[9.5px] text-zinc-400">The first click replaces the default; then click up to two more headings. Active headings toggle direction; near-equal 1% bands advance to the next priority.</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-zinc-400">No candidates in this set.</p>
      ) : (
        <div className="max-h-[320px] overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10 bg-zinc-50">
              <tr className="border-b border-zinc-200 text-[9.5px] uppercase tracking-wide text-zinc-400">
                <th className="px-1.5 py-1 text-left font-semibold">shortlist</th>
                {COLS.map((col) => (
                  <th key={`plain-${col.key}`} className="px-1.5 py-1 text-right font-semibold whitespace-normal leading-tight">
                    <button
                      type="button"
                      onClick={() => setSort(col.key)}
                      className={`inline-flex items-center justify-end gap-1 text-right hover:text-zinc-700 ${sortPriorities.some((priority) => priority.key === col.key) ? "text-blue-600" : ""}`}
                      title={`Add ${col.plainLabel} to sort priorities or toggle its direction`}
                    >
                      {col.plainLabel}
                      {sortPriorities.findIndex((priority) => priority.key === col.key) >= 0 && (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                          {sortPriorities.findIndex((priority) => priority.key === col.key) + 1}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
                <th className="px-1.5 py-1 text-center font-semibold">stress band</th>
              </tr>
              <tr className="text-[16px] text-black">
                <th className="px-1.5 py-1.5 text-left font-semibold">★</th>
                {COLS.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-1.5 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSort(col.key)}
                      className={`font-semibold hover:text-zinc-800 ${
                        sortPriorities.some((priority) => priority.key === col.key) ? "text-blue-600" : ""
                      }`}
                      title={`Add ${col.plainLabel} to sort priorities or toggle its direction`}
                    >
                      {renderSymbol(col.label)}
                      {(() => {
                        const active = sortPriorities.find((priority) => priority.key === col.key);
                        return active ? (active.direction === "asc" ? " ▲" : " ▼") : "";
                      })()}
                    </button>
                  </th>
                ))}
                <th className="px-1.5 py-1.5 text-center font-semibold">band</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const selected = c.key === selectedKey;
                const starred = shortlist.includes(c.key);
                const band = STRESS_BAND_META[c.feasibility.stressBand];
                return (
                  <tr
                    key={c.key}
                    onClick={() => onSelect(c.key)}
                    className={`cursor-pointer border-t border-zinc-100 transition-colors ${
                      selected ? "bg-blue-50" : "hover:bg-zinc-50"
                    }`}
                  >
                    <td className="px-1.5 py-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleShortlist(c.key);
                        }}
                        className={starred ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"}
                        aria-label={starred ? "Remove from shortlist" : "Add to shortlist"}
                      >
                        {starred ? "★" : "☆"}
                      </button>
                    </td>
                    {COLS.map((col) => (
                      <td key={col.key} className="whitespace-nowrap px-1.5 py-1 text-right font-mono text-zinc-700">
                        {col.fmt(c)}
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-center">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: band.swatch }} title={band.label} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-1.5 text-[10px] text-zinc-400">
        <span>d, Lc, c_req, s, Lf in inches · u_max and %TS in percent · k in lbf/in · forces in lbf · work in in·lbf</span>
        <span>{rows.length} shown</span>
      </div>
    </div>
  );
}
