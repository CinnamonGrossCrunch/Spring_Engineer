"use client";

import { type ReactNode, useMemo, useState } from "react";
import type { V2Candidate, V2SweepResult } from "@/lib/v2/types";
import { canonicalName, canonicalSym } from "@/lib/engineering/nomenclature";
import { STRESS_BAND_META, fmtCoils } from "./v2format";
import { formatValue } from "../StatusBadge";

interface Props {
  sweep: V2SweepResult;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  shortlist: string[];
  onToggleShortlist: (key: string) => void;
}

type SortKey =
  | "d" | "Na" | "Nt" | "k" | "Lc" | "s" | "Lf" | "F2" | "F3"
  | "Whammer" | "Wlatch" | "FeqAvgIdeal" | "stressPctConservative";

interface Col {
  key: SortKey;
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
  const [sortKey, setSortKey] = useState<SortKey>("FeqAvgIdeal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const source =
      mode === "pareto"
        ? sweep.candidates.filter((c) => c.pareto)
        : sweep.feasible;
    const sorted = [...source].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted.slice(0, 60);
  }, [sweep, mode, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
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
                    {col.plainLabel}
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
                        sortKey === col.key ? "text-blue-600" : ""
                      }`}
                      title={`Sort by ${col.label}`}
                    >
                      {renderSymbol(col.label)}
                      {sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
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
        <span>d, Lc, s, Lf in inches · k in lbf/in · forces in lbf · work in in·lbf</span>
        <span>{rows.length} shown</span>
      </div>
    </div>
  );
}
