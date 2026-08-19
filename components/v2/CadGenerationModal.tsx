"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CadServiceError,
  downloadAll,
  formatBytes,
  generateSpringCad,
} from "@/lib/cad/client";
import {
  ALL_CONFIGURATIONS,
  CONFIGURATION_LABELS,
  END_MODEL_V1_DISPLAY,
  STATE_REPRESENTATION_DISCLAIMER,
  type CadPackageMode,
  type CadSpringRequest,
  type CadSpringResponse,
  type Handedness,
  type SpringConfiguration,
  type SpringGeometry,
  type SpringStates,
} from "@/lib/cad/types";
import { stateBuildability, validateSpringGeometry } from "@/lib/cad/validation";
import type { V2Candidate, V2Material } from "@/lib/v2/types";

import { fmtCoils, fmtIn } from "./v2format";

interface Props {
  candidate: V2Candidate;
  material: V2Material;
  isOpen: boolean;
  onClose: () => void;
}

type Phase = "configure" | "generating" | "done" | "error";

/**
 * The service runs synchronously and reports no incremental progress, so these
 * are shown as a static description of the pipeline rather than as a tracker
 * with a fake active step.
 */
const PIPELINE_STEPS = [
  "Preparing geometry",
  "Building configurations",
  "Validating B-rep",
  "Writing STEP",
  "Packaging download",
];

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 2.6 20.5 7v10L12 21.4 3.5 17V7z" />
      <path d="M3.5 7 12 11.6 20.5 7" />
      <path d="M12 11.6v9.8" />
    </svg>
  );
}

export function CadGenerationModal({ candidate: c, material, isOpen, onClose }: Props) {
  const [selected, setSelected] = useState<SpringConfiguration[]>(ALL_CONFIGURATIONS);
  const [packageMode, setPackageMode] = useState<CadPackageMode>("zip");
  const [handedness, setHandedness] = useState<Handedness>("right");
  const [phase, setPhase] = useState<Phase>("configure");
  const [result, setResult] = useState<CadSpringResponse | null>(null);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const geometry: SpringGeometry = useMemo(
    () => ({
      wireDiameterIn: c.d,
      meanDiameterIn: c.D,
      outerDiameterIn: c.OD,
      innerDiameterIn: c.ID,
      activeCoils: c.Na,
      totalCoils: c.Nt,
    }),
    [c],
  );

  const states: SpringStates = useMemo(
    () => ({
      freeLengthIn: c.Lf,
      armedLengthIn: c.Lc,
      contactLengthIn: c.L2,
      releaseLengthIn: c.L3,
    }),
    [c],
  );

  const geometryCheck = useMemo(() => validateSpringGeometry(geometry), [geometry]);
  const buildability = useMemo(() => stateBuildability(states, geometry), [states, geometry]);

  // Drop any selected state that this candidate cannot actually build.
  const effectiveSelection = useMemo(
    () => selected.filter((key) => buildability[key].buildable),
    [selected, buildability],
  );

  const reset = useCallback(() => {
    setPhase("configure");
    setResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    onClose();
    // let the close animation finish before wiping the panel contents
    window.setTimeout(reset, 150);
  }, [onClose, reset]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const toggle = (key: SpringConfiguration) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const handleGenerate = async () => {
    if (effectiveSelection.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("generating");
    setError(null);

    const request: CadSpringRequest = {
      candidateKey: c.key,
      geometry,
      states,
      configurations: effectiveSelection,
      endModel: "squared-ground-v1",
      handedness,
      packageMode,
      performance: {
        k: c.k,
        F0: c.F0,
        F2: c.F2,
        F3: c.F3,
        Whammer: c.Whammer,
        Wlatch: c.Wlatch,
        WreleaseIdeal: c.WreleaseIdeal,
        stressPctConservative: c.stressPctConservative,
      },
      materialName: material.name,
    };

    try {
      const response = await generateSpringCad(request, controller.signal);
      setResult(response);
      setPhase("done");
      downloadAll(response);
    } catch (err) {
      if (err instanceof CadServiceError && err.code === "CANCELLED") return;
      setError(
        err instanceof CadServiceError
          ? { message: err.message, details: err.details }
          : {
              message: err instanceof Error ? err.message : String(err),
              details: [],
            },
      );
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  };

  const totalBytes = result?.files.reduce((sum, f) => sum + f.byteLength, 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cad-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-zinc-900/10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-3.5">
          <div>
            <h2 id="cad-modal-title" className="text-base font-semibold text-zinc-900">
              Generate Spring CAD
            </h2>
            <p className="mt-0.5 font-mono text-[11.5px] text-zinc-500">
              d = {fmtIn(c.d)} · Nₐ = {fmtCoils(c.Na)} · OD = {fmtIn(c.OD)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="-mr-1 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === "configure" && (
            <div className="flex flex-col gap-5">
              {/* Geometry problem: nothing can be generated */}
              {!geometryCheck.valid && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <div className="text-[12.5px] font-semibold text-red-900">
                    This candidate&apos;s geometry is internally inconsistent
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-red-800">
                    {geometryCheck.errors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Feasible-set note: allowed, but worth saying */}
              {geometryCheck.valid && !c.feasibility.feasible && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
                  Geometry can be generated, but this candidate is excluded from the
                  recommended V2 feasible set.
                </div>
              )}

              {geometryCheck.warnings.map((w) => (
                <div
                  key={w}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11.5px] text-zinc-600"
                >
                  {w}
                </div>
              ))}

              {/* Configurations */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Configurations
                  </h3>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelected(ALL_CONFIGURATIONS)}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelected([])}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  {ALL_CONFIGURATIONS.map((key) => {
                    const meta = CONFIGURATION_LABELS[key];
                    const info = buildability[key];
                    const checked = selected.includes(key) && info.buildable;
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                          info.buildable
                            ? "cursor-pointer border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                            : "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!info.buildable}
                          onChange={() => toggle(key)}
                          className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[12.5px] font-medium text-zinc-800">
                              {meta.label}
                            </span>
                            <span className="font-mono text-[11px] text-zinc-500">
                              {meta.symbol} = {fmtIn(info.lengthIn)}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500">{meta.description}</div>
                          {!info.buildable && (
                            <div className="mt-0.5 text-[11px] font-medium text-red-700">
                              {info.reason}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] italic leading-snug text-zinc-500">
                  {STATE_REPRESENTATION_DISCLAIMER}
                </p>
              </section>

              {/* Output */}
              <section>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Output
                </h3>
                <div className="grid gap-1.5">
                  {[
                    {
                      value: "zip" as const,
                      label: "Individual STEP / ZIP",
                      description:
                        "One STEP per state — a single file if one state is selected, otherwise a ZIP with the manifest.",
                    },
                    {
                      value: "assembly-step" as const,
                      label: "All-States STEP Assembly",
                      description:
                        "One STEP containing the selected states side by side, for review only.",
                    },
                  ].map((mode) => (
                    <label
                      key={mode.value}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 p-2.5 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <input
                        type="radio"
                        name="cad-package-mode"
                        checked={packageMode === mode.value}
                        onChange={() => setPackageMode(mode.value)}
                        className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                      />
                      <div>
                        <div className="text-[12.5px] font-medium text-zinc-800">{mode.label}</div>
                        <div className="text-[11px] text-zinc-500">{mode.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* Advanced */}
              <details className="rounded-lg border border-zinc-200">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11.5px] font-semibold text-zinc-600 hover:text-zinc-900">
                  Advanced CAD Options
                </summary>
                <div className="space-y-3 border-t border-zinc-200 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="cad-handedness" className="text-[11.5px] text-zinc-600">
                      Handedness
                    </label>
                    <select
                      id="cad-handedness"
                      value={handedness}
                      onChange={(e) => setHandedness(e.target.value as Handedness)}
                      className="rounded border border-zinc-300 px-2 py-1 text-[11.5px] text-zinc-800"
                    >
                      <option value="right">Right-hand wound</option>
                      <option value="left">Left-hand wound</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] text-zinc-600">End model</span>
                    <span className="font-mono text-[11.5px] text-zinc-800">
                      {END_MODEL_V1_DISPLAY.version}
                    </span>
                  </div>

                  <div className="rounded border border-amber-200 bg-amber-50 p-2.5">
                    <div className="text-[11px] font-semibold text-amber-900">
                      Squared &amp; ground end form
                    </div>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-amber-900">
                      <dt>End turns per side</dt>
                      <dd className="text-right font-mono">
                        {END_MODEL_V1_DISPLAY.endTurnsPerSide.toFixed(2)}
                      </dd>
                      <dt>Closed (zero-gap) portion</dt>
                      <dd className="text-right font-mono">
                        {END_MODEL_V1_DISPLAY.closedTurns.toFixed(2)} turn
                      </dd>
                      <dt>Tangent transition</dt>
                      <dd className="text-right font-mono">
                        {END_MODEL_V1_DISPLAY.transitionTurns.toFixed(2)} turn
                      </dd>
                      <dt>Grind depth</dt>
                      <dd className="text-right font-mono">
                        {END_MODEL_V1_DISPLAY.grindDepthFraction.toFixed(2)} × d
                      </dd>
                    </dl>
                    <p className="mt-1.5 text-[10.5px] italic leading-snug text-amber-800">
                      CAD representation settings — not mechanism optimisation inputs, and not
                      vendor-certified end-form geometry.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          )}

          {phase === "generating" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-zinc-200 border-t-blue-600" />
              <div className="text-center">
                <div className="text-[13px] font-medium text-zinc-800">
                  Generating {effectiveSelection.length} configuration
                  {effectiveSelection.length === 1 ? "" : "s"}…
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  B-rep construction runs on the CAD service and may take a few seconds.
                </div>
              </div>
              <div className="text-center text-[10.5px] leading-relaxed text-zinc-400">
                {PIPELINE_STEPS.join("  →  ")}
              </div>
            </div>
          )}

          {phase === "done" && result && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-600" fill="none"
                  stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-base font-semibold text-zinc-900">CAD Ready</div>
                <div className="mt-0.5 text-[12px] text-zinc-500">
                  {result.configurations.length} configuration
                  {result.configurations.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
                </div>
              </div>

              <div className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-blue-900">
                <strong>STEP B-rep geometry</strong> · Units: mm · Squared &amp; ground nominal
                end model · Not vendor validated
                <div className="mt-1 text-[11px] text-blue-800">
                  {STATE_REPRESENTATION_DISCLAIMER}
                </div>
              </div>

              <ul className="w-full space-y-1">
                {result.files.map((f) => (
                  <li
                    key={f.filename}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2.5 py-1.5"
                  >
                    <span className="truncate font-mono text-[11px] text-zinc-700">
                      {f.filename}
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-400">
                      {formatBytes(f.byteLength)}
                    </span>
                  </li>
                ))}
              </ul>

              {result.warnings.length > 0 && (
                <ul className="w-full space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  {result.warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {phase === "error" && error && (
            <div className="py-4">
              <div className="rounded-lg border border-red-300 bg-red-50 p-3.5">
                <div className="text-[13px] font-semibold text-red-900">Generation failed</div>
                <div className="mt-1 text-[12px] text-red-800">{error.message}</div>
                {error.details.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[11px] text-red-700">
                    {error.details.map((d, i) => (
                      <li key={i}>• {d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <div className="text-[11px] text-zinc-500">
            {phase === "configure" && effectiveSelection.length === 0 && geometryCheck.valid && (
              <span>Select at least one configuration.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              {phase === "done" ? "Done" : "Cancel"}
            </button>

            {phase === "configure" && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={effectiveSelection.length === 0 || !geometryCheck.valid}
                className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-b from-violet-600 to-blue-600 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-sm transition-all hover:from-violet-500 hover:to-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CubeIcon className="h-3.5 w-3.5" />
                Generate
              </button>
            )}

            {phase === "done" && result && (
              <button
                type="button"
                onClick={() => downloadAll(result)}
                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-700"
              >
                {result.files.length === 1 && result.files[0].contentType === "application/zip"
                  ? "Download CAD Package"
                  : "Download STEP"}
              </button>
            )}

            {phase === "error" && (
              <button
                type="button"
                onClick={reset}
                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-700"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
