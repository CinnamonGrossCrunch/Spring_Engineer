"""
Geometry construction: does the B-rep actually carry the dimensions we asked
for, and do the end-model invariants hold?
"""

from __future__ import annotations

import math

import pytest

from app.errors import CoilInterferenceError, GeometryInconsistentError
from app.spring_end_model import (
    CAD_END_MODEL_V1,
    EndModelV1,
    SpringPitchProfile,
    closed_pitch_mm,
    minimum_buildable_length_mm,
    smoothstep,
    solve_active_pitch_mm,
)
from app.spring_geometry import (
    _centerline_points,
    build_spring_state,
    planar_seating_faces,
)
from app.tolerances import CAD_LENGTH_VALIDATION_TOL_MM, CAD_OD_VALIDATION_TOL_MM, IN_TO_MM
from app.validation import validate_brep, validate_candidate_consistency

from .fixtures import (
    coil_crossing_count,
    geometry_mm,
    measured_inner_radius,
    measured_wire_diameter,
    state_length_mm,
)


@pytest.fixture(scope="module")
def free_spring():
    geom = geometry_mm()
    return geom, build_spring_state(geom, state_length_mm("free"), "free")


# ---------------------------------------------------------------- basics ---

def test_generates_one_valid_solid(free_spring):
    geom, built = free_spring
    report = validate_brep(built, geom)
    assert report.is_valid
    assert report.is_manifold
    assert report.solid_count == 1
    assert report.volume_mm3 > 0
    assert math.isfinite(report.volume_mm3)


def test_all_expected_checks_ran(free_spring):
    geom, built = free_spring
    report = validate_brep(built, geom)
    for check in ("shape.is_valid", "shape.is_manifold", "single_solid",
                  "finite_positive_volume", "finite_bounding_box",
                  "height_matches_requested_state", "no_material_outside_seating_planes",
                  "od_matches_candidate", "planar_bearing_faces_present"):
        assert check in report.checks


# ------------------------------------------------------------ dimensions ---

def test_wire_diameter_is_real(free_spring):
    """The swept section must measure d, not merely be requested as d."""
    geom, built = free_spring
    measured = measured_wire_diameter(built.solid, geom, built.length_mm)
    assert measured == pytest.approx(geom.wire_diameter, abs=CAD_OD_VALIDATION_TOL_MM)


def test_increasing_wire_diameter_thickens_the_wire():
    thin = geometry_mm(d_in=0.120)
    thick = geometry_mm(d_in=0.170)
    b_thin = build_spring_state(thin, state_length_mm("free"), "free")
    b_thick = build_spring_state(thick, state_length_mm("free"), "free")

    m_thin = measured_wire_diameter(b_thin.solid, thin, b_thin.length_mm)
    m_thick = measured_wire_diameter(b_thick.solid, thick, b_thick.length_mm)

    assert m_thin == pytest.approx(thin.wire_diameter, abs=CAD_OD_VALIDATION_TOL_MM)
    assert m_thick == pytest.approx(thick.wire_diameter, abs=CAD_OD_VALIDATION_TOL_MM)
    assert m_thick > m_thin


def test_mean_diameter_sets_the_radial_envelope():
    small = geometry_mm(od_in=0.900)
    large = geometry_mm(od_in=1.300)
    b_small = build_spring_state(small, state_length_mm("free"), "free")
    b_large = build_spring_state(large, state_length_mm("free"), "free")

    assert b_small.measured_od_mm == pytest.approx(
        small.outer_diameter, abs=CAD_OD_VALIDATION_TOL_MM)
    assert b_large.measured_od_mm == pytest.approx(
        large.outer_diameter, abs=CAD_OD_VALIDATION_TOL_MM)
    assert b_large.measured_od_mm > b_small.measured_od_mm


def test_inner_diameter_is_real(free_spring):
    geom, built = free_spring
    inner = measured_inner_radius(built.solid, geom, built.length_mm)
    assert inner == pytest.approx(geom.inner_diameter / 2.0, abs=CAD_OD_VALIDATION_TOL_MM)


def test_coil_count_changes_the_turn_count():
    """A wire of Nt turns crosses the theta = 0 half-plane Nt + 1 times."""
    for na, nt in ((3.0, 5.0), (4.0, 6.0)):
        geom = geometry_mm(na=na, nt=nt)
        built = build_spring_state(geom, state_length_mm("free"), "free")
        assert coil_crossing_count(built.solid, geom, built.length_mm) == int(nt) + 1


# ------------------------------------------------------------- end model ---

def test_smoothstep_is_tangent_continuous():
    assert smoothstep(0.0) == 0.0
    assert smoothstep(1.0) == 1.0
    # numerical derivative vanishes at both ends -> no kink in the pitch profile
    h = 1e-6
    assert abs((smoothstep(h) - smoothstep(0.0)) / h) < 1e-4
    assert abs((smoothstep(1.0) - smoothstep(1.0 - h)) / h) < 1e-4


def test_pitch_profile_is_continuous_across_the_transition():
    geom = geometry_mm()
    p_a = solve_active_pitch_mm(state_length_mm("free"), geom.total_coils, geom.wire_diameter)
    profile = SpringPitchProfile(geom.total_coils, geom.wire_diameter, p_a)

    # sample densely across both junctions and assert no jump
    previous = profile.pitch_at(0.0)
    for i in range(1, 4001):
        t = profile.Nt * i / 4000
        current = profile.pitch_at(t)
        assert abs(current - previous) < p_a * 0.01, f"pitch jump at t={t}"
        previous = current


def test_length_solve_round_trips_exactly():
    geom = geometry_mm()
    for length_in in (0.80, 1.20, 1.90, 2.50, 3.10):
        target = length_in * IN_TO_MM
        p_a = solve_active_pitch_mm(target, geom.total_coils, geom.wire_diameter)
        profile = SpringPitchProfile(geom.total_coils, geom.wire_diameter, p_a)
        gdf = CAD_END_MODEL_V1.grind_depth_fraction
        reconstructed = (profile.centerline_rise() + geom.wire_diameter
                         - 2.0 * gdf * geom.wire_diameter)
        assert reconstructed == pytest.approx(target, abs=1e-9)


def test_minimum_buildable_length_matches_textbook_solid_height():
    """
    With the default heuristics the model reduces to Hs = Nt * d, so CAD
    validity and the engineering solid-height limit agree.
    """
    geom = geometry_mm()
    expected = geom.total_coils * geom.wire_diameter
    actual = minimum_buildable_length_mm(geom.total_coils, geom.wire_diameter)
    # differs only by the documented tangency clearance, applied once per turn
    assert actual == pytest.approx(expected, abs=0.01)


def test_end_model_rejects_inconsistent_parameters():
    with pytest.raises(ValueError):
        EndModelV1(end_turns_per_side=1.0, closed_turns=0.75, transition_turns=0.5)
    with pytest.raises(ValueError):
        EndModelV1(transition_turns=0.0, closed_turns=1.0)
    with pytest.raises(ValueError):
        EndModelV1(grind_depth_fraction=1.5)


def test_closed_pitch_prevents_interpenetration():
    """
    The whole point of the pitch floor: the one-turn rise never drops below d,
    so wire never passes through wire, in any buildable state.
    """
    geom = geometry_mm()
    for length_in in (0.72, 0.90, 1.40, 1.90, 2.50):
        target = length_in * IN_TO_MM
        if target < minimum_buildable_length_mm(geom.total_coils, geom.wire_diameter):
            continue
        p_a = solve_active_pitch_mm(target, geom.total_coils, geom.wire_diameter)
        profile = SpringPitchProfile(geom.total_coils, geom.wire_diameter, p_a)
        assert profile.min_one_turn_rise() >= geom.wire_diameter - 1e-9


def test_closed_pitch_equals_wire_diameter_plus_clearance():
    geom = geometry_mm()
    assert closed_pitch_mm(geom.wire_diameter) > geom.wire_diameter


# ------------------------------------------------------- input validation ---

def test_consistent_candidate_passes():
    validate_candidate_consistency(geometry_mm())


def test_bad_outer_diameter_is_reported():
    geom = geometry_mm()
    broken = type(geom)(
        wire_diameter=geom.wire_diameter,
        mean_diameter=geom.mean_diameter * 1.30,   # D no longer OD - d
        outer_diameter=geom.outer_diameter,
        inner_diameter=geom.inner_diameter,
        active_coils=geom.active_coils,
        total_coils=geom.total_coils,
    )
    with pytest.raises(GeometryInconsistentError) as exc:
        validate_candidate_consistency(broken)
    assert any("Mean diameter" in d for d in exc.value.details)


def test_bad_coil_relationship_is_reported():
    geom = geometry_mm(na=3.0, nt=8.0)   # Nt != Na + 2
    with pytest.raises(GeometryInconsistentError) as exc:
        validate_candidate_consistency(geom)
    assert any("Total coils" in d for d in exc.value.details)


def test_geometry_is_never_silently_reinterpreted():
    """An inconsistent candidate must raise, not be quietly corrected."""
    geom = geometry_mm()
    broken = type(geom)(
        wire_diameter=geom.wire_diameter,
        mean_diameter=geom.mean_diameter,
        outer_diameter=geom.outer_diameter,
        inner_diameter=geom.inner_diameter * 0.5,
        active_coils=geom.active_coils,
        total_coils=geom.total_coils,
    )
    with pytest.raises(GeometryInconsistentError):
        validate_candidate_consistency(broken)


# ------------------------------------------------------------ interference ---

def test_below_solid_height_fails_cleanly():
    """Not a corrupt STEP, not a silent dimension change - a typed error."""
    geom = geometry_mm()
    impossible = 0.5 * geom.total_coils * geom.wire_diameter  # far below solid
    with pytest.raises(CoilInterferenceError) as exc:
        build_spring_state(geom, impossible, "armed")
    assert "solid height" in " ".join(exc.value.details).lower()


def test_zero_length_fails_cleanly():
    geom = geometry_mm()
    with pytest.raises(Exception):
        build_spring_state(geom, 0.0, "armed")


def test_exact_solid_height_is_allowed_as_tangency():
    """Tangency is legal; only penetration is not."""
    geom = geometry_mm()
    at_solid = minimum_buildable_length_mm(geom.total_coils, geom.wire_diameter)
    built = build_spring_state(geom, at_solid, "armed")
    report = validate_brep(built, geom)
    assert report.is_valid
    assert report.measured_height_mm == pytest.approx(
        at_solid, abs=CAD_LENGTH_VALIDATION_TOL_MM)


# ------------------------------------------------------------- handedness ---

def test_left_hand_centerline_is_an_exact_mirror():
    """Handedness flips the winding sense and nothing else."""
    geom = geometry_mm()
    p_a = solve_active_pitch_mm(state_length_mm("free"), geom.total_coils, geom.wire_diameter)
    profile = SpringPitchProfile(geom.total_coils, geom.wire_diameter, p_a)

    right = _centerline_points(geom, profile, "right")
    left = _centerline_points(geom, profile, "left")

    assert len(right) == len(left)
    for (xr, yr, zr), (xl, yl, zl) in zip(right, left):
        assert xl == pytest.approx(xr, abs=1e-12)
        assert yl == pytest.approx(-yr, abs=1e-12)
        assert zl == pytest.approx(zr, abs=1e-12)


def test_left_hand_winding_builds_the_same_spring():
    geom = geometry_mm()
    right = build_spring_state(geom, state_length_mm("free"), "free", handedness="right")
    left = build_spring_state(geom, state_length_mm("free"), "free", handedness="left")

    assert left.measured_od_mm == pytest.approx(right.measured_od_mm, abs=1e-6)
    assert left.length_mm == pytest.approx(right.length_mm, abs=1e-9)
    assert left.active_pitch_mm == pytest.approx(right.active_pitch_mm, rel=1e-12)

    # Volumes agree to within the kernel's surface-approximation error. They are
    # not bit-identical because the Frenet frame of a left-hand helix produces a
    # differently parameterised (but geometrically mirrored) swept surface.
    assert left.solid.volume == pytest.approx(right.solid.volume, rel=2e-3)

    bottom, top = planar_seating_faces(left.solid, left.length_mm)
    assert bottom >= 1 and top >= 1
