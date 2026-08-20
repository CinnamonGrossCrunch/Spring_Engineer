import type { V2Candidate, V2Material, V2Scenario } from "./types";

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
  return communicationText(`# Spring Candidate — Mechanism Review

For internal mechanism review. This summarizes what the mechanism requires and what the selected V2 candidate predicts.

## Mechanism Requirements

- Maximum armed spring force: ${lbf(s.forceCap)}
- Total axial package, B: ${inch(s.axialBudget)} (armed spring + hammer run-up)
- Latch follow-through after contact: ${inch(s.latchTravel)}
- Study outside diameter: ${inch(s.outerDiameter)} (held constant in this sweep)
- Maximum deflection utilization: ${(s.maxDeflectionUtilization * 100).toFixed(1)}% (held constant in this scenario)
- Equivalent height above modeled maximum solid: ${dualLength(c.solidClearance)} (same constraint expressed as candidate-specific armed clearance)

## Selected Spring Geometry

- Wire diameter: ${inch(c.d)}
- Mean / inside diameter: ${inch(c.D)} / ${inch(c.ID)} (outside diameter is the study value above)
- Active / total coils: ${c.Na.toFixed(2)} / ${c.Nt.toFixed(2)}

## Package and Operating States

- Solid-height reference, nominal / modeled maximum: ${inch(c.HsNom)} / ${inch(c.HsMax)}
- Free state: length ${inch(c.Lf)}
- Armed / compressed state: length ${inch(c.Lc)}; spring force ${lbf(c.F0)}
- Hammer-contact state: length ${inch(c.L2)}; spring force ${lbf(c.F2)}
- Released / follow-through state: length ${inch(c.L3)}; spring force ${lbf(c.F3)}
- Hammer run-up: ${inch(c.s)}

## Predicted Mechanism Performance

- Spring rate: ${rate(c.k)}
- Hammer run-up work: ${work(c.Whammer)}
- Latch follow-through work: ${work(c.Wlatch)}
- Ideal total release work: ${work(c.WreleaseIdeal)} (not measured delivered energy)
- Stress guidance: ${stressSummary(c)}

## Assumptions and Decisions to Confirm

- Model uses ${materialName(material)} as a benchmark material.
- Nominal end form is squared and ground; CAD defaults to right-hand winding.
- Confirm that the armed, contact, and released lengths match the actual mechanism stops.
- Confirm the ${s.forceCap.toFixed(0)} lbf force cap, ${s.outerDiameter.toFixed(3)} in OD envelope, and ${s.latchTravel.toFixed(3)} in latch travel.
- Confirm the ${(s.maxDeflectionUtilization * 100).toFixed(1)}% maximum-deflection-utilization scenario; equivalent clearance for this candidate is ${inch(c.solidClearance)} above modeled H_s,max.
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
  const tensileBasis = s.stressBasis === "upper"
    ? material.tensileMaxPsi
    : s.stressBasis === "mid"
      ? (material.tensileMinPsi + material.tensileMaxPsi) / 2
      : material.tensileMinPsi;
  const tensileBasisLabel = s.stressBasis === "upper"
    ? "upper"
    : s.stressBasis === "mid"
      ? "mid-range"
      : "conservative";

  return communicationText(`# Compression Spring Prototype RFQ

We are seeking design-for-manufacture review and a prototype quotation. The spring candidate below is preliminary; please assess it and recommend changes that improve manufacturability, durability, or performance within the stated mechanism constraints.

## 1. Our Mechanism and Constraints

- Intended use: accelerate a hammer from the armed position to contact, then continue driving through the latch follow-through travel.
- Interpretation: contact and released values are quasi-static spring forces, not dynamic impact-force claims.

Constraint	Target / boundary	Status
Armed spring force	≤ ${lbf(s.forceCap)}	Mechanism limit
Total axial package, B	${inch(s.axialBudget)}	Armed spring length + hammer run-up
Latch follow-through	${inch(s.latchTravel)}	Additional travel after hammer contact
Spring outside diameter	${inch(s.outerDiameter)}	Current study envelope; please confirm feasibility

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
State	Spring length	Calculated spring force
Armed / compressed	${inch(c.Lc)}	${lbf(c.F0)} maximum
Hammer contact	${inch(c.L2)}	${lbf(c.F2)} nominal
Released / follow-through	${inch(c.L3)}	${lbf(c.F3)} nominal

Calculated Results
Result	Preliminary value
Spring rate	${rate(c.k)}
Nominal solid height	${inch(c.HsNom)}
Modeled maximum solid height	${inch(c.HsMax)}
Armed-load shear stress	${ksi(c.tau)} (Wahl-corrected, K_w = ${c.Kw.toFixed(3)})
Stress screening	${pct(c.stressPctBasis)} at the selected ${tensileBasisLabel} basis; ${stressSummary(c)}

## 3. Our Assumptions for Vendor Review

Assumption	Current model value	Please assess / optimize
Starting material	${materialName(material)}	Recommend the production material, wire condition, and temper—or a suitable alternative
Shear modulus, G	${(material.shearModulusPsi / 1e6).toFixed(1)} Mpsi	Confirm the value appropriate for the recommended material and condition
Tensile-strength screening range	${ksi(material.tensileMinPsi)}–${ksi(material.tensileMaxPsi)}	Replace with applicable values for the actual wire size and temper; these are not allowable shear stresses
Stress-classification basis	${ksi(tensileBasis)} (${tensileBasisLabel})	Apply the appropriate set, allowable-shear, fatigue, and relaxation criteria
Maximum-solid-height allowance	${pct(s.solidHeightTolerance)} above nominal	Confirm an achievable production tolerance and resulting maximum solid height
Maximum deflection utilization	${pct(s.maxDeflectionUtilization)}	Advise whether this can be safely increased for more performance or must be reduced for durability/tolerances
Equivalent armed height above maximum solid	${dualLength(c.solidClearance)}	Confirm the required production clearance after solid-height and load tolerances
End condition	Squared and ground	Confirm feasibility and recommend any change
Winding hand	Right-hand nominal	Confirm whether winding hand is functionally relevant
Fatigue duty / cycle target	TBD	Tell us what duty information is needed and what cycle capability is realistic
Temperature / corrosion / finish / cleanliness	TBD	Recommend requirements and identify any information needed from us

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
