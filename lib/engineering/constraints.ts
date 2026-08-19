import type { ConstraintResult } from "./types";

/**
 * Physical/design constraint checks evaluated against the solved model.
 * These never modify values — they only report status.
 */
export function evaluateConstraints(
  values: Record<string, number | undefined>,
): ConstraintResult[] {
  const results: ConstraintResult[] = [];
  const v = (id: string) => values[id];

  // ── Coil bind / solid height ─────────────────────────────────────────────
  {
    const Lmin = v("L_min");
    const HsMax = v("Hs_max");
    const cExtra = v("c_extra") ?? 0;
    if (Lmin !== undefined && HsMax !== undefined) {
      const clearance = Lmin - HsMax;
      const ok = clearance >= cExtra;
      results.push({
        id: "coil_bind",
        name: "Solid height / coil bind",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Clearance above Lee maximum solid height is ${clearance.toFixed(3)} in (c_extra = ${cExtra.toFixed(3)} in). ${cExtra === 0 ? "This is the theoretical Lee tolerance boundary (no added vendor margin)." : "L_min >= H_s,max + c_extra is satisfied."}`
          : `COIL BIND RISK: c_solid = ${clearance.toFixed(3)} in is below c_extra = ${cExtra.toFixed(3)} in. Increase L_min, reduce coils/wire diameter, or reduce extra margin.`,
        parameterIds: ["L_min", "Hs_max", "c_extra", "clearance", "solid_tolerance"],
      });
    }
  }

  // ── Stress ───────────────────────────────────────────────────────────────
  {
    const tau = v("tau");
    const tsBasis = v("TS_basis");
    if (tau !== undefined && tsBasis !== undefined && tsBasis > 0) {
      const util = tau / tsBasis;
      const low = util <= 0.4;
      const setBand = util > 0.4 && util <= 0.6;
      const ok = util <= 0.6;
      results.push({
        id: "stress",
        name: "Shear stress vs TS basis",
        ok,
        severity: ok ? (setBand ? "warning" : "info") : "error",
        message: ok
          ? low
            ? `Stress ratio is ${(util * 100).toFixed(1)}% of TS_basis (low band). TS_basis is tensile-strength guidance, not allowable shear stress.`
            : `Stress ratio is ${(util * 100).toFixed(1)}% of TS_basis (set/preset band). TS_basis is tensile-strength guidance, not allowable shear stress.`
          : `REDESIGN REGION: τ/TS_basis = ${(util * 100).toFixed(1)}% (>60%). For this Elgiloy first-pass guidance, reduce stress by increasing d, reducing D, or reducing F1.`,
        parameterIds: ["tau", "TS_basis", "TS_conservative", "TS_upper", "utilization"],
      });
    }
  }

  // ── Starting-force cap ───────────────────────────────────────────────────
  {
    const F1 = v("F1");
    const F1Cap = v("F1_cap");
    if (F1 !== undefined && F1Cap !== undefined) {
      const ok = F1 <= F1Cap + 1e-9;
      results.push({
        id: "start_force_cap",
        name: "Starting spring-force cap",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `F1 = ${F1.toFixed(2)} lbf satisfies cap F1_cap = ${F1Cap.toFixed(2)} lbf.`
          : `Starting-force cap exceeded: F1 = ${F1.toFixed(2)} lbf > F1_cap = ${F1Cap.toFixed(2)} lbf.`,
        parameterIds: ["F1", "F1_cap"],
      });
    }
  }

  // ── Axial budget consistency ─────────────────────────────────────────────
  {
    const B = v("B");
    const Lmin = v("L_min");
    const sh = v("s_h");
    if (B !== undefined && Lmin !== undefined && sh !== undefined) {
      const sum = Lmin + sh;
      const diff = Math.abs(sum - B);
      const ok = diff <= 1e-3;
      results.push({
        id: "axial_budget",
        name: "Axial budget consistency",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `B = ${B.toFixed(3)} in matches L_min + s_h = ${sum.toFixed(3)} in.`
          : `Axial budget mismatch: B = ${B.toFixed(3)} in but L_min + s_h = ${sum.toFixed(3)} in (Δ = ${diff.toFixed(3)} in).`,
        parameterIds: ["B", "L_min", "s_h"],
      });
    }
  }

  // ── Latch follow-through boundary ────────────────────────────────────────
  {
    const y = v("y_latch");
    if (y !== undefined) {
      const target = 0.07;
      const diff = Math.abs(y - target);
      const ok = diff <= 1e-6;
      results.push({
        id: "latch_travel_boundary",
        name: "Latch follow-through boundary",
        ok,
        severity: ok ? "info" : "warning",
        message: ok
          ? `y_latch = ${y.toFixed(3)} in matches the current boundary value (0.070 in).`
          : `y_latch = ${y.toFixed(3)} in differs from the current boundary value (0.070 in).`,
        parameterIds: ["y_latch"],
      });
    }
  }

  // ── Continuous drive through latch travel ───────────────────────────────
  {
    const F3 = v("F3");
    if (F3 !== undefined) {
      const ok = F3 > 0;
      results.push({
        id: "continuous_drive",
        name: "Spring drive through latch travel",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Residual spring force after latch travel is F3 = ${F3.toFixed(2)} lbf — the spring keeps driving through release.`
          : `F3 = ${F3.toFixed(2)} lbf ≤ 0: the spring reaches free length before latch travel completes, violating the V1 continuous-drive assumption.`,
        parameterIds: ["F3", "k", "y_latch", "x1", "s_h"],
      });
    }
  }

  // ── Positive contact force ───────────────────────────────────────────────
  {
    const F2 = v("F2");
    if (F2 !== undefined && F2 <= 0) {
      results.push({
        id: "contact_force",
        name: "Spring force at contact",
        ok: false,
        severity: "error",
        message: `F2 = ${F2.toFixed(2)} lbf ≤ 0: the spring relaxes fully before the hammer reaches the latch (run-up stroke exceeds available deflection).`,
        parameterIds: ["F2", "s_h", "x1"],
      });
    }
  }

  // ── Spring index manufacturability (advisory) ────────────────────────────
  {
    const C = v("C");
    if (C !== undefined) {
      const ok = C >= 4 && C <= 12;
      if (!ok) {
        results.push({
          id: "spring_index",
          name: "Spring index range",
          ok: false,
          severity: "warning",
          message:
            C < 4
              ? `Spring index C = ${C.toFixed(1)} is below ~4: high curvature stress and difficult winding. Consider a larger D or thinner wire.`
              : `Spring index C = ${C.toFixed(1)} is above ~12: coil may tangle/buckle easily. Consider a smaller D or thicker wire.`,
          parameterIds: ["C", "D", "d"],
        });
      }
    }
  }

  // ── Geometric sanity ─────────────────────────────────────────────────────
  {
    const x1 = v("x1");
    if (x1 !== undefined && x1 <= 0) {
      results.push({
        id: "deflection_positive",
        name: "Working deflection",
        ok: false,
        severity: "error",
        message: `x1 = ${x1.toFixed(3)} in ≤ 0: free length must exceed the minimum loaded length.`,
        parameterIds: ["x1", "L_free", "L_min"],
      });
    }
  }

  return results;
}
