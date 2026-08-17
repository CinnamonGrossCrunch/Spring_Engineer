/**
 * Lightweight validation of the equation system and solver.
 * Run with:  npx tsx lib/engineering/validate.ts
 * Exits non-zero on failure.
 */
import { solveModel } from "./solver";
import { buildInitialState } from "../../data/exampleModel";
import { springRate, wahlFactor, shearStress } from "./spring";

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

// ── Pure helpers ────────────────────────────────────────────────────────────
check("springRate(11.5e6, 0.055, 0.4, 10)", springRate(11.5e6, 0.055, 0.4, 10), 20.553, 0.5);
check("wahlFactor(C=7.2727)", wahlFactor(0.4 / 0.055), 1.2042, 0.5);
check(
  "shearStress(Kw=1.2042, F=12.33, D=0.4, d=0.055)",
  shearStress(1.2042, 12.33, 0.4, 0.055),
  90_950,
  1,
);

// ── Forward solve ───────────────────────────────────────────────────────────
{
  const result = solveModel(buildInitialState("forward"));
  const v = result.values;
  check("impact latch example k", v.k, 280, 3);
  check("impact latch example F1", v.F1, 140, 3);
  check("impact latch example F2", v.F2, 70, 3);
  check("impact latch example F3", v.F3, 50.4, 3);
  check("impact latch example x1", v.x1, 0.5, 3);
  check("impact latch example s_h", v.s_h, 0.25, 3);
  check("impact latch example y_latch", v.y_latch, 0.07, 3);
  check("impact latch example L_free", v.L_free, 2.2, 10);
  check("impact latch example L_min", v.L_min, 1.7, 10);
  assert("forward: no conflicts", result.conflicts.length === 0);
  assert("forward: fully resolved", result.unresolved.length === 0);
}

// ── Reverse solve (k and d worked backward from pinned F2) ─────────────────
{
  const result = solveModel(buildInitialState("reverse"));
  const v = result.values;
  check("reverse k = F2/(x1−s_h)", v.k, 20.0, 0.5);
  check("reverse F1", v.F1, 12.0, 0.5);
  check("reverse F3", v.F3, 3.4, 0.5);
  check("reverse d (solved from rate eq)", v.d, 0.05463, 1);
  assert("reverse: no conflicts", result.conflicts.length === 0);
  assert("reverse: fully resolved", result.unresolved.length === 0);
}

// ── Overconstraint: pinned inconsistent Hooke triple must conflict ─────────
{
  const state = buildInitialState("explore");
  state.F1 = { value: 50, status: "fixed" }; // k·x1 ≈ 12.33, not 50
  state.x1 = { value: 0.6, status: "fixed" };
  state.d = { value: 0.055, status: "fixed" }; // keeps k derivable → conflict
  const result = solveModel(state);
  assert(
    "overconstraint: conflict traced to pinned F1",
    result.conflicts.some((c) => c.fixedParameterIds.includes("F1")),
  );
  assert(
    "overconstraint: fixed F1 not overwritten",
    result.values.F1 === 50,
  );
}

// ── Determinism: same input → same output ──────────────────────────────────
{
  const a = solveModel(buildInitialState("forward"));
  const b = solveModel(buildInitialState("forward"));
  assert("determinism", JSON.stringify(a) === JSON.stringify(b));
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s).`);
  process.exit(1);
}
console.log("\nAll validations passed.");
