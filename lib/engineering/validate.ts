/**
 * Lightweight validation of the equation system, solver, constraints and the
 * pure SVG spring-geometry renderer.
 *
 * Run with:  npm test        (→ tsx lib/engineering/validate.ts)
 *        or: npx tsx lib/engineering/validate.ts
 * Exits non-zero on failure.
 *
 * These tests intentionally encode the *literal Bokaie sketch* as the default
 * historical reference. The literal geometry is NOT internally consistent with
 * the separately written ~280 lbf/in / ~140 lbf whiteboard estimates — the
 * literal spring is over-stressed. That inconsistency is expected and is
 * asserted here rather than "fixed". The separate "Reconciled Candidate" preset
 * is the equation-consistent alternative.
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
import { computePareto } from "../v2/pareto";
import { DEFAULT_V2_SCENARIO, computeHistoricalReference } from "../v2/defaults";
import type { V2Candidate, V2Scenario } from "../v2/types";

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

  // Reverse direction: pin active coils, derive total coils (N_t = N_a + 2).
  const rev: ModelState = buildInitialState("forward", "literalSketch");
  rev.Na = { value: 1.5, status: "fixed" };
  rev.Nt = { value: 3.5, status: "derived" };
  const revSolved = solveModel(rev);
  check("reverse: N_a pinned → N_t = N_a + 2 (derived)", revSolved.values.Nt, 3.5, 0.5);
  assert("reverse: coil relation produces no conflict", revSolved.conflicts.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Test group 2 — Literal preset retains N_t ≈ 3.5 (NOT 5.5) and is geometry-
// driven / over-stressed; reconciled preset is equation-consistent.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── (2) Literal vs reconciled presets ────────────────────────");
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
  check("reconciled F1 ≈ 140", v.F1, 140.7, 2);
  assert("reconciled: fully resolved", r.unresolved.length === 0);
  assert("reconciled: no conflicts", r.conflicts.length === 0);

  // Reconciled candidate should pass every physical constraint.
  const c = evaluateConstraints(v);
  assert("reconciled: all constraints satisfied", c.every((x) => x.ok));
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
  // Literal: over-stressed (red badge) but geometry is NOT bound → spring
  // stays neutral steel, not red.
  const litC = evaluateConstraints(solveModel(buildInitialState("forward", "literalSketch")).values);
  const litStress = litC.find((x) => x.id === "stress");
  const litBind = litC.find((x) => x.id === "coil_bind");
  assert("viz: literal stress fails (badge is red)", litStress?.ok === false);
  assert("viz: literal coil geometry OK → spring not repainted red", litBind?.ok === true);

  // Reconciled: passes stress, but solid-height clearance is a small positive
  // margin (near limit). coil_bind stays OK → amber *badge* only, no full
  // amber/red spring.
  const recV = solveModel(buildInitialState("forward", "reconciledCandidate")).values;
  const recC = evaluateConstraints(recV);
  const recBind = recC.find((x) => x.id === "coil_bind");
  const clearance = (recV.L_min as number) - (recV.Hs as number);
  const required = (recV.required_clearance as number) ?? 0;
  assert("viz: reconciled clearance is a small positive margin (near limit)", clearance > required && clearance - required < 0.1);
  assert("viz: reconciled near-limit is NOT a geometry failure → spring stays neutral", recBind?.ok === true);
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
  const OD = sc.outerDiameter;
  const B = sc.axialBudget;
  const y = sc.latchTravel;

  // Geometry (OD locked)
  check("V2 D = OD − d", c.D, OD - d, 0.001);
  check("V2 ID = OD − 2d", c.ID, OD - 2 * d, 0.001);
  check("V2 Nt = Na + 2", c.Nt, Na + 2, 0.001);

  // Solid height
  check("V2 Hs_nom = Nt·d", c.HsNom, c.Nt * d, 0.001);
  check("V2 Hs_max = 1.05·Hs_nom", c.HsMax, 1.05 * c.HsNom, 0.001);
  check("V2 Lc = Hs_max + c_extra", c.Lc, c.HsMax + sc.extraSolidClearance, 0.001);

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
// as constraints, and V2 does not read the V1 required_clearance / tau_allow.
// ─────────────────────────────────────────────────────────────────────────
console.log("\n── V2 (f) V1 independence ───────────────────────────────────");
{
  // Changing OD alone (a study assumption) shifts the feasible set — proving V2
  // derives everything from its own scenario, not V1 pins.
  const wide: V2Scenario = { ...DEFAULT_V2_SCENARIO, outerDiameter: 1.3 };
  const base = sweepV2DesignSpace(DEFAULT_V2_SCENARIO);
  const alt = sweepV2DesignSpace(wide);
  assert("V2 responds to its own scenario (OD change alters feasible count)", base.feasibleCount !== alt.feasibleCount);

  // extraSolidClearance eats the axial budget → fewer positive-run-up candidates.
  const tight: V2Scenario = { ...DEFAULT_V2_SCENARIO, extraSolidClearance: 0.2 };
  const tightSweep = sweepV2DesignSpace(tight);
  assert(
    "V2 extra clearance reduces the run-up budget (feasible count drops)",
    tightSweep.feasibleCount < base.feasibleCount,
  );
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s).`);
  process.exit(1);
}
console.log("\nAll validations passed.");
