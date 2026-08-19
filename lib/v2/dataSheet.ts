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
  "Nominal Spring",
  "Required Operating Points",
  "Mechanism Envelope",
  "Please Include With Quote",
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

  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };

  for (const line of lines) {
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
        : `<p>${escapeHtml(line)}</p>`,
    );
  }
  closeList();
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

  for (const line of lines) {
    const safeLine = escapeHtml(line);
    if (SHARE_SHEET_HEADINGS.has(line)) {
      const isTitle = line === "Spring Candidate — Mechanism Review" || line === "Compression Spring Prototype RFQ";
      rows.push(
        `<tr><td colspan="2" style="border:1px solid #a1a1aa;padding:9px 10px;background:${isTitle ? "#18181b" : "#e4e4e7"};color:${isTitle ? "#ffffff" : "#18181b"};font-weight:700;">${safeLine}</td></tr>`,
      );
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
  return communicationText(`# Compression Spring Prototype RFQ

Please assess manufacturability, recommend production details, and quote prototypes for the following nominal compression spring.

## Nominal Spring

- Material starting point: ${materialName(material)}; vendor to recommend exact wire condition/temper or a suitable alternative.
- Wire diameter: ${inch(c.d)}
- Outside diameter: ${inch(c.OD)}
- Inside / mean diameter: ${inch(c.ID)} / ${inch(c.D)}
- Active / total coils: ${c.Na.toFixed(2)} / ${c.Nt.toFixed(2)}
- Free length: ${inch(c.Lf)}
- End condition: squared and ground
- Handedness: right-hand nominal; advise if hand is functionally irrelevant

## Required Operating Points

- At armed height ${inch(c.Lc)}: ${lbf(c.F0)} maximum
- At hammer-contact height ${inch(c.L2)}: nominal ${lbf(c.F2)}
- At released/follow-through height ${inch(c.L3)}: nominal ${lbf(c.F3)}
- Nominal spring rate: ${rate(c.k)}
- Model nominal / maximum solid height: ${inch(c.HsNom)} / ${inch(c.HsMax)}
- Maximum deflection utilization: ${(s.maxDeflectionUtilization * 100).toFixed(1)}% (held constant in this scenario)
- Equivalent height above modeled maximum solid: ${dualLength(c.solidClearance)} (same constraint expressed as candidate-specific armed clearance)
- Stress screening result: ${stressSummary(c)}; please advise on preset/set and fatigue implications.

## Mechanism Envelope

- Nominal OD envelope: ${inch(s.outerDiameter)}
- Latch follow-through travel: ${inch(s.latchTravel)}
- Starting force must not exceed ${lbf(s.forceCap)} at the armed height.

## Please Include With Quote

- Manufacturability feedback and preferred standard wire size, if different
- Recommended material/temper, preset or scragging process, and finish
- Achievable tolerances for OD, free length, solid height, squareness, spring rate, and loads at the three specified heights
- Confirmation of solid-height clearance and end-grinding feasibility
- Information needed from us to assess fatigue life, temperature, corrosion, and cleanliness
- Available inspection, material certification, CoC, and lot-traceability options
- Prototype quantity: ___ pieces
- Production quantity: ___ pieces/order; ___ pieces/year
- Prototype and production pricing plus lead times

Please identify any recommended changes needed to make the spring robust and economical while preserving the OD envelope, armed-height force cap, and specified operating heights.

Reference: Spring Mechanism Explorer V2 · Candidate ${c.key} · Exported ${generatedAt}

This is an RFQ starting point, not a released drawing or qualified spring specification. Fatigue duty, temperature, environment, finish, and final inspection requirements remain TBD.`);
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
