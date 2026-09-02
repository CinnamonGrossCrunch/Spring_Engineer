import type { V2Candidate, V2Scenario } from "./types";
import { calculateManufacturingToleranceEnvelope } from "./toleranceEnvelope";

export type CandidateCsvMode = "pareto" | "feasible";

const HEADERS = [
  "candidate_key",
  "shortlisted",
  "pareto",
  "feasible",
  "wire_diameter_in",
  "mean_diameter_in",
  "outside_diameter_in",
  "inside_diameter_in",
  "active_coils",
  "total_coils",
  "spring_index",
  "spring_rate_lbf_per_in",
  "nominal_solid_height_in",
  "maximum_solid_height_in",
  "required_clearance_above_maximum_solid_in",
  "available_deflection_in",
  "deflection_utilization_pct",
  "deflection_reserve_pct",
  "armed_length_in",
  "hammer_run_up_in",
  "free_length_in",
  "hammer_contact_length_in",
  "released_length_in",
  "armed_force_lbf",
  "contact_force_lbf",
  "released_force_lbf",
  "hammer_work_in_lbf",
  "latch_work_in_lbf",
  "ideal_release_work_in_lbf",
  "ideal_equivalent_average_lbf",
  "wahl_factor",
  "shear_stress_psi",
  "stress_basis_psi",
  "stress_pct_selected_basis",
  "stress_pct_conservative",
  "stress_pct_optimistic",
  "stress_band",
  "manufacturing_tolerance_enabled",
  "manufacturing_tolerance_method",
  "mechanism_force_cap_lbf",
  "spring_rate_tolerance_pct",
  "free_length_tolerance_in",
  "independent_corner_estimate_armed_force_min_lbf",
  "independent_corner_estimate_armed_force_max_lbf",
  "independent_corner_estimate_contact_force_min_lbf",
  "independent_corner_estimate_contact_force_max_lbf",
  "independent_corner_estimate_released_force_min_lbf",
  "independent_corner_estimate_released_force_max_lbf",
  "independent_corner_estimate_hammer_work_min_in_lbf",
  "independent_corner_estimate_hammer_work_max_in_lbf",
  "independent_corner_estimate_latch_work_min_in_lbf",
  "independent_corner_estimate_latch_work_max_in_lbf",
  "independent_corner_estimate_ideal_release_work_min_in_lbf",
  "independent_corner_estimate_ideal_release_work_max_in_lbf",
  "independent_corner_estimate_worst_case_force_cap_pass",
  "independent_corner_estimate_armed_force_cap_excess_lbf",
  "exclusion_reasons",
] as const;

function escapeCsv(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function candidateRow(candidate: V2Candidate, shortlisted: boolean, scenario?: V2Scenario): Array<string | number | boolean> {
  const tolerance = scenario
    ? calculateManufacturingToleranceEnvelope(candidate, scenario)
    : null;
  return [
    candidate.key,
    shortlisted,
    candidate.pareto,
    candidate.feasibility.feasible,
    candidate.d,
    candidate.D,
    candidate.OD,
    candidate.ID,
    candidate.Na,
    candidate.Nt,
    candidate.C,
    candidate.k,
    candidate.HsNom,
    candidate.HsMax,
    candidate.solidClearance,
    candidate.availableDeflection,
    candidate.deflectionUtilization * 100,
    candidate.deflectionReserve * 100,
    candidate.Lc,
    candidate.s,
    candidate.Lf,
    candidate.L2,
    candidate.L3,
    candidate.F0,
    candidate.F2,
    candidate.F3,
    candidate.Whammer,
    candidate.Wlatch,
    candidate.WreleaseIdeal,
    candidate.FeqAvgIdeal,
    candidate.Kw,
    candidate.tau,
    candidate.stressBasisPsi,
    candidate.stressPctBasis * 100,
    candidate.stressPctConservative * 100,
    candidate.stressPctOptimistic * 100,
    candidate.feasibility.stressBand,
    scenario?.manufacturingToleranceEnabled ?? false,
    tolerance ? "independent_rate_free_length_corner_stack" : "",
    scenario?.forceCap ?? "",
    scenario ? scenario.springRateTolerance * 100 : "",
    scenario?.freeLengthTolerance ?? "",
    tolerance?.forces.armed.min ?? "",
    tolerance?.forces.armed.max ?? "",
    tolerance?.forces.contact.min ?? "",
    tolerance?.forces.contact.max ?? "",
    tolerance?.forces.released.min ?? "",
    tolerance?.forces.released.max ?? "",
    tolerance?.work.hammer.min ?? "",
    tolerance?.work.hammer.max ?? "",
    tolerance?.work.latch.min ?? "",
    tolerance?.work.latch.max ?? "",
    tolerance?.work.total.min ?? "",
    tolerance?.work.total.max ?? "",
    tolerance?.worstCaseForceCapPass ?? "",
    tolerance?.worstCaseForceCapExcess ?? "",
    candidate.feasibility.reasons.join(";"),
  ];
}

/** Export the exact ordered candidate rows supplied by the table. */
export function generateCandidateCsv(
  candidates: V2Candidate[],
  shortlist: string[],
  scenario?: V2Scenario,
): string {
  const shortlisted = new Set(shortlist);
  const lines = [
    HEADERS.map(escapeCsv).join(","),
    ...candidates.map((candidate) =>
      candidateRow(candidate, shortlisted.has(candidate.key), scenario).map(escapeCsv).join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function candidateCsvFilename(mode: CandidateCsvMode, date = new Date()): string {
  return `spring-candidates_${mode}_${date.toISOString().slice(0, 10)}.csv`;
}
