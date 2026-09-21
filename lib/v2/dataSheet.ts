import type { V2Candidate, V2Material, V2Scenario } from "./types";
import {
  maximumFinishedSpringOuterDiameter,
  nominalSpringOuterDiameter,
} from "./envelope";
import { applyScenarioImpactLens } from "./impactLens";
import { getImpactBodyMaterial } from "./impactMaterials";
import {
  calculateManufacturingToleranceEnvelope,
  type ManufacturingToleranceEnvelope,
} from "./toleranceEnvelope";

export type DataSheetAudience = "mechanism" | "vendor";
export type ShareSheetFormat = "text" | "table";

export interface SpringDataSheetInput {
  candidate: V2Candidate;
  scenario: V2Scenario;
  material: V2Material;
  generatedAt?: string;
}

const inch = (value: number) => `${value.toFixed(4)} in (${(value * 25.4).toFixed(2)} mm)`;
const dualLength = (value: number) => `${value.toFixed(4)} in / ${(value * 25.4).toFixed(2)} mm`;
const lbf = (value: number) => `${value.toFixed(2)} lbf (${(value * 4.4482216153).toFixed(1)} N)`;
const rate = (value: number) => `${value.toFixed(2)} lbf/in (${(value * 0.175126835).toFixed(2)} N/mm)`;
const work = (value: number) => `${value.toFixed(2)} in·lbf (${(value * 0.112984829).toFixed(2)} J)`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const ksi = (valuePsi: number) => `${(valuePsi / 1000).toFixed(1)} ksi`;
const shortLbf = (value: number) => `${value.toFixed(2)} lbf`;
const tableForce = (value: number) => `${value.toFixed(2)} lbf / ${(value * 4.4482216153).toFixed(1)} N`;
const shortWork = (value: number) => `${value.toFixed(2)} in·lbf`;

function materialName(material: V2Material): string {
  return `${material.name}${material.specification ? ` (${material.specification})` : ""}`;
}

function stressSummary(candidate: V2Candidate): string {
  const band = candidate.feasibility.stressBand === "low"
    ? "lower-stress guidance band"
    : candidate.feasibility.stressBand === "set"
      ? "set/preset review band"
      : "redesign guidance band";
  return `${pct(candidate.stressPctOptimistic)}–${pct(candidate.stressPctConservative)} of published tensile range; ${band}`;
}

function operatingStateTable(
  candidate: V2Candidate,
  tolerance: ManufacturingToleranceEnvelope | null,
): string {
  if (!tolerance) {
    return `State\tSpring length\tCalculated spring force
Armed / compressed\t${inch(candidate.Lc)}\t${lbf(candidate.F0)} nominal target
Hammer contact\t${inch(candidate.L2)}\t${lbf(candidate.F2)} nominal
Critical release point\t${inch(candidate.L3)}\t${lbf(candidate.F3)} nominal
Full coupled-travel end\t${inch(candidate.L4)}\t${lbf(candidate.F4)} nominal`;
  }
  return `State\tSpring length\tMinimum estimate*\tNominal\tMaximum estimate*
Armed / compressed\t${inch(candidate.Lc)}\t${tableForce(tolerance.forces.armed.min)}\t${tableForce(tolerance.forces.armed.nominal)}\t${tableForce(tolerance.forces.armed.max)}
Hammer contact\t${inch(candidate.L2)}\t${tableForce(tolerance.forces.contact.min)}\t${tableForce(tolerance.forces.contact.nominal)}\t${tableForce(tolerance.forces.contact.max)}
Critical release point\t${inch(candidate.L3)}\t${tableForce(tolerance.forces.critical.min)}\t${tableForce(tolerance.forces.critical.nominal)}\t${tableForce(tolerance.forces.critical.max)}
Full coupled-travel end\t${inch(candidate.L4)}\t${tableForce(tolerance.forces.end.min)}\t${tableForce(tolerance.forces.end.nominal)}\t${tableForce(tolerance.forces.end.max)}`;
}

function tolerancePerformanceTable(
  tolerance: ManufacturingToleranceEnvelope | null,
  scenario: V2Scenario,
): string {
  if (!tolerance) return "";
  const capStatus = tolerance.worstCaseForceCapPass
    ? `Estimated armed maximum remains within the ${shortLbf(scenario.forceCap)} mechanism cap.`
    : `Estimated armed maximum is ${shortLbf(tolerance.worstCaseForceCapExcess)} above the ${shortLbf(scenario.forceCap)} mechanism cap.`;
  const endStatus = tolerance.worstCaseEndForcePass
    ? `Estimated end-force minimum remains at or above the ${shortLbf(scenario.minimumEndForce)} floor.`
    : `Estimated end-force minimum is ${shortLbf(tolerance.worstCaseEndForceShortfall)} below the ${shortLbf(scenario.minimumEndForce)} floor.`;
  return `
Manufacturing Tolerance Estimate
Work metric\tMinimum estimate*\tNominal\tMaximum estimate*
Hammer run-up work\t${shortWork(tolerance.work.hammer.min)}\t${shortWork(tolerance.work.hammer.nominal)}\t${shortWork(tolerance.work.hammer.max)}
Critical-window spring work\t${shortWork(tolerance.work.critical.min)}\t${shortWork(tolerance.work.critical.nominal)}\t${shortWork(tolerance.work.critical.max)}
Post-critical spring work\t${shortWork(tolerance.work.postCritical.min)}\t${shortWork(tolerance.work.postCritical.nominal)}\t${shortWork(tolerance.work.postCritical.max)}
Full coupled-travel spring work\t${shortWork(tolerance.work.coupled.min)}\t${shortWork(tolerance.work.coupled.nominal)}\t${shortWork(tolerance.work.coupled.max)}

• Force-cap check: ${capStatus}
• End-force check: ${endStatus}
• *Advisory independent corner stack using only ±${pct(scenario.springRateTolerance)} spring rate and ±${dualLength(scenario.freeLengthTolerance)} free length at fixed mechanism heights. This is not a statistical confidence interval or a supplier-guaranteed load range. Operating-height tolerance, temperature, friction, nonlinearity, solid-height variation beyond the separate modeled H_s,max allowance, and correlated production data are not included.
• Stress, deflection/utilization, impact-equivalent values, Pareto ranking, and feasibility remain nominal; the tolerance envelope is not propagated into those outputs.`;
}

const SHARE_SHEET_HEADINGS = new Set([
  "Spring Candidate — Mechanism Review",
  "Compression Spring Prototype RFQ",
  "Mechanism Requirements",
  "Selected Spring Geometry",
  "Package and Operating States",
  "Predicted Mechanism Performance",
  "Assumptions and Decisions to Confirm",
  "1. Our Mechanism and Constraints",
  "2. Preliminary Calculations — Please Assess and Optimize",
  "3. Our Assumptions for Vendor Review",
]);

const SHARE_SHEET_SUBHEADINGS = new Set([
  "Preliminary Candidate Geometry",
  "Operating States",
  "Calculated Results",
  "Manufacturing Tolerance Estimate",
]);

function communicationText(source: string): string {
  return source
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^- /gm, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Rich clipboard/preview representation of the same clean plain text. */
export function shareSheetToHtml(plainText: string): string {
  const lines = plainText.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  let inTable = false;
  let tableRow = 0;

  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };

  const closeTable = () => {
    if (inTable) html.push("</tbody></table>");
    inTable = false;
    tableRow = 0;
  };

  for (const line of lines) {
    if (line.includes("\t")) {
      closeList();
      if (!inTable) {
        html.push('<table style="width:100%;border-collapse:collapse;margin:0 0 12px 0;"><tbody>');
        inTable = true;
      }
      const tag = tableRow === 0 ? "th" : "td";
      const background = tableRow === 0 ? "#f4f4f5" : "#ffffff";
      const cells = line.split("\t").map((cell) => `<${tag} style="border:1px solid #d4d4d8;padding:6px 8px;background:${background};text-align:left;vertical-align:top;${tableRow === 0 ? "font-weight:700;" : ""}">${escapeHtml(cell)}</${tag}>`);
      html.push(`<tr>${cells.join("")}</tr>`);
      tableRow += 1;
      continue;
    }

    closeTable();
    if (line.startsWith("• ")) {
      if (!inList) html.push("<ul>");
      inList = true;
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    if (!line) continue;
    html.push(
      SHARE_SHEET_HEADINGS.has(line)
        ? `<p><strong>${escapeHtml(line)}</strong></p>`
        : SHARE_SHEET_SUBHEADINGS.has(line)
          ? `<p><strong>${escapeHtml(line)}</strong></p>`
        : `<p>${escapeHtml(line)}</p>`,
    );
  }
  closeList();
  closeTable();
  return html.join("\n");
}

/**
 * Email-safe two-column table with inline styles. Inline presentation is
 * deliberate: Gmail and other rich-text editors discard application CSS when
 * pasting but preserve these basic table attributes and semantic bolding.
 */
export function shareSheetToTableHtml(plainText: string): string {
  const lines = plainText.split(/\r?\n/).filter(Boolean);
  const rows: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("\t")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("\t")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      i -= 1;
      const nestedRows = tableLines.map((tableLine, rowIndex) => {
        const tag = rowIndex === 0 ? "th" : "td";
        const background = rowIndex === 0 ? "#f4f4f5" : "#ffffff";
        const cells = tableLine.split("\t").map((cell) => `<${tag} style="border:1px solid #d4d4d8;padding:6px 8px;background:${background};text-align:left;vertical-align:top;${rowIndex === 0 ? "font-weight:700;" : ""}">${escapeHtml(cell)}</${tag}>`);
        return `<tr>${cells.join("")}</tr>`;
      });
      rows.push(`<tr><td colspan="2" style="border:0;padding:0 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tbody>${nestedRows.join("")}</tbody></table></td></tr>`);
      continue;
    }
    const safeLine = escapeHtml(line);
    if (SHARE_SHEET_HEADINGS.has(line)) {
      const isTitle = line === "Spring Candidate — Mechanism Review" || line === "Compression Spring Prototype RFQ";
      rows.push(
        `<tr><td colspan="2" style="border:1px solid #a1a1aa;padding:9px 10px;background:${isTitle ? "#18181b" : "#e4e4e7"};color:${isTitle ? "#ffffff" : "#18181b"};font-weight:700;">${safeLine}</td></tr>`,
      );
      continue;
    }

    if (SHARE_SHEET_SUBHEADINGS.has(line)) {
      rows.push(`<tr><td colspan="2" style="border:1px solid #d4d4d8;padding:7px 9px;background:#fafafa;font-weight:700;">${safeLine}</td></tr>`);
      continue;
    }

    if (line.startsWith("• ")) {
      const content = line.slice(2);
      const colon = content.indexOf(":");
      if (colon > 0) {
        const label = escapeHtml(content.slice(0, colon));
        const value = escapeHtml(content.slice(colon + 1).trim());
        rows.push(
          `<tr><td style="width:38%;border:1px solid #d4d4d8;padding:7px 9px;background:#fafafa;vertical-align:top;font-weight:700;">${label}</td><td style="border:1px solid #d4d4d8;padding:7px 9px;vertical-align:top;">${value}</td></tr>`,
        );
      } else {
        rows.push(
          `<tr><td colspan="2" style="border:1px solid #d4d4d8;padding:7px 9px;vertical-align:top;">• ${escapeHtml(content)}</td></tr>`,
        );
      }
      continue;
    }

    rows.push(
      `<tr><td colspan="2" style="border:1px solid #d4d4d8;padding:8px 9px;vertical-align:top;">${safeLine}</td></tr>`,
    );
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#27272a;"><tbody>${rows.join("")}</tbody></table>`;
}

/** Concise internal handoff for discussing the candidate in its mechanism context. */
export function generateMechanismSummary({
  candidate: c,
  scenario: s,
  material,
  generatedAt = new Date().toISOString(),
}: SpringDataSheetInput): string {
  const nominalOuterDiameter = nominalSpringOuterDiameter(s);
  const maximumFinishedOuterDiameter = maximumFinishedSpringOuterDiameter(s);
  const impact = applyScenarioImpactLens(c, s);
  const tolerance = calculateManufacturingToleranceEnvelope(c, s);

  return communicationText(`# Spring Candidate — Mechanism Review

For internal mechanism review. This summarizes what the mechanism requires and what the selected V2 candidate predicts.

## Mechanism Requirements

- Nominal armed spring force target: ${lbf(s.forceTarget)}
- Absolute maximum armed spring force: ${lbf(s.forceCap)} (including tolerance)
- Total axial package, B: ${inch(s.axialBudget)} (armed spring + hammer run-up)
- Critical release travel after contact: ${inch(s.latchTravel)}
- Total hammer/latch coupled travel after contact: ${inch(s.totalLatchTravel)}
- Minimum nominal spring force at full-travel end: ${lbf(s.minimumEndForce)}
- Opposing latch preload: ${lbf(s.opposingPreload)}
- Armed spring height: ${s.armedHeightConstraintEnabled ? `${inch(s.armedHeightMin)} to ${inch(s.armedHeightMax)} allowed` : "optimizer-derived; no additional mechanism range enabled"}
- Housing ID / absolute finished-spring OD: ${inch(s.housingInnerDiameter)}
- Nominal study OD: ${inch(nominalOuterDiameter)} (housing limit minus ${inch(s.outerDiameterTolerance)} positive OD tolerance allowance; held constant in this sweep)
- Worst-case finished OD: ${inch(maximumFinishedOuterDiameter)}
- Maximum deflection utilization: ${(s.maxDeflectionUtilization * 100).toFixed(1)}% (held constant in this scenario)
- Equivalent height above modeled maximum solid: ${dualLength(c.solidClearance)} (same constraint expressed as candidate-specific armed clearance)

## Selected Spring Geometry

- Wire diameter: ${inch(c.d)}
- Mean / inside diameter: ${inch(c.D)} / ${inch(c.ID)} (outside diameter is the study value above)
- Active / total coils: ${c.Na.toFixed(2)} / ${c.Nt.toFixed(2)}

## Package and Operating States

- Solid-height reference, nominal / modeled maximum: ${inch(c.HsNom)} / ${inch(c.HsMax)}
- Free state: length ${inch(c.Lf)}
- Hammer run-up: ${inch(c.s)}

Operating States
${operatingStateTable(c, tolerance)}

## Predicted Mechanism Performance

- Spring rate: ${rate(c.k)}
- Hammer run-up work: ${work(c.Whammer)}
- Critical-window spring work: ${work(c.Wlatch)}
- Post-critical spring work: ${work(c.WpostCritical)}
- Work against modeled opposing preload: ${work(c.Wopposing)}
- Net post-critical work after opposing preload: ${work(c.WpostCriticalNet)}
- Full coupled-travel spring work: ${work(c.Wcoupled)}
- End-of-travel force: ${lbf(c.F4)}; ${lbf(c.endForceMargin)} above the configured floor; ${lbf(c.netEndForce)} after opposing preload
- Ideal total release work: ${work(c.WreleaseIdeal)} (not measured delivered energy)
- Impact assumptions: η = ${(s.impactEfficiency * 100).toFixed(0)}%; restitution e = ${s.impactRestitution.toFixed(2)}; hammer mass ${s.hammerMassLbm === null ? "TBD" : `${s.hammerMassLbm.toFixed(4)} lbm`}; latch mass ${s.latchMassLbm === null ? "TBD" : `${s.latchMassLbm.toFixed(4)} lbm`}
- Collision lens: latch-only KE ${impact.latchPostImpactKE === undefined ? "not calculated — both masses are required" : work(impact.latchPostImpactKE * 12)}; coupled-drive work* ${impact.coupledDriveWork === undefined ? "not calculated — both masses are required" : work(impact.coupledDriveWork)}; coupled average* ${impact.coupledAverageEquivalent === undefined ? "not calculated — both masses are required" : `${lbf(impact.coupledAverageEquivalent)} over the full coupled travel`}
- *Coupled drive counts total hammer+latch translational KE after collision plus efficiency-adjusted spring work over the full post-contact travel, less work against the modeled opposing preload. It is available only while the hammer remains engaged. No minimum velocity is imposed after the critical release point; positive residual spring force supplies the remaining drive. It is not peak contact force.
- Nominal stress guidance: ${stressSummary(c)}
${tolerancePerformanceTable(tolerance, s)}

## Assumptions and Decisions to Confirm

- Model uses ${materialName(material)}, ${material.condition}, as a benchmark material with G = ${(s.shearModulusPsi / 1e6).toFixed(2)} Mpsi and a ${ksi(s.stressBasisPsi)} tensile-strength classification basis. Source: ${material.sourceUrl}
- Nominal end form is squared and ground; CAD defaults to right-hand winding.
- Confirm that the armed, contact, critical-release, and full-travel-end lengths match the actual mechanism stops.
- Confirm the ${s.forceTarget.toFixed(0)} lbf nominal starting-force target, ${s.forceCap.toFixed(0)} lbf absolute force cap, ${dualLength(s.housingInnerDiameter)} housing/OD ceiling, ${dualLength(s.outerDiameterTolerance)} positive OD tolerance allowance, ${s.latchTravel.toFixed(3)} in critical travel, ${s.totalLatchTravel.toFixed(3)} in total coupled travel, and ${s.minimumEndForce.toFixed(1)} lbf nominal end-force floor.
- Confirm the ${(s.maxDeflectionUtilization * 100).toFixed(1)}% maximum-deflection-utilization scenario; equivalent clearance for this candidate is ${inch(c.solidClearance)} above modeled H_s,max.
${tolerance ? `- Confirm the entered/assumed ±${pct(s.springRateTolerance)} rate and ±${dualLength(s.freeLengthTolerance)} free-length values, or replace this estimate with supplier-guaranteed loads at the four specified heights.` : ""}
- If those inputs are correct, decide whether to send this candidate for vendor review and prototype quotation.

Source: Spring Mechanism Explorer V2 · Candidate ${c.key} · Exported ${generatedAt}

Model results are nominal and not yet vendor validated or physically tested.`);
}

/** Concise supplier handoff focused on manufacturability, loads, and quotation. */
export function generateVendorRfq({
  candidate: c,
  scenario: s,
  material,
  generatedAt = new Date().toISOString(),
}: SpringDataSheetInput): string {
  const nominalOuterDiameter = nominalSpringOuterDiameter(s);
  const maximumFinishedOuterDiameter = maximumFinishedSpringOuterDiameter(s);
  const impact = applyScenarioImpactLens(c, s);
  const tolerance = calculateManufacturingToleranceEnvelope(c, s);

  return communicationText(`# Compression Spring Prototype RFQ

We are seeking design-for-manufacture review and a prototype quotation. The spring candidate below is preliminary; please assess it and recommend changes that improve manufacturability, durability, or performance within the stated mechanism constraints.

## 1. Our Mechanism and Constraints

- Intended use: accelerate a hammer from the armed position to contact, cross the critical release point, then continue driving the coupled hammer/latch assembly to its final stop.
- Interpretation: contact, critical-point, and end values are quasi-static spring forces, not dynamic impact-force claims.

Constraint	Target / boundary	Status
Nominal armed spring force	${lbf(s.forceTarget)}	Design target
Absolute maximum armed spring force	≤ ${lbf(s.forceCap)}	Mechanism limit including tolerance
Total axial package, B	${inch(s.axialBudget)}	Armed spring length + hammer run-up
Critical release travel	${inch(s.latchTravel)}	Point-of-no-return window after hammer contact
Total coupled travel	${inch(s.totalLatchTravel)}	Hammer and latch remain engaged to the final stop
Minimum spring force at end	${lbf(s.minimumEndForce)}	Nominal quasi-static floor at B + total coupled travel
Opposing preload	${lbf(s.opposingPreload)}	Modeled counter-force during remaining travel
Armed spring height	${s.armedHeightConstraintEnabled ? `${inch(s.armedHeightMin)} to ${inch(s.armedHeightMax)}` : "No additional range enabled"}	${s.armedHeightConstraintEnabled ? "Hard mechanism packaging range" : "Optimizer-derived from force and deflection constraints"}
Housing ID / absolute finished-spring OD	${inch(s.housingInnerDiameter)}	Hard mechanism envelope
Nominal spring outside diameter	${inch(nominalOuterDiameter)}	Derived by subtracting the positive OD tolerance allowance
Positive OD tolerance allowance	${inch(s.outerDiameterTolerance)}	Worst-case finished OD is ${inch(maximumFinishedOuterDiameter)}; confirm tolerance and required fit clearance

## 2. Preliminary Calculations — Please Assess and Optimize

Preliminary Candidate Geometry
Parameter	Preliminary value
Wire diameter	${inch(c.d)}
Outside diameter	${inch(c.OD)}
Mean diameter	${inch(c.D)}
Inside diameter	${inch(c.ID)}
Active / total coils	${c.Na.toFixed(2)} / ${c.Nt.toFixed(2)}
Free length	${inch(c.Lf)}

Operating States
${operatingStateTable(c, tolerance)}

Calculated Results
Result	Preliminary value
Spring rate	${rate(c.k)}
Nominal solid height	${inch(c.HsNom)}
Modeled maximum solid height	${inch(c.HsMax)}
Nominal armed-load shear stress	${ksi(c.tau)} (Wahl-corrected, K_w = ${c.Kw.toFixed(3)})
Nominal stress screening	${pct(c.stressPctBasis)} at the selected ${ksi(s.stressBasisPsi)} tensile-strength basis; ${stressSummary(c)}
Hammer / latch mass	${s.hammerMassLbm === null ? "TBD" : `${s.hammerMassLbm.toFixed(4)} lbm`} / ${s.latchMassLbm === null ? "TBD" : `${s.latchMassLbm.toFixed(4)} lbm`}
Impact efficiency / restitution	${pct(s.impactEfficiency)} / e = ${s.impactRestitution.toFixed(2)}
Critical / full-travel work	${work(c.Wlatch)} / ${work(c.Wcoupled)}	Spring work after contact through the critical point / final stop
Post-critical gross / net work	${work(c.WpostCritical)} / ${work(c.WpostCriticalNet)}	Net subtracts ${work(c.Wopposing)} against the modeled opposing preload
End-force reserve	${lbf(c.F4)} at end; ${lbf(c.endForceMargin)} above floor; ${lbf(c.netEndForce)} net after preload	Please assess friction and mechanism-geometry allowance
Collision lens	Latch-only KE: ${impact.latchPostImpactKE === undefined ? "Not calculated — both masses required" : work(impact.latchPostImpactKE * 12)}; coupled-drive work*: ${impact.coupledDriveWork === undefined ? "Not calculated — both masses required" : work(impact.coupledDriveWork)}; coupled average*: ${impact.coupledAverageEquivalent === undefined ? "Not calculated — both masses required" : lbf(impact.coupledAverageEquivalent)} over full coupled travel. *Counts total post-impact hammer+latch KE plus efficiency-adjusted spring work through the final stop, less modeled opposing-preload work; applies only while the hammer remains engaged; not peak contact force
${tolerancePerformanceTable(tolerance, s)}

## 3. Our Assumptions for Vendor Review

Assumption	Current model value	Please assess / optimize
Starting material	${materialName(material)}	Recommend the production material, wire condition, and temper—or a suitable alternative
Material-property source	${material.sourceLabel}; ${material.condition}	Verify properties for the purchased wire size/condition; ${material.sourceUrl}
Shear modulus, G	${(s.shearModulusPsi / 1e6).toFixed(1)} Mpsi	Confirm the value appropriate for the recommended material and condition
Tensile-strength screening range	${ksi(material.tensileMinPsi)}–${ksi(material.tensileMaxPsi)}	Replace with applicable values for the actual wire size and temper; these are not allowable shear stresses
Stress-classification basis	${ksi(s.stressBasisPsi)} (user-selected tensile basis)	Apply the appropriate set, allowable-shear, fatigue, and relaxation criteria
OD tolerance / fit allowance	${dualLength(s.outerDiameterTolerance)}	Confirm achievable OD tolerance and advise any additional diametral installation clearance
Maximum-solid-height allowance	${pct(s.solidHeightTolerance)} above nominal	Confirm an achievable production tolerance and resulting maximum solid height
Maximum deflection utilization	${pct(s.maxDeflectionUtilization)}	Advise whether this can be safely increased for more performance or must be reduced for durability/tolerances
Equivalent armed height above maximum solid	${dualLength(c.solidClearance)}	Confirm the required production clearance after solid-height and load tolerances
Critical / total post-contact travel	${dualLength(s.latchTravel)} / ${dualLength(s.totalLatchTravel)}	Confirm the specified load heights and that the spring can remain engaged through full travel
Minimum nominal end force / opposing preload	${lbf(s.minimumEndForce)} / ${lbf(s.opposingPreload)}	Confirm achievable load at the final height; mechanism friction and geometry remain our responsibility
Armed spring-height range	${s.armedHeightConstraintEnabled ? `${dualLength(s.armedHeightMin)} to ${dualLength(s.armedHeightMax)}` : "Not currently constrained beyond force/solid-height/package limits"}	Advise whether an explicit load-height requirement is preferable
End condition	Squared and ground	Confirm feasibility and recommend any change
Winding hand	Right-hand nominal	Confirm whether winding hand is functionally relevant
Fatigue duty / cycle target	TBD	Tell us what duty information is needed and what cycle capability is realistic
Temperature / corrosion / finish / cleanliness	TBD	Recommend requirements and identify any information needed from us
Hammer / latch body materials	${getImpactBodyMaterial(s.hammerBodyMaterialId).name} / ${getImpactBodyMaterial(s.latchBodyMaterialId).name}	Used only for density-based mass estimates; confirm actual alloys and measured masses
Collision elasticity	Coefficient of restitution e = ${s.impactRestitution.toFixed(2)} (assumed)	Empirical mechanism input; validate by test. It is not determined by material name alone
${tolerance ? `Manufacturing load estimate	Enabled: ±${pct(s.springRateTolerance)} rate and ±${dualLength(s.freeLengthTolerance)} free length	Replace this independent worst-case estimate with supplier-guaranteed loads at the specified heights when available` : ""}

Please return a recommended producible spring definition and identify any changes to the preliminary geometry or assumptions.

- Prototype quantity: ___ pieces
- Production quantity: ___ pieces/order; ___ pieces/year
- Include prototype and production pricing, lead times, achievable load/dimensional tolerances, and available certification/traceability options.

Reference: Spring Mechanism Explorer V2 · Candidate ${c.key} · Exported ${generatedAt}

This is an RFQ starting point, not a released drawing or qualified spring specification.`);
}

export function generateShareSheet(input: SpringDataSheetInput, audience: DataSheetAudience): string {
  return audience === "mechanism" ? generateMechanismSummary(input) : generateVendorRfq(input);
}

export function springDataSheetFilename(
  candidateKey: string,
  extension: "txt",
  audience: DataSheetAudience = "vendor",
): string {
  const safeKey = candidateKey.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "candidate";
  const purpose = audience === "mechanism" ? "mechanism-summary" : "vendor-rfq";
  return `spring-${purpose}_${safeKey}.${extension}`;
}
