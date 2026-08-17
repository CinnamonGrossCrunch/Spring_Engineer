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
    const Hs = v("Hs");
    const creq = v("required_clearance") ?? 0;
    if (Lmin !== undefined && Hs !== undefined) {
      const clearance = Lmin - Hs;
      const ok = clearance > creq;
      results.push({
        id: "coil_bind",
        name: "Solid height / coil bind",
        ok,
        severity: ok ? "info" : "error",
        message: ok
          ? `Clearance above solid is ${clearance.toFixed(3)} in (required > ${creq.toFixed(3)} in). L_min > H_s + c_req is satisfied.`
          : `COIL BIND RISK: clearance above solid is ${clearance.toFixed(3)} in but required clearance is ${creq.toFixed(3)} in. Increase L_min, reduce coils/wire diameter, or relax the margin.`,
        parameterIds: ["L_min", "Hs", "required_clearance", "clearance"],
      });
    }
  }

  // ── Stress ───────────────────────────────────────────────────────────────
  {
    const tau = v("tau");
    const tauAllow = v("tau_allow");
    if (tau !== undefined && tauAllow !== undefined && tauAllow > 0) {
      const util = tau / tauAllow;
      const ok = util < 1;
      const marginal = ok && util > 0.85;
      results.push({
        id: "stress",
        name: "Shear stress vs allowable",
        ok,
        severity: ok ? (marginal ? "warning" : "info") : "error",
        message: ok
          ? marginal
            ? `Stress utilization is ${(util * 100).toFixed(0)}% — under the allowable but with thin margin. Confirm τ_allow with the supplier for this wire size and life target.`
            : `Stress utilization is ${(util * 100).toFixed(0)}% of the vendor-supplied allowable.`
          : `OVERSTRESSED: corrected shear stress τ = ${Math.round(tau).toLocaleString()} psi exceeds τ_allow = ${Math.round(tauAllow).toLocaleString()} psi (utilization ${(util * 100).toFixed(0)}%).`,
        parameterIds: ["tau", "tau_allow", "utilization"],
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
