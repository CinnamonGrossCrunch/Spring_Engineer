"""
Two kinds of validation:

1. Input consistency - do the redundant candidate values agree with each other?
   Run before any CAD work. A mismatch is reported, never silently reinterpreted.

2. B-rep validation - is the finished solid something we are willing to export?
   Run before every STEP write, so a known-invalid shape can never reach a
   download.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from build123d import GeomType

from .errors import GeometryInconsistentError, InvalidBrepError
from .spring_geometry import BuiltSpring, SpringGeometryMm, planar_seating_faces
from .tolerances import (
    CAD_LENGTH_VALIDATION_TOL_MM,
    CAD_LINEAR_TOL_MM,
    CAD_OD_VALIDATION_TOL_MM,
    COIL_COUNT_ABS_TOL,
    GEOMETRY_CONSISTENCY_REL_TOL,
)


# ---------------------------------------------------------------------------
# 1. Input consistency
# ---------------------------------------------------------------------------

def validate_candidate_consistency(geom: SpringGeometryMm) -> None:
    """
    Cross-check the redundant geometry a V2 candidate carries.

        D  ~= OD - d
        ID ~= D - d
        Nt ~= Na + 2      (closed and ground ends)

    Raises GeometryInconsistentError listing every disagreement found, so the
    user sees all of them at once rather than one per round trip.
    """
    problems: list[str] = []

    d = geom.wire_diameter
    D = geom.mean_diameter
    OD = geom.outer_diameter
    ID = geom.inner_diameter

    expected_D = OD - d
    if abs(expected_D - D) > GEOMETRY_CONSISTENCY_REL_TOL * max(abs(D), CAD_LINEAR_TOL_MM):
        problems.append(
            f"Mean diameter disagrees with OD - d: provided D = {D / 25.4:.4f} in, "
            f"OD - d = {expected_D / 25.4:.4f} in."
        )

    expected_ID = D - d
    if abs(expected_ID - ID) > GEOMETRY_CONSISTENCY_REL_TOL * max(abs(ID), CAD_LINEAR_TOL_MM):
        problems.append(
            f"Inside diameter disagrees with D - d: provided ID = {ID / 25.4:.4f} in, "
            f"D - d = {expected_ID / 25.4:.4f} in."
        )

    expected_Nt = geom.active_coils + 2.0
    if abs(expected_Nt - geom.total_coils) > COIL_COUNT_ABS_TOL:
        problems.append(
            f"Total coils disagrees with Na + 2 for closed/ground ends: provided "
            f"Nt = {geom.total_coils:.2f}, Na + 2 = {expected_Nt:.2f}."
        )

    if D <= d:
        problems.append(
            f"Mean diameter ({D / 25.4:.4f} in) must exceed wire diameter "
            f"({d / 25.4:.4f} in)."
        )

    for name, value in (("d", d), ("D", D), ("OD", OD), ("ID", ID),
                        ("Na", geom.active_coils), ("Nt", geom.total_coils)):
        if not math.isfinite(value):
            problems.append(f"{name} is not a finite number.")

    if problems:
        raise GeometryInconsistentError(
            "Candidate geometry is internally inconsistent.", problems)


# ---------------------------------------------------------------------------
# 2. B-rep validation
# ---------------------------------------------------------------------------

@dataclass
class BrepReport:
    """What we checked and what we measured, for the manifest."""

    configuration: str
    is_valid: bool = False
    is_manifold: bool = False
    solid_count: int = 0
    volume_mm3: float = 0.0
    bbox_min: tuple[float, float, float] = (0.0, 0.0, 0.0)
    bbox_max: tuple[float, float, float] = (0.0, 0.0, 0.0)
    measured_height_mm: float = 0.0
    measured_od_mm: float = 0.0
    bottom_seating_faces: int = 0
    top_seating_faces: int = 0
    active_pitch_mm: float = 0.0
    grind_depth_mm: float = 0.0
    min_one_turn_rise_mm: float = 0.0
    checks: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "configuration": self.configuration,
            "isValid": self.is_valid,
            "isManifold": self.is_manifold,
            "solidCount": self.solid_count,
            "volumeMm3": round(self.volume_mm3, 6),
            "measuredHeightMm": round(self.measured_height_mm, 6),
            "measuredOdMm": round(self.measured_od_mm, 6),
            "bottomSeatingFaces": self.bottom_seating_faces,
            "topSeatingFaces": self.top_seating_faces,
            "activePitchMm": round(self.active_pitch_mm, 6),
            "grindDepthMm": round(self.grind_depth_mm, 6),
            "minOneTurnRiseMm": round(self.min_one_turn_rise_mm, 6),
            "checksPassed": self.checks,
        }


def _finite(*values: float) -> bool:
    return all(math.isfinite(v) for v in values)


def validate_brep(built: BuiltSpring, geom: SpringGeometryMm) -> BrepReport:
    """
    Gate every solid before export. Raises InvalidBrepError on any failure, so
    a corrupt shape cannot become a download.
    """
    solid = built.solid
    report = BrepReport(configuration=built.configuration)
    problems: list[str] = []

    if solid is None or solid.is_null:
        raise InvalidBrepError(
            f"The {built.configuration} solid is null.",
            ["OpenCascade returned an empty shape."])

    report.is_valid = bool(solid.is_valid)
    report.is_manifold = bool(solid.is_manifold)
    solids = solid.solids()
    report.solid_count = len(solids)

    if not report.is_valid:
        problems.append("Shape failed the OpenCascade validity check.")
    else:
        report.checks.append("shape.is_valid")

    if not report.is_manifold:
        problems.append("Shape is not manifold.")
    else:
        report.checks.append("shape.is_manifold")

    if report.solid_count != 1:
        problems.append(
            f"Expected exactly one solid, found {report.solid_count}. A spring wire "
            f"must sweep as a single continuous body.")
    else:
        report.checks.append("single_solid")

    # volume
    try:
        report.volume_mm3 = float(solid.volume)
    except Exception as exc:  # noqa: BLE001
        raise InvalidBrepError(
            f"Could not measure the volume of the {built.configuration} solid.",
            [str(exc)]) from exc

    if not math.isfinite(report.volume_mm3) or report.volume_mm3 <= 0:
        problems.append(f"Volume is not finite and positive ({report.volume_mm3}).")
    else:
        report.checks.append("finite_positive_volume")

    # bounding box
    bb = solid.bounding_box()
    report.bbox_min = (bb.min.X, bb.min.Y, bb.min.Z)
    report.bbox_max = (bb.max.X, bb.max.Y, bb.max.Z)
    if not _finite(*report.bbox_min, *report.bbox_max):
        raise InvalidBrepError(
            f"The {built.configuration} solid has non-finite coordinates.",
            ["Bounding box contains NaN or infinity."])
    report.checks.append("finite_bounding_box")

    report.measured_height_mm = bb.max.Z - bb.min.Z
    report.measured_od_mm = max(bb.max.X - bb.min.X, bb.max.Y - bb.min.Y)
    report.active_pitch_mm = built.active_pitch_mm
    report.grind_depth_mm = built.grind_depth_mm
    report.min_one_turn_rise_mm = built.min_one_turn_rise_mm

    # requested height achieved
    if abs(report.measured_height_mm - built.length_mm) > CAD_LENGTH_VALIDATION_TOL_MM:
        problems.append(
            f"Overall height {report.measured_height_mm:.6f} mm does not match the "
            f"requested {built.length_mm:.6f} mm.")
    else:
        report.checks.append("height_matches_requested_state")

    # no material outside the seating planes
    if bb.min.Z < -CAD_LENGTH_VALIDATION_TOL_MM or \
            bb.max.Z > built.length_mm + CAD_LENGTH_VALIDATION_TOL_MM:
        problems.append(
            f"Material exists outside the seating planes: Z spans "
            f"[{bb.min.Z:.6f}, {bb.max.Z:.6f}] mm, expected [0, {built.length_mm:.6f}].")
    else:
        report.checks.append("no_material_outside_seating_planes")

    # radial envelope
    if abs(report.measured_od_mm - geom.outer_diameter) > CAD_OD_VALIDATION_TOL_MM:
        problems.append(
            f"Radial envelope {report.measured_od_mm:.4f} mm does not match the "
            f"requested OD {geom.outer_diameter:.4f} mm.")
    else:
        report.checks.append("od_matches_candidate")

    # the ground bearing faces must actually exist in the topology
    bottom, top = planar_seating_faces(solid, built.length_mm)
    report.bottom_seating_faces = bottom
    report.top_seating_faces = top
    if bottom < 1 or top < 1:
        problems.append(
            f"Planar bearing faces missing (bottom={bottom}, top={top}). The grind "
            f"Boolean did not produce seating geometry.")
    else:
        report.checks.append("planar_bearing_faces_present")

    # any planar face at all implies the trim happened
    if not any(f.geom_type == GeomType.PLANE for f in solid.faces()):
        problems.append("No planar faces in the solid at all.")

    if problems:
        raise InvalidBrepError(
            f"The {built.configuration} configuration failed B-rep validation.", problems)

    return report
