"""
STEP round-trip.

"export_step returned True" proves nothing about whether the file is readable
or dimensionally faithful. Every test here writes a real STEP, reads it back
through OpenCascade, and re-measures the imported shape.
"""

from __future__ import annotations

import os
import re
import tempfile

import pytest
from build123d import import_step

from app.errors import StepExportError
from app.export import export_solid_to_step_bytes, verify_step_roundtrip
from app.spring_geometry import build_spring_state
from app.tolerances import CAD_LENGTH_VALIDATION_TOL_MM, CAD_OD_VALIDATION_TOL_MM

from .fixtures import geometry_mm, state_length_mm

CONFIGURATIONS = ["free", "armed", "contact", "release"]


@pytest.fixture(scope="module")
def exported():
    """Build and export every state once."""
    geom = geometry_mm()
    out = {}
    for configuration in CONFIGURATIONS:
        built = build_spring_state(geom, state_length_mm(configuration), configuration)
        out[configuration] = (built, export_solid_to_step_bytes(built.solid, configuration))
    return geom, out


def _reimport(step_bytes: bytes):
    handle, path = tempfile.mkstemp(suffix=".step")
    try:
        with os.fdopen(handle, "wb") as fh:
            fh.write(step_bytes)
        return import_step(path)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_step_is_written(exported, configuration):
    _geom, out = exported
    _built, data = out[configuration]
    assert len(data) > 0
    assert data.lstrip().startswith(b"ISO-10303-21")


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_step_declares_millimetres(exported, configuration):
    _geom, out = exported
    _built, data = out[configuration]
    header = data[:20000].decode("ascii", errors="replace").upper()
    assert "MILLI" in header or "MM" in header


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_step_reimports_as_a_valid_shape(exported, configuration):
    _geom, out = exported
    _built, data = out[configuration]
    shape = _reimport(data)
    assert shape is not None
    assert not shape.is_null
    assert shape.is_valid


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_roundtrip_preserves_height(exported, configuration):
    _geom, out = exported
    built, data = out[configuration]
    shape = _reimport(data)
    bb = shape.bounding_box()
    assert (bb.max.Z - bb.min.Z) == pytest.approx(
        built.length_mm, abs=CAD_LENGTH_VALIDATION_TOL_MM)


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_roundtrip_preserves_radial_envelope(exported, configuration):
    geom, out = exported
    _built, data = out[configuration]
    shape = _reimport(data)
    bb = shape.bounding_box()
    measured = max(bb.max.X - bb.min.X, bb.max.Y - bb.min.Y)
    assert measured == pytest.approx(geom.outer_diameter, abs=CAD_OD_VALIDATION_TOL_MM)


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_roundtrip_preserves_solid_topology(exported, configuration):
    _geom, out = exported
    _built, data = out[configuration]
    shape = _reimport(data)
    assert len(shape.solids()) == 1


@pytest.mark.parametrize("configuration", CONFIGURATIONS)
def test_verify_helper_accepts_a_good_file(exported, configuration):
    geom, out = exported
    built, data = out[configuration]
    result = verify_step_roundtrip(data, configuration, built.length_mm, geom.outer_diameter)
    assert result["reimportValid"] is True
    assert result["roundTripHeightMm"] == pytest.approx(
        built.length_mm, abs=CAD_LENGTH_VALIDATION_TOL_MM)


def test_verify_helper_rejects_a_dimensional_mismatch(exported):
    """Guard against the verifier rubber-stamping whatever it is handed."""
    geom, out = exported
    built, data = out["free"]
    with pytest.raises(StepExportError):
        verify_step_roundtrip(data, "free", built.length_mm * 2.0, geom.outer_diameter)


def test_verify_helper_rejects_unreadable_bytes():
    with pytest.raises(StepExportError):
        verify_step_roundtrip(b"not a step file at all", "junk", 10.0, 10.0)


def _normalise_occurrence_ids(step: bytes) -> bytes:
    """
    Blank out NEXT_ASSEMBLY_USAGE_OCCURRENCE's first field.

    OpenCascade increments that occurrence counter once per export for the
    lifetime of the process, so it differs between two exports in the same run
    while being identical across separate runs. It carries no geometry.
    """
    return re.sub(rb"NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'",
                  b"NEXT_ASSEMBLY_USAGE_OCCURRENCE('N'", step)


def test_export_is_deterministic(exported):
    """
    Same input -> same bytes, so a request can be cached, diffed or checksummed.
    The STEP header timestamp is pinned for this reason; the only remaining
    variance is OpenCascade's per-process occurrence counter.
    """
    geom, out = exported
    built, first = out["free"]
    second = export_solid_to_step_bytes(built.solid, "free")

    # Equality after normalising that one field proves every geometry entity,
    # every coordinate and the header are identical.
    assert _normalise_occurrence_ids(first) == _normalise_occurrence_ids(second)


def test_geometry_is_deterministic():
    """Rebuilding from the same inputs yields the same solid, not just the same file."""
    geom = geometry_mm()
    first = build_spring_state(geom, state_length_mm("free"), "free")
    second = build_spring_state(geom, state_length_mm("free"), "free")

    assert first.active_pitch_mm == pytest.approx(second.active_pitch_mm, rel=1e-12)
    assert first.grind_depth_mm == pytest.approx(second.grind_depth_mm, rel=1e-12)
    assert first.solid.volume == pytest.approx(second.solid.volume, rel=1e-12)


def test_no_mesh_representation_in_the_step(exported):
    """
    The STEP must describe B-rep entities, not a tessellation. A triangulated
    export would be dominated by TRIANGULATED_* / POLY_LOOP records.
    """
    _geom, out = exported
    _built, data = out["free"]
    text = data.decode("ascii", errors="replace").upper()
    assert "ADVANCED_BREP_SHAPE_REPRESENTATION" in text or "MANIFOLD_SOLID_BREP" in text
    assert "TRIANGULATED_FACE_SET" not in text
    assert "TESSELLATED_SHAPE_REPRESENTATION" not in text
