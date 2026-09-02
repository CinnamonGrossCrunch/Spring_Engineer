"use client";

import type { V2Candidate, V2Scenario } from "@/lib/v2/types";
import { getV2Material, listV2Materials } from "@/lib/v2/materials";
import {
  IMPACT_BODY_MATERIALS,
  estimateBodyMassLbm,
  getImpactBodyMaterial,
} from "@/lib/v2/impactMaterials";
import { applyScenarioImpactLens } from "@/lib/v2/impactLens";

interface Props {
  scenario: V2Scenario;
  onChange: (patch: Partial<V2Scenario>) => void;
  candidate?: V2Candidate | null;
  compact?: boolean;
}

interface EmbeddedProps extends Omit<Props, "compact"> {
  embedded?: boolean;
}

function OptionalNumber({
  value,
  onChange,
  step,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={0}
      step={step}
      placeholder={placeholder}
      onChange={(event) => {
        if (event.target.value === "") return onChange(null);
        const next = Number.parseFloat(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-right font-mono text-[11px] text-zinc-800 focus:border-blue-500 focus:outline-none"
    />
  );
}

function BodyInput({
  label,
  materialId,
  volume,
  mass,
  onMaterial,
  onVolume,
  onMass,
}: {
  label: string;
  materialId: string;
  volume: number | null;
  mass: number | null;
  onMaterial: (value: string) => void;
  onVolume: (value: number | null) => void;
  onMass: (value: number | null) => void;
}) {
  const material = getImpactBodyMaterial(materialId);
  const estimate = estimateBodyMassLbm(materialId, volume);
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-zinc-700">{label}</span>
        <a href={material.sourceUrl} target="_blank" rel="noreferrer" className="text-[9px] text-blue-600 hover:underline">density source</a>
      </div>
      <select value={materialId} onChange={(e) => onMaterial(e.target.value)} className="mb-1.5 w-full rounded border border-zinc-300 bg-white px-1.5 py-1 text-[10.5px]">
        {Object.values(IMPACT_BODY_MATERIALS).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1 text-[9.5px] text-zinc-500">
        <OptionalNumber value={volume} onChange={onVolume} step={0.001} placeholder="volume" /><span>in³</span>
        <OptionalNumber value={mass} onChange={onMass} step={0.001} placeholder="mass" /><span>lbm</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-400">
        <span>ρ = {material.densityLbmIn3.toFixed(3)} lb/in³</span>
        <button type="button" disabled={estimate === null} onClick={() => onMass(estimate)} className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40">
          Use estimate{estimate === null ? "" : ` ${estimate.toFixed(3)} lbm`}
        </button>
      </div>
    </div>
  );
}

function PanelShell({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <>{children}</> : <section className="rounded-lg border border-zinc-200 bg-white p-3">{children}</section>;
}

export function SpringMaterialInputs({ scenario, onChange, embedded = false }: EmbeddedProps) {
  const material = getV2Material(scenario.materialId);
  return (
    <PanelShell embedded={embedded}>
        {!embedded && <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Spring material benchmark</div>}
        <select
          value={scenario.materialId}
          onChange={(event) => {
            const next = getV2Material(event.target.value);
            onChange({ materialId: next.id, shearModulusPsi: next.shearModulusPsi, stressBasisPsi: next.tensileMinPsi });
          }}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-[11px] font-medium text-zinc-800"
        >
          {listV2Materials().map((item) => <option key={item.id} value={item.id}>{item.name} · {item.specification}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-zinc-500">
          <span>Condition</span><span className="text-right text-zinc-700">{material.condition}</span>
          <span>Shear modulus G</span><span className="text-right font-mono text-zinc-700">{(scenario.shearModulusPsi / 1e6).toFixed(2)} Mpsi</span>
          <span>Tensile screen</span><span className="text-right font-mono text-zinc-700">{(material.tensileMinPsi / 1000).toFixed(0)}–{(material.tensileMaxPsi / 1000).toFixed(0)} ksi</span>
        </div>
        <p className="mt-2 text-[9.5px] leading-snug text-zinc-400">{material.note}</p>
        <a href={material.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[9.5px] text-blue-600 hover:underline">{material.sourceLabel} ↗</a>
    </PanelShell>
  );
}

export function ImpactEquivalentInputs({ scenario, onChange, candidate, embedded = false }: EmbeddedProps) {
  const lens = candidate ? applyScenarioImpactLens(candidate, scenario) : null;
  return (
    <PanelShell embedded={embedded}>
        <div className="mb-2 flex items-center justify-between gap-2">
          {!embedded && <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Impact-equivalent assumptions</span>}
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">not peak contact force</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <BodyInput label="Hammer" materialId={scenario.hammerBodyMaterialId} volume={scenario.hammerVolumeIn3} mass={scenario.hammerMassLbm} onMaterial={(hammerBodyMaterialId) => onChange({ hammerBodyMaterialId })} onVolume={(hammerVolumeIn3) => onChange({ hammerVolumeIn3 })} onMass={(hammerMassLbm) => onChange({ hammerMassLbm })} />
          <BodyInput label="HF latch" materialId={scenario.latchBodyMaterialId} volume={scenario.latchVolumeIn3} mass={scenario.latchMassLbm} onMaterial={(latchBodyMaterialId) => onChange({ latchBodyMaterialId })} onVolume={(latchVolumeIn3) => onChange({ latchVolumeIn3 })} onMass={(latchMassLbm) => onChange({ latchMassLbm })} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-600">
          <label>Transfer efficiency η<input type="number" min={0} max={1} step={0.05} value={scenario.impactEfficiency} onChange={(e) => onChange({ impactEfficiency: Math.max(0, Math.min(1, Number(e.target.value))) })} className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-right font-mono" /></label>
          <label>Restitution e<input type="number" min={0} max={1} step={0.05} value={scenario.impactRestitution} onChange={(e) => onChange({ impactRestitution: Math.max(0, Math.min(1, Number(e.target.value))) })} className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-right font-mono" /></label>
        </div>
        {lens && (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded bg-blue-50 p-2 text-[9.5px] text-blue-900">
            <span>Hammer speed</span><b className="text-right font-mono">{lens.velocity === undefined ? "mass required" : `${lens.velocity.toFixed(1)} ft/s`}</b>
            <span>Hammer momentum</span><b className="text-right font-mono">{lens.momentum === undefined ? "mass required" : `${lens.momentum.toFixed(2)} lbm·ft/s`}</b>
            <span>Latch KE transfer</span><b className="text-right font-mono">{lens.latchPostImpactKE === undefined ? "both masses required" : `${(lens.latchPostImpactKE * 12).toFixed(2)} in·lbf`}</b>
            <span>Coupled-drive work*</span><b className="text-right font-mono">{lens.coupledDriveWork === undefined ? "both masses required" : `${lens.coupledDriveWork.toFixed(2)} in·lbf`}</b>
            <span>Coupled avg equivalent*</span><b className="text-right font-mono">{lens.coupledAverageEquivalent === undefined ? "—" : `${lens.coupledAverageEquivalent.toFixed(0)} lbf`}</b>
          </div>
        )}
        <p className="mt-2 text-[9px] leading-snug text-zinc-400">*Coupled drive uses total hammer+latch translational KE after impact plus follow-through spring work. It is available to drive the latch only while the hammer remains engaged; latch KE transfer is the latch-only amount immediately after collision. Neither value is peak contact force.</p>
        <p className="mt-1 text-[9px] leading-snug text-zinc-400">Density estimates mass from CAD volume. Restitution is an empirical 1-D collision input; verify it by test because hardness, geometry, finish and speed dominate the real contact event.</p>
    </PanelShell>
  );
}

export function MaterialImpactInputs({ scenario, onChange, candidate, compact = false }: Props) {
  return (
    <div className={compact ? "space-y-2" : "grid gap-3 lg:grid-cols-2"}>
      <SpringMaterialInputs scenario={scenario} onChange={onChange} candidate={candidate} />
      <ImpactEquivalentInputs scenario={scenario} onChange={onChange} candidate={candidate} />
    </div>
  );
}
