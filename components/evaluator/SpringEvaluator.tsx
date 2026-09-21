"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { V2CandidateMechanism } from "@/components/v2/V2CandidateMechanism";
import { fmtInMm, fmtRate, fmtWork } from "@/components/v2/v2format";
import { formatValue, inchesToMm } from "@/components/StatusBadge";
import {
  DEFAULT_EVALUATOR_INPUTS,
  EVALUATOR_STORAGE_KEY,
  parseStoredEvaluatorInputs,
} from "@/lib/evaluator/defaults";
import {
  buildEvaluatorSummary,
  evaluateSpringConstraints,
} from "@/lib/evaluator/evaluateSpring";
import type { SpringEvaluatorInputs } from "@/lib/evaluator/types";
import { getV2Material, listV2Materials } from "@/lib/v2/materials";

interface NumberInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit: string;
  step: number;
  min?: number;
  max?: number;
  helper?: string;
  prominent?: boolean;
  disabled?: boolean;
}

function NumberInput({
  id,
  label,
  value,
  onChange,
  unit,
  step,
  min,
  max,
  helper,
  prominent = false,
  disabled = false,
}: NumberInputProps) {
  return (
    <label
      htmlFor={id}
      className={`block rounded-md border p-2 ${
        prominent ? "border-blue-200 bg-blue-50/60" : "border-zinc-200 bg-white"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span className="block text-[10.5px] font-semibold text-zinc-700">{label}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          className={`min-w-0 flex-1 rounded border px-2 py-1.5 font-mono text-sm outline-none transition ${
            prominent
              ? "border-blue-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              : "border-zinc-300 bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          } disabled:bg-zinc-100`}
        />
        <span className="shrink-0 font-mono text-[10px] text-zinc-500">{unit}</span>
      </span>
      {helper ? <span className="mt-1 block text-[9.5px] leading-tight text-zinc-500">{helper}</span> : null}
    </label>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="text-[9.5px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] font-semibold text-zinc-800">{value}</div>
      {detail ? <div className="mt-0.5 text-[9px] leading-tight text-zinc-400">{detail}</div> : null}
    </div>
  );
}

function StatusChip({
  ok,
  children,
  advisory = false,
}: {
  ok: boolean;
  children: ReactNode;
  advisory?: boolean;
}) {
  const style = advisory
    ? "border-amber-300 bg-amber-50 text-amber-700"
    : ok
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : "border-red-300 bg-red-50 text-red-700";
  return <span className={`rounded border px-2 py-1 text-[10px] font-semibold ${style}`}>{children}</span>;
}

function copyNumber(value: number): string {
  return Number.isFinite(value) ? formatValue(value) : "—";
}

export function SpringEvaluator() {
  const [inputs, setInputs] = useState<SpringEvaluatorInputs>(DEFAULT_EVALUATOR_INPUTS);
  const [storageReady, setStorageReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const materials = useMemo(() => listV2Materials(), []);
  const result = useMemo(() => evaluateSpringConstraints(inputs), [inputs]);
  const candidate = result.candidate;
  const runUp = inputs.axialBudget - inputs.armedLength;
  const material = getV2Material(inputs.materialId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = parseStoredEvaluatorInputs(
        window.localStorage.getItem(EVALUATOR_STORAGE_KEY),
      );
      if (restored) setInputs(restored);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(EVALUATOR_STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs, storageReady]);

  const patch = useCallback((next: Partial<SpringEvaluatorInputs>) => {
    setInputs((previous) => ({ ...previous, ...next }));
  }, []);

  const updateRunUp = useCallback(
    (nextRunUp: number) => {
      patch({ armedLength: Math.max(0, inputs.axialBudget - nextRunUp) });
    },
    [inputs.axialBudget, patch],
  );

  const updateMaterial = useCallback(
    (materialId: string) => {
      const nextMaterial = getV2Material(materialId);
      patch({
        materialId: nextMaterial.id,
        shearModulusPsi: nextMaterial.shearModulusPsi,
        stressBasisPsi: nextMaterial.tensileMinPsi,
      });
    },
    [patch],
  );

  const toggleAutomaticOd = useCallback(
    (checked: boolean) => {
      patch({
        centerSpringInEnvelope: checked,
        nominalSpringOd: checked ? inputs.nominalSpringOd : result.nominalSpringOd,
      });
    },
    [inputs.nominalSpringOd, patch, result.nominalSpringOd],
  );

  const copySummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildEvaluatorSummary(inputs, result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [inputs, result]);

  const reset = useCallback(() => {
    setInputs(DEFAULT_EVALUATOR_INPUTS);
  }, []);

  const envelopeOk =
    result.innerRadialClearance >= 0 && result.outerRadialClearance >= 0;
  const endForceOk = candidate
    ? candidate.F4 + 1e-9 >= inputs.minimumEndForce
    : false;
  const toleranceEndOk = result.forceRanges
    ? result.forceRanges.end.min + 1e-9 >= inputs.minimumEndForce
    : false;

  return (
    <main className="flex-1 bg-zinc-100 p-3">
      <section className="mb-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-zinc-900">
                Constraint-to-Spring Evaluator
              </h1>
              <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Direct solve
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
              Enter the mechanism load, height and wire. The evaluator solves one nominal spring
              directly—no landscape, ranking or Pareto workflow.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={copySummary}
              disabled={!candidate}
              className="rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy fundamentals"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <section className="rounded-lg border border-blue-200 bg-white p-3 shadow-sm">
            <div className="mb-2">
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-blue-800">
                Define the spring
              </h2>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                These controls define the nominal force curve and coil geometry.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <NumberInput
                id="evaluator-armed-force"
                label="Nominal armed force"
                value={inputs.nominalArmedForce}
                onChange={(value) => patch({ nominalArmedForce: value })}
                unit="lbf"
                step={5}
                min={0}
                prominent
              />
              <NumberInput
                id="evaluator-armed-length"
                label="Armed spring length"
                value={inputs.armedLength}
                onChange={(value) => patch({ armedLength: value })}
                unit="in"
                step={0.005}
                min={0}
                prominent
              />
              <NumberInput
                id="evaluator-run-up"
                label="Hammer run-up"
                value={runUp}
                onChange={updateRunUp}
                unit="in"
                step={0.005}
                min={0}
                helper="Linked: run-up = axial budget − armed length. Editing either updates the same relationship."
                prominent
              />
              <NumberInput
                id="evaluator-end-force"
                label="Nominal force target at full travel"
                value={inputs.targetEndForce}
                onChange={(value) => patch({ targetEndForce: value })}
                unit="lbf"
                step={1}
                min={0}
                helper={`Design target; the current required minimum is ${formatValue(inputs.minimumEndForce)} lbf.`}
                prominent
              />
              <NumberInput
                id="evaluator-wire"
                label="Wire diameter"
                value={inputs.wireDiameter}
                onChange={(value) => patch({ wireDiameter: value })}
                unit="in"
                step={0.001}
                min={0.001}
                prominent
              />
            </div>
          </section>

          <details className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none px-3 py-2.5 hover:bg-zinc-50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-700">
                    Editable defaults
                  </div>
                  <div className="mt-0.5 text-[9.5px] text-zinc-400">
                    {material.name} · B {formatValue(inputs.axialBudget)} in · annulus {formatValue(inputs.minimumSpringId)}–{formatValue(inputs.maximumSpringOd)} in
                  </div>
                </div>
                <span className="text-[10px] text-zinc-400">expand</span>
              </div>
            </summary>
            <div className="space-y-4 border-t border-zinc-100 p-3">
              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Mechanism defaults
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <NumberInput id="evaluator-budget" label="Axial budget / contact length" value={inputs.axialBudget} onChange={(value) => patch({ axialBudget: value })} unit="in" step={0.005} min={0} />
                  <NumberInput id="evaluator-critical" label="Critical release travel" value={inputs.criticalTravel} onChange={(value) => patch({ criticalTravel: value, totalCoupledTravel: Math.max(value, inputs.totalCoupledTravel) })} unit="in" step={0.005} min={0.001} />
                  <NumberInput id="evaluator-total-travel" label="Total coupled travel after contact" value={inputs.totalCoupledTravel} onChange={(value) => patch({ totalCoupledTravel: Math.max(inputs.criticalTravel, value) })} unit="in" step={0.005} min={inputs.criticalTravel} />
                  <NumberInput id="evaluator-min-end" label="Required minimum end force" value={inputs.minimumEndForce} onChange={(value) => patch({ minimumEndForce: value })} unit="lbf" step={1} min={0} />
                  <NumberInput id="evaluator-preload" label="Opposing preload" value={inputs.opposingPreload} onChange={(value) => patch({ opposingPreload: value })} unit="lbf" step={0.1} min={0} />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Radial envelope
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <NumberInput id="evaluator-min-id" label="Minimum finished spring ID" value={inputs.minimumSpringId} onChange={(value) => patch({ minimumSpringId: value })} unit="in" step={0.001} min={0} />
                  <NumberInput id="evaluator-max-od" label="Maximum finished spring OD" value={inputs.maximumSpringOd} onChange={(value) => patch({ maximumSpringOd: value })} unit="in" step={0.0001} min={0} />
                  <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-[10.5px] font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      checked={inputs.centerSpringInEnvelope}
                      onChange={(event) => toggleAutomaticOd(event.target.checked)}
                      className="h-3.5 w-3.5 accent-violet-600"
                    />
                    Automatically place the spring in the radial envelope
                  </label>
                  <NumberInput
                    id="evaluator-radial-od-bias"
                    label="OD placement bias"
                    value={inputs.radialOdBias * 100}
                    onChange={(value) => patch({ radialOdBias: Math.max(0, Math.min(1, value / 100)) })}
                    unit="%"
                    step={5}
                    min={0}
                    max={100}
                    disabled={!inputs.centerSpringInEnvelope}
                    helper="0% clears the inner boundary, 50% balances radial clearance, 100% reaches the outer limit."
                  />
                  <NumberInput
                    id="evaluator-nominal-od"
                    label="Nominal spring OD"
                    value={inputs.centerSpringInEnvelope ? result.nominalSpringOd : inputs.nominalSpringOd}
                    onChange={(value) => patch({ nominalSpringOd: value })}
                    unit="in"
                    step={0.0005}
                    min={0}
                    disabled={inputs.centerSpringInEnvelope}
                    helper={inputs.centerSpringInEnvelope ? `Derived at ${Math.round(inputs.radialOdBias * 100)}% of the usable radial span.` : "Manual OD target; envelope checks remain active."}
                  />
                  <p className="rounded border border-blue-100 bg-blue-50 px-2 py-1.5 text-[9.5px] leading-relaxed text-blue-700 sm:col-span-2 xl:col-span-1">
                    A larger mean coil diameter lowers rate when wire and coil count stay fixed. In this evaluator the two force targets already set the rate, so OD placement changes the required coil count, solid height, stress, and clearance—not the requested force curve.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Material and manufacturing assumptions
                </h3>
                <label className="mb-2 block rounded-md border border-zinc-200 bg-white p-2">
                  <span className="block text-[10.5px] font-semibold text-zinc-700">Material benchmark</span>
                  <select
                    value={inputs.materialId}
                    onChange={(event) => updateMaterial(event.target.value)}
                    className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-violet-500"
                  >
                    {materials.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}{item.specification ? ` · ${item.specification}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <NumberInput id="evaluator-g" label="Shear modulus, G" value={inputs.shearModulusPsi / 1e6} onChange={(value) => patch({ shearModulusPsi: value * 1e6 })} unit="Mpsi" step={0.1} min={0.1} />
                  <NumberInput id="evaluator-ts" label="Tensile screening basis" value={inputs.stressBasisPsi / 1000} onChange={(value) => patch({ stressBasisPsi: value * 1000 })} unit="ksi" step={5} min={1} />
                   <NumberInput id="evaluator-end-coils" label="Inactive end coils" value={inputs.inactiveEndCoils} onChange={(value) => patch({ inactiveEndCoils: value })} unit="coils" step={0.1} min={0} />
                   <NumberInput id="evaluator-solid-tol" label="Maximum solid-height allowance" value={inputs.solidHeightTolerance * 100} onChange={(value) => patch({ solidHeightTolerance: value / 100 })} unit="%" step={1} min={0} />
                   <NumberInput id="evaluator-preset-height" label="Preset compression height" value={inputs.presetHeight} onChange={(value) => patch({ presetHeight: value })} unit="in" step={0.005} min={0} helper="Manufacturing process height only; it is not the armed operating length." />
                   <NumberInput id="evaluator-rate-tol" label="Advisory rate tolerance" value={inputs.springRateTolerance * 100} onChange={(value) => patch({ springRateTolerance: value / 100 })} unit="± %" step={1} min={0} max={99} />
                  <NumberInput id="evaluator-free-tol" label="Advisory free-length tolerance" value={inputs.freeLengthTolerance} onChange={(value) => patch({ freeLengthTolerance: value })} unit="± in" step={0.005} min={0} />
                </div>
              </div>
            </div>
          </details>
        </aside>

        <section className="min-w-0 space-y-3">
          {result.errors.length > 0 ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-5 text-red-800">
              <h2 className="text-sm font-bold">No spring can be calculated from these inputs</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {result.errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          ) : null}

          {candidate ? (
            <>
              <V2CandidateMechanism
                candidate={candidate}
                title="Evaluated Spring — Four-State Mechanism"
                subtitle="Nominal quasi-static spring forces; contact force is not dynamic impact force."
              />

              <section className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700">
                      Nominal spring definition
                    </h2>
                    <p className="mt-0.5 text-[9.5px] text-zinc-400">
                      Directly derived from the two load-at-height points and the editable assumptions.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip ok={envelopeOk}>Radial envelope {envelopeOk ? "fits" : "fails"}</StatusChip>
                    <StatusChip ok={endForceOk}>End force {endForceOk ? "passes" : "fails"}</StatusChip>
                    <StatusChip ok={toleranceEndOk} advisory={!toleranceEndOk}>
                      Tolerance low: {copyNumber(result.forceRanges?.end.min ?? Number.NaN)} lbf
                    </StatusChip>
                    <StatusChip ok={false} advisory>Vendor validation required</StatusChip>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  <Metric label="Free length" value={fmtInMm(candidate.Lf)} />
                  <Metric label="Active / total coils" value={`${candidate.Na.toFixed(2)} / ${candidate.Nt.toFixed(2)}`} />
                  <Metric label="Spring rate" value={fmtRate(candidate.k)} />
                  <Metric label="Outside diameter" value={fmtInMm(candidate.OD)} />
                  <Metric label="Inside diameter" value={fmtInMm(candidate.ID)} />
                  <Metric label="Hammer run-up work" value={fmtWork(candidate.Whammer)} />
                </div>

                <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-700">
                  {material.name} · d {candidate.d.toFixed(4)} in · OD/ID {candidate.OD.toFixed(4)} / {candidate.ID.toFixed(4)} in · Nₐ/Nₜ {candidate.Na.toFixed(2)} / {candidate.Nt.toFixed(2)} · Lf {candidate.Lf.toFixed(4)} in · k {candidate.k.toFixed(1)} lbf/in
                </div>
              </section>

              {result.warnings.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Review items</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-relaxed text-amber-800">
                    {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}

              <details className="rounded-lg border border-zinc-200 bg-white shadow-sm">
                <summary className="cursor-pointer px-3 py-2.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                  Engineering checks and advisory tolerance range
                </summary>
                <div className="border-t border-zinc-100 p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="Nominal / max solid" value={`${candidate.HsNom.toFixed(4)} / ${candidate.HsMax.toFixed(4)} in`} />
                    <Metric label="Clearance above max solid" value={fmtInMm(candidate.solidClearance)} />
                    <Metric label="Deflection utilization" value={`${(candidate.deflectionUtilization * 100).toFixed(1)}%`} />
                    <Metric label="Preset / armed height" value={`${inputs.presetHeight.toFixed(4)} / ${candidate.Lc.toFixed(4)} in`} detail="manufacturing preset / operating state" />
                    <Metric label="Wahl-corrected stress" value={`${(candidate.tau / 1000).toFixed(1)} ksi`} detail={`${(candidate.stressPctBasis * 100).toFixed(1)}% of selected tensile basis`} />
                    <Metric label="Inner radial clearance" value={`${copyNumber(result.innerRadialClearance)} in`} detail={`${copyNumber(inchesToMm(result.innerRadialClearance))} mm nominal`} />
                    <Metric label="Outer radial clearance" value={`${copyNumber(result.outerRadialClearance)} in`} detail={`${copyNumber(inchesToMm(result.outerRadialClearance))} mm nominal`} />
                    <Metric label="Full-travel spring work" value={fmtWork(candidate.Wcoupled)} />
                    <Metric label="Net end force" value={`${copyNumber(candidate.netEndForce)} lbf`} detail={`after ${copyNumber(inputs.opposingPreload)} lbf opposing preload`} />
                  </div>

                  {result.forceRanges ? (
                    <div className="mt-3 overflow-x-auto rounded border border-zinc-200">
                      <table className="w-full border-collapse text-left text-[10px]">
                        <thead className="bg-zinc-100 text-zinc-500">
                          <tr>
                            <th className="px-2 py-1.5 font-semibold">State</th>
                            <th className="px-2 py-1.5 font-semibold">Length</th>
                            <th className="px-2 py-1.5 font-semibold">Low estimate</th>
                            <th className="px-2 py-1.5 font-semibold">Nominal</th>
                            <th className="px-2 py-1.5 font-semibold">High estimate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 font-mono text-zinc-700">
                          {[
                            ["Armed", candidate.Lc, result.forceRanges.armed],
                            ["Contact", candidate.L2, result.forceRanges.contact],
                            ["Critical", candidate.L3, result.forceRanges.critical],
                            ["End", candidate.L4, result.forceRanges.end],
                          ].map(([label, length, range]) => {
                            const forceRange = range as typeof result.forceRanges.armed;
                            return (
                              <tr key={label as string}>
                                <td className="px-2 py-1.5 font-sans font-medium">{label as string}</td>
                                <td className="px-2 py-1.5">{(length as number).toFixed(4)} in</td>
                                <td className="px-2 py-1.5">{forceRange.min.toFixed(1)} lbf</td>
                                <td className="px-2 py-1.5 font-semibold">{forceRange.nominal.toFixed(1)} lbf</td>
                                <td className="px-2 py-1.5">{forceRange.max.toFixed(1)} lbf</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[9px] leading-relaxed text-zinc-400">
                    The low/high values are an independent corner estimate using the editable rate and free-length assumptions. They are not supplier-guaranteed loads or a statistical confidence interval. Presetting does not remove stress, relaxation, fatigue or radial-clearance review.
                  </p>
                </div>
              </details>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
