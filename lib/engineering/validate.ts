/**
 * Lightweight validation of the equation system, solver, constraints and the
 * pure SVG spring-geometry renderer.
 *
 * Run with:  npm test        (→ tsx lib/engineering/validate.ts)
 *        or: npx tsx lib/engineering/validate.ts
 * Exits non-zero on failure.
 *
 * These tests retain the historical presets while validating the shared
 * Optimize → Engineering candidate semantics:
 *   - stress guidance uses τ / TS_basis (TS is tensile, not allowable shear)
 *   - Lee solid-height tolerance and maximum-deflection-utilization constraints stay distinct
 *   - mechanism boundaries include F1 cap and axial budget B
 */
import { solveModel } from "./solver";
import { evaluateConstraints } from "./constraints";
import { buildInitialState } from "../../data/exampleModel";
import { springRate, wahlFactor, shearStress } from "./spring";
import type { ModelState } from "./types";
import {
  buildSpringPath,
  isRenderableSpring,
  type SpringPathResult,
  type SpringPathSpec,
} from "../../components/SpringStateIllustration/springSvgGeometry";
import { evaluateV2Candidate, classifyStressBand } from "../v2/evaluateCandidate";
import { sweepV2DesignSpace, buildRange } from "../v2/sweepDesignSpace";
import { computePareto, recommendTopCandidates } from "../v2/pareto";
import { DEFAULT_V2_SCENARIO, computeHistoricalReference } from "../v2/defaults";
import type { V2Candidate, V2Scenario } from "../v2/types";
import { generateMechanismSummary, generateVendorRfq, shareSheetToHtml, shareSheetToTableHtml, springDataSheetFilename } from "../v2/dataSheet";
import { getV2Material, listV2Materials } from "../v2/materials";
import { applyScenarioImpactLens } from "../v2/impactLens";
import { estimateBodyMassLbm } from "../v2/impactMaterials";
import { parseStoredV2Scenario } from "../v2/scenarioStorage";
import { DataSheetButton } from "../../components/v2/DataSheetButton";
import { candidateCsvFilename, generateCandidateCsv } from "../v2/candidateCsv";
import { CandidateCsvButton } from "../../components/v2/CandidateCsvButton";
import { requiredSolidClearance, utilizationFromClearance } from "./deflectionConstraint";
import { sortV2CandidatesByPriorities } from "../v2/candidateSort";
import {
  DEFAULT_HOUSING_INNER_DIAMETER_MM,
  inchesToMillimeters,
  nominalSpringOuterDiameter,
} from "../v2/envelope";
import {
  isPlainWorkspaceNavigation,
  workspaceFromPathname,
} from "./workspaceNavigation";
import {
  createV2ShortlistEntry,
  isV2ShortlistEntryActive,
  v2ScenarioSignature,
  v2ShortlistEntryId,
} from "../v2/shortlist";
import { candidateToV1Model, defaultV2CandidateToV1Model } from "../v2/inspectBridge";
import { mechanismLatchBottoms } from "./mechanismLayout";

let failures = 0;

function check(label: string, actual: number | undefined, expected: number, tolPct = 0.5) {
  const ok =
    actual !== undefined &&
    Number.isFinite(actual) &&
    Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9) < tolPct / 100;
  if (!ok) {
    failures++;
    console.error(`FAIL  ${label}: got ${actual}, expected ≈ ${expected}`);
  } else {
    console.log(`ok    ${label} = ${actual}`);
  }
}

function assert(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`FAIL  ${label}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

/** Parse "M x,y L x,y L x,y …" path strings into a flat list of points. */
function coordsOf(paths: string[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const p of paths) {
    for (const tok of p.replace(/[ML]/g, " ").trim().split(/\s+/)) {
      if (!tok) continue;
      const [xs, ys] = tok.split(",");
      pts.push({ x: Number(xs), y: Number(ys) });
    }
  }
  return pts;
}

const segCount = (r: SpringPathResult) => r.backSegments.length + r.frontSegments.length;
const span = (r: SpringPathResult) => r.rightX - r.leftX;

console.log("── Pure helpers ──────────────────────────────");
assert("workspace route: /engineer → V1", workspaceFromPathname("/engineer") === "v1");
assert("workspace route: /optimize/ → V2", workspaceFromPathname("/optimize/") === "v2");
assert("workspace route: unrelated path ignored", workspaceFromPathname("/api/cad") === null);
assert(
  "workspace navigation: plain primary click stays in the mounted workbench",
  isPlainWorkspaceNavigation({
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  }),
);

console.log("\n── Canonical candidate + frozen comparison state ───────────");
{
  const defaultSweep = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const defaultCandidate = defaultSweep.candidates.find(
    (candidate) => candidate.key === defaultSweep.defaultKey,
  );
  const engineerModel = defaultV2CandidateToV1Model(DEFAULT_V2_SCENARIO);
  assert("Engineering initializes from the actual Optimize default", defaultCandidate !== undefined);
  check("canonical Engineer wire diameter", engineerModel.d?.value, defaultCandidate?.d ?? 0, 0.001);
  check("canonical Engineer total coils", engineerModel.Nt?.value, defaultCandidate?.Nt ?? 0, 0.001);

  const scenarioA: V2Scenario = { ...DEFAULT_V2_SCENARIO };
  const scenarioB: V2Scenario = { ...DEFAULT_V2_SCENARIO, axialBudget: 1.3 };
  const candidateA = evaluateV2Candidate(scenarioA, 0.14, 2.2);
  const candidateB = evaluateV2Candidate(scenarioB, 0.14, 2.2);
  const entryA = createV2ShortlistEntry(candidateA, scenarioA);
  const entryB = createV2ShortlistEntry(candidateB, scenarioB);
  const engineerScenarioB = candidateToV1Model(candidateB, scenarioB);

  assert("scenario signature changes with a mechanism constraint", v2ScenarioSignature(scenarioA) !== v2ScenarioSignature(scenarioB));
  assert("same geometry can be shortlisted under two scenarios", entryA.id !== entryB.id);
  assert("shortlist identity is deterministic", entryA.id === v2ShortlistEntryId(candidateA.key, scenarioA));
  assert("shortlist entry matches only its captured scenario", isV2ShortlistEntryActive(entryA, candidateA.key, scenarioA) && !isV2ShortlistEntryActive(entryA, candidateA.key, scenarioB));
  check("Engineer receives the shortlisted axial budget", engineerScenarioB.B?.value, 1.3, 0.001);
  check("Engineer receives the scenario force cap", engineerScenarioB.F1_cap?.value, scenarioB.forceCap, 0.001);
  check("Engineer receives the scenario solid-height tolerance", engineerScenarioB.solid_tolerance?.value, scenarioB.solidHeightTolerance, 0.001);
  check("Engineer receives the scenario TS basis", engineerScenarioB.TS_basis?.value, scenarioB.stressBasisPsi, 0.001);
  assert("Engineer mapping remains equation-consistent at the shortlisted budget", solveModel(engineerScenarioB).conflicts.length === 0);

  const savedBudget = entryA.scenario.axialBudget;
  const savedContactForce = entryA.candidate.F2;
  scenarioA.axialBudget = 9;
  candidateA.F2 = -1;
  check("shortlist freezes scenario inputs", entryA.scenario.axialBudget, savedBudget, 0.001);
  check("shortlist freezes evaluated outputs", entryA.candidate.F2, savedContactForce, 0.001);

  const latchBottoms = mechanismLatchBottoms(2.3, 2.37, 0.55);
  check("Engineer latch uses actual contact length", latchBottoms[0], 2.85, 0.001);
  check("Engineer latch stays fixed through contact", latchBottoms[1], latchBottoms[0], 0.001);
  check("Engineer latch follows actual released length", latchBottoms[2], 2.92, 0.001);
}
assert(
  "workspace navigation: modified click keeps native new-tab behavior",
  !isPlainWorkspaceNavigation({
    button: 0,
    altKey: false,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
  }),
);
check("springRate(11.5e6, 0.055, 0.4, 10)", springRate(11.5e6, 0.055, 0.4, 10), 20.553, 0.5);
check("wahlFactor(C=7.2727)", wahlFactor(0.4 / 0.055), 1.2042, 0.5);
check(
  "shearStress(Kw=1.2042, F=12.33, D=0.4, d=0.055)",
  shearStress(1.2042, 12.33, 0.4, 0.055),
  90_950,
  1,
);

// ─────────────────────────────────────────────────────────────────────────
// Test group 1 — Closed-and-ground coil relation (N_a ≈ N_t − 2)
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (1) Closed-and-ground coil relation ──────────────────────");
{
  // Forward direction: total coils is the input, active coils is derived.
  const literal = solveModel(buildInitialState("forward", "literalSketch"));
  check("literal: N_t (input)", literal.values.Nt, 3.5, 0.5);
  check("literal: N_a = N_t − 2 (derived)", literal.values.Na, 1.5, 0.5);

  const recon = solveModel(buildInitialState("forward", "reconciledCandidate"));
  check("reconciled: N_t (input)", recon.values.Nt, 5.5, 0.5);
  check("reconciled: N_a = N_t − 2 (derived)", recon.values.Na, 3.5, 0.5);

  const cur = solveModel(buildInitialState("forward", "currentCandidate"));
  check("current: N_t (input)", cur.values.Nt, 5.1, 0.5);
  check("current: N_a = N_t − 2 (derived)", cur.values.Na, 3.1, 0.5);

  // Reverse direction: pin active coils, derive total coils (N_t = N_a + 2).
  const rev: ModelState = buildInitialState("forward", "literalSketch");
  rev.Na = { value: 1.5, status: "fixed" };
  rev.Nt = { value: 3.5, status: "derived" };
  const revSolved = solveModel(rev);
  check("reverse: N_a pinned → N_t = N_a + 2 (derived)", revSolved.values.Nt, 3.5, 0.5);
  assert("reverse: coil relation produces no conflict", revSolved.conflicts.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Test group 2 — Historical presets remain intact; current candidate aligns to
// Elgiloy + Lee + mechanism-boundary semantics.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (2) Literal / reconciled / current presets ─────────────────");
{
  const r = solveModel(buildInitialState("forward", "literalSketch"));
  const v = r.values;
  // The whole point of the corrective pass: N_t is 3.5, never 5.5.
  assert("literal: N_t is exactly ≈ 3.5", Math.abs((v.Nt ?? 0) - 3.5) < 1e-6);
  assert("literal: N_t is NOT 5.5", Math.abs((v.Nt ?? 0) - 5.5) > 1);
  assert("literal: N_a is NOT 3.5 (that was the bug)", Math.abs((v.Na ?? 0) - 3.5) > 1);

  // Geometry inputs and derivations.
  check("literal d (input)", v.d, 0.17, 0.5);
  check("literal ID (input)", v.ID, 0.78, 0.5);
  check("literal D = ID + d (derived)", v.D, 0.95, 0.5);
  check("literal OD = D + d (derived)", v.OD, 1.12, 0.5);

  // Rate/forces come from the literal geometry — they do NOT match the
  // whiteboard's ~280 lbf/in / ~140 lbf and that is expected.
  check("literal k (geometry-derived, ≠ stated 280)", v.k, 933.6, 2);
  check("literal F1 (≠ stated 140)", v.F1, 466.8, 2);
  check("literal F2", v.F2, 233.4, 2);
  check("literal F3", v.F3, 168.0, 2);
  check("literal L_free (input)", v.L_free, 1.4, 0.5);
  check("literal L_min", v.L_min, 0.9, 1);
  assert("literal: fully resolved", r.unresolved.length === 0);
  assert("literal: no solver conflict (disagreement is not a pinned conflict)", r.conflicts.length === 0);

  // The literal spring is over-stressed — expose, do not hide.
  const c = evaluateConstraints(v);
  const stress = c.find((x) => x.id === "stress");
  assert("literal: stress constraint present", !!stress);
  assert("literal: literal geometry is OVER-STRESSED (util ≥ 1)", stress?.ok === false);
}
{
  const r = solveModel(buildInitialState("forward", "reconciledCandidate"));
  const v = r.values;
  check("reconciled d (input)", v.d, 0.147, 1);
  check("reconciled D (input)", v.D, 0.88, 0.5);
  check("reconciled OD = D + d (derived)", v.OD, 1.027, 1);
  check("reconciled ID = D − d (derived)", v.ID, 0.733, 1);
  check("reconciled k ≈ 280 (equation-consistent)", v.k, 281.4, 2);
  check("reconciled F1 ≈ 140", v.F1, 140.0, 2);
  assert("reconciled: fully resolved", r.unresolved.length === 0);
  assert("reconciled: no conflicts", r.conflicts.length === 0);

  // Reconciled candidate remains equation-consistent; legacy geometry is not
  // silently changed to satisfy the new deflection-margin scenario.
  const c = evaluateConstraints(v);
  const failed = c.filter((x) => !x.ok);
  assert("reconciled: new deflection constraint is surfaced", failed.some((x) => x.id === "coil_bind"));
}
{
  const r = solveModel(buildInitialState("forward", "currentCandidate"));
  const v = r.values;
  check("current d (input)", v.d, 0.137, 0.5);
  check("current D (input)", v.D, 0.963, 0.5);
  check("current OD = D + d (derived)", v.OD, 1.1, 0.5);
  check("current ID = D − d (derived)", v.ID, 0.826, 0.5);
  check("current N_t (input)", v.Nt, 5.1, 0.5);
  check("current N_a (derived)", v.Na, 3.1, 0.5);
  check("current k", v.k, 190.9, 1);
  check("current H_s,nom", v.Hs, 0.6987, 0.5);
  check("current H_s,max", v.Hs_max, 0.733635, 0.5);
  check("current L_min", v.L_min, 0.9170079, 0.5);
  check("current s_h", v.s_h, 0.2329921, 0.5);
  check("current x1", v.x1, 0.733491, 0.5);
  check("current L_f", v.L_free, 1.6504993, 0.5);
  check("current deflection utilization", v.deflection_utilization, 0.8, 0.1);
  check("current F1", v.F1, 140, 0.6);
  check("current F2", v.F2, 95.52, 1);
  check("current F3", v.F3, 82.16, 1);
  check("current W_run", v.W_run, 27.43, 1);
  check("current τ", v.tau, 161_806, 1);
  check("current τ / TS_basis", v.utilization, 0.599, 1);
  assert("current: conflict-free", r.conflicts.length === 0);
  assert(
    "current: optional hammer/latch unknowns can remain unresolved",
    r.unresolved.every((id) => ["KE", "v", "p"].includes(id)),
  );

  const c = evaluateConstraints(v);
  const stress = c.find((x) => x.id === "stress");
  const cap = c.find((x) => x.id === "start_force_cap");
  const budget = c.find((x) => x.id === "axial_budget");
  assert("current: stress ratio is set/preset band (passes)", stress?.ok === true && stress?.severity === "warning");
  assert("current: starting-force cap passes (F1 <= 140)", cap?.ok === true);
  assert("current: axial budget boundary passes", budget?.ok === true);
}

// ─────────────────────────────────────────────────────────────────────────
// Test group 3 — Pure SVG spring renderer
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (3) Spring renderer geometry ─────────────────────────────");
{
  const base: SpringPathSpec = {
    wireDiameter: 0.17,
    meanDiameter: 0.95,
    totalCoils: 3.5,
    currentLength: 0.9,
  };
  const CX = 100;
  const BOTTOM = 300;
  const PX = 150;

  assert("renderer: base spec is renderable", isRenderableSpring(base));
  const r = buildSpringPath(base, CX, BOTTOM, PX);
  assert("renderer: buildSpringPath returns a result", r !== null);
  if (r) {
    // Layered front/back half-turns exist.
    assert("renderer: has back segments", r.backSegments.length > 0);
    assert("renderer: has front segments", r.frontSegments.length > 0);

    // Part 5 — NO full-width horizontal seat path. The old full-width
    // "seatPaths"/"interiorPath" elements must be gone, and no segment may be a
    // 2-point straight line spanning (most of) the diameter at the datum.
    assert("renderer: no seatPaths property", !("seatPaths" in r));
    assert("renderer: no interiorPath property", !("interiorPath" in r));
    const noShelf = [...r.backSegments, ...r.frontSegments].every((segPath) => {
      const pts = coordsOf([segPath]);
      const horizontal2pt =
        pts.length === 2 &&
        Math.abs(pts[0].y - pts[1].y) < 0.5 &&
        Math.abs(pts[0].x - pts[1].x) > 0.8 * span(r);
      return !horizontal2pt;
    });
    assert("renderer: no diameter-spanning horizontal seat bar", noShelf);

    // No NaN/Infinity anywhere.
    const allPts = coordsOf([...r.backSegments, ...r.frontSegments]);
    assert(
      "renderer: all coordinates finite (no NaN/Infinity)",
      allPts.length > 0 && allPts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    );

    // Datum + top plane. Bottom terminal coil sits at/above the datum; nothing
    // is drawn below the datum or above the top seating plane.
    check("renderer: bottomSeatY equals datum", r.bottomSeatY, BOTTOM, 0.01);
    check("renderer: topSeatY = datum − L·px", r.topSeatY, BOTTOM - base.currentLength * PX, 0.5);
    const withinSeats = allPts.every(
      (p) => p.y >= r.topSeatY - 0.6 && p.y <= r.bottomSeatY + 0.6,
    );
    assert("renderer: every point between top seat and datum (nothing below datum)", withinSeats);
  }

  // Parametric response — the renderer reflects engineering inputs, never
  // recomputes them.
  const moreCoils = buildSpringPath({ ...base, totalCoils: 5.5 }, CX, BOTTOM, PX);
  assert(
    "parametric: more N_t → more helix segments (turn count)",
    !!moreCoils && !!r && segCount(moreCoils) > segCount(r),
  );

  const thicker = buildSpringPath({ ...base, wireDiameter: 0.34 }, CX, BOTTOM, PX);
  assert(
    "parametric: larger d → larger stroke width",
    !!thicker && !!r && thicker.strokeWidthPx > r.strokeWidthPx,
  );

  const wider = buildSpringPath({ ...base, meanDiameter: 1.9 }, CX, BOTTOM, PX);
  assert(
    "parametric: larger D → wider coil span",
    !!wider && !!r && span(wider) > span(r),
  );

  const taller = buildSpringPath({ ...base, currentLength: 1.4 }, CX, BOTTOM, PX);
  assert(
    "parametric: longer length → higher top seat (larger pitch)",
    !!taller && !!r && taller.topSeatY < r.topSeatY,
  );

  // Invalid specs never throw and never produce geometry.
  assert(
    "renderer: rejects D ≤ d",
    buildSpringPath({ ...base, meanDiameter: 0.1 }, CX, BOTTOM, PX) === null,
  );
  assert(
    "renderer: rejects non-finite input",
    buildSpringPath({ ...base, totalCoils: Number.NaN }, CX, BOTTOM, PX) === null,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Test group 4 — State consistency across the three presentation states.
// States 1/2/3 share identical d / D / N_t but differ only in loaded length.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (4) State-to-state consistency ───────────────────────────");
{
  const v = solveModel(buildInitialState("forward", "literalSketch")).values;
  const d = v.d as number;
  const D = v.D as number;
  const Nt = v.Nt as number;
  const lengths = [v.L_free as number, v.L_min as number, ((v.L_free as number) + (v.L_min as number)) / 2];
  const specs = lengths.map(
    (currentLength): SpringPathSpec => ({ wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength }),
  );
  const results = specs.map((s) => buildSpringPath(s, 100, 300, 150));

  assert("states: all three render", results.every((x) => x !== null));
  if (results.every((x): x is SpringPathResult => x !== null)) {
    assert(
      "states: identical wire (same stroke width across states)",
      results.every((x) => Math.abs(x.strokeWidthPx - results[0].strokeWidthPx) < 1e-6),
    );
    assert(
      "states: identical D (same coil span across states)",
      results.every((x) => Math.abs(span(x) - span(results[0])) < 1e-6),
    );
    assert(
      "states: identical N_t (same segment count across states)",
      results.every((x) => segCount(x) === segCount(results[0])),
    );
    const seats = results.map((x) => x.topSeatY);
    assert(
      "states: differing loaded length → differing top seat",
      new Set(seats.map((s) => s.toFixed(2))).size === seats.length,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Test group 5 — Warning visualization: a near-limit or stress-only condition
// must NOT repaint the whole spring. The spring is only recoloured (red) when
// its geometry is actually violated (coil bind). Near-limit adds a small badge
// only, driven by coil_bind.ok staying true.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (5) Warning visualization invariants ─────────────────────");
{
  // Isolate a stress-only case with a permissive deflection margin so the
  // spring stays neutral steel rather than being repainted for stress alone.
  const litModel = buildInitialState("forward", "literalSketch");
  litModel.deflection_utilization_max = { value: 0.99, status: "variable" };
  const litC = evaluateConstraints(solveModel(litModel).values);
  const litStress = litC.find((x) => x.id === "stress");
  const litBind = litC.find((x) => x.id === "coil_bind");
  assert("viz: literal stress fails (badge is red)", litStress?.ok === false);
  assert("viz: literal coil geometry OK → spring not repainted red", litBind?.ok === true);

  // Reconciled: its historical geometry now explicitly fails the new margin.
  const recV = solveModel(buildInitialState("forward", "reconciledCandidate")).values;
  const recC = evaluateConstraints(recV);
  const recBind = recC.find((x) => x.id === "coil_bind");
  const clearance = (recV.L_min as number) - (recV.Hs_max as number);
  const cExtra = (recV.c_extra as number) ?? 0;
  assert("viz: reconciled clearance is below the new required margin", clearance < cExtra);
  assert("viz: reconciled deflection-margin failure is surfaced", recBind?.ok === false);
}

// ─────────────────────────────────────────────────────────────────────────
// Reverse solve — worked backward from the pinned latch force (F2). Reverse
// always uses the equation-consistent reconciled base (a literal reverse would
// be circular: D = ID + d vs d from the rate equation).
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── Reverse solve ────────────────────────────────────────────");
{
  const r = solveModel(buildInitialState("reverse"));
  const v = r.values;
  check("reverse k = F2/(x1 − s_h)", v.k, 280, 1);
  check("reverse F1 = k·x1", v.F1, 140, 1);
  check("reverse F3", v.F3, 50.4, 1);
  check("reverse d (solved from rate eq)", v.d, 0.14681, 1);
  assert("reverse: no conflicts", r.conflicts.length === 0);
  assert("reverse: fully resolved", r.unresolved.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Overconstraint — a pinned, inconsistent Hooke triple must surface as a
// conflict instead of being silently "corrected".
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── Overconstraint detection ─────────────────────────────────");
{
  const state = buildInitialState("explore", "literalSketch");
  // k is geometry-derived (~934); pin F1 to a value inconsistent with k·x1.
  state.F1 = { value: 50, status: "fixed" };
  const result = solveModel(state);
  assert("overconstraint: at least one conflict raised", result.conflicts.length > 0);
  assert(
    "overconstraint: conflict traced to pinned F1",
    result.conflicts.some((c) => c.fixedParameterIds.includes("F1")),
  );
  assert("overconstraint: fixed F1 not overwritten", result.values.F1 === 50);
}

// ─────────────────────────────────────────────────────────────────────────
// Determinism — same input → same output.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── Determinism ──────────────────────────────────────────────");
{
  const a = solveModel(buildInitialState("forward", "literalSketch"));
  const b = solveModel(buildInitialState("forward", "literalSketch"));
  assert("determinism", JSON.stringify(a) === JSON.stringify(b));
}

// ═════════════════════════════════════════════════════════════════════════
// V2 OPTIMIZATION WORKBENCH
// V2 is a separate workflow. These tests never touch the V1 model above.
// ═════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// V2 (a) — Candidate geometry / packaging / force / work relationships.
// A single representative candidate is checked against every governing
// relationship (all self-consistent with the shared spring helpers).
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (a) Candidate evaluator relationships ──────────────────");
{
  const sc = DEFAULT_V2_SCENARIO;
  const d = 0.147;
  const Na = 3.5;
  const c = evaluateV2Candidate(sc, d, Na);
  const OD = nominalSpringOuterDiameter(sc);
  const B = sc.axialBudget;
  const y = sc.latchTravel;

  // Geometry (OD locked)
  check("V2 D = OD − d", c.D, OD - d, 0.001);
  check("V2 ID = OD − 2d", c.ID, OD - 2 * d, 0.001);
  check("V2 Nt = Na + 2", c.Nt, Na + 2, 0.001);
  check("V2 housing ceiling defaults to 28 mm", inchesToMillimeters(sc.housingInnerDiameter), DEFAULT_HOUSING_INNER_DIAMETER_MM, 0.001);
  check("V2 nominal OD + positive tolerance = housing ceiling", c.OD + sc.outerDiameterTolerance, sc.housingInnerDiameter, 0.001);

  // Solid height
  check("V2 Hs_nom = Nt·d", c.HsNom, c.Nt * d, 0.001);
  check("V2 Hs_max = 1.05·Hs_nom", c.HsMax, 1.05 * c.HsNom, 0.001);
  check("V2 clearance derives from scenario utilization", c.solidClearance, requiredSolidClearance(c.x0, sc.maxDeflectionUtilization), 0.001);
  check("V2 Lc = Hs_max + required clearance", c.Lc, c.HsMax + c.solidClearance, 0.001);
  check("V2 deflection utilization = scenario limit", c.deflectionUtilization, sc.maxDeflectionUtilization, 0.001);

  // Axial budget: Lc + s = B (within floating tolerance)
  assert("V2 Lc + s = B (1.150)", Math.abs(c.Lc + c.s - B) < 1e-9);
  check("V2 B constant → L2 = B", c.L2, B, 0.001);
  check("V2 L3 = B + y", c.L3, B + y, 0.001);

  // Starting deflection + free length (F0 evaluated AT the cap)
  check("V2 F0 = force cap", c.F0, sc.forceCap, 0.001);
  check("V2 x0 = F0/k", c.x0, c.F0 / c.k, 0.001);
  check("V2 Lf = Lc + x0", c.Lf, c.Lc + c.x0, 0.001);

  // Forces
  check("V2 F2 = F0 − k·s", c.F2, c.F0 - c.k * c.s, 0.001);
  check("V2 F3 = F0 − k·(s+y)", c.F3, c.F0 - c.k * (c.s + y), 0.001);

  // Work
  check("V2 W_hammer = F0·s − ½·k·s²", c.Whammer, c.F0 * c.s - 0.5 * c.k * c.s * c.s, 0.001);
  check("V2 W_latch = F2·y − ½·k·y²", c.Wlatch, c.F2 * y - 0.5 * c.k * y * y, 0.001);
  check("V2 W_release_ideal = W_hammer + W_latch", c.WreleaseIdeal, c.Whammer + c.Wlatch, 0.001);

  // Force-equivalent proxies (ideal, NOT contact force)
  check("V2 F_eq_avg_ideal = W_release/y", c.FeqAvgIdeal, c.WreleaseIdeal / y, 0.001);
  check("V2 F_eq_tri_peak = 2·F_eq_avg", c.FeqTriPeakIdeal, 2 * c.FeqAvgIdeal, 0.001);

  // Editable engineering assumptions must cascade into the evaluator.
  const lowerG = evaluateV2Candidate({ ...sc, shearModulusPsi: sc.shearModulusPsi * 0.9 }, d, Na);
  check("V2 numeric shear modulus drives spring rate", lowerG.k, c.k * 0.9, 0.001);
  const customBasis = evaluateV2Candidate({ ...sc, stressBasisPsi: 280_000 }, d, Na);
  check("V2 numeric TS basis drives stress classification ratio", customBasis.stressPctBasis, customBasis.tau / 280_000, 0.001);
}

// ─────────────────────────────────────────────────────────────────────────
// V2 (b) — Historical whiteboard reconstruction lands near ~450 / ~900.
// Using F0=140, k=280, s=0.250, y=0.070. Not required to hit exactly.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (b) Historical whiteboard reconstruction ──────────────");
{
  const h = computeHistoricalReference();
  check("V2 historical W_hammer", h.Whammer, 26.25, 1);
  check("V2 historical W_latch", h.Wlatch, 4.214, 1);
  assert(
    `V2 historical F_eq_avg_ideal ≈ 450 neighborhood (got ${h.FeqAvgIdeal.toFixed(1)})`,
    h.FeqAvgIdeal > 400 && h.FeqAvgIdeal < 480,
  );
  assert(
    `V2 historical F_eq_tri_peak ≈ 900 neighborhood (got ${h.FeqTriPeakIdeal.toFixed(1)})`,
    h.FeqTriPeakIdeal > 800 && h.FeqTriPeakIdeal < 960,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// V2 (c) — Lee stress-guidance band classification (design guidance, NOT
// yield/ultimate). Boundaries: ≤40% low · >40–60% set · >60% redesign.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (c) Stress band classification ────────────────────────");
{
  assert("V2 stress 30% → low", classifyStressBand(0.3) === "low");
  assert("V2 stress 40% (boundary) → low", classifyStressBand(0.4) === "low");
  assert("V2 stress 50% → set", classifyStressBand(0.5) === "set");
  assert("V2 stress 60% (boundary) → set", classifyStressBand(0.6) === "set");
  assert("V2 stress 70% → redesign", classifyStressBand(0.7) === "redesign");

  // The default sweep spans enough of the space to produce every band.
  const sweep = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const bands = new Set(sweep.candidates.map((c) => c.feasibility.stressBand));
  assert("V2 sweep produces a low-stress region", bands.has("low"));
  assert("V2 sweep produces a set (40–60%) region", bands.has("set"));
  assert("V2 sweep produces a redesign (>60%) region", bands.has("redesign"));
  assert(
    "V2 feasible set excludes every >60% redesign candidate",
    sweep.feasible.every((c) => c.feasibility.stressBand !== "redesign"),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// V2 (d) — Pareto frontier on a tiny synthetic set: dominated points removed.
// Dimensions are (W_hammer, W_latch).
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (d) Pareto frontier ───────────────────────────────────");
{
  const mk = (key: string, Whammer: number, Wlatch: number): V2Candidate =>
    ({ key, Whammer, Wlatch } as unknown as V2Candidate);
  const set = [
    mk("A", 10, 1), // frontier (max hammer work)
    mk("B", 1, 10), // frontier (max latch work)
    mk("C", 5, 5), // frontier (not dominated by A or B)
    mk("D", 4, 4), // dominated by C (5≥4, 5≥4, strictly better)
  ];
  const front = computePareto(set);
  assert("V2 pareto keeps A", front.has("A"));
  assert("V2 pareto keeps B", front.has("B"));
  assert("V2 pareto keeps C", front.has("C"));
  assert("V2 pareto removes dominated D", !front.has("D"));
  assert("V2 pareto frontier size = 3", front.size === 3);

  const nearMax = [
    { ...mk("H", 100, 2), WreleaseIdeal: 101 },
    { ...mk("T", 99, 3), WreleaseIdeal: 102 },
    { ...mk("L", 98, 4), WreleaseIdeal: 101.5 },
    { ...mk("X", 110, 0.1), WreleaseIdeal: 90 },
  ];
  const recommendations = recommendTopCandidates(nearMax);
  assert("V2 recommendations use near-max hammer / total / follow-through leaders", recommendations.keys.join("") === "HTL");
}

// ─────────────────────────────────────────────────────────────────────────
// V2 (e) — Sweep grid + determinism. Same scenario → identical results/order.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (e) Sweep grid + determinism ──────────────────────────");
{
  const r = buildRange(0.12, 0.18, 0.001);
  assert("V2 buildRange inclusive count (0.120→0.180 @0.001 = 61)", r.length === 61);
  check("V2 buildRange first = 0.120", r[0], 0.12, 0.001);
  check("V2 buildRange last = 0.180", r[r.length - 1], 0.18, 0.001);

  const a = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const b = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  assert("V2 sweep count = wire × coils", a.totalCount === a.wireValues.length * a.coilValues.length);
  assert("V2 sweep is deterministic (identical results + order)", JSON.stringify(a) === JSON.stringify(b));
  assert("V2 sweep finds feasible candidates", a.feasibleCount > 0);
  assert("V2 sweep suggests a default candidate", a.defaultKey !== null);
  assert("V2 sweep exposes three green recommendations", a.recommendedKeys.length === Math.min(3, a.feasible.length));
  assert("V2 recommendations are feasible", a.recommendedKeys.every((key) => a.feasible.some((candidate) => candidate.key === key)));

  // The suggested default is the feasible candidate with max ideal release equiv.
  const def = a.candidates.find((c) => c.key === a.defaultKey);
  assert("V2 default candidate is feasible", def?.feasibility.feasible === true);
  const maxFeq = Math.max(...a.feasible.map((c) => c.FeqAvgIdeal));
  assert(
    "V2 default candidate maximizes ideal release equivalent",
    def !== undefined && Math.abs(def.FeqAvgIdeal - maxFeq) < 1e-9,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// V2 (f) — Independence from V1: the 900/450 lbf latch numbers are NEVER used
// as constraints, and V2 does not read V1-only state or latch assumptions.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (f) V1 independence ───────────────────────────────────");
{
  // Changing OD alone (a study assumption) shifts the feasible set — proving V2
  // derives everything from its own scenario, not V1 pins.
  const wide: V2Scenario = {
    ...DEFAULT_V2_SCENARIO,
    housingInnerDiameter: 1.3 + DEFAULT_V2_SCENARIO.outerDiameterTolerance,
  };
  const base = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const alt = sweepV2DesignSpace(wide);
  assert("V2 responds to its own scenario (OD change alters feasible count)", base.feasibleCount !== alt.feasibleCount);

  // Lower permitted utilization reserves more travel and eats axial budget.
  const tight: V2Scenario = { ...DEFAULT_V2_SCENARIO, maxDeflectionUtilization: 0.5 };
  const tightSweep = sweepV2DesignSpace(tight);
  assert(
    "V2 lower utilization reduces the run-up budget (feasible count drops)",
    tightSweep.feasibleCount < base.feasibleCount,
  );
}

console.log("\n── V2 (f2) Deflection constraint representations ────────────");
{
  const x = 0.5;
  const clearance = requiredSolidClearance(x, 0.8);
  check("80% utilization requires 25% of working deflection as clearance", clearance, 0.125, 0.001);
  check("clearance converts back to the same utilization", utilizationFromClearance(x, clearance), 0.8, 0.001);

  const a = evaluateV2Candidate(DEFAULT_V2_SCENARIO, 0.137, 3.2);
  const b = evaluateV2Candidate(DEFAULT_V2_SCENARIO, 0.150, 3.8);
  check("candidate A uses shared utilization", a.deflectionUtilization, DEFAULT_V2_SCENARIO.maxDeflectionUtilization, 0.001);
  check("candidate B uses shared utilization", b.deflectionUtilization, DEFAULT_V2_SCENARIO.maxDeflectionUtilization, 0.001);
  assert("candidate-specific clearances differ", Math.abs(a.solidClearance - b.solidClearance) > 1e-6);
}

// ───────────────────────────────────────────────────────────────────────
// V2 (g) — Vendor data sheet content and Selected Candidate UI trigger.
// ──────────────────────────────────────────────────────────────────────
console.log("\n── V2 (g) Spring vendor data sheet ───────────────────");
{
  const stainless177 = getV2Material("stainless177Ph");
  assert("17-7 PH appears in the spring-material selector library", listV2Materials().some((material) => material.id === stainless177.id));
  check("17-7 PH uses Lee's published shear modulus", stainless177.shearModulusPsi, 11_000_000);
  check("17-7 PH uses Lee's CH900 tensile minimum", stainless177.tensileMinPsi, 230_000);
  check("17-7 PH uses Lee's CH900 tensile maximum", stainless177.tensileMaxPsi, 343_000);
  assert("17-7 PH records AMS 5678, CH900 and Lee provenance", stainless177.specification === "AMS 5678" && stainless177.condition.includes("CH900") && stainless177.sourceUrl.includes("leespring.com"));

  const scenario = DEFAULT_V2_SCENARIO;
  const candidate = evaluateV2Candidate(scenario, 0.137, 3.6);
  const material = getV2Material(scenario.materialId);
  const input = {
    candidate,
    scenario,
    material,
    generatedAt: "2026-08-19T12:00:00.000Z",
  };
  const mechanism = generateMechanismSummary(input);
  const vendor = generateVendorRfq(input);

  for (const phrase of ["Mechanism Requirements", "Selected Spring Geometry", "Package and Operating States", "Predicted Mechanism Performance", "Decisions to Confirm"]) {
    assert(`mechanism summary includes ${phrase}`, mechanism.includes(phrase));
  }
  for (const phrase of ["Prototype RFQ", "1. Our Mechanism and Constraints", "2. Preliminary Calculations — Please Assess and Optimize", "3. Our Assumptions for Vendor Review"]) {
    assert(`vendor RFQ includes ${phrase}`, vendor.includes(phrase));
  }
  assert("mechanism summary uses selected candidate value", mechanism.includes(candidate.Lf.toFixed(4)));
  assert("mechanism summary identifies equivalent height-above-solid constraint", mechanism.includes("Equivalent height above modeled maximum solid") && mechanism.includes("same constraint expressed as candidate-specific armed clearance"));
  assert("mechanism summary includes scenario utilization beside equivalent clearance", mechanism.includes(`Maximum deflection utilization: ${(scenario.maxDeflectionUtilization * 100).toFixed(1)}%`) && mechanism.includes(candidate.solidClearance.toFixed(4)));
  assert("mechanism summary uses candidate maximum solid height", mechanism.includes(candidate.HsMax.toFixed(4)));
  assert("vendor RFQ uses current scenario value", vendor.includes(scenario.latchTravel.toFixed(4)));
  assert("exports include the 28 mm housing OD ceiling", mechanism.includes("Housing ID / absolute finished-spring OD") && mechanism.includes("28.00 mm") && vendor.includes("Hard mechanism envelope"));
  assert("exports include the derived OD tolerance allowance", mechanism.includes(scenario.outerDiameterTolerance.toFixed(4)) && vendor.includes("OD tolerance / fit allowance"));
  assert("exports include editable shear modulus and numeric stress basis", vendor.includes(`${(scenario.shearModulusPsi / 1e6).toFixed(1)} Mpsi`) && vendor.includes(`${(scenario.stressBasisPsi / 1000).toFixed(1)} ksi`));
  assert("vendor RFQ places utilization and clearance together in assumptions", vendor.includes("Maximum deflection utilization\t") && vendor.includes("Equivalent armed height above maximum solid\t"));
  assert("vendor RFQ explains mechanism use and distinguishes spring from impact force", vendor.includes("accelerate a hammer") && vendor.includes("not dynamic impact-force claims"));
  assert("vendor RFQ discloses ksi assumptions without unnecessary equation detail", vendor.includes(`${(material.tensileMinPsi / 1000).toFixed(1)} ksi–${(material.tensileMaxPsi / 1000).toFixed(1)} ksi`) && vendor.includes("not allowable shear stresses") && !vendor.includes("τ = K_w·8·F·D/(π·d³)"));
  assert("exports disclose missing impact masses instead of inventing force", mechanism.includes("both masses are required") && vendor.includes("both masses required"));
  assert("exports cite the selected material source", mechanism.includes(material.sourceUrl) && vendor.includes(material.sourceUrl));
  assert("vendor RFQ requests optimization of material assumptions", vendor.includes("Recommend the production material") && vendor.includes("Replace with applicable values"));
  assert("vendor RFQ includes prototype quantity placeholder", vendor.includes("Prototype quantity: ___"));
  assert("vendor RFQ keeps unspecified requirements TBD", vendor.includes("Fatigue duty / cycle target\tTBD") && vendor.includes("Temperature / corrosion / finish / cleanliness\tTBD"));
  assert("mechanism summary stays concise", mechanism.split("\n").length < 55);
  assert("vendor RFQ stays concise", vendor.split("\n").filter(Boolean).length < 60);
  assert("mechanism export contains no Markdown headings", !mechanism.includes("# "));
  assert("vendor export contains plain-text bullets", vendor.includes("• "));
  assert("formatted copy bolds headings", shareSheetToHtml(mechanism).includes("<strong>Mechanism Requirements</strong>"));
  assert("formatted copy uses semantic bullet lists", shareSheetToHtml(vendor).includes("<ul>") && shareSheetToHtml(vendor).includes("<li>"));
  assert("formatted copy renders operating states as a three-column table", shareSheetToHtml(vendor).includes("Calculated spring force</th>") && shareSheetToHtml(vendor).includes("Hammer contact</td>"));
  assert("Gmail copy uses an HTML table", shareSheetToTableHtml(mechanism).startsWith("<table"));
  assert("Gmail table uses inline paste-safe styles", shareSheetToTableHtml(mechanism).includes("border-collapse:collapse") && shareSheetToTableHtml(mechanism).includes("font-weight:700"));
  assert("Gmail table includes selected candidate values", shareSheetToTableHtml(mechanism).includes(candidate.Lf.toFixed(4)));
  assert("Gmail vendor copy contains nested sub-tables", shareSheetToTableHtml(vendor).includes("Operating States") && shareSheetToTableHtml(vendor).includes("Calculated spring force</th>"));
  assert("Gmail table escapes generated content", !shareSheetToTableHtml(generateMechanismSummary({ ...input, generatedAt: "<unsafe>" })).includes("<unsafe>"));
  assert("mechanism filename is audience-specific", springDataSheetFilename("d=0.137 / Na=3.60", "txt", "mechanism") === "spring-mechanism-summary_d-0.137-Na-3.60.txt");
  assert("vendor filename is audience-specific", springDataSheetFilename("d=0.137 / Na=3.60", "txt", "vendor") === "spring-vendor-rfq_d-0.137-Na-3.60.txt");

  let opened = false;
  const button = DataSheetButton({ onClick: () => { opened = true; } });
  const buttonProps = button.props as { onClick: () => void; "data-testid": string; children: unknown[] };
  buttonProps.onClick();
  assert("Export Data Sheet UI trigger invokes its handler", opened);
  assert("Export Data Sheet UI trigger is discoverable", buttonProps["data-testid"] === "export-data-sheet-button");
}

console.log("\n── V2 (g2) Shared impact assumptions and persistence ─────────");
{
  const sweep = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const candidate = sweep.feasible.find((item) => item.key === sweep.defaultKey) ?? sweep.feasible[0];
  assert("impact test has a feasible candidate", candidate !== undefined);
  const scenario: V2Scenario = {
    ...DEFAULT_V2_SCENARIO,
    hammerMassLbm: 0.25,
    latchMassLbm: 0.05,
    impactEfficiency: 1,
    impactRestitution: 0,
  };
  const lens = applyScenarioImpactLens(candidate, scenario);
  assert("impact lens calculates velocity when hammer mass exists", lens.velocity !== undefined && lens.velocity > 0);
  assert("impact lens calculates latch-only KE transfer when both masses exist", lens.latchPostImpactKE !== undefined && lens.latchPostImpactKE > 0);
  assert("impact lens calculates coupled-drive equivalent when both masses exist", lens.coupledAverageEquivalent !== undefined && lens.coupledAverageEquivalent > 0);
  const equalMassScenario: V2Scenario = { ...scenario, hammerMassLbm: 0.05 };
  const heavyHammerScenario: V2Scenario = { ...scenario, hammerMassLbm: 0.15 };
  const equalMassLens = applyScenarioImpactLens(candidate, equalMassScenario);
  const heavyHammerLens = applyScenarioImpactLens(candidate, heavyHammerScenario);
  assert(
    "heavier hammer retains more coupled-drive energy at fixed incoming spring work",
    (heavyHammerLens.coupledDriveWork ?? 0) > (equalMassLens.coupledDriveWork ?? 0),
  );
  assert(
    "latch-only KE can fall above the equal-mass transfer point",
    (heavyHammerLens.latchPostImpactKE ?? Infinity) < (equalMassLens.latchPostImpactKE ?? 0),
  );
  check("tungsten mass estimate uses density × volume", estimateBodyMassLbm("tungstenHeavyAlloy", 0.38473079) ?? undefined, 0.650 * 0.38473079, 0.001);
  const restored = parseStoredV2Scenario(JSON.stringify(scenario));
  assert("shared scenario storage round-trips material, masses and efficiency", restored?.hammerMassLbm === 0.25 && restored.latchMassLbm === 0.05 && restored.impactEfficiency === 1);
}

// ───────────────────────────────────────────────────────────────────────
// V2 (h) — Candidate-table CSV export content and UI trigger.
// ──────────────────────────────────────────────────────────────────────
console.log("\n── V2 (h) Candidate CSV export ─────────────────────");
{
  const sweep = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const candidates = sweep.candidates.filter((candidate) => candidate.pareto).slice(0, 2);
  const csv = generateCandidateCsv(candidates, candidates[0] ? [candidates[0].key] : []);
  const lines = csv.trim().split("\r\n");

  assert("candidate CSV includes explicit-unit headers", lines[0].includes("wire_diameter_in") && lines[0].includes("spring_rate_lbf_per_in"));
  assert("candidate CSV includes solid-height fields", lines[0].includes("nominal_solid_height_in") && lines[0].includes("maximum_solid_height_in"));
  assert("candidate CSV includes deflection constraint fields", lines[0].includes("required_clearance_above_maximum_solid_in") && lines[0].includes("deflection_utilization_pct"));
  assert("candidate CSV includes selected stress-basis fields", lines[0].includes("stress_basis_psi") && lines[0].includes("stress_pct_selected_basis"));
  assert("candidate CSV includes every supplied row", lines.length === candidates.length + 1);
  assert("candidate CSV preserves table row order", candidates.length === 0 || lines[1].startsWith(candidates[0].key));
  assert("candidate CSV records shortlist state", candidates.length === 0 || lines[1].includes(",true,"));
  assert("candidate CSV filename identifies view and date", candidateCsvFilename("pareto", new Date("2026-08-19T12:00:00.000Z")) === "spring-candidates_pareto_2026-08-19.csv");

  let exported = false;
  const button = CandidateCsvButton({ onClick: () => { exported = true; } });
  const buttonProps = button.props as { onClick: () => void; "data-testid": string };
  buttonProps.onClick();
  assert("Export CSV UI trigger invokes its handler", exported);
  assert("Export CSV UI trigger is discoverable", buttonProps["data-testid"] === "export-candidate-csv-button");
}

// ───────────────────────────────────────────────────────────────────────
// V2 (i) — Tolerance-aware primary / secondary / tertiary candidate sort.
// ───────────────────────────────────────────────────────────────────────
console.log("\n── V2 (i) Candidate priority sorting ───────────────");
{
  const base = evaluateV2Candidate(DEFAULT_V2_SCENARIO, 0.137, 3.6);
  const a: V2Candidate = { ...base, key: "a", Whammer: 100, FeqAvgIdeal: 10, stressPctBasis: 0.50 };
  const b: V2Candidate = { ...base, key: "b", Whammer: 99.5, FeqAvgIdeal: 20, stressPctBasis: 0.45 };
  const c: V2Candidate = { ...base, key: "c", Whammer: 98.5, FeqAvgIdeal: 100, stressPctBasis: 0.40 };

  const secondary = sortV2CandidatesByPriorities([a, b, c], [
    { key: "Whammer", direction: "desc" },
    { key: "FeqAvgIdeal", direction: "desc" },
  ]);
  assert("priority sort uses secondary inside the primary 1% band", secondary.map((candidate) => candidate.key).join("") === "bac");

  const tertiary = sortV2CandidatesByPriorities(
    [
      { ...a, FeqAvgIdeal: 20 },
      b,
      c,
    ],
    [
      { key: "Whammer", direction: "desc" },
      { key: "FeqAvgIdeal", direction: "desc" },
      { key: "stressPctBasis", direction: "asc" },
    ],
  );
  assert("priority sort uses tertiary direction inside tied primary/secondary bands", tertiary.map((candidate) => candidate.key).join("") === "bac");
  assert("priority sort does not mutate its input", [a, b, c].map((candidate) => candidate.key).join("") === "abc");
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s).`);
  process.exit(1);
}
console.log("\nAll validations passed.");
