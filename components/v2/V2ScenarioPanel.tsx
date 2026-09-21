"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { V2Material, V2Scenario } from "@/lib/v2/types";
import { DEFLECTION_UTILIZATION_SCENARIOS } from "@/lib/v2/defaults";
import { SOURCE_TAG, fmtInMm, fmtPct } from "./v2format";
import { DeflectionConstraintControl } from "../DeflectionConstraintControl";
import type { DeflectionConstraintState } from "@/lib/engineering/deflectionConstraint";
import {
  inchesToMillimeters,
  maximumFinishedSpringOuterDiameter,
  millimetersToInches,
  nominalSpringOuterDiameter,
} from "@/lib/v2/envelope";
import { ImpactEquivalentInputs, SpringMaterialInputs } from "./MaterialImpactInputs";
import type { V2Candidate } from "@/lib/v2/types";

interface Props {
  scenario: V2Scenario;
  material: V2Material;
  onChange: (patch: Partial<V2Scenario>) => void;
  onReset: () => void;
  deflectionConstraint: DeflectionConstraintState;
  onDeflectionConstraintChange: (value: DeflectionConstraintState) => void;
  referenceWorkingDeflection?: number;
  referenceShearStressPsi?: number;
  selectedCandidate?: V2Candidate | null;
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

export function ScenarioAccordion({
  title,
  tag,
  tagKind,
  children,
  info,
  testId,
}: {
  title: string;
  tag: string;
  tagKind: keyof typeof SOURCE_TAG;
  children?: React.ReactNode;
  info?: React.ReactNode;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <section className="border-t border-zinc-100 first:border-t-0" data-testid={testId}>
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2.5 text-left hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[12px] font-bold text-zinc-400" aria-hidden="true">
            {open ? "−" : "+"}
          </span>
          <SourceTag kind={tagKind}>{tag}</SourceTag>
          <span className="min-w-0 text-[11px] font-bold uppercase tracking-wide text-zinc-600">{title}</span>
        </button>
        {info && (
          <InfoPopover title={title}>{info}</InfoPopover>
        )}
      </div>
      <div id={contentId} hidden={!open} className="flex flex-col gap-2 px-3 pb-3">
        {children}
      </div>
    </section>
  );
}

function InfoPopover({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative mr-2 my-2 flex shrink-0 items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`Information about ${title}`}
        onClick={() => setOpen((current) => !current)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-zinc-300 text-[11px] font-semibold text-zinc-500 hover:border-blue-400 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        i
      </button>
      {open && (
        <div
          id={popoverId}
          role="note"
          aria-label={`${title} information`}
          className="absolute right-0 top-7 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-300 bg-white p-3 text-[11px] leading-relaxed text-zinc-600 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function NumberField({
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
            if (Number.isFinite(v)) {
              const bounded = Math.min(
                max ?? Number.POSITIVE_INFINITY,
                Math.max(min ?? Number.NEGATIVE_INFINITY, v),
              );
              onChange(bounded);
            }
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
 * boundaries vs. study assumptions vs. derived guidance vs. design margin.
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
  referenceShearStressPsi,
  selectedCandidate,
}: Props) {
  const nominalOuterDiameter = nominalSpringOuterDiameter(scenario);
  const maximumFinishedOuterDiameter = maximumFinishedSpringOuterDiameter(scenario);

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

      <ScenarioAccordion
        title="Actual Mechanism Boundaries"
        tag="Constraint"
        tagKind="mechanism"
        testId="scenario-section-mechanism"
        info={<>Candidates are evaluated at the nominal target (F₀ = {scenario.forceTarget} lbf). When manufacturing tolerances are enabled, the estimated armed-force maximum is checked separately against the absolute {scenario.forceCap} lbf mechanism cap. B is the spring length at hammer contact.</>}
      >
        <NumberField
          label="Nominal starting force"
          symbol="F₀"
          value={scenario.forceTarget}
          step={5}
          min={0}
          max={scenario.forceCap}
          unit="lbf"
          onChange={(v) => onChange({ forceTarget: Math.min(v, scenario.forceCap) })}
        />
        <NumberField
          label="Absolute maximum starting force"
          symbol="F₀,max"
          value={scenario.forceCap}
          step={5}
          min={scenario.forceTarget}
          unit="lbf"
          onChange={(v) => onChange({ forceCap: Math.max(v, scenario.forceTarget) })}
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
          label="Critical release travel"
          symbol="ycritical"
          value={scenario.latchTravel}
          step={0.005}
          min={0.005}
          unit="in"
          onChange={(v) => onChange({
            latchTravel: v,
            totalLatchTravel: Math.max(v, scenario.totalLatchTravel),
          })}
        />
        <NumberField
          label="Total hammer / latch travel"
          symbol="ytotal"
          value={scenario.totalLatchTravel}
          step={0.005}
          min={scenario.latchTravel}
          unit="in"
          onChange={(v) => onChange({ totalLatchTravel: Math.max(scenario.latchTravel, v) })}
        />
        <NumberField
          label="Minimum spring force at end"
          symbol="Fend,min"
          value={scenario.minimumEndForce}
          step={1}
          min={0}
          unit="lbf"
          onChange={(v) => onChange({ minimumEndForce: v })}
        />
        <NumberField
          label="Opposing latch preload"
          symbol="Fopp"
          value={scenario.opposingPreload}
          step={0.1}
          min={0}
          unit="lbf"
          onChange={(v) => onChange({ opposingPreload: v })}
        />
        <NumberField
          label="Housing ID / absolute spring OD"
          symbol="ODₘₐₓ"
          value={inchesToMillimeters(scenario.housingInnerDiameter)}
          step={0.1}
          min={0}
          unit="mm"
          onChange={(v) => onChange({ housingInnerDiameter: millimetersToInches(v) })}
        />
        <div className="rounded border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-[10px] leading-snug text-blue-800">
          End position: <span className="font-mono">B + ytotal = {fmtInMm(scenario.axialBudget + scenario.totalLatchTravel)}</span>. The end-force floor is a nominal quasi-static requirement; enabled manufacturing tolerances are reported separately.
        </div>
        <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-[10.5px] text-zinc-600">
          <input
            type="checkbox"
            checked={scenario.armedHeightConstraintEnabled}
            onChange={(event) => onChange({ armedHeightConstraintEnabled: event.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
          />
          <span>
            <strong className="text-zinc-700">Constrain armed spring height</strong>
            <span className="mt-0.5 block text-[9.5px] leading-snug text-zinc-400">Optional mechanism packaging range. This is separate from clearance above solid.</span>
          </span>
        </label>
        {scenario.armedHeightConstraintEnabled && (
          <div className="rounded border border-zinc-200 bg-white p-2">
            <NumberField
              label="Minimum armed height"
              symbol="Larmed,min"
              value={scenario.armedHeightMin}
              step={0.005}
              min={0}
              max={scenario.armedHeightMax}
              unit="in"
              onChange={(v) => onChange({ armedHeightMin: Math.min(v, scenario.armedHeightMax) })}
            />
            <NumberField
              label="Maximum armed height"
              symbol="Larmed,max"
              value={scenario.armedHeightMax}
              step={0.005}
              min={scenario.armedHeightMin}
              max={scenario.axialBudget}
              unit="in"
              onChange={(v) => onChange({ armedHeightMax: Math.max(v, scenario.armedHeightMin) })}
            />
          </div>
        )}
      </ScenarioAccordion>

      <ScenarioAccordion title="Fixed For This Study" tag="Study" tagKind="study" testId="scenario-section-study">
        <NumberField
          label="Positive OD tolerance allowance"
          symbol="+tolOD"
          value={scenario.outerDiameterTolerance}
          step={0.001}
          min={0}
          max={scenario.housingInnerDiameter}
          unit="in"
          onChange={(v) => onChange({ outerDiameterTolerance: v })}
        />
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px] text-zinc-500">
          <span>Derived nominal spring OD</span>
          <span className="text-right font-mono text-zinc-700">{fmtInMm(nominalOuterDiameter)}</span>
          <span>Worst-case finished OD</span>
          <span className="text-right font-mono text-zinc-700">{fmtInMm(maximumFinishedOuterDiameter)}</span>
        </div>
        <p className="text-[10px] leading-tight text-zinc-400">
          Nominal OD = housing limit − positive tolerance allowance. Add any required diametral
          fit clearance to this allowance. Benchmark material model — not an approved aerospace
          material.
        </p>
      </ScenarioAccordion>

      <ScenarioAccordion title="Spring Material Benchmark" tag="Study" tagKind="study" testId="scenario-section-material">
        <SpringMaterialInputs scenario={scenario} onChange={onChange} candidate={selectedCandidate} embedded />
      </ScenarioAccordion>

      <ScenarioAccordion title="Impact-Equivalent Assumptions" tag="Assumed" tagKind="vendor" testId="scenario-section-impact">
        <ImpactEquivalentInputs scenario={scenario} onChange={onChange} candidate={selectedCandidate} embedded />
      </ScenarioAccordion>

      <ScenarioAccordion title="Derived Model Guidance" tag="Derived" tagKind="derived" testId="scenario-section-guidance">
        <NumberField
          label="Maximum solid-height allowance"
          symbol="Hₛ,max"
          value={scenario.solidHeightTolerance * 100}
          step={1}
          min={0}
          unit="%"
          onChange={(v) => onChange({ solidHeightTolerance: v / 100 })}
        />
        <NumberField
          label="Shear modulus"
          symbol="G"
          value={scenario.shearModulusPsi / 1e6}
          step={0.1}
          min={0.1}
          unit="Mpsi"
          onChange={(v) => onChange({ shearModulusPsi: v * 1e6 })}
        />
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10.5px] text-zinc-500">
          <span>Published benchmark G</span>
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
        <NumberField
          label="Stress classification basis (tensile)"
          symbol="TSbasis"
          value={scenario.stressBasisPsi / 1000}
          step={1}
          min={1}
          unit="ksi"
          onChange={(v) => onChange({ stressBasisPsi: v * 1000 })}
        />
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-zinc-400">Basis presets:</span>
          {[material.tensileMinPsi, (material.tensileMinPsi + material.tensileMaxPsi) / 2, material.tensileMaxPsi].map((psi) => {
            const ksi = psi / 1000;
            const active = Math.abs(scenario.stressBasisPsi / 1000 - ksi) < 1e-6;
            return (
              <button
                key={psi}
                type="button"
                onClick={() => onChange({ stressBasisPsi: ksi * 1000 })}
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                  active
                    ? "border-violet-500 bg-violet-100 text-violet-800"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {ksi.toFixed(0)} ksi
              </button>
            );
          })}
        </div>
        <p className="text-[10px] leading-tight text-zinc-400">
          The editable basis is tensile strength used to classify the calculated shear stress
          {referenceShearStressPsi !== undefined && Number.isFinite(referenceShearStressPsi)
            ? ` (selected candidate τ = ${(referenceShearStressPsi / 1000).toFixed(1)} ksi)`
            : ""}
          . It is not an &quot;allowable shear stress.&quot; The 40 / 60% bands are set / redesign
          guidance, not yield or ultimate limits.
        </p>
      </ScenarioAccordion>

      <ScenarioAccordion
        title="Manufacturing Tolerance Assumptions"
        tag="Optional"
        tagKind="vendor"
        testId="scenario-section-tolerances"
        info={<>This is a conservative independent stack of spring-rate and free-length tolerances at fixed mechanism heights. It is not a statistical confidence interval or a vendor-guaranteed load range.</>}
      >
        <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-[10.5px] text-zinc-600">
          <input
            type="checkbox"
            checked={scenario.manufacturingToleranceEnabled}
            onChange={(event) => onChange({ manufacturingToleranceEnabled: event.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
          />
          <span>
            <strong className="text-zinc-700">Show estimated force and work ranges</strong>
            <span className="mt-0.5 block text-[9.5px] leading-snug text-zinc-400">Nominal candidate math and Pareto ranking stay unchanged.</span>
          </span>
        </label>
        <NumberField
          label="Spring-rate tolerance"
          symbol="±k"
          value={scenario.springRateTolerance * 100}
          step={1}
          min={0}
          max={99}
          unit="%"
          onChange={(v) => onChange({ springRateTolerance: Math.min(0.99, Math.max(0, v / 100)) })}
        />
        <NumberField
          label="Free-length tolerance"
          symbol="±Lf"
          value={scenario.freeLengthTolerance}
          step={0.001}
          min={0}
          unit="in"
          onChange={(v) => onChange({ freeLengthTolerance: Math.max(0, v) })}
        />
        <p className="text-[10px] leading-tight text-zinc-400">
          Prefilled values reflect the current quote, not a universal spring tolerance. ±{fmtInMm(scenario.freeLengthTolerance)} free length. When enabled, the selected-candidate panel, export sheet, and CSV show min / nominal / max estimates.
        </p>
        <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9.5px] leading-snug text-amber-800">
          Nominal candidates are evaluated at {scenario.forceTarget.toFixed(1)} lbf. The independent tolerance estimate checks its armed-force maximum against the separate {scenario.forceCap.toFixed(1)} lbf absolute cap; this advisory check does not remove candidates.
        </p>
      </ScenarioAccordion>

      <ScenarioAccordion title="Deflection / Coil-Bind Margin" tag="Constraint" tagKind="mechanism" testId="scenario-section-deflection">
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
      </ScenarioAccordion>

      <ScenarioAccordion title="Advanced Sweep Settings" tag="Sweep" tagKind="study" testId="scenario-section-advanced">
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
      </ScenarioAccordion>
    </div>
  );
}
