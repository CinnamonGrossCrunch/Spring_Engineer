"use client";

import { useState, type ReactNode } from "react";
import type { V2Candidate, V2Material } from "@/lib/v2/types";
import { computeHistoricalReference } from "@/lib/v2/defaults";
import { applyImpactLens, type V2EtaMode } from "@/lib/v2/impactLens";
import {
  STRESS_BAND_META,
  fmtCoils,
  fmtIn,
  fmtLbf,
  fmtPct,
  fmtRate,
  fmtWork,
} from "./v2format";
import { formatValue } from "../StatusBadge";
import { canonicalName, canonicalSym } from "@/lib/engineering/nomenclature";

interface Props {
  candidate: V2Candidate;
  material: V2Material;
  shortlisted: boolean;
  onToggleShortlist: () => void;
  onInspectInV1: () => void;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-zinc-100 px-3 py-2 first:border-t-0">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{title}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">{children}</dl>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="col-span-1 flex items-baseline justify-between gap-2">
      <dt className="text-[11px] leading-tight text-zinc-500" title={hint}>
        {label}
      </dt>
      <dd className="font-mono text-[11.5px] font-medium text-zinc-800">{value}</dd>
    </div>
  );
}

/**
 * V2 performance panel for the selected candidate. Keeps a strict conceptual
 * distinction between spring force, ideal release work, and the ideal
 * force-equivalent proxies (never labeled as impact/contact force). The
 * efficiency + hammer-mass "Advanced Impact Lens" is optional and clearly
 * separated from the ideal metrics.
 */
export function V2PerformancePanel({
  candidate: c,
  material,
  shortlisted,
  onToggleShortlist,
  onInspectInV1,
}: Props) {
  const [etaMode, setEtaMode] = useState<V2EtaMode>("unspecified");
  const [etaValue, setEtaValue] = useState(0.9);
  const [mass, setMass] = useState(0.28);

  const band = STRESS_BAND_META[c.feasibility.stressBand];
  const hist = computeHistoricalReference();
  const lens = applyImpactLens(c, etaMode, etaValue, mass);

  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">Selected Candidate</h2>
          <p className="font-mono text-[11px] text-zinc-500">
            d = {c.d.toFixed(3)} in · Na = {fmtCoils(c.Na)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleShortlist}
            aria-pressed={shortlisted}
            className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
              shortlisted
                ? "border-amber-400 bg-amber-100 text-amber-800"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
            }`}
            title="Add / remove from shortlist"
          >
            {shortlisted ? "★ Shortlisted" : "☆ Shortlist"}
          </button>
          <button
            type="button"
            onClick={onInspectInV1}
            className="rounded border border-blue-400 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
            title="Explicitly map this candidate into V1 → Engineering (overwrites V1 state)"
          >
            Inspect in Engineering →
          </button>
        </div>
      </div>

      {/* Feasibility banner */}
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
            c.feasibility.feasible
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {c.feasibility.feasible ? "Mathematically feasible in V2" : "Excluded from feasible set"}
        </span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${band.badge}`} title={band.note}>
          Stress {band.label}
        </span>
        {!c.feasibility.springIndexAdvisoryOk && (
          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Spring index outside ~4–12 (advisory only)">
            Index advisory
          </span>
        )}
        <span className="ml-auto text-[10px] italic text-zinc-400">not vendor validated</span>
      </div>

      <Group title="Geometry">
        <Row label="Wire Diameter" value={fmtIn(c.d)} />
        <Row label="Active Coils" value={fmtCoils(c.Na)} />
        <Row label="Total Coils" value={fmtCoils(c.Nt)} />
        <Row label="Spring Index C" value={formatValue(c.C)} />
        <Row label="Outside Diameter" value={fmtIn(c.OD)} />
        <Row label="Inside Diameter" value={fmtIn(c.ID)} />
      </Group>

      <Group title="Package">
        <Row label="Max Solid Height" value={fmtIn(c.HsMax)} hint="Lee max = 1.05 × nominal solid height" />
        <Row label={`${canonicalName("Lc")} ${canonicalSym("Lc")}`} value={fmtIn(c.Lc)} />
        <Row label={`${canonicalName("s")} ${canonicalSym("s")}`} value={fmtIn(c.s)} hint="s = B − Lc" />
        <Row label={`${canonicalName("Lf")} ${canonicalSym("Lf")}`} value={fmtIn(c.Lf)} hint="Output, not a target" />
      </Group>

      <Group title="Spring Behavior">
        <Row label={`${canonicalName("k")} ${canonicalSym("k")}`} value={fmtRate(c.k)} />
        <Row label={`${canonicalName("F0")} ${canonicalSym("F0")}`} value={fmtLbf(c.F0)} />
        <Row label={`${canonicalName("F2")} ${canonicalSym("F2")}`} value={fmtLbf(c.F2)} hint="Spring force at hammer contact — not impact force" />
        <Row label={`${canonicalName("F3")} ${canonicalSym("F3")}`} value={fmtLbf(c.F3)} />
      </Group>

      <Group title="Work">
        <Row label={`${canonicalName("Whammer")} ${canonicalSym("Whammer")}`} value={fmtWork(c.Whammer)} />
        <Row label={`${canonicalName("Wlatch")} ${canonicalSym("Wlatch")}`} value={fmtWork(c.Wlatch)} />
        <Row label={`${canonicalName("WreleaseIdeal")} ${canonicalSym("WreleaseIdeal")}`} value={fmtWork(c.WreleaseIdeal)} hint="Ideal upper bound — not energy delivered to the latch" />
        <Row
          label="Stress τ / TS"
          value={`${fmtPct(c.stressPctOptimistic)}–${fmtPct(c.stressPctConservative)}`}
          hint={`τ = ${Math.round(c.tau).toLocaleString()} psi vs ${Math.round(material.tensileMinPsi / 1000)}–${Math.round(material.tensileMaxPsi / 1000)} ksi`}
        />
      </Group>

      {/* Ideal force-equivalent proxies — visually distinct from contact force */}
      <div className="border-t border-zinc-100 bg-blue-50/40 px-3 py-2">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-blue-500">
          Ideal Force-Equivalent Metrics
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-blue-200 bg-white px-2 py-1.5">
            <div className="text-[10px] leading-tight text-zinc-500">{canonicalName("FeqAvgIdeal")}</div>
            <div className="font-mono text-[17px] font-bold text-blue-700">{fmtLbf(c.FeqAvgIdeal)}</div>
            <div className="text-[9px] italic text-zinc-400">= W_release,ideal / y · not actual average latch force</div>
          </div>
          <div className="rounded border border-blue-200 bg-white px-2 py-1.5">
            <div className="text-[10px] leading-tight text-zinc-500">{canonicalName("FeqTriPeakIdeal")}</div>
            <div className="font-mono text-[17px] font-bold text-blue-700">{fmtLbf(c.FeqTriPeakIdeal)}</div>
            <div className="text-[9px] italic text-zinc-400">= 2 × ideal avg · not peak impact force</div>
          </div>
        </div>
      </div>

      {/* Historical whiteboard reference */}
      <details className="border-t border-zinc-100">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-zinc-600">
          Historical whiteboard reference (not a requirement)
        </summary>
        <div className="px-3 pb-3">
          <p className="mb-1.5 text-[10px] leading-tight text-zinc-400">
            Reconstructed from nominal spring work (F₀=140, k=280, s=0.250, y=0.070); exact original
            derivation not confirmed. Never used as a feasibility threshold.
          </p>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
              ~{Math.round(hist.FeqAvgIdeal)} lbf avg equivalent
            </span>
            <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1">
              ~{Math.round(hist.FeqTriPeakIdeal)} lbf triangular peak equivalent
            </span>
          </div>
        </div>
      </details>

      {/* Advanced impact lens — optional, not core optimization */}
      <details className="border-t border-zinc-100">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-zinc-600">
          Advanced Impact Lens (efficiency + hammer mass)
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="flex flex-wrap items-center gap-1">
            {(["unspecified", "ideal", "assumed", "measured"] as V2EtaMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setEtaMode(m)}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  etaMode === m ? "border-zinc-800 bg-zinc-800 text-white" : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {m === "unspecified" ? "Not specified" : m === "ideal" ? "Ideal η=1.0" : m === "assumed" ? "Assumed" : "Measured"}
              </button>
            ))}
          </div>

          {(etaMode === "assumed" || etaMode === "measured") && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-zinc-600">η</label>
              <input
                type="number"
                value={etaValue}
                step={0.05}
                min={0}
                max={1}
                onChange={(e) => setEtaValue(Number.parseFloat(e.target.value) || 0)}
                className="w-[70px] rounded border border-zinc-300 px-1.5 py-1 text-right font-mono text-[12px] focus:border-blue-500 focus:outline-none"
              />
              <span
                className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                  etaMode === "measured"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-amber-300 bg-amber-50 text-amber-700"
                }`}
              >
                {etaMode === "measured" ? "measured input" : "assumed input"}
              </span>
            </div>
          )}

          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
            {etaMode === "unspecified"
              ? "Efficiency not specified — the primary V2 metric operates on ideal spring work."
              : etaMode === "ideal"
                ? "η = 1.0 lossless upper bound only."
                : etaMode === "assumed"
                  ? "η is a user assumption, treated as external input — not a measured result."
                  : "η reflects testing/field data — treated as a measured external input."}
          </p>

          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <Row label="Ideal hammer work" value={fmtWork(c.Whammer)} />
            <Row label="η · hammer work" value={lens.WhammerAvailable === undefined ? "—" : fmtWork(lens.WhammerAvailable)} />
            <Row label="Ideal release work" value={fmtWork(c.WreleaseIdeal)} />
            <Row label="Efficiency-adj. release" value={lens.WreleaseEta === undefined ? "—" : fmtWork(lens.WreleaseEta)} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] text-zinc-600">Hammer mass (secondary)</label>
            <input
              type="number"
              value={mass}
              step={0.01}
              min={0}
              onChange={(e) => setMass(Number.parseFloat(e.target.value) || 0)}
              className="w-[70px] rounded border border-zinc-300 px-1.5 py-1 text-right font-mono text-[12px] focus:border-blue-500 focus:outline-none"
            />
            <span className="text-[10px] text-zinc-400">lbm</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <Row label="Hammer KE" value={lens.KE === undefined ? "—" : `${formatValue(lens.KE)} ft·lbf`} />
            <Row label="Hammer velocity" value={lens.velocity === undefined ? "—" : `${formatValue(lens.velocity)} ft/s`} />
            <Row label="Hammer momentum" value={lens.momentum === undefined ? "—" : `${formatValue(lens.momentum)} lbm·ft/s`} />
          </div>
          <p className="text-[9.5px] italic leading-tight text-zinc-400">
            Hammer mass is not needed for the spring geometry optimization; it only feeds these
            secondary kinematics. None of these determine dynamic contact force.
          </p>
        </div>
      </details>
    </div>
  );
}
