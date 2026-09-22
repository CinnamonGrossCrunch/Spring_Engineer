"use client";

import { OptionalCommitNumberInput } from "@/components/CommitNumberInput";
import {
  IMPACT_BODY_MATERIALS,
  estimateBodyMassLbm,
} from "@/lib/v2/impactMaterials";
import type { ImpactMassInputMode } from "@/lib/v2/types";

export interface ImpactBodyPatch {
  mode?: ImpactMassInputMode;
  materialId?: string;
  volumeIn3?: number | null;
  massLbm?: number | null;
}

export function ImpactBodyControl({
  label,
  mode,
  materialId,
  volumeIn3,
  massLbm,
  defaultVolumeIn3,
  onChange,
}: {
  label: string;
  mode: ImpactMassInputMode;
  materialId: string;
  volumeIn3: number | null;
  massLbm: number | null;
  defaultVolumeIn3: number;
  onChange: (patch: ImpactBodyPatch) => void;
}) {
  const material = IMPACT_BODY_MATERIALS[materialId] ?? IMPACT_BODY_MATERIALS.stainless17_4;
  const estimatedMass = estimateBodyMassLbm(material.id, volumeIn3);
  const resolvedMass = mode === "volume" ? estimatedMass : massLbm;

  const setMode = (nextMode: ImpactMassInputMode) => {
    if (nextMode === "direct") {
      onChange({ mode: nextMode, massLbm: massLbm ?? estimatedMass });
      return;
    }
    onChange({ mode: nextMode, volumeIn3: volumeIn3 ?? defaultVolumeIn3 });
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-zinc-800">{label}</span>
        <div className="flex overflow-hidden rounded border border-zinc-300 text-[9px] font-medium">
          <button
            type="button"
            onClick={() => setMode("volume")}
            aria-pressed={mode === "volume"}
            className={`px-2 py-1 ${mode === "volume" ? "bg-blue-600 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"}`}
          >
            Volume
          </button>
          <button
            type="button"
            onClick={() => setMode("direct")}
            aria-pressed={mode === "direct"}
            className={`border-l border-zinc-300 px-2 py-1 ${mode === "direct" ? "bg-blue-600 text-white" : "bg-white text-zinc-500 hover:bg-zinc-50"}`}
          >
            Direct mass
          </button>
        </div>
      </div>

      {mode === "volume" ? (
        <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_92px]">
          <label className="text-[9px] uppercase tracking-wide text-zinc-400">
            Material
            <select
              value={material.id}
              onChange={(event) => onChange({ materialId: event.target.value })}
              className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-1.5 py-1 text-[10.5px] normal-case tracking-normal text-zinc-700"
            >
              {Object.values(IMPACT_BODY_MATERIALS).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="text-[9px] uppercase tracking-wide text-zinc-400">
            Volume
            <span className="mt-0.5 grid grid-cols-[1fr_auto] items-center gap-1">
              <OptionalCommitNumberInput
                value={volumeIn3}
                min={0}
                step={0.01}
                placeholder="volume"
                onCommit={(value) => onChange({ volumeIn3: value })}
                className="min-w-0 rounded border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-[10.5px] text-zinc-700 focus:border-blue-500 focus:outline-none"
              />
              <span className="normal-case tracking-normal text-zinc-400">in³</span>
            </span>
          </label>
        </div>
      ) : (
        <label className="block text-[9px] uppercase tracking-wide text-zinc-400">
          Effective moving mass
          <span className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
            <OptionalCommitNumberInput
              value={massLbm}
              min={0}
              step={0.005}
              placeholder="mass"
              onCommit={(value) => onChange({ massLbm: value })}
              className="min-w-0 rounded border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-[10.5px] text-zinc-700 focus:border-blue-500 focus:outline-none"
            />
            <span className="normal-case tracking-normal text-zinc-400">lbm</span>
          </span>
        </label>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9.5px] text-zinc-400">
        <span>{mode === "volume" ? `ρ ${material.densityLbmIn3.toFixed(3)} lb/in³` : "direct entry"}</span>
        <span className="font-mono font-semibold text-zinc-700">
          {resolvedMass !== null && resolvedMass !== undefined && resolvedMass > 0
            ? `~${resolvedMass.toFixed(4)} lbm`
            : "mass needed"}
        </span>
      </div>
    </div>
  );
}
