"""
Spring B-rep construction.

Pipeline for one state:

    solve active pitch  ->  sample variable-pitch centerline  ->  B-spline
        ->  sweep circular wire section  ->  planar Boolean grind  ->  solid

Everything here works in millimetres. Inch values never enter this module;
conversion happens once, at the schema boundary.

The engineering values (d, D, OD, ID, Na, Nt, requested length) are treated as
exact and are never adjusted to make the kernel succeed. If a state cannot be
built, that is reported as a structured error.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from build123d import (
    Box,
    Circle,
    GeomType,
    Plane,
    Pos,
    Spline,
    sweep,
)

from .errors import (
    CoilInterferenceError,
    GrindFailureError,
    InvalidBrepError,
    InvalidStateLengthError,
    SweepFailureError,
)
from .spring_end_model import (
    CAD_END_MODEL_V1,
    EndModelV1,
    SpringPitchProfile,
    closed_pitch_mm,
    minimum_buildable_length_mm,
    solve_active_pitch_mm,
)
from .tolerances import (
    CAD_GRIND_DEPTH_TOL_MM,
    CAD_LENGTH_VALIDATION_TOL_MM,
    CAD_LINEAR_TOL_MM,
    MIN_COIL_GAP_MM,
    SAMPLES_PER_TURN,
)


@dataclass(frozen=True)
class SpringGeometryMm:
    """Candidate geometry in millimetres. Immutable across all four states."""

    wire_diameter: float
    mean_diameter: float
    outer_diameter: float
    inner_diameter: float
    active_coils: float
    total_coils: float

    @property
    def wire_radius(self) -> float:
        return self.wire_diameter / 2.0

    @property
    def mean_radius(self) -> float:
        return self.mean_diameter / 2.0


@dataclass
class BuiltSpring:
    """A finished, ground, validated spring solid plus how it was made."""

    solid: object                 # build123d Part
    length_mm: float              # requested (and achieved) overall height
    active_pitch_mm: float
    grind_depth_mm: float         # realised, per end
    nominal_grind_depth_mm: float
    min_one_turn_rise_mm: float
    swept_height_mm: float
    measured_od_mm: float
    configuration: str


def _centerline_points(geom: SpringGeometryMm, profile: SpringPitchProfile,
                       handedness: str) -> list[tuple[float, float, float]]:
    """
    Sample the variable-pitch centerline.

        x(theta) = R cos(theta)
        y(theta) = R sin(theta)          (negated for left-hand winding)
        z(theta) = integral of local pitch

    The z integral is evaluated in closed form by the pitch profile, so the
    only approximation is the B-spline interpolation between samples.
    """
    R = geom.mean_radius
    n = max(2, int(round(SAMPLES_PER_TURN * profile.Nt)))
    sign = -1.0 if handedness == "left" else 1.0

    pts: list[tuple[float, float, float]] = []
    for i in range(n + 1):
        t = profile.Nt * i / n           # turn coordinate
        theta = 2.0 * math.pi * t
        pts.append((R * math.cos(theta), sign * R * math.sin(theta), profile.rise_at(t)))
    return pts


def build_spring_state(geom: SpringGeometryMm, length_mm: float, configuration: str,
                       handedness: str = "right",
                       end_model: EndModelV1 = CAD_END_MODEL_V1) -> BuiltSpring:
    """
    Build one ground spring solid at the requested overall length.

    The length is achieved by solving the active pitch *before* construction.
    The finished solid is never scaled in Z and the circular wire section is
    never distorted.
    """
    d = geom.wire_diameter
    r = geom.wire_radius
    Nt = geom.total_coils

    # -- 1. is this length physically buildable at all? --------------------
    if length_mm <= 0:
        raise InvalidStateLengthError(
            f"Requested {configuration} length must be positive (got {length_mm:.4f} mm).")

    min_len = minimum_buildable_length_mm(Nt, d, end_model)
    if length_mm < min_len - CAD_LINEAR_TOL_MM:
        raise CoilInterferenceError(
            f"The {configuration} state is shorter than this spring can physically close to.",
            [
                f"Requested length: {length_mm:.4f} mm ({length_mm / 25.4:.4f} in)",
                f"Nominal solid height: {min_len:.4f} mm ({min_len / 25.4:.4f} in)",
                f"At Nt = {Nt:g} and d = {d:.4f} mm the coils are already touching at "
                f"solid height; a shorter state would require wire to pass through wire.",
            ],
        )

    # -- 2. solve the active pitch -----------------------------------------
    p_active = solve_active_pitch_mm(length_mm, Nt, d, end_model)
    p_closed = closed_pitch_mm(d)
    if p_active < p_closed - CAD_LINEAR_TOL_MM:
        raise CoilInterferenceError(
            f"The {configuration} state requires an active pitch below the closed-coil pitch.",
            [
                f"Solved active pitch: {p_active:.4f} mm",
                f"Closed-coil pitch (coils touching): {p_closed:.4f} mm",
            ],
        )

    profile = SpringPitchProfile(Nt, d, p_active, end_model)

    # -- 3. non-interpenetration check on the analytic centerline ----------
    min_rise = profile.min_one_turn_rise()
    if min_rise < d + MIN_COIL_GAP_MM - CAD_LINEAR_TOL_MM:
        raise CoilInterferenceError(
            f"The {configuration} state produces coil interference.",
            [
                f"Smallest one-turn axial rise: {min_rise:.4f} mm",
                f"Wire diameter: {d:.4f} mm - the rise must be at least this to avoid "
                f"wire passing through wire.",
            ],
        )

    # -- 4. sweep the circular wire along the centerline -------------------
    try:
        pts = _centerline_points(geom, profile, handedness)
        path = Spline(*pts)
        start_pt = path @ 0.0
        start_tangent = path % 0.0
        section = Plane(origin=start_pt, z_dir=start_tangent) * Circle(r)
        swept = sweep(section, path=path, is_frenet=True)
    except Exception as exc:  # noqa: BLE001 - kernel failures are opaque
        raise SweepFailureError(
            f"The circular wire sweep failed for the {configuration} state.",
            [str(exc)],
        ) from exc

    if swept is None or swept.is_null or not swept.is_valid:
        raise SweepFailureError(
            f"The swept wire solid for the {configuration} state is not a valid B-rep.")

    # -- 5. grind: two true planar Boolean trims ---------------------------
    bb = swept.bounding_box()
    swept_height = bb.max.Z - bb.min.Z

    # Place the seating planes from the *measured* extent so that the finished
    # height is exactly the requested length. Any spline-vs-analytic drift is
    # absorbed by the grind depth, which is a heuristic dimension, rather than
    # by the state length, which is an engineering one.
    grind = (swept_height - length_mm) / 2.0
    nominal_grind = end_model.grind_depth_fraction * d

    if grind <= CAD_LINEAR_TOL_MM:
        raise GrindFailureError(
            f"The {configuration} state leaves no material to grind.",
            [
                f"Swept height {swept_height:.4f} mm vs requested {length_mm:.4f} mm.",
                "The seating planes would not intersect the wire, so no planar "
                "bearing face could be formed.",
            ],
        )
    if grind >= r - CAD_LINEAR_TOL_MM:
        raise GrindFailureError(
            f"The {configuration} state would grind through the end coil.",
            [
                f"Required grind depth {grind:.4f} mm exceeds the wire radius {r:.4f} mm.",
            ],
        )

    z_bottom = bb.min.Z + grind
    try:
        span = 4.0 * geom.outer_diameter
        trim_box = Pos(0, 0, z_bottom + length_mm / 2.0) * Box(span, span, length_mm)
        ground = swept & trim_box
        ground = Pos(0, 0, -z_bottom) * ground     # seat the part on Z = 0
    except Exception as exc:  # noqa: BLE001
        raise GrindFailureError(
            f"The seating-plane Boolean failed for the {configuration} state.",
            [str(exc)],
        ) from exc

    if ground is None or ground.is_null or not ground.is_valid:
        raise GrindFailureError(
            f"Grinding the {configuration} state produced an invalid solid.")

    # -- 6. cheap structural checks (full validation lives in validation.py)
    final_bb = ground.bounding_box()
    if abs(final_bb.min.Z) > CAD_LENGTH_VALIDATION_TOL_MM or \
            abs(final_bb.max.Z - length_mm) > CAD_LENGTH_VALIDATION_TOL_MM:
        raise InvalidBrepError(
            f"The ground {configuration} solid does not sit exactly between the seating planes.",
            [
                f"Bounding box Z: [{final_bb.min.Z:.6f}, {final_bb.max.Z:.6f}] mm",
                f"Expected: [0, {length_mm:.6f}] mm",
            ],
        )

    measured_od = max(final_bb.max.X - final_bb.min.X, final_bb.max.Y - final_bb.min.Y)

    return BuiltSpring(
        solid=ground,
        length_mm=length_mm,
        active_pitch_mm=p_active,
        grind_depth_mm=grind,
        nominal_grind_depth_mm=nominal_grind,
        min_one_turn_rise_mm=min_rise,
        swept_height_mm=swept_height,
        measured_od_mm=measured_od,
        configuration=configuration,
    )


def planar_seating_faces(solid, length_mm: float) -> tuple[int, int]:
    """
    Count planar faces lying in the two seating planes.

    Used by validation and by the tests that assert the ground bearing faces
    really exist in the B-rep rather than only in a viewport.
    """
    bottom = top = 0
    for face in solid.faces():
        if face.geom_type != GeomType.PLANE:
            continue
        fb = face.bounding_box()
        if abs(fb.max.Z - fb.min.Z) > CAD_LINEAR_TOL_MM:
            continue  # not perpendicular to the axis
        z = (fb.max.Z + fb.min.Z) / 2.0
        if abs(z) <= CAD_LENGTH_VALIDATION_TOL_MM:
            bottom += 1
        elif abs(z - length_mm) <= CAD_LENGTH_VALIDATION_TOL_MM:
            top += 1
    return bottom, top


def grind_depth_within_nominal(built: BuiltSpring) -> bool:
    """True when the realised grind depth is close to the heuristic nominal."""
    return abs(built.grind_depth_mm - built.nominal_grind_depth_mm) <= CAD_GRIND_DEPTH_TOL_MM
