"use client";

import { useEffect, useMemo, useState } from "react";
import { CommitNumberInput } from "@/components/CommitNumberInput";
import {
  DEFAULT_PACKAGE_DISCOVERY_SETTINGS,
  discoverPackageFrontier,
  type PackageDiscoveryPoint,
  type PackageDiscoverySettings,
  type PackageRecommendationRole,
} from "@/lib/v2/packageDiscovery";
import { inchesToMillimeters, millimetersToInches } from "@/lib/v2/envelope";
import {
  generatePackageDiscoveryCsv,
  packageDiscoveryCsvFilename,
} from "@/lib/v2/packageDiscoveryCsv";
import type { V2Candidate, V2Scenario } from "@/lib/v2/types";
import { calculateManufacturingToleranceEnvelope } from "@/lib/v2/toleranceEnvelope";
import { CandidateCsvButton } from "./CandidateCsvButton";
import { V2CandidateMechanism } from "./V2CandidateMechanism";
import { V2ForceWorkChart } from "./V2ForceWorkChart";
import { V2ImpactLensPanel } from "./V2ImpactLensPanel";
import { fmtIn, fmtLbf, fmtPct, fmtRate, fmtWork } from "./v2format";

const STORAGE_KEY = "sigma-spring-engine:package-discovery:v1";

const ROLE_META: Record<PackageRecommendationRole, { label: string; color: string; description: string }> = {
  density: {
    label: "Compact 90% punch",
    color: "#0891b2",
    description: "Shortest package retaining at least 90% of maximum searched hammer work.",
  },
  knee: {
    label: "Balanced knee",
    color: "#7c3aed",
    description: "Best gain before package length yields diminishing returns.",
  },
  punch: {
    label: "Maximum punch",
    color: "#dc2626",
    description: "Greatest hammer run-up work in the searched range.",
  },
};

interface Props {
  scenario: V2Scenario;
  onScenarioChange: (patch: Partial<V2Scenario>) => void;
  onSelectedCandidateChange: (candidate: V2Candidate, scenario: V2Scenario) => void;
}

export function V2PackageDiscovery({
  scenario,
  onScenarioChange,
  onSelectedCandidateChange,
}: Props) {
  const [settings, setSettings] = useState<PackageDiscoverySettings>(
    DEFAULT_PACKAGE_DISCOVERY_SETTINGS,
  );
  const [storageReady, setStorageReady] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PackageDiscoverySettings>;
          setSettings((current) => sanitizeSettings({ ...current, ...parsed }));
        }
      } catch {
        // Invalid local state should never prevent the optimizer from loading.
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, storageReady]);

  const result = useMemo(
    () => discoverPackageFrontier(scenario, settings),
    [scenario, settings],
  );

  const selected = useMemo(() => {
    const requested = selectedKey
      ? result.frontier.find((point) => point.key === selectedKey)
      : undefined;
    return requested ?? result.recommendations.knee ?? result.recommendations.punch ?? result.frontier[0] ?? null;
  }, [result, selectedKey]);

  useEffect(() => {
    if (!selected) return;
    onSelectedCandidateChange(selected.candidate, selected.scenario);
  }, [onSelectedCandidateChange, selected]);

  const updateSettings = (patch: Partial<PackageDiscoverySettings>) => {
    setSettings((current) => sanitizeSettings({ ...current, ...patch }));
  };

  const exportFrontierCsv = () => {
    const csv = generatePackageDiscoveryCsv(result, settings);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = packageDiscoveryCsvFilename();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-cyan-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-700">
              Spring-first optimization
            </div>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-900">
              Discover the shortest package that preserves the punch
            </h2>
            <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-zinc-600">
              Axial budget is now a searched variable. For every package length, the engine keeps
              the spring geometry delivering the greatest hammer run-up work, then removes points
              dominated by a shorter package.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className="rounded bg-zinc-900 px-2 py-1 text-white">17-7 PH · AMS 5678</span>
            <span className="rounded bg-blue-700 px-2 py-1 text-white">F₀ = {settings.forceTarget.toFixed(0)} lbf</span>
            <span className="rounded bg-emerald-700 px-2 py-1 text-white">Fend,worst ≥ {settings.minimumEndForce.toFixed(0)} lbf</span>
            <span className="rounded bg-orange-600 px-2 py-1 text-white">coupled travel = {settings.totalCoupledTravel.toFixed(3)} in</span>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[310px_minmax(0,1fr)]">
        <DiscoveryControls
          scenario={scenario}
          settings={settings}
          onScenarioChange={onScenarioChange}
          onSettingsChange={updateSettings}
          onReset={() => setSettings(DEFAULT_PACKAGE_DISCOVERY_SETTINGS)}
        />

        <div className="min-w-0 space-y-3">
          <PackageFrontierChart
            points={result.frontier}
            selectedKey={selected?.key ?? null}
            recommendationRoles={result.recommendationRoles}
            onSelect={setSelectedKey}
          />

          <div className="grid gap-2 md:grid-cols-3">
            {(["knee", "density", "punch"] as PackageRecommendationRole[]).map((role) => {
              const point = result.recommendations[role];
              return (
                <RecommendationCard
                  key={role}
                  role={role}
                  point={point}
                  selected={point?.key === selected?.key}
                  onSelect={() => point && setSelectedKey(point.key)}
                />
              );
            })}
          </div>

          <SearchSummary
            result={result}
            settings={settings}
            onExportCsv={exportFrontierCsv}
          />

          {selected ? (
            <>
              <V2CandidateMechanism
                candidate={selected.candidate}
                title="Selected Package-Frontier Candidate"
                subtitle="The armed-height / package ratio is an optimized output, not an imposed input."
              />
              <V2ImpactLensPanel
                candidate={selected.candidate}
                scenario={selected.scenario}
                onChange={onScenarioChange}
              />
              <SelectedDiscoverySummary point={selected} />
              <V2ForceWorkChart candidate={selected.candidate} scenario={selected.scenario} />
            </>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center text-sm text-amber-900">
              No package-frontier candidate passes the current hard constraints. Expand the package or
              geometry search, reduce the minimum ID, or review the enabled tolerance assumptions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiscoveryControls({
  scenario,
  settings,
  onScenarioChange,
  onSettingsChange,
  onReset,
}: {
  scenario: V2Scenario;
  settings: PackageDiscoverySettings;
  onScenarioChange: (patch: Partial<V2Scenario>) => void;
  onSettingsChange: (patch: Partial<PackageDiscoverySettings>) => void;
  onReset: () => void;
}) {
  return (
    <aside className="h-fit rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Discovery constraints</h3>
          <p className="text-[9.5px] text-zinc-400">Defaults are visible and editable.</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-zinc-300 px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-50"
        >
          Reset search
        </button>
      </div>

      <div className="space-y-2.5 p-3">
        <ControlGroup title="Known requirements">
          <DiscoveryNumber label="Nominal armed force" value={settings.forceTarget} step={5} unit="lbf" onCommit={(forceTarget) => onSettingsChange({ forceTarget })} />
          <DiscoveryNumber label="Absolute armed-force maximum" value={settings.forceCap} step={5} unit="lbf" onCommit={(forceCap) => onSettingsChange({ forceCap })} />
          <DiscoveryNumber label="Worst-case end-force minimum" value={settings.minimumEndForce} step={1} unit="lbf" onCommit={(minimumEndForce) => onSettingsChange({ minimumEndForce })} />
          <DiscoveryNumber label="Critical release travel" value={settings.criticalTravel} step={0.005} unit="in" onCommit={(criticalTravel) => onSettingsChange({ criticalTravel })} />
          <DiscoveryNumber label="Total coupled travel" value={settings.totalCoupledTravel} step={0.005} unit="in" onCommit={(totalCoupledTravel) => onSettingsChange({ totalCoupledTravel })} />
        </ControlGroup>

        <ControlGroup title="Radial envelope">
          <DiscoveryNumber label="Housing bore / finished OD ceiling" value={inchesToMillimeters(settings.housingInnerDiameter)} step={0.1} unit="mm" onCommit={(mm) => onSettingsChange({ housingInnerDiameter: millimetersToInches(mm) })} />
          <DiscoveryNumber label="Positive OD tolerance + clearance" value={settings.outerDiameterTolerance} step={0.001} unit="in" onCommit={(outerDiameterTolerance) => onSettingsChange({ outerDiameterTolerance })} />
          <DiscoveryNumber label="Minimum allowable spring ID" value={settings.minimumInnerDiameter} step={0.001} unit="in" onCommit={(minimumInnerDiameter) => onSettingsChange({ minimumInnerDiameter: Math.max(0, minimumInnerDiameter) })} />
          <DiscoveryNumber label="Preferred wire diameter" value={settings.preferredWireDiameter} step={0.001} unit="in" onCommit={(preferredWireDiameter) => onSettingsChange({ preferredWireDiameter: Math.max(0.001, preferredWireDiameter) })} />
          <p className="rounded border border-cyan-100 bg-cyan-50 px-2 py-1.5 text-[9.5px] leading-snug text-cyan-900">
            OD is hard. ID is CAD-driven and editable. The preferred wire only breaks near-equal
            performance ties; it is not forced.
          </p>
        </ControlGroup>

        <ControlGroup title="Package search">
          <div className="grid grid-cols-3 gap-1.5">
            <CompactNumber label="B min" value={settings.packageMin} step={0.01} onCommit={(packageMin) => onSettingsChange({ packageMin })} />
            <CompactNumber label="B max" value={settings.packageMax} step={0.01} onCommit={(packageMax) => onSettingsChange({ packageMax })} />
            <CompactNumber label="step" value={settings.packageStep} step={0.005} onCommit={(packageStep) => onSettingsChange({ packageStep })} />
          </div>
          <DiscoveryNumber label="Maximum working deflection" value={settings.maxDeflectionUtilization * 100} step={1} unit="%" onCommit={(percent) => onSettingsChange({ maxDeflectionUtilization: percent / 100 })} />
          <p className="text-[9.5px] leading-snug text-zinc-400">
            The default 84% is a transparent screening assumption derived from the quoted geometry,
            not a universal preset limit.
          </p>
        </ControlGroup>

        <details className="rounded border border-zinc-200 bg-zinc-50">
          <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
            Geometry and tolerance search
          </summary>
          <div className="space-y-2 border-t border-zinc-200 p-2">
            <div className="text-[9.5px] font-semibold uppercase text-zinc-400">Wire range</div>
            <div className="grid grid-cols-3 gap-1.5">
              <CompactNumber label="min" value={scenario.wireMin} step={0.001} onCommit={(wireMin) => onScenarioChange({ wireMin })} />
              <CompactNumber label="max" value={scenario.wireMax} step={0.001} onCommit={(wireMax) => onScenarioChange({ wireMax })} />
              <CompactNumber label="step" value={scenario.wireStep} step={0.001} onCommit={(wireStep) => onScenarioChange({ wireStep })} />
            </div>
            <div className="text-[9.5px] font-semibold uppercase text-zinc-400">Active-coil range</div>
            <div className="grid grid-cols-3 gap-1.5">
              <CompactNumber label="min" value={scenario.activeCoilsMin} step={0.1} onCommit={(activeCoilsMin) => onScenarioChange({ activeCoilsMin })} />
              <CompactNumber label="max" value={scenario.activeCoilsMax} step={0.1} onCommit={(activeCoilsMax) => onScenarioChange({ activeCoilsMax })} />
              <CompactNumber label="step" value={scenario.activeCoilsStep} step={0.05} onCommit={(activeCoilsStep) => onScenarioChange({ activeCoilsStep })} />
            </div>
            <DiscoveryNumber label="Spring-rate tolerance" value={settings.springRateTolerance * 100} step={1} unit="±%" onCommit={(percent) => onSettingsChange({ springRateTolerance: percent / 100 })} />
            <DiscoveryNumber label="Free-length tolerance" value={settings.freeLengthTolerance} step={0.001} unit="±in" onCommit={(freeLengthTolerance) => onSettingsChange({ freeLengthTolerance })} />
            <DiscoveryNumber label="Maximum stress screen" value={settings.maximumStressRatio * 100} step={1} unit="%TS" onCommit={(percent) => onSettingsChange({ maximumStressRatio: percent / 100 })} />
            <ToggleRow label="Enforce tolerance corners" checked={settings.enforceManufacturingTolerance} onChange={(enforceManufacturingTolerance) => onSettingsChange({ enforceManufacturingTolerance })} />
            <ToggleRow label="Include >60% TS for vendor preset review" checked={settings.includePresetReviewStress} onChange={(includePresetReviewStress) => onSettingsChange({ includePresetReviewStress })} />
            <p className="text-[9px] leading-snug text-amber-700">The %TS ceiling is an exploratory screen, not an allowable stress. Lee must approve the final preset design.</p>
          </div>
        </details>
      </div>
    </aside>
  );
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-zinc-200 p-2">
      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function DiscoveryNumber({
  label,
  value,
  step,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_76px_30px] items-center gap-1.5 text-[10.5px] text-zinc-600">
      <span>{label}</span>
      <CommitNumberInput value={value} step={step} onCommit={onCommit} className="min-w-0 rounded border border-zinc-300 bg-white px-1.5 py-1 text-right font-mono text-[11px] focus:border-violet-500 focus:outline-none" />
      <span className="text-[9px] text-zinc-400">{unit}</span>
    </label>
  );
}

function CompactNumber({ label, value, step, onCommit }: { label: string; value: number; step: number; onCommit: (value: number) => void }) {
  return (
    <label className="text-[9px] text-zinc-400">
      {label}
      <CommitNumberInput value={value} step={step} onCommit={onCommit} className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-1 py-1 text-right font-mono text-[10.5px] text-zinc-700 focus:border-violet-500 focus:outline-none" />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[10px] leading-tight text-zinc-600">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-px accent-violet-600" />
      <span>{label}</span>
    </label>
  );
}

function PackageFrontierChart({
  points,
  selectedKey,
  recommendationRoles,
  onSelect,
}: {
  points: PackageDiscoveryPoint[];
  selectedKey: string | null;
  recommendationRoles: Record<string, PackageRecommendationRole>;
  onSelect: (key: string) => void;
}) {
  const width = 760;
  const height = 155;
  const pad = { left: 58, right: 24, top: 24, bottom: 46 };
  const xMin = points.length ? Math.min(...points.map((point) => point.axialBudget)) : 0;
  const xMax = points.length ? Math.max(...points.map((point) => point.axialBudget)) : 1;
  const yMin = 0;
  const yMax = points.length ? Math.max(...points.map((point) => point.candidate.Whammer)) * 1.08 : 1;
  const svgCoordinate = (value: number) => Number(value.toFixed(4));
  const x = (value: number) => svgCoordinate(pad.left + ((value - xMin) / Math.max(1e-9, xMax - xMin)) * (width - pad.left - pad.right));
  const y = (value: number) => svgCoordinate(height - pad.bottom - ((value - yMin) / Math.max(1e-9, yMax - yMin)) * (height - pad.top - pad.bottom));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.axialBudget)} ${y(point.candidate.Whammer)}`).join(" ");

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Package–Punch Frontier</h3>
          <p className="text-[10.5px] text-zinc-400">Every point is the highest-work spring found at that axial budget; dominated points are removed.</p>
        </div>
        <div className="text-[10px] text-zinc-500">Higher and farther left is better.</div>
      </div>
      {points.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 block h-auto w-full" role="img" aria-label="Pareto frontier of hammer work versus axial package">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = yMin + fraction * (yMax - yMin);
            return (
              <g key={`y-${fraction}`}>
                <line x1={pad.left} y1={y(value)} x2={width - pad.right} y2={y(value)} stroke="#e4e4e7" strokeWidth="1" />
                <text x={pad.left - 8} y={y(value) + 3} textAnchor="end" fontSize="9" fill="#71717a" fontFamily="monospace">{value.toFixed(0)}</text>
              </g>
            );
          })}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = xMin + fraction * (xMax - xMin);
            return (
              <g key={`x-${fraction}`}>
                <line x1={x(value)} y1={height - pad.bottom} x2={x(value)} y2={height - pad.bottom + 5} stroke="#a1a1aa" />
                <text x={x(value)} y={height - pad.bottom + 18} textAnchor="middle" fontSize="9" fill="#71717a" fontFamily="monospace">{value.toFixed(2)}</text>
              </g>
            );
          })}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#a1a1aa" />
          <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#a1a1aa" />
          <path d={path} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" />
          {points.map((point) => {
            const role = recommendationRoles[point.key];
            const selected = point.key === selectedKey;
            const color = role ? ROLE_META[role].color : "#a1a1aa";
            return (
              <g key={point.key} onClick={() => onSelect(point.key)} className="cursor-pointer">
                <circle cx={x(point.axialBudget)} cy={y(point.candidate.Whammer)} r={selected ? 6.5 : role ? 5.5 : 3} fill={color} stroke={selected ? "#facc15" : "white"} strokeWidth={selected ? 3 : 1.5} />
                <title>{`B ${point.axialBudget.toFixed(3)} in · work ${point.candidate.Whammer.toFixed(2)} in·lbf · Lc ${point.candidate.Lc.toFixed(3)} in`}</title>
              </g>
            );
          })}
          <text x={(pad.left + width - pad.right) / 2} y={height - 8} textAnchor="middle" fontSize="10" fontWeight="600" fill="#52525b">Axial budget B (in) — shorter ←</text>
          <text x="14" y={(pad.top + height - pad.bottom) / 2} textAnchor="middle" fontSize="10" fontWeight="600" fill="#52525b" transform={`rotate(-90 14 ${(pad.top + height - pad.bottom) / 2})`}>Hammer run-up work (in·lbf)</text>
        </svg>
      ) : (
        <div className="py-20 text-center text-sm text-zinc-400">No feasible frontier to plot.</div>
      )}
    </section>
  );
}

function RecommendationCard({ role, point, selected, onSelect }: { role: PackageRecommendationRole; point?: PackageDiscoveryPoint; selected: boolean; onSelect: () => void }) {
  const meta = ROLE_META[role];
  return (
    <button type="button" disabled={!point} onClick={onSelect} className={`rounded-lg border bg-white p-3 text-left shadow-sm transition ${selected ? "border-yellow-400 ring-2 ring-yellow-200" : "border-zinc-200 hover:border-violet-300"} disabled:cursor-not-allowed disabled:opacity-50`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-700">{meta.label}</span>
      </div>
      {point ? (
        <>
          <div className="font-mono text-lg font-bold text-zinc-900">{fmtWork(point.candidate.Whammer)}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-zinc-500">
            <span>Package B</span><span className="text-right font-mono">{fmtIn(point.axialBudget)}</span>
            <span>Armed Lc</span><span className="text-right font-mono">{fmtIn(point.candidate.Lc)}</span>
            <span>Run-up</span><span className="text-right font-mono">{fmtIn(point.candidate.s)}</span>
          </div>
        </>
      ) : <div className="text-xs text-zinc-400">No candidate</div>}
      <p className="mt-1.5 text-[9.5px] leading-snug text-zinc-400">{meta.description}</p>
    </button>
  );
}

function SearchSummary({
  result,
  settings,
  onExportCsv,
}: {
  result: ReturnType<typeof discoverPackageFrontier>;
  settings: PackageDiscoverySettings;
  onExportCsv: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[10px] text-zinc-500">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span><strong className="text-zinc-700">{result.searchedCount.toLocaleString()}</strong> geometries searched</span>
        <span><strong className="text-emerald-700">{result.acceptedCount.toLocaleString()}</strong> passed</span>
        <span><strong className="text-violet-700">{result.frontier.length}</strong> non-dominated package points</span>
        <span>{settings.enforceManufacturingTolerance ? "Tolerance corners enforced" : "Nominal loads only"}</span>
        <span className="text-amber-700">Vendor validation still required</span>
      </div>
      <CandidateCsvButton disabled={result.frontier.length === 0} onClick={onExportCsv} />
    </div>
  );
}

function SelectedDiscoverySummary({ point }: { point: PackageDiscoveryPoint }) {
  const c = point.candidate;
  const tolerance = calculateManufacturingToleranceEnvelope(c, point.scenario);
  const ratio = point.axialBudget > 0 ? c.Lc / point.axialBudget : 0;
  const roleLabels = [
    ["Axial budget", fmtIn(point.axialBudget)],
    ["Armed / budget ratio", fmtPct(ratio)],
    ["Free length", fmtIn(c.Lf)],
    ["Wire / active coils", `${c.d.toFixed(3)} in / ${c.Na.toFixed(2)}`],
    ["Rate", fmtRate(c.k)],
    ["Contact force", fmtLbf(c.F2)],
    ["Critical force", fmtLbf(c.F3)],
    ["End force nominal", fmtLbf(c.F4)],
    ["End force tolerance low", tolerance ? fmtLbf(tolerance.forces.end.min) : "not enabled"],
    ["Critical-window work", fmtWork(c.Wlatch)],
    ["Work density", `${point.workDensity.toFixed(1)} in·lbf/in`],
    ["Deflection utilization", fmtPct(c.deflectionUtilization)],
  ];
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">Selected frontier definition</h3>
          <p className="text-[10px] text-zinc-400">Critical path: contact = Lend − 0.200 in; release point = Lend − 0.130 in.</p>
        </div>
        <div className={`rounded px-2 py-1 text-[10px] font-semibold ${c.feasibility.stressBand === "redesign" ? "bg-red-100 text-red-800" : c.feasibility.stressBand === "set" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
          {c.feasibility.stressBand === "redesign" ? "Vendor preset / redesign review" : c.feasibility.stressBand === "set" ? "Preset review indicated" : "Lower-stress screen"}
        </div>
      </div>
      <dl className="grid gap-x-5 gap-y-1.5 text-[10.5px] sm:grid-cols-2 lg:grid-cols-4">
        {roleLabels.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-zinc-100 pb-1">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-right font-mono font-semibold text-zinc-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function sanitizeSettings(settings: PackageDiscoverySettings): PackageDiscoverySettings {
  const forceTarget = Math.max(0, finite(settings.forceTarget, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.forceTarget));
  const forceCap = Math.max(forceTarget, finite(settings.forceCap, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.forceCap));
  const criticalTravel = Math.max(0.001, finite(settings.criticalTravel, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.criticalTravel));
  const totalCoupledTravel = Math.max(criticalTravel, finite(settings.totalCoupledTravel, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.totalCoupledTravel));
  const packageMin = finite(settings.packageMin, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.packageMin);
  const packageMax = Math.max(packageMin, finite(settings.packageMax, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.packageMax));
  return {
    forceTarget,
    forceCap,
    minimumEndForce: Math.max(0, finite(settings.minimumEndForce, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.minimumEndForce)),
    criticalTravel,
    totalCoupledTravel,
    housingInnerDiameter: Math.max(0.001, finite(settings.housingInnerDiameter, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.housingInnerDiameter)),
    outerDiameterTolerance: Math.max(0, finite(settings.outerDiameterTolerance, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.outerDiameterTolerance)),
    springRateTolerance: Math.min(0.99, Math.max(0, finite(settings.springRateTolerance, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.springRateTolerance))),
    freeLengthTolerance: Math.max(0, finite(settings.freeLengthTolerance, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.freeLengthTolerance)),
    packageMin: Math.max(0.05, packageMin),
    packageMax,
    packageStep: Math.max(0.001, finite(settings.packageStep, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.packageStep)),
    preferredWireDiameter: Math.max(0.001, finite(settings.preferredWireDiameter, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.preferredWireDiameter)),
    minimumInnerDiameter: Math.max(0, finite(settings.minimumInnerDiameter, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.minimumInnerDiameter)),
    maxDeflectionUtilization: Math.min(0.99, Math.max(0.05, finite(settings.maxDeflectionUtilization, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.maxDeflectionUtilization))),
    maximumStressRatio: Math.min(2, Math.max(0.1, finite(settings.maximumStressRatio, DEFAULT_PACKAGE_DISCOVERY_SETTINGS.maximumStressRatio))),
    enforceManufacturingTolerance: settings.enforceManufacturingTolerance !== false,
    includePresetReviewStress: settings.includePresetReviewStress !== false,
  };
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
