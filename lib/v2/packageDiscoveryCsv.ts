import type {
  PackageDiscoveryResult,
  PackageDiscoverySettings,
  PackageRecommendationRole,
} from "./packageDiscovery";
import { calculateManufacturingToleranceEnvelope } from "./toleranceEnvelope";

const HEADERS = [
  "frontier_rank",
  "recommendation_role",
  "candidate_key",
  "searched_geometries",
  "passed_geometries",
  "non_dominated_package_points",
  "axial_budget_in",
  "armed_length_in",
  "armed_to_budget_pct",
  "hammer_run_up_in",
  "wire_diameter_in",
  "mean_diameter_in",
  "outside_diameter_in",
  "inside_diameter_in",
  "active_coils",
  "total_coils",
  "free_length_in",
  "spring_rate_lbf_per_in",
  "armed_force_lbf",
  "contact_force_lbf",
  "critical_force_lbf",
  "end_force_nominal_lbf",
  "end_force_tolerance_low_lbf",
  "hammer_run_up_work_in_lbf",
  "critical_window_work_in_lbf",
  "post_critical_work_gross_in_lbf",
  "work_density_in_lbf_per_in",
  "deflection_utilization_pct",
  "stress_pct_selected_basis",
  "stress_band",
  "absolute_armed_force_max_lbf",
  "worst_case_end_force_min_lbf",
  "critical_travel_in",
  "total_coupled_travel_in",
  "housing_bore_in",
  "minimum_spring_inside_diameter_in",
  "positive_od_tolerance_and_clearance_in",
  "spring_rate_tolerance_pct",
  "free_length_tolerance_in",
  "tolerance_corners_enforced",
  "worst_case_force_cap_pass",
  "worst_case_end_force_pass",
  "vendor_validation_required",
] as const;

type CsvValue = string | number | boolean;

function escapeCsv(value: CsvValue): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Export the same non-dominated package points displayed in the discovery frontier. */
export function generatePackageDiscoveryCsv(
  result: PackageDiscoveryResult,
  settings: PackageDiscoverySettings,
): string {
  const rows = result.frontier.map((point, index) => {
    const candidate = point.candidate;
    const tolerance = calculateManufacturingToleranceEnvelope(candidate, point.scenario);
    const recommendationRole = result.recommendationRoles[point.key] as
      | PackageRecommendationRole
      | undefined;
    const armedRatio = point.axialBudget > 0 ? candidate.Lc / point.axialBudget : 0;

    const row: CsvValue[] = [
      index + 1,
      recommendationRole ?? "",
      point.key,
      result.searchedCount,
      result.acceptedCount,
      result.frontier.length,
      point.axialBudget,
      candidate.Lc,
      armedRatio * 100,
      candidate.s,
      candidate.d,
      candidate.D,
      candidate.OD,
      candidate.ID,
      candidate.Na,
      candidate.Nt,
      candidate.Lf,
      candidate.k,
      candidate.F0,
      candidate.F2,
      candidate.F3,
      candidate.F4,
      tolerance?.forces.end.min ?? "",
      candidate.Whammer,
      candidate.Wlatch,
      candidate.WpostCritical,
      point.workDensity,
      candidate.deflectionUtilization * 100,
      candidate.stressPctBasis * 100,
      candidate.feasibility.stressBand,
      settings.forceCap,
      settings.minimumEndForce,
      settings.criticalTravel,
      settings.totalCoupledTravel,
      settings.housingInnerDiameter,
      settings.minimumInnerDiameter,
      settings.outerDiameterTolerance,
      settings.springRateTolerance * 100,
      settings.freeLengthTolerance,
      settings.enforceManufacturingTolerance,
      tolerance?.worstCaseForceCapPass ?? "",
      tolerance?.worstCaseEndForcePass ?? "",
      true,
    ];

    return row.map(escapeCsv).join(",");
  });

  return `${[HEADERS.map(escapeCsv).join(","), ...rows].join("\r\n")}\r\n`;
}

export function packageDiscoveryCsvFilename(date = new Date()): string {
  return `spring-package-frontier_${date.toISOString().slice(0, 10)}.csv`;
}
