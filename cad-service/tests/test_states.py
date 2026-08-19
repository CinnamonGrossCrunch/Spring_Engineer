"""
The four configurations: each must hit its requested length exactly, and all
four must be the same nominal spring.
"""

from __future__ import annotations

import pytest

from app.spring_geometry import build_spring_state, planar_seating_faces
from app.tolerances import (
    CAD_LENGTH_VALIDATION_TOL_MM,
    CAD_OD_VALIDATION_TOL_MM,
    IN_TO_MM,
)
from app.validation import validate_brep

from .fixtures import (
    STATE_LENGTH_IN,
    coil_crossing_count,
    geometry_mm,
    measured_inner_radius,
    measured_wire_diameter,
    state_length_mm,
)

CONFIGURATIONS = ["free", "armed", "contact", "release"]


@pytest.fixture(scope="module")
def all_states():
    """Build every configuration once; the suite reuses them."""
    geom = geometry_mm()
    return geom, {c: build_spring_state(geom, state_length_mm(c), c) for c in CONFIGURATIONS}


# ------------------------------------------------------------- lengths ---

@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_state_height_matches_requested_length(all_states, configuration):
    geom, built = all_states
    spring = built[configuration]
    expected = STATE_LENGTH_IN[configuration] * IN_TO_MM
    bb = spring.solid.bounding_box()
    assert (bb.max.Z - bb.min.Z) == pytest.approx(expected, abs=CAD_LENGTH_VALIDATION_TOL_MM)


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_state_seats_on_the_origin_plane(all_states, configuration):
    geom, built = all_states
    bb = built[configuration].solid.bounding_box()
    assert bb.min.Z == pytest.approx(0.0, abs=CAD_LENGTH_VALIDATION_TOL_MM)


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_no_material_beyond_the_grind_planes(all_states, configuration):
    geom, built = all_states
    spring = built[configuration]
    bb = spring.solid.bounding_box()
    assert bb.min.Z >= -CAD_LENGTH_VALIDATION_TOL_MM
    assert bb.max.Z <= spring.length_mm + CAD_LENGTH_VALIDATION_TOL_MM


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_planar_bearing_faces_exist_in_the_brep(all_states, configuration):
    """
    The ground faces must be real planar geometry in the solid, not a viewport
    clip. Counted from the topology.
    """
    geom, built = all_states
    spring = built[configuration]
    bottom, top = planar_seating_faces(spring.solid, spring.length_mm)
    assert bottom >= 1, "no planar bearing face at Z = 0"
    assert top >= 1, f"no planar bearing face at Z = {spring.length_mm}"


# ------------------------------------------- same spring in every state ---

def test_all_states_share_the_same_radial_envelope(all_states):
    geom, built = all_states
    for configuration in CONFIGURATIONS:
        assert built[configuration].measured_od_mm == pytest.approx(
            geom.outer_diameter, abs=CAD_OD_VALIDATION_TOL_MM)


def test_all_states_share_the_same_wire_diameter(all_states):
    geom, built = all_states
    for configuration in CONFIGURATIONS:
        spring = built[configuration]
        measured = measured_wire_diameter(spring.solid, geom, spring.length_mm)
        assert measured == pytest.approx(geom.wire_diameter, abs=CAD_OD_VALIDATION_TOL_MM), \
            f"{configuration} wire section differs - the section must not be distorted"


def test_all_states_share_the_same_inner_diameter(all_states):
    geom, built = all_states
    for configuration in CONFIGURATIONS:
        spring = built[configuration]
        inner = measured_inner_radius(spring.solid, geom, spring.length_mm)
        assert inner == pytest.approx(geom.inner_diameter / 2.0, abs=CAD_OD_VALIDATION_TOL_MM)


def test_all_states_share_the_same_coil_count(all_states):
    geom, built = all_states
    counts = {c: coil_crossing_count(built[c].solid, geom, built[c].length_mm)
              for c in CONFIGURATIONS}
    assert len(set(counts.values())) == 1, f"coil count varies between states: {counts}"
    assert set(counts.values()) == {int(geom.total_coils) + 1}


def test_only_the_pitch_differs_between_states(all_states):
    """Shorter state -> smaller active pitch, strictly monotonic."""
    geom, built = all_states
    by_length = sorted(CONFIGURATIONS, key=lambda c: built[c].length_mm)
    pitches = [built[c].active_pitch_mm for c in by_length]
    assert pitches == sorted(pitches)
    assert len(set(pitches)) == len(pitches)


def test_states_are_not_z_scaled_copies(all_states):
    """
    A Z-scaled copy would keep volume proportional to height. Real re-pitching
    keeps the wire section constant, so volume barely moves while height varies
    by nearly 3x across the states.
    """
    geom, built = all_states
    volumes = [built[c].solid.volume for c in CONFIGURATIONS]
    heights = [built[c].length_mm for c in CONFIGURATIONS]

    assert max(heights) / min(heights) > 2.5
    assert max(volumes) / min(volumes) < 1.10


# ----------------------------------------------------------- validation ---

@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_every_state_passes_brep_validation(all_states, configuration):
    geom, built = all_states
    report = validate_brep(built[configuration], geom)
    assert report.is_valid
    assert report.is_manifold
    assert report.solid_count == 1
    assert report.bottom_seating_faces >= 1
    assert report.top_seating_faces >= 1


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_every_state_is_free_of_coil_interference(all_states, configuration):
    geom, built = all_states
    spring = built[configuration]
    assert spring.min_one_turn_rise_mm >= geom.wire_diameter - 1e-9
