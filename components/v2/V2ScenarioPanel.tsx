"use client";

import { useId } from "react";
import type { V2Material, V2Scenario, V2StressBasis } from "@/lib/v2/types";
import { DEFLECTION_UTILIZATION_SCENARIOS } from "@/lib/v2/defaults";
import { SOURCE_TAG, fmtPct } from "./v2format";
import { DeflectionConstraintControl } from "../DeflectionConstraintControl";
import type { DeflectionConstraintState } from "@/lib/engineering/deflectionConstraint";

interface Props {
  scenario: V2Scenario;
  material: V2Material;
  onChange: (patch: Partial<V2Scenario>) => void;
  onReset: () => void;
  deflectionConstraint: DeflectionConstraintState;
  onDeflectionConstraintChange: (value: DeflectionConstraintState) => void;
  referenceWorkingDeflection?: number;
}

function SourceTag({ kind, children }: { kind: keyof typeof SOURCE_TAG; children: string }) {
  return (
    <span
      className={`inline-block rounded border px-1 py-px text-[8.5px] font-semibold uppercase tracking-wide ${SOURCE_TAG[kind]}`}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  tag,
  tagKind,
  children,
}: {
  title: string;
  tag: string;
  tagKind: keyof typeof SOURCE_TAG;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-100 px-3 py-2.5 first:border-t-0">
      <div className="mb-2 flex items-center gap-1.5">
        <SourceTag kind={tagKind}>{tag}</SourceTag>
        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">{title}</span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  symbol,
  value,
  step,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  symbol?: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 text-[11.5px] leading-tight text-zinc-600">
        {label}
        {symbol && <span className="ml-1 font-mono text-[10px] text-zinc-400">{symbol}</span>}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="w-[74px] rounded border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-[12px] text-zinc-800 focus:border-blue-500 focus:outline-none"
        />
        <span className="w-[42px] text-[10px] text-zinc-400">{unit}</span>
      </div>
    </div>
  );
}

/**
 * V2 scenario panel with a strong epistemic hierarchy: actual mechanism
 * boundaries vs. study assumptions vs. Lee-derived guidance vs. design margin.
 * Editing any value updates the parent scenario, which re-runs the memoized
 * sweep.
 */
export function V2ScenarioPanel({
  scenario,
  material,
  onChange,
  onReset,
  deflectionConstraint,
  onDeflectionConstraintChange,
  referenceWorkingDeflection,
}: Props) {
  return (
    <div className="flex flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-800">Scenario</h2>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-zinc-300 px-2 py-0.5 text-[10.5px] font-medium text-zinc-500 hover:bg-zinc-100"
          title="Reset the V2 scenario to the Sweep #1 defaults"
        >
          Reset study
        </button>
      </div>

      <Section title="Actual Mechanism Boundaries" tag="Constraint" tagKind="mechanism">
        <NumberField
          label="Starting force cap"
          symbol="F₀ ≤"
          value={scenario.forceCap}
          step={5}
          min={0}
          unit="lbf"
          onChange={(v) => onChange({ forceCap: v })}
        />
        <NumberField
          label="Axial budget (spring + run-up stroke)"
          symbol="B"
          value={scenario.axialBudget}
          step={0.01}
          min={0}
          unit="in"
          onChange={(v) => onChange({ axialBudget: v })}
        />
        <NumberField
          label="Latch follow-through"
          symbol="y"
          value={scenario.latchTravel}
          step={0.005}
          min={0}
          unit="in"
          onChange={(v) => onChange({ latchTravel: v })}
        />
        <p className="text-[10px] leading-tight text-zinc-400">
          Candidates are evaluated <span className="font-semibold">at</span> the force cap
          (F₀ = {scenario.forceCap} lbf), maximizing mechanism performance under it.
        </p>
      </Section>

      <Section title="Fixed For This Study" tag="Study" tagKind="study">
        <NumberField
          label="Nominal spring OD"
          symbol="OD"
          value={scenario.outerDiameter}
          step={0.005}
          min={0}
          unit="in"
          onChange={(v) => onChange({ outerDiameter: v })}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-zinc-600">Material</span>
          <span className="text-[11px] font-medium text-zinc-700">
            {material.name}
            {material.specification ? ` · ${material.specification}` : ""}
          </span>
        </div>
        <p className="text-[10px] leading-tight text-zinc-400">
          OD is a deliberate first-pass study assumption, not a hard mechanism constraint.
          Benchmark material model — not an approved aerospace material.
        </p>
      </Section>

      <Section title="Lee-Derived Model Guidance" tag="Lee" tagKind="lee">
        <NumberField
          label="Solid-height tolerance (Lee +%)"
          symbol="Hₛ,max"
          value={scenario.solidHeightTolerance * 100}
          step={1}
          min={0}
          unit="%"
          onChange={(v) => onChange({ solidHeightTolerance: v / 100 })}
        />
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px] text-zinc-500">
          <span>Shear modulus G</span>
          <span className="text-right font-mono text-zinc-700">
            {(material.shearModulusPsi / 1e6).toFixed(1)} Mpsi
          </span>
          <span>Tensile range (TS)</span>
          <span className="text-right font-mono text-zinc-700">
            {Math.round(material.tensileMinPsi / 1000)}–{Math.round(material.tensileMaxPsi / 1000)} ksi
          </span>
          <span>Stress guidance</span>
          <span className="text-right font-mono text-zinc-700">≤40% · 40–60% · &gt;60% TS</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-zinc-600">Stress classification basis</span>
          <select
            value={scenario.stressBasis}
            onChange={(e) => onChange({ stressBasis: e.target.value as V2StressBasis })}
            className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-[11px] text-zinc-700 focus:border-blue-500 focus:outline-none"
          >
            <option value="conservative">Conservative (270 ksi)</option>
            <option value="mid">Mid (285 ksi)</option>
            <option value="upper">Upper (300 ksi)</option>
          </select>
        </div>
        <p className="text-[10px] leading-tight text-zinc-400">
          270 ksi is Lee&apos;s tensile strength used for percent-stress guidance — not an
          &quot;allowable shear stress.&quot; The 40 / 60% bands are set / redesign guidance, not
          yield or ultimate limits.
        </p>
      </Section>

      <Section title="Deflection / Coil-Bind Margin" tag="Constraint" tagKind="mechanism">
        <DeflectionConstraintControl
          value={deflectionConstraint}
          workingDeflection={referenceWorkingDeflection}
          onChange={onDeflectionConstraintChange}
          compact
        />
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-zinc-400">Utilization scenarios:</span>
          {DEFLECTION_UTILIZATION_SCENARIOS.map((u) => {
            const active = Math.abs(scenario.maxDeflectionUtilization - u) < 1e-6;
            return (
              <button
                key={u}
                type="button"
                onClick={() => onChange({ maxDeflectionUtilization: u })}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  active
                    ? "border-violet-500 bg-violet-100 text-violet-800"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {(u * 100).toFixed(0)}%
              </button>
            );
          })}
        </div>
        <p className="text-[10px] leading-tight text-zinc-400">
          This is a design-scenario input, not a Lee requirement. Lower utilization reserves more travel above Hₛ,max and can remove candidates by consuming axial run-up budget.
        </p>
      </Section>

      <details className="border-t border-zinc-100">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-zinc-600">
          Advanced sweep settings
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-[10px] leading-tight text-zinc-400">
            Numerical search ranges — NOT manufacturing limits. Fractional coil counts are
            supported.
          </p>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Wire diameter d
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="min" value={scenario.wireMin} step={0.001} unit="in" onChange={(v) => onChange({ wireMin: v })} />
            <NumberField label="max" value={scenario.wireMax} step={0.001} unit="in" onChange={(v) => onChange({ wireMax: v })} />
            <NumberField label="step" value={scenario.wireStep} step={0.001} unit="in" onChange={(v) => onChange({ wireStep: v })} />
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Active coils Na
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="min" value={scenario.activeCoilsMin} step={0.1} unit="" onChange={(v) => onChange({ activeCoilsMin: v })} />
            <NumberField label="max" value={scenario.activeCoilsMax} step={0.1} unit="" onChange={(v) => onChange({ activeCoilsMax: v })} />
            <NumberField label="step" value={scenario.activeCoilsStep} step={0.05} unit="" onChange={(v) => onChange({ activeCoilsStep: v })} />
          </div>
          <p className="text-[10px] leading-tight text-zinc-400">
            Solid-height boundary is Lee max (Hₛ,max = {fmtPct(scenario.solidHeightTolerance)} over
            nominal). The shared utilization limit is applied after that boundary and determines each candidate&apos;s required operating clearance.
          </p>
        </div>
      </details>
    </div>
  );
}
