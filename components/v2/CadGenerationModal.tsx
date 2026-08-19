"use client";

import { useState } from "react";
import type { V2Candidate } from "@/lib/v2/types";
import type {
  CadSpringRequest,
  SpringConfiguration,
  CadPackageMode,
} from "@/lib/cad/types";
import { cadClient, CadServiceError } from "@/lib/cad/client";
import { fmtCoils, fmtIn } from "./v2format";

interface Props {
  candidate: V2Candidate;
  isOpen: boolean;
  onClose: () => void;
}

type GenerationStage =
  | "idle"
  | "preparing"
  | "generating-free"
  | "generating-armed"
  | "generating-contact"
  | "generating-release"
  | "validating"
  | "packaging"
  | "success"
  | "error";

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: "Ready",
  preparing: "Preparing spring geometry...",
  "generating-free": "Building free configuration...",
  "generating-armed": "Building armed configuration...",
  "generating-contact": "Building contact configuration...",
  "generating-release": "Building release configuration...",
  validating: "Validating B-rep...",
  packaging: "Packaging download...",
  success: "CAD Ready",
  error: "Generation Failed",
};

export function CadGenerationModal({ candidate, isOpen, onClose }: Props) {
  const [selectedConfigs, setSelectedConfigs] = useState<SpringConfiguration[]>([
    "free",
    "armed",
    "contact",
    "release",
  ]);
  const [packageMode, setPackageMode] = useState<CadPackageMode>("zip");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);

  const toggleConfig = (config: SpringConfiguration) => {
    setSelectedConfigs((prev) =>
      prev.includes(config) ? prev.filter((c) => c !== config) : [...prev, config]
    );
  };

  const selectAll = () => {
    setSelectedConfigs(["free", "armed", "contact", "release"]);
  };

  const clearAll = () => {
    setSelectedConfigs([]);
  };

  const handleGenerate = async () => {
    if (selectedConfigs.length === 0) {
      setError("Please select at least one configuration");
      return;
    }

    setStage("preparing");
    setError(null);
    setErrorDetails([]);

    try {
      const request: CadSpringRequest = {
        candidateKey: candidate.key,
        geometry: {
          wireDiameterIn: candidate.d,
          meanDiameterIn: candidate.D,
          outerDiameterIn: candidate.OD,
          innerDiameterIn: candidate.ID,
          activeCoils: candidate.Na,
          totalCoils: candidate.Nt,
        },
        states: {
          freeLengthIn: candidate.Lf,
          armedLengthIn: candidate.Lc,
          contactLengthIn: candidate.L2,
          releaseLengthIn: candidate.L3,
        },
        configurations: selectedConfigs,
        endModel: "squared-ground-v1",
        handedness: "right",
        packageMode,
        performance: {
          k: candidate.k,
          F0: candidate.F0,
          F2: candidate.F2,
          F3: candidate.F3,
          Whammer: candidate.Whammer,
          Wlatch: candidate.Wlatch,
          WreleaseIdeal: candidate.WreleaseIdeal,
          stressPctConservative: candidate.stressPctConservative,
        },
      };

      // Update stage based on selected configs
      if (selectedConfigs.includes("free")) setStage("generating-free");
      else if (selectedConfigs.includes("armed")) setStage("generating-armed");
      else if (selectedConfigs.includes("contact")) setStage("generating-contact");
      else setStage("generating-release");

      const response = await cadClient.generateSpring(request);

      if (!response.success) {
        throw new CadServiceError(response.code, response.details, response.message);
      }

      setStage("packaging");

      // Download files based on package mode
      if (packageMode === "single" && response.files.length === 1) {
        cadClient.downloadFile(response.files[0]!.content, response.files[0]!.filename);
      } else if (packageMode === "zip") {
        // ZIP file is included in the response
        const zipFile = response.files.find((f) => f.filename.endsWith(".zip"));
        if (zipFile) {
          cadClient.downloadZip(zipFile.content, zipFile.filename);
        }
      } else if (packageMode === "assembly-step" && response.assemblyFile) {
        cadClient.downloadFile(response.assemblyFile.content, response.assemblyFile.filename);
      }

      setStage("success");
    } catch (err) {
      setStage("error");
      const message =
        err instanceof CadServiceError ? err.message : err instanceof Error ? err.message : String(err);
      setError(message);
      if (err instanceof CadServiceError) {
        setErrorDetails(err.details);
      }
    }
  };

  if (!isOpen) return null;

  const isProcessing = stage !== "idle" && stage !== "success" && stage !== "error";
  const isSuccess = stage === "success";
  const hasError = stage === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-zinc-800">Generate Spring CAD</h2>
          <p className="mt-1 font-mono text-sm text-zinc-500">
            d = {fmtIn(candidate.d)} · Nₐ = {fmtCoils(candidate.Na)} · OD = {fmtIn(candidate.OD)}
          </p>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-6 px-6 py-4 max-h-[60vh] overflow-y-auto">
          {!isProcessing && !isSuccess && !hasError && (
            <>
              {/* Configuration selector */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-800">Configurations</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="grid gap-2">
                  {[
                    {
                      value: "free" as const,
                      label: "Free",
                      length: candidate.Lf,
                      description: "Unloaded spring",
                    },
                    {
                      value: "armed" as const,
                      label: "Armed / Compressed",
                      length: candidate.Lc,
                      description: "Maximum operating load state",
                    },
                    {
                      value: "contact" as const,
                      label: "Hammer Contact",
                      length: candidate.L2,
                      description: "After hammer run-up",
                    },
                    {
                      value: "release" as const,
                      label: "Latch Follow-Through",
                      length: candidate.L3,
                      description: "After release travel",
                    },
                  ].map((cfg) => (
                    <label key={cfg.value} className="flex cursor-pointer items-start gap-3 rounded border border-zinc-200 p-3 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={selectedConfigs.includes(cfg.value)}
                        onChange={() => toggleConfig(cfg.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-zinc-800">{cfg.label}</div>
                        <div className="text-sm text-zinc-500">
                          L = {fmtIn(cfg.length)} · {cfg.description}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Output selector */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-zinc-800">Output</h3>
                <div className="space-y-2">
                  {[
                    {
                      value: "single" as const,
                      label: "Individual STEP",
                      description: "One file per configuration or single ZIP archive",
                    },
                    {
                      value: "zip" as const,
                      label: "ZIP Archive",
                      description: "All selected configurations in one ZIP",
                    },
                    {
                      value: "assembly-step" as const,
                      label: "Assembly STEP",
                      description: "All configurations side-by-side in one STEP file",
                    },
                  ].map((mode) => (
                    <label key={mode.value} className="flex items-start gap-3 rounded border border-zinc-200 p-3 hover:bg-zinc-50">
                      <input
                        type="radio"
                        name="packageMode"
                        value={mode.value}
                        checked={packageMode === mode.value}
                        onChange={() => setPackageMode(mode.value)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-zinc-800">{mode.label}</div>
                        <div className="text-sm text-zinc-500">{mode.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Advanced options */}
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-zinc-600 hover:text-zinc-800">
                  Advanced CAD Options
                </summary>
                <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div className="mb-2 font-medium">End Model: Squared & Ground V1</div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <dt>End turns per side:</dt>
                    <dd className="font-mono">1.0</dd>
                    <dt>Zero-pitch portion:</dt>
                    <dd className="font-mono">0.75 turn</dd>
                    <dt>Transition portion:</dt>
                    <dd className="font-mono">0.25 turn</dd>
                  </dl>
                  <p className="mt-2 text-xs italic">CAD representation settings — not mechanism optimization inputs.</p>
                </div>
              </details>
            </>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="flex flex-col items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-blue-600" />
              <div className="text-center">
                <div className="text-sm font-medium text-zinc-800">{STAGE_LABELS[stage]}</div>
                <div className="mt-2 text-xs text-zinc-500">
                  Generating {selectedConfigs.length} configuration{selectedConfigs.length !== 1 ? "s" : ""}...
                </div>
              </div>
            </div>
          )}

          {/* Success */}
          {isSuccess && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-800">CAD Ready</div>
                <div className="mt-1 text-sm text-zinc-500">
                  {selectedConfigs.length} configuration{selectedConfigs.length !== 1 ? "s" : ""} generated
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                <strong>STEP B-rep</strong> · Units: mm · Squared & ground nominal end model · Not vendor validated
              </div>
            </div>
          )}

          {/* Error */}
          {hasError && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-red-300 bg-red-50 p-4">
                <div className="font-semibold text-red-900">Generation Failed</div>
                <div className="mt-2 text-sm text-red-800">{error}</div>
                {errorDetails.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-red-700">
                    {errorDetails.map((detail, i) => (
                      <div key={i}>• {detail}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 flex justify-end gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {isSuccess ? "Done" : "Cancel"}
          </button>
          {!isProcessing && !isSuccess && !hasError && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={selectedConfigs.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate
            </button>
          )}
          {hasError && (
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
