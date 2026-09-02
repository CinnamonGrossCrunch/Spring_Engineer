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
    const requiredClearance = v("c_extra");
    const actualUtilization = v("deflection_utilization");
    const maxUtilization = v("deflection_utilization_max");
    if (Lmin !== undefined && HsMax !== undefined) {
      const clearance = Lmin - HsMax;
      const clearanceOk = requiredClearance === undefined || clearance + 1e-9 >= requiredClearance;
      const utilizationOk = actualUtilization === undefined || maxUtilization === undefined || actualUtilization <= maxUtilization + 1e-9;
      const ok = clearanceOk && utilizationOk;
      results.push({
        id: "coil_bind",
        name: "Solid height / coil bind",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Working deflection uses ${actualUtilization !== undefined ? (actualUtilization * 100).toFixed(1) : "—"}% of available travel (limit ${maxUtilization !== undefined ? (maxUtilization * 100).toFixed(1) : "—"}%). Clearance above H_s,max is ${clearance.toFixed(3)} in; required ${requiredClearance !== undefined ? requiredClearance.toFixed(3) : "—"} in.`
          : `DEFLECTION / COIL-BIND MARGIN EXCEEDED: utilization is ${actualUtilization !== undefined ? (actualUtilization * 100).toFixed(1) : "—"}% versus ${maxUtilization !== undefined ? (maxUtilization * 100).toFixed(1) : "—"}% maximum; clearance is ${clearance.toFixed(3)} in versus ${requiredClearance !== undefined ? requiredClearance.toFixed(3) : "—"} in required.`,
        parameterIds: ["L_min", "Hs_max", "c_extra", "clearance", "available_deflection", "deflection_utilization", "deflection_utilization_max", "solid_tolerance"],
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

  // ── Critical / total travel ordering ────────────────────────────────────
  {
    const yCritical = v("y_latch");
    const yTotal = v("y_total");
    if (yCritical !== undefined && yTotal !== undefined) {
      const ok = yCritical > 0 && yTotal + 1e-9 >= yCritical;
      results.push({
        id: "travel_order",
        name: "Critical and total travel",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Critical release occurs at ${yCritical.toFixed(3)} in after contact; full coupled travel ends at ${yTotal.toFixed(3)} in.`
          : `Travel definition is invalid: critical travel must be positive and cannot exceed total coupled travel (${yCritical.toFixed(3)} in critical vs ${yTotal.toFixed(3)} in total).`,
        parameterIds: ["y_latch", "y_total", "y_post"],
      });
    }
  }

  // ── Spring force at critical release ────────────────────────────────────
  {
    const F3 = v("F3");
    if (F3 !== undefined) {
      const ok = F3 > 0;
      results.push({
        id: "critical_release_force",
        name: "Spring drive at critical release",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Spring force at the point of no return is F3 = ${F3.toFixed(2)} lbf.`
          : `F3 = ${F3.toFixed(2)} lbf ≤ 0: the spring reaches free length before the critical release point.`,
        parameterIds: ["F3", "k", "y_latch", "x1", "s_h"],
      });
    }
  }

  // ── Minimum force at the end of full coupled travel ─────────────────────
  {
    const F4 = v("F4");
    const minimum = v("F_end_min");
    if (F4 !== undefined && minimum !== undefined) {
      const ok = F4 + 1e-9 >= minimum;
      results.push({
        id: "end_force_floor",
        name: "End-of-travel spring-force floor",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `F4 = ${F4.toFixed(2)} lbf satisfies the nominal end-force floor of ${minimum.toFixed(2)} lbf.`
          : `F4 = ${F4.toFixed(2)} lbf is below the nominal end-force floor of ${minimum.toFixed(2)} lbf.`,
        parameterIds: ["F4", "F_end_min", "k", "y_total"],
      });
    }
  }

  // ── Positive finishing drive against the modeled opposing preload ───────
  {
    const F4 = v("F4");
    const opposing = v("F_opposing");
    const yCritical = v("y_latch");
    const yTotal = v("y_total");
    if (
      F4 !== undefined &&
      opposing !== undefined &&
      yCritical !== undefined &&
      yTotal !== undefined &&
      yTotal > yCritical + 1e-9
    ) {
      const net = F4 - opposing;
      const ok = net > 0;
      results.push({
        id: "opposing_preload",
        name: "Net drive after critical release",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Final net drive is ${net.toFixed(2)} lbf (${F4.toFixed(2)} lbf spring force − ${opposing.toFixed(2)} lbf opposing preload). No minimum post-critical velocity is imposed.`
          : `Final net drive is ${net.toFixed(2)} lbf: the spring cannot overcome the modeled ${opposing.toFixed(2)} lbf opposing preload through the remaining travel.`,
        parameterIds: ["F4", "F4_net", "F_opposing", "y_post"],
      });
    }
  }

  // ── Optional armed/compressed spring-height range ───────────────────────
  {
    const Lmin = v("L_min");
    const armedMin = v("L_armed_min");
    const armedMax = v("L_armed_max");
    if (Lmin !== undefined && armedMin !== undefined && armedMax !== undefined) {
      const rangeValid = armedMin <= armedMax;
      const ok = rangeValid && Lmin + 1e-9 >= armedMin && Lmin <= armedMax + 1e-9;
      results.push({
        id: "armed_height_range",
        name: "Optional armed spring-height range",
        ok,
        severity: ok ? "info" : "error",
        message: !rangeValid
          ? `Armed-height range is invalid: minimum ${armedMin.toFixed(3)} in exceeds maximum ${armedMax.toFixed(3)} in.`
          : ok
            ? `Armed spring height ${Lmin.toFixed(3)} in is within ${armedMin.toFixed(3)}–${armedMax.toFixed(3)} in.`
            : `Armed spring height ${Lmin.toFixed(3)} in is outside ${armedMin.toFixed(3)}–${armedMax.toFixed(3)} in.`,
        parameterIds: ["L_min", "L_armed_min", "L_armed_max"],
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
