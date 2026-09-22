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
import {
  DEFAULT_DEFLECTION_CONSTRAINT,
  requiredSolidClearance,
  utilizationFromClearance,
} from "./deflectionConstraint";
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
import { mechanismLatchBottoms, mechanismLatchBottoms4 } from "./mechanismLayout";
import {
  calculateManufacturingToleranceEnvelope,
  forceAtHeight,
  workBetweenHeights,
} from "../v2/toleranceEnvelope";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScenarioAccordion, V2ScenarioPanel } from "../../components/v2/V2ScenarioPanel";
import {
  DEFAULT_EVALUATOR_INPUTS,
  parseStoredEvaluatorInputs,
} from "../evaluator/defaults";
import {
  buildEvaluatorSummary,
  evaluateSpringConstraints,
} from "../evaluator/evaluateSpring";
import { SpringEvaluator } from "../../components/evaluator/SpringEvaluator";
import {
  DEFAULT_PACKAGE_DISCOVERY_SETTINGS,
  discoverPackageFrontier,
} from "../v2/packageDiscovery";
import {
  generatePackageDiscoveryCsv,
  packageDiscoveryCsvFilename,
} from "../v2/packageDiscoveryCsv";

let failures = 0;

/** A deliberately relaxed radial fixture for tests that require a feasible V2 selection. */
const FEASIBLE_V2_TEST_SCENARIO: V2Scenario = {
  ...DEFAULT_V2_SCENARIO,
  minimumSpringInnerDiameter: 0.78,
};

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
assert("workspace route: /evaluate → Evaluator", workspaceFromPathname("/evaluate") === "evaluator");
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

console.log("\n── Direct constraint-to-spring evaluator ────────────────");
{
  const result = evaluateSpringConstraints(DEFAULT_EVALUATOR_INPUTS);
  const candidate = result.candidate;
  assert("default evaluator produces a spring", candidate !== null);
  assert("default evaluator has no blocking errors", result.errors.length === 0);
  check("evaluator nominal rate", candidate?.k, 200, 0.001);
  check("evaluator free length", candidate?.Lf, 1.6, 0.001);
  check("evaluator armed length", candidate?.Lc, 0.9, 0.001);
  check("evaluator hammer run-up", candidate?.s, 0.4, 0.001);
  check("evaluator contact force", candidate?.F2, 60, 0.001);
  check("evaluator critical force", candidate?.F3, 46, 0.001);
  check("evaluator full-travel force", candidate?.F4, 20, 0.001);
  check("evaluator centered OD", candidate?.OD, 1.0992, 0.001);
  check("evaluator spring ID", candidate?.ID, 0.8232, 0.001);
  check("evaluator balanced inner clearance", result.innerRadialClearance, 0.0016, 0.001);
  check("evaluator balanced outer clearance", result.outerRadialClearance, 0.0016, 0.001);
  const outerBiased = evaluateSpringConstraints({
    ...DEFAULT_EVALUATOR_INPUTS,
    radialOdBias: 0.75,
  });
  assert("evaluator OD placement bias is editable", (outerBiased.candidate?.OD ?? 0) > (candidate?.OD ?? Infinity));
  check("evaluator OD bias preserves the force-derived rate", outerBiased.candidate?.k, candidate?.k ?? 0, 0.001);
  assert("evaluator OD bias changes required coil geometry", Math.abs((outerBiased.candidate?.Na ?? 0) - (candidate?.Na ?? 0)) > 1e-6);
  assert(
    "evaluator total coils include editable inactive ends",
    candidate !== null &&
      Math.abs(candidate.Nt - candidate.Na - DEFAULT_EVALUATOR_INPUTS.inactiveEndCoils) < 1e-9,
  );
  assert(
    "evaluator advisory tolerance corner is computed",
    result.forceRanges !== null && result.forceRanges.end.min < result.forceRanges.end.nominal,
  );
  assert(
    "evaluator summary distinguishes preset and operating height",
    buildEvaluatorSummary(DEFAULT_EVALUATOR_INPUTS, result).includes(
      "manufacturing process, not armed length",
    ),
  );

  const stored = parseStoredEvaluatorInputs(JSON.stringify({
    ...DEFAULT_EVALUATOR_INPUTS,
    armedLength: 0.91,
  }));
  check("evaluator stored armed length restores", stored?.armedLength, 0.91, 0.001);
  check(
    "evaluator legacy storage receives preset-height default",
    parseStoredEvaluatorInputs(JSON.stringify({ armedLength: 0.91 }))?.presetHeight,
    DEFAULT_EVALUATOR_INPUTS.presetHeight,
    0.001,
  );

  const impossibleWire = evaluateSpringConstraints({
    ...DEFAULT_EVALUATOR_INPUTS,
    wireDiameter: 0.142,
  });
  assert("evaluator rejects wire that cannot fit the radial annulus", impossibleWire.candidate === null);

  const evaluatorMarkup = renderToStaticMarkup(createElement(SpringEvaluator));
  assert("Evaluator UI exposes the direct-solve objective", evaluatorMarkup.includes("Constraint-to-Spring Evaluator"));
  assert("Evaluator UI keeps manufacturing assumptions secondary", evaluatorMarkup.includes("Editable defaults"));
  assert("Evaluator UI exposes editable OD placement bias", evaluatorMarkup.includes("OD placement bias") && evaluatorMarkup.includes("larger mean coil diameter lowers rate"));
}

console.log("\n── Canonical candidate + frozen comparison state ───────────");
{
  const defaultSweep = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
  const defaultCandidate = defaultSweep.candidates.find(
    (candidate) => candidate.key === defaultSweep.defaultKey,
  );
  const engineerModel = defaultV2CandidateToV1Model(FEASIBLE_V2_TEST_SCENARIO);
  const constrainedEngineerModel = defaultV2CandidateToV1Model(DEFAULT_V2_SCENARIO);
  assert("Engineering initializes from the actual Optimize default", defaultCandidate !== undefined);
  check("canonical Engineer wire diameter", engineerModel.d?.value, defaultCandidate?.d ?? 0, 0.001);
  check("canonical Engineer total coils", engineerModel.Nt?.value, defaultCandidate?.Nt ?? 0, 0.001);
  assert("Engineering can initialize when the fully constrained default has no feasible recommendation", typeof constrainedEngineerModel.d?.value === "number" && Number.isFinite(constrainedEngineerModel.d.value));

  const scenarioA: V2Scenario = { ...FEASIBLE_V2_TEST_SCENARIO };
  const scenarioB: V2Scenario = { ...FEASIBLE_V2_TEST_SCENARIO, forceTarget: 120, axialBudget: 1.3 };
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
  check("Engineer receives critical travel", engineerScenarioB.y_latch?.value, scenarioB.latchTravel, 0.001);
  check("Engineer receives full coupled travel", engineerScenarioB.y_total?.value, scenarioB.totalLatchTravel, 0.001);
  check("Engineer receives the end-force floor", engineerScenarioB.F_end_min?.value, scenarioB.minimumEndForce, 0.001);
  check("Engineer receives opposing preload", engineerScenarioB.F_opposing?.value, scenarioB.opposingPreload, 0.001);
  const engineerScenarioBSolved = solveModel(engineerScenarioB);
  assert("Engineer mapping remains equation-consistent at the shortlisted budget", engineerScenarioBSolved.conflicts.length === 0);
  check("Engineer reproduces the nominal starting-force target", engineerScenarioBSolved.values.F1, scenarioB.forceTarget, 0.001);
  check("Engineer bridge reproduces L4", engineerScenarioBSolved.values.L4, candidateB.L4, 0.001);
  check("Engineer bridge reproduces F4", engineerScenarioBSolved.values.F4, candidateB.F4, 0.001);
  check("Engineer bridge reproduces net F4", engineerScenarioBSolved.values.F4_net, candidateB.netEndForce, 0.001);

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
  const latchBottoms4 = mechanismLatchBottoms4(2.3, 2.37, 2.5, 0.55);
  assert("four-state latch layout follows critical and final positions", JSON.stringify(latchBottoms4) === JSON.stringify([2.8499999999999996, 2.8499999999999996, 2.92, 3.05]));
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
  check("current F4", v.F4, 57.3557, 1);
  check("current net F4", v.F4_net, 56.7557, 1);
  check("current W_run", v.W_run, 27.43, 1);
  check("current critical-window work", v.W_critical, 6.2194, 1);
  check("current post-critical work", v.W_post, 9.0691, 1);
  check("current opposing-preload work", v.W_opposing, 0.078, 0.01);
  check("current net post-critical work", v.W_post_net, 8.9911, 1);
  check("current full coupled work", v.W_coupled, 15.2885, 1);
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
  const travel = c.find((x) => x.id === "travel_order");
  const critical = c.find((x) => x.id === "critical_release_force");
  const endFloor = c.find((x) => x.id === "end_force_floor");
  const preload = c.find((x) => x.id === "opposing_preload");
  assert("current: stress ratio is set/preset band (passes)", stress?.ok === true && stress?.severity === "warning");
  assert("current: starting-force cap passes (F1 <= 140)", cap?.ok === true);
  assert("current: axial budget boundary passes", budget?.ok === true);
  assert("current: critical and total travel ordering passes", travel?.ok === true);
  assert("current: critical release retains spring force", critical?.ok === true);
  assert("current: end-force floor passes", endFloor?.ok === true);
  assert("current: residual spring force overcomes opposing preload", preload?.ok === true);
  const armedRangePass = evaluateConstraints({ ...v, L_armed_min: (v.L_min ?? 0) - 0.01, L_armed_max: (v.L_min ?? 0) + 0.01 }).find((item) => item.id === "armed_height_range");
  const armedRangeFail = evaluateConstraints({ ...v, L_armed_min: (v.L_min ?? 0) + 0.01, L_armed_max: (v.L_min ?? 0) + 0.02 }).find((item) => item.id === "armed_height_range");
  assert("Engineering optional armed-height range passes at the modeled height", armedRangePass?.ok === true);
  assert("Engineering optional armed-height range flags an out-of-range height", armedRangeFail?.ok === false);
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
// Test group 4 — State consistency across the four mechanism states.
// States 1/2/3/4 share identical d / D / N_t but differ only in loaded length.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (4) State-to-state consistency ───────────────────────────");
{
  const v = solveModel(buildInitialState("forward", "literalSketch")).values;
  const d = v.d as number;
  const D = v.D as number;
  const Nt = v.Nt as number;
  const lengths = [v.L_min as number, v.L2 as number, v.L3 as number, v.L4 as number];
  const specs = lengths.map(
    (currentLength): SpringPathSpec => ({ wireDiameter: d, meanDiameter: D, totalCoils: Nt, currentLength }),
  );
  const results = specs.map((s) => buildSpringPath(s, 100, 300, 150));

  assert("states: all four render", results.length === 4 && results.every((x) => x !== null));
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
  check("reverse L4", v.L4, 1.35, 0.001);
  check("reverse F4", v.F4, 14, 0.001);
  check("reverse net F4", v.F4_net, 13.4, 0.001);
  check("reverse critical-window work", v.W_critical, 4.214, 0.001);
  check("reverse post-critical work", v.W_post, 4.186, 0.001);
  check("reverse opposing-preload work", v.W_opposing, 0.078, 0.001);
  check("reverse net post-critical work", v.W_post_net, 4.108, 0.001);
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
  const sc = FEASIBLE_V2_TEST_SCENARIO;
  const d = 0.14;
  const Na = 2.2;
  const c = evaluateV2Candidate(sc, d, Na);
  const OD = nominalSpringOuterDiameter(sc);
  const B = sc.axialBudget;
  const y = sc.latchTravel;
  const yTotal = sc.totalLatchTravel;
  const yPost = yTotal - y;

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
  check("V2 L4 = B + total coupled travel", c.L4, B + yTotal, 0.001);

  // Starting deflection + free length (F0 evaluated at the nominal target)
  check("V2 F0 = nominal force target", c.F0, sc.forceTarget, 0.001);
  check("V2 x0 = F0/k", c.x0, c.F0 / c.k, 0.001);
  check("V2 Lf = Lc + x0", c.Lf, c.Lc + c.x0, 0.001);

  // Forces
  check("V2 F2 = F0 − k·s", c.F2, c.F0 - c.k * c.s, 0.001);
  check("V2 F3 = F0 − k·(s+y)", c.F3, c.F0 - c.k * (c.s + y), 0.001);
  check("V2 F4 = F0 − k·(s+y_total)", c.F4, c.F0 - c.k * (c.s + yTotal), 0.001);
  check("V2 end-force margin", c.endForceMargin, c.F4 - sc.minimumEndForce, 0.001);
  check("V2 net end force", c.netEndForce, c.F4 - sc.opposingPreload, 0.001);

  // Work
  check("V2 W_hammer = F0·s − ½·k·s²", c.Whammer, c.F0 * c.s - 0.5 * c.k * c.s * c.s, 0.001);
  check("V2 W_latch = F2·y − ½·k·y²", c.Wlatch, c.F2 * y - 0.5 * c.k * y * y, 0.001);
  check("V2 W_coupled = F2·y_total − ½·k·y_total²", c.Wcoupled, c.F2 * yTotal - 0.5 * c.k * yTotal * yTotal, 0.001);
  check("V2 W_post = W_coupled − W_critical", c.WpostCritical, c.Wcoupled - c.Wlatch, 0.001);
  check("V2 opposing-preload work", c.Wopposing, sc.opposingPreload * yPost, 0.001);
  check("V2 net post-critical work", c.WpostCriticalNet, c.WpostCritical - c.Wopposing, 0.001);
  check("V2 armed-through-end work", c.WthroughEnd, c.Whammer + c.Wcoupled, 0.001);
  check("V2 W_release_ideal = W_hammer + W_latch", c.WreleaseIdeal, c.Whammer + c.Wlatch, 0.001);
  assert("V2 representative four-state candidate is feasible", c.feasibility.feasible);

  const annulusCandidate = evaluateV2Candidate(DEFAULT_V2_SCENARIO, 0.134, 3.0);
  check("V2 screenshot candidate has 0.814 in nominal ID", annulusCandidate.ID, 0.8143622047, 0.001);
  assert(
    "V2 rejects screenshot candidate below the 0.820 in annulus boundary",
    !annulusCandidate.feasibility.fitsInnerDiameter &&
      annulusCandidate.feasibility.reasons.includes("inside-diameter-too-small"),
  );
  const relaxedAnnulusCandidate = evaluateV2Candidate(
    { ...DEFAULT_V2_SCENARIO, minimumSpringInnerDiameter: 0.81 },
    0.134,
    3.0,
  );
  assert(
    "V2 minimum-ID constraint is editable and immediately re-evaluated",
    relaxedAnnulusCandidate.feasibility.fitsInnerDiameter &&
      !relaxedAnnulusCandidate.feasibility.reasons.includes("inside-diameter-too-small"),
  );

  // Force-equivalent proxies (ideal, NOT contact force)
  check("V2 F_eq_avg_ideal = W_release/y", c.FeqAvgIdeal, c.WreleaseIdeal / y, 0.001);
  check("V2 F_eq_tri_peak = 2·F_eq_avg", c.FeqTriPeakIdeal, 2 * c.FeqAvgIdeal, 0.001);

  // Editable engineering assumptions must cascade into the evaluator.
  const lowerG = evaluateV2Candidate({ ...sc, shearModulusPsi: sc.shearModulusPsi * 0.9 }, d, Na);
  check("V2 numeric shear modulus drives spring rate", lowerG.k, c.k * 0.9, 0.001);
  const customBasis = evaluateV2Candidate({ ...sc, stressBasisPsi: 280_000 }, d, Na);
  check("V2 numeric TS basis drives stress classification ratio", customBasis.stressPctBasis, customBasis.tau / 280_000, 0.001);

  const zeroCritical = evaluateV2Candidate({ ...sc, latchTravel: 0 }, d, Na);
  assert("V2 rejects zero critical travel", !zeroCritical.feasibility.travelOrderValid && zeroCritical.feasibility.reasons.includes("invalid-travel"));
  const reversedTravel = evaluateV2Candidate({ ...sc, totalLatchTravel: sc.latchTravel - 0.01 }, d, Na);
  assert("V2 rejects total travel shorter than critical travel", !reversedTravel.feasibility.travelOrderValid && reversedTravel.feasibility.reasons.includes("invalid-travel"));
  const highEndFloor = evaluateV2Candidate({ ...sc, minimumEndForce: c.F4 + 1 }, d, Na);
  assert("V2 rejects a candidate below the nominal end-force floor", !highEndFloor.feasibility.endForceSufficient && highEndFloor.feasibility.reasons.includes("insufficient-end-force"));
  const highPreload = evaluateV2Candidate({ ...sc, opposingPreload: c.F4 + 1 }, d, Na);
  assert("V2 rejects negative final drive against opposing preload", !highPreload.feasibility.overcomesOpposingPreload && highPreload.feasibility.reasons.includes("insufficient-end-force"));
  const noPostSegment = evaluateV2Candidate({ ...sc, totalLatchTravel: sc.latchTravel, opposingPreload: 1_000 }, d, Na);
  assert("V2 does not impose a preload-drive check when no post-critical segment exists", noPostSegment.feasibility.overcomesOpposingPreload);
  const armedPass = evaluateV2Candidate({ ...sc, armedHeightConstraintEnabled: true, armedHeightMin: c.Lc, armedHeightMax: c.Lc }, d, Na);
  const armedFail = evaluateV2Candidate({ ...sc, armedHeightConstraintEnabled: true, armedHeightMin: c.Lc + 0.01, armedHeightMax: c.Lc + 0.02 }, d, Na);
  assert("V2 optional armed-height range includes its exact boundary", armedPass.feasibility.armedHeightInRange);
  assert("V2 optional armed-height range excludes out-of-range candidates", !armedFail.feasibility.armedHeightInRange && armedFail.feasibility.reasons.includes("armed-height-out-of-range"));
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
  const sweep = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
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
    { ...mk("H", 100, 2), WreleaseIdeal: 101, F4: 10, Wcoupled: 5 },
    { ...mk("T", 99, 3), WreleaseIdeal: 102, F4: 20, Wcoupled: 6 },
    { ...mk("L", 98, 4), WreleaseIdeal: 101.5, F4: 30, Wcoupled: 7 },
    { ...mk("X", 110, 0.1), WreleaseIdeal: 90, F4: 40, Wcoupled: 8 },
  ];
  const recommendations = recommendTopCandidates(nearMax);
  assert("V2 recommendations use near-max hammer / total / end-force leaders", recommendations.keys.join("") === "HTL" && recommendations.roles.L === "end-force");
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

  const a = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
  const b = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
  assert("V2 sweep count = wire × coils", a.totalCount === a.wireValues.length * a.coilValues.length);
  assert("V2 sweep is deterministic (identical results + order)", JSON.stringify(a) === JSON.stringify(b));
  assert("V2 sweep finds feasible candidates", a.feasibleCount > 0);
  assert("V2 sweep suggests a default candidate", a.defaultKey !== null);
  assert("V2 sweep exposes three green recommendations", a.recommendedKeys.length === Math.min(3, a.feasible.length));
  assert("V2 recommendations are feasible", a.recommendedKeys.every((key) => a.feasible.some((candidate) => candidate.key === key)));
  assert(
    "V2 feasible set enforces ordered travel and the final force requirements",
    a.feasible.every((candidate) =>
      FEASIBLE_V2_TEST_SCENARIO.latchTravel > 0 &&
      FEASIBLE_V2_TEST_SCENARIO.totalLatchTravel >= FEASIBLE_V2_TEST_SCENARIO.latchTravel &&
      candidate.L4 === FEASIBLE_V2_TEST_SCENARIO.axialBudget + FEASIBLE_V2_TEST_SCENARIO.totalLatchTravel &&
      candidate.F4 + 1e-9 >= FEASIBLE_V2_TEST_SCENARIO.minimumEndForce &&
      candidate.F4 > FEASIBLE_V2_TEST_SCENARIO.opposingPreload &&
      candidate.ID + 1e-9 >= FEASIBLE_V2_TEST_SCENARIO.minimumSpringInnerDiameter
    ),
  );

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
    ...FEASIBLE_V2_TEST_SCENARIO,
    housingInnerDiameter: 1.3 + FEASIBLE_V2_TEST_SCENARIO.outerDiameterTolerance,
  };
  const base = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
  const alt = sweepV2DesignSpace(wide);
  assert("V2 responds to its own scenario (OD change alters feasible count)", base.feasibleCount !== alt.feasibleCount);

  // Lower permitted utilization reserves more travel and eats axial budget.
  const tight: V2Scenario = { ...FEASIBLE_V2_TEST_SCENARIO, maxDeflectionUtilization: 0.5 };
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

  const scenario = FEASIBLE_V2_TEST_SCENARIO;
  const candidate = evaluateV2Candidate(scenario, 0.14, 2.2);
  assert("data-sheet fixture is a feasible four-state candidate", candidate.feasibility.feasible);
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
  assert("exports distinguish critical and full coupled travel", mechanism.includes("Critical release point") && mechanism.includes("Full coupled-travel end") && vendor.includes("Total coupled travel"));
  assert("exports include final force floor, gross force, and net force", mechanism.includes(`${scenario.minimumEndForce.toFixed(2)} lbf`) && mechanism.includes(candidate.F4.toFixed(2)) && mechanism.includes(candidate.netEndForce.toFixed(2)));
  assert("exports include gross, opposing, and net post-critical work", mechanism.includes(candidate.WpostCritical.toFixed(2)) && mechanism.includes(candidate.Wopposing.toFixed(2)) && mechanism.includes(candidate.WpostCriticalNet.toFixed(2)));
  assert("exports include the 28 mm housing OD ceiling", mechanism.includes("Housing ID / absolute finished-spring OD") && mechanism.includes("28.00 mm") && vendor.includes("Hard mechanism envelope"));
  assert("exports include the minimum spring-ID boundary", mechanism.includes("minimum nominal spring ID") && vendor.includes("Annulus inner boundary / minimum nominal spring ID"));
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
  assert("mechanism summary stays concise", mechanism.split("\n").filter(Boolean).length < 75);
  assert("vendor RFQ stays concise", vendor.split("\n").filter(Boolean).length < 75);
  assert("mechanism export contains no Markdown headings", !mechanism.includes("# "));
  assert("vendor export contains plain-text bullets", vendor.includes("• "));
  assert("formatted copy bolds headings", shareSheetToHtml(mechanism).includes("<strong>Mechanism Requirements</strong>"));
  assert("formatted copy uses semantic bullet lists", shareSheetToHtml(vendor).includes("<ul>") && shareSheetToHtml(vendor).includes("<li>"));
  assert("formatted copy renders all four operating states as a table", shareSheetToHtml(vendor).includes("Calculated spring force</th>") && shareSheetToHtml(vendor).includes("Hammer contact</td>") && shareSheetToHtml(vendor).includes("Critical release point</td>") && shareSheetToHtml(vendor).includes("Full coupled-travel end</td>"));
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

console.log("\n── V2 (g1) Manufacturing tolerance envelope ─────────");
{
  const base = evaluateV2Candidate(DEFAULT_V2_SCENARIO, 0.14, 2.2);
  const k = 211.32;
  const Lf = 1.461;
  const Lc = 0.8;
  const L2 = 1.15;
  const L3 = 1.22;
  const L4 = 1.35;
  const F0 = forceAtHeight(k, Lf, Lc);
  const F2 = forceAtHeight(k, Lf, L2);
  const F3 = forceAtHeight(k, Lf, L3);
  const F4 = forceAtHeight(k, Lf, L4);
  const Whammer = workBetweenHeights(k, Lf, Lc, L2);
  const Wlatch = workBetweenHeights(k, Lf, L2, L3);
  const WpostCritical = workBetweenHeights(k, Lf, L3, L4);
  const Wopposing = DEFAULT_V2_SCENARIO.opposingPreload * (DEFAULT_V2_SCENARIO.totalLatchTravel - DEFAULT_V2_SCENARIO.latchTravel);
  const Wcoupled = Wlatch + WpostCritical;
  const fixture: V2Candidate = {
    ...base,
    k,
    Lf,
    Lc,
    L2,
    L3,
    L4,
    s: L2 - Lc,
    F0,
    F2,
    F3,
    F4,
    endForceMargin: F4 - DEFAULT_V2_SCENARIO.minimumEndForce,
    netEndForce: F4 - DEFAULT_V2_SCENARIO.opposingPreload,
    Whammer,
    Wlatch,
    WpostCritical,
    Wopposing,
    WpostCriticalNet: WpostCritical - Wopposing,
    Wcoupled,
    WthroughEnd: Whammer + Wcoupled,
    WreleaseIdeal: Whammer + Wlatch,
  };
  const enabled: V2Scenario = {
    ...FEASIBLE_V2_TEST_SCENARIO,
    forceTarget: 139.68252,
    forceCap: 140,
    manufacturingToleranceEnabled: true,
    springRateTolerance: 0.10,
    freeLengthTolerance: 0.030,
  };
  const envelope = calculateManufacturingToleranceEnvelope(fixture, enabled);
  assert("enabled tolerance scenario produces an envelope", envelope !== null);
  check("tolerance nominal armed force", envelope?.forces.armed.nominal, 139.68252, 0.0001);
  check("tolerance minimum armed force", envelope?.forces.armed.min, 120.008628, 0.0001);
  check("tolerance maximum armed force", envelope?.forces.armed.max, 160.624332, 0.0001);
  check("tolerance minimum contact force", envelope?.forces.contact.min, 53.442828, 0.0001);
  check("tolerance maximum contact force", envelope?.forces.contact.max, 79.266132, 0.0001);
  check("tolerance minimum released force", envelope?.forces.released.min, 40.129668, 0.0001);
  check("tolerance maximum released force", envelope?.forces.released.max, 62.994492, 0.0001);
  check("tolerance minimum end force", envelope?.forces.end.min, 15.405228, 0.0001);
  check("tolerance nominal end force", envelope?.forces.end.nominal, 23.45652, 0.0001);
  check("tolerance maximum end force", envelope?.forces.end.max, 32.775732, 0.0001);
  check("tolerance minimum hammer work", envelope?.work.hammer.min, 30.3540048, 0.0001);
  check("tolerance maximum hammer work", envelope?.work.hammer.max, 41.9808312, 0.0001);
  check("tolerance minimum total work", envelope?.work.total.min, 33.62904216, 0.0001);
  check("tolerance maximum total work", envelope?.work.total.max, 46.95995304, 0.0001);
  check("tolerance minimum post-critical work", envelope?.work.postCritical.min, 3.60976824, 0.0001);
  check("tolerance maximum post-critical work", envelope?.work.postCritical.max, 6.22506456, 0.0001);
  check("tolerance nominal full coupled work", envelope?.work.coupled.nominal, 8.917704, 0.0001);
  check("tolerance nominal armed-through-end work", envelope?.work.throughEnd.nominal, 44.863236, 0.0001);
  assert("nominal force passes while stacked maximum exceeds the hard cap", envelope?.nominalForceCapPass === true && envelope.worstCaseForceCapPass === false);
  assert("independent low-corner estimate satisfies the end-force floor", envelope?.worstCaseEndForcePass === true && envelope.worstCaseEndForceShortfall === 0);
  assert(
    "every coherent corner total equals its hammer and latch work",
    envelope?.corners.every((corner) => Math.abs(corner.totalWork - corner.hammerWork - corner.latchWork) < 1e-9) === true,
  );
  assert(
    "every tolerance corner preserves critical + post = coupled and run-up + coupled = through-end",
    envelope?.corners.every((corner) => Math.abs(corner.coupledWork - corner.criticalWork - corner.postCriticalWork) < 1e-9 && Math.abs(corner.throughEndWork - corner.hammerWork - corner.coupledWork) < 1e-9) === true,
  );

  check(
    "partially slack travel integrates only until free length",
    workBetweenHeights(100, 1.18, 1.15, 1.22),
    0.045,
    0.0001,
  );

  const zeroEnvelope = calculateManufacturingToleranceEnvelope(fixture, {
    ...enabled,
    springRateTolerance: 0,
    freeLengthTolerance: 0,
  });
  check("zero-tolerance minimum collapses to nominal", zeroEnvelope?.forces.contact.min, F2, 0.0001);
  check("zero-tolerance maximum collapses to nominal", zeroEnvelope?.forces.contact.max, F2, 0.0001);
  assert("disabled tolerance leaves no advisory envelope", calculateManufacturingToleranceEnvelope(fixture, { ...enabled, manufacturingToleranceEnabled: false }) === null);

  const slackEnvelope = calculateManufacturingToleranceEnvelope(fixture, {
    ...enabled,
    freeLengthTolerance: 1,
  });
  check("slack tolerance corner clamps released force to zero", slackEnvelope?.forces.released.min, 0, 0.0001);
  assert("slack tolerance corners never produce negative work", slackEnvelope?.corners.every((corner) => corner.hammerWork >= 0 && corner.latchWork >= 0 && corner.totalWork >= 0) === true);

  const disabledSweep = sweepV2DesignSpace({ ...enabled, manufacturingToleranceEnabled: false });
  const enabledSweep = sweepV2DesignSpace(enabled);
  assert("advisory tolerances do not change Pareto membership", JSON.stringify(disabledSweep.paretoKeys) === JSON.stringify(enabledSweep.paretoKeys));
  assert("advisory tolerances do not change recommended candidates", JSON.stringify(disabledSweep.recommendedKeys) === JSON.stringify(enabledSweep.recommendedKeys));
  assert("advisory tolerances do not change nominal default candidate", disabledSweep.defaultKey === enabledSweep.defaultKey);

  const material = getV2Material(enabled.materialId);
  const exportCandidate = (enabledSweep.candidates.find((candidate) => candidate.key === enabledSweep.defaultKey) ?? enabledSweep.feasible[0])!;
  assert("tolerance export test has a coherent evaluated candidate", exportCandidate !== undefined);
  const mechanism = generateMechanismSummary({ candidate: exportCandidate, scenario: enabled, material, generatedAt: "2026-09-02T00:00:00.000Z" });
  const vendor = generateVendorRfq({ candidate: exportCandidate, scenario: enabled, material, generatedAt: "2026-09-02T00:00:00.000Z" });
  assert("data sheets distinguish nominal target from absolute maximum", mechanism.includes("Nominal armed spring force target") && mechanism.includes("Absolute maximum armed spring force") && vendor.includes("Nominal armed spring force") && vendor.includes("Absolute maximum armed spring force"));
  assert("enabled mechanism sheet includes min/nominal/max tolerance estimates", mechanism.includes("Manufacturing Tolerance Estimate") && mechanism.includes("Minimum estimate*") && mechanism.includes("Maximum estimate*"));
  assert("enabled vendor RFQ asks supplier to replace advisory stack with guaranteed loads", vendor.includes("supplier-guaranteed loads") && vendor.includes("independent corner"));
  assert("tolerance exports disclaim statistical certainty and omitted contributors", mechanism.includes("not a statistical confidence interval") && mechanism.includes("temperature") && mechanism.includes("correlated production data") && mechanism.includes("remain nominal"));
  const disabledMechanism = generateMechanismSummary({ candidate: exportCandidate, scenario: { ...enabled, manufacturingToleranceEnabled: false }, material });
  assert("disabled data sheet remains nominal-only", !disabledMechanism.includes("Manufacturing Tolerance Estimate"));

  const oldStored = parseStoredV2Scenario(JSON.stringify({ forceCap: 125 }));
  assert("old stored scenarios receive disabled backward-compatible tolerance defaults", oldStored?.manufacturingToleranceEnabled === false && oldStored.springRateTolerance === DEFAULT_V2_SCENARIO.springRateTolerance && oldStored.freeLengthTolerance === DEFAULT_V2_SCENARIO.freeLengthTolerance);
  assert("legacy force-cap scenarios migrate their old value to the nominal target with independent headroom", oldStored?.forceTarget === 125 && oldStored.forceCap === 140);
  assert("old stored scenarios receive four-state and radial-envelope defaults", oldStored?.latchTravel === 0.07 && oldStored.totalLatchTravel === 0.20 && oldStored.minimumEndForce === 10 && oldStored.opposingPreload === 0.6 && oldStored.minimumSpringInnerDiameter === 0.82 && oldStored.armedHeightConstraintEnabled === false);
  const restored = parseStoredV2Scenario(JSON.stringify(enabled));
  assert("tolerance scenario round-trips through shared storage", restored?.manufacturingToleranceEnabled === true && restored.forceTarget === enabled.forceTarget && restored.forceCap === enabled.forceCap && restored.springRateTolerance === 0.10 && restored.freeLengthTolerance === 0.030);
  assert("shortlist identity includes tolerance assumptions", v2ScenarioSignature(enabled) !== v2ScenarioSignature({ ...enabled, springRateTolerance: 0.05 }));
  assert("shortlist identity includes the nominal force target", v2ScenarioSignature(enabled) !== v2ScenarioSignature({ ...enabled, forceTarget: enabled.forceTarget - 5 }));
  for (const patch of [
    { latchTravel: 0.08 },
    { totalLatchTravel: 0.21 },
    { minimumEndForce: 11 },
    { opposingPreload: 0.7 },
    { minimumSpringInnerDiameter: 0.81 },
    { armedHeightConstraintEnabled: true },
    { armedHeightMin: 0.71 },
    { armedHeightMax: 0.99 },
  ]) {
    assert(`shortlist identity includes ${Object.keys(patch)[0]}`, v2ScenarioSignature(enabled) !== v2ScenarioSignature({ ...enabled, ...patch }));
  }

  const accordionHtml = renderToStaticMarkup(createElement(
    ScenarioAccordion,
    { title: "Actual Mechanism Boundaries", tag: "Constraint", tagKind: "mechanism", testId: "scenario-test", info: "Details" },
    createElement("div", null, "Inputs"),
  ));
  assert("scenario subset starts collapsed with accessible disclosure state", accordionHtml.includes('aria-expanded="false"') && accordionHtml.includes(" hidden=\"\""));
  assert("scenario info trigger is independent and accessible", accordionHtml.includes('aria-controls=') && accordionHtml.includes('aria-expanded="false"') && accordionHtml.includes("Information about Actual Mechanism Boundaries"));

  const scenarioPanelHtml = renderToStaticMarkup(createElement(V2ScenarioPanel, {
    scenario: enabled,
    material,
    onChange: () => undefined,
    onReset: () => undefined,
    deflectionConstraint: DEFAULT_DEFLECTION_CONSTRAINT,
    onDeflectionConstraintChange: () => undefined,
  }));
  assert("scenario guidance header is renamed in the full panel", scenarioPanelHtml.includes("Derived Model Guidance") && !scenarioPanelHtml.includes("Lee-Derived Model Guidance"));
  assert("scenario panel exposes distinct nominal and absolute starting-force controls", scenarioPanelHtml.includes("Nominal starting force") && scenarioPanelHtml.includes("Absolute maximum starting force"));
  assert("scenario panel exposes critical, total, end-force, preload, radial-envelope, and optional armed-height controls", scenarioPanelHtml.includes("Critical release travel") && scenarioPanelHtml.includes("Total hammer / latch travel") && scenarioPanelHtml.includes("Minimum spring force at end") && scenarioPanelHtml.includes("Opposing latch preload") && scenarioPanelHtml.includes("Annulus inner boundary / minimum spring ID") && scenarioPanelHtml.includes("Constrain armed spring height"));
}

console.log("\n── V2 (g2) Shared impact assumptions and persistence ─────────");
{
  const sweep = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
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
  check("impact lens subtracts modeled opposing-preload work", lens.coupledDriveWork, (lens.combinedPostImpactKE ?? 0) * 12 + candidate.Wcoupled - candidate.Wopposing, 0.001);
  check("impact equivalent uses full post-contact coupled travel", lens.coupledAverageEquivalent, (lens.coupledDriveWork ?? 0) / (candidate.L4 - candidate.L2), 0.001);
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
  const sweep = sweepV2DesignSpace(FEASIBLE_V2_TEST_SCENARIO);
  const candidates = sweep.candidates.filter((candidate) => candidate.pareto).slice(0, 2);
  const csv = generateCandidateCsv(candidates, candidates[0] ? [candidates[0].key] : []);
  const lines = csv.trim().split("\r\n");

  assert("candidate CSV includes explicit-unit headers", lines[0].includes("wire_diameter_in") && lines[0].includes("spring_rate_lbf_per_in"));
  assert("candidate CSV includes the minimum-ID requirement and pass state", lines[0].includes("minimum_inside_diameter_requirement_in") && lines[0].includes("inside_diameter_requirement_pass"));
  assert("candidate CSV includes solid-height fields", lines[0].includes("nominal_solid_height_in") && lines[0].includes("maximum_solid_height_in"));
  assert("candidate CSV includes deflection constraint fields", lines[0].includes("required_clearance_above_maximum_solid_in") && lines[0].includes("deflection_utilization_pct"));
  assert("candidate CSV includes selected stress-basis fields", lines[0].includes("stress_basis_psi") && lines[0].includes("stress_pct_selected_basis"));
  assert("candidate CSV distinguishes critical and full-travel states", lines[0].includes("critical_release_length_in") && lines[0].includes("full_travel_end_length_in") && lines[0].includes("critical_release_force_lbf") && lines[0].includes("full_travel_end_force_lbf"));
  assert("candidate CSV includes end-force and opposing-preload context", lines[0].includes("minimum_end_force_requirement_lbf") && lines[0].includes("end_force_margin_lbf") && lines[0].includes("opposing_preload_lbf") && lines[0].includes("net_end_force_lbf"));
  assert("candidate CSV includes gross and net post-critical work", lines[0].includes("post_critical_work_in_lbf") && lines[0].includes("opposing_preload_work_in_lbf") && lines[0].includes("net_post_critical_work_in_lbf") && lines[0].includes("full_coupled_travel_work_in_lbf"));
  assert("candidate CSV reserves explicit manufacturing-tolerance fields", lines[0].includes("manufacturing_tolerance_enabled") && lines[0].includes("independent_corner_estimate_armed_force_min_lbf") && lines[0].includes("independent_corner_estimate_ideal_release_work_max_in_lbf"));
  assert("candidate CSV identifies tolerance method, nominal target, and cap context", lines[0].includes("manufacturing_tolerance_method") && lines[0].includes("nominal_starting_force_target_lbf") && lines[0].includes("mechanism_force_cap_lbf") && lines[0].includes("independent_corner_estimate_armed_force_cap_excess_lbf"));
  assert("candidate CSV includes every supplied row", lines.length === candidates.length + 1);
  assert("candidate CSV preserves table row order", candidates.length === 0 || lines[1].startsWith(candidates[0].key));
  assert("candidate CSV records shortlist state", candidates.length === 0 || lines[1].includes(",true,"));
  assert("candidate CSV filename identifies view and date", candidateCsvFilename("pareto", new Date("2026-08-19T12:00:00.000Z")) === "spring-candidates_pareto_2026-08-19.csv");

  const toleranceCsv = generateCandidateCsv(candidates, [], {
    ...DEFAULT_V2_SCENARIO,
    manufacturingToleranceEnabled: true,
    springRateTolerance: 0.10,
    freeLengthTolerance: 0.030,
  });
  const toleranceLines = toleranceCsv.trim().split("\r\n");
  const toleranceHeaders = toleranceLines[0].split(",");
  const toleranceValues = toleranceLines[1]?.split(",") ?? [];
  const csvValue = (header: string) => toleranceValues[toleranceHeaders.indexOf(header)];
  assert("enabled candidate CSV writes structurally aligned rows", candidates.length === 0 || toleranceValues.length === toleranceHeaders.length);
  assert("enabled candidate CSV writes tolerance assumptions and mechanism provenance", candidates.length === 0 || (csvValue("manufacturing_tolerance_enabled") === "true" && csvValue("manufacturing_tolerance_method") === "independent_rate_free_length_corner_stack" && csvValue("nominal_starting_force_target_lbf") === "140" && csvValue("mechanism_force_cap_lbf") === "140" && csvValue("critical_release_travel_in") === "0.07" && csvValue("total_coupled_travel_in") === "0.2" && csvValue("spring_rate_tolerance_pct") === "10" && csvValue("free_length_tolerance_in") === "0.03"));
  assert("enabled candidate CSV writes end-force tolerance results", candidates.length === 0 || csvValue("independent_corner_estimate_end_force_min_lbf") !== "" && csvValue("independent_corner_estimate_end_force_max_lbf") !== "" && csvValue("independent_corner_estimate_worst_case_end_force_pass") !== "");

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
  const base = evaluateV2Candidate(DEFAULT_V2_SCENARIO, 0.14, 2.2);
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
  const byEndForce = sortV2CandidatesByPriorities(
    [{ ...a, F4: 12 }, { ...b, F4: 15 }, { ...c, F4: 10 }],
    [{ key: "F4", direction: "desc" }],
  );
  assert("priority sort supports full-travel end force", byEndForce.map((candidate) => candidate.key).join("") === "bac");
  assert("priority sort does not mutate its input", [a, b, c].map((candidate) => candidate.key).join("") === "abc");
}

// ───────────────────────────────────────────────────────────────────────
// V2 (j) — Spring-first package discovery and Pareto recommendations.
// ───────────────────────────────────────────────────────────────────────
console.log("\n── V2 (j) Package–punch discovery ───────────────");
{
  const discovery = discoverPackageFrontier(
    {
      ...DEFAULT_V2_SCENARIO,
      wireMin: 0.128,
      wireMax: 0.14,
      wireStep: 0.002,
      activeCoilsMin: 2.2,
      activeCoilsMax: 3.2,
      activeCoilsStep: 0.2,
    },
    {
      ...DEFAULT_PACKAGE_DISCOVERY_SETTINGS,
      packageMin: 0.9,
      packageMax: 1.3,
      packageStep: 0.05,
    },
  );
  assert("package discovery searches geometry and axial budget together", discovery.searchedCount > 0);
  assert("package discovery finds tolerance-robust candidates", discovery.acceptedCount > 0);
  assert("package discovery produces a non-dominated frontier", discovery.frontier.length > 1);
  assert(
    "package frontier is strictly increasing in work as package grows",
    discovery.frontier.every((point, index) => index === 0 || (
      point.axialBudget > discovery.frontier[index - 1].axialBudget &&
      point.candidate.Whammer > discovery.frontier[index - 1].candidate.Whammer
    )),
  );
  assert("package discovery identifies a balanced knee", Boolean(discovery.recommendations.knee));
  assert("package discovery identifies maximum punch", Boolean(discovery.recommendations.punch));
  assert(
    "maximum-punch recommendation is the frontier work maximum",
    discovery.recommendations.punch?.candidate.Whammer === Math.max(...discovery.frontier.map((point) => point.candidate.Whammer)),
  );
  assert(
    "discovery keeps critical and final travel tied to the selected package",
    discovery.frontier.every((point) =>
      Math.abs(point.candidate.L3 - (point.axialBudget + DEFAULT_PACKAGE_DISCOVERY_SETTINGS.criticalTravel)) < 1e-9 &&
      Math.abs(point.candidate.L4 - (point.axialBudget + DEFAULT_PACKAGE_DISCOVERY_SETTINGS.totalCoupledTravel)) < 1e-9
    ),
  );
  const csv = generatePackageDiscoveryCsv(discovery, {
    ...DEFAULT_PACKAGE_DISCOVERY_SETTINGS,
    packageMin: 0.9,
    packageMax: 1.3,
    packageStep: 0.05,
  });
  const csvLines = csv.trim().split(/\r?\n/);
  assert("package discovery CSV exports every frontier point", csvLines.length === discovery.frontier.length + 1);
  assert("package discovery CSV names package, force, work, and tolerance fields", (
    csvLines[0].includes("axial_budget_in") &&
    csvLines[0].includes("contact_force_lbf") &&
    csvLines[0].includes("hammer_run_up_work_in_lbf") &&
    csvLines[0].includes("worst_case_end_force_pass")
  ));
  assert(
    "package discovery CSV filename identifies the frontier and date",
    packageDiscoveryCsvFilename(new Date("2026-09-21T12:00:00.000Z")) === "spring-package-frontier_2026-09-21.csv",
  );
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s).`);
  process.exit(1);
}
console.log("\nAll validations passed.");
