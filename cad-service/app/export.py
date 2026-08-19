"""
STEP export, straight from the B-rep.

There is no mesh anywhere in this path: the solid produced by the sweep and
grind Booleans is handed directly to OpenCascade's STEP writer. No STL, no
triangulation, no hand-written STEP text.

Determinism: the STEP header carries a creation timestamp, which would
otherwise make byte-identical inputs produce byte-different files. We pin it to
a fixed epoch so the same request always yields the same bytes, and record the
real generation time in the manifest instead.
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from io import BytesIO

from build123d import PrecisionMode, Unit, export_step, import_step

from .errors import StepExportError
from .tolerances import CAD_LENGTH_VALIDATION_TOL_MM, CAD_OD_VALIDATION_TOL_MM

#: Fixed STEP header timestamp; see module docstring.
DETERMINISTIC_TIMESTAMP = datetime(2000, 1, 1, tzinfo=timezone.utc)

STEP_CONTENT_TYPE = "application/step"


def export_solid_to_step_bytes(solid, label: str) -> bytes:
    """Write a solid to STEP in memory, in millimetres."""
    buffer = BytesIO()
    try:
        ok = export_step(
            solid,
            buffer,
            unit=Unit.MM,
            write_pcurves=True,
            precision_mode=PrecisionMode.AVERAGE,
            timestamp=DETERMINISTIC_TIMESTAMP,
        )
    except Exception as exc:  # noqa: BLE001
        raise StepExportError(f"STEP export failed for {label}.", [str(exc)]) from exc

    if not ok:
        raise StepExportError(f"STEP export reported failure for {label}.")

    data = buffer.getvalue()
    if not data:
        raise StepExportError(f"STEP export produced an empty file for {label}.")
    return data


def verify_step_roundtrip(step_bytes: bytes, label: str, expected_height_mm: float,
                          expected_od_mm: float) -> dict:
    """
    Read the STEP back and confirm it still describes the part we built.

    "export returned true" is not evidence that the file is usable, so this
    re-imports through OpenCascade and re-measures. Returns the measurements
    for the manifest; raises StepExportError if the file does not survive.
    """
    handle, path = tempfile.mkstemp(suffix=".step")
    try:
        with os.fdopen(handle, "wb") as fh:
            fh.write(step_bytes)

        try:
            reimported = import_step(path)
        except Exception as exc:  # noqa: BLE001
            raise StepExportError(
                f"The exported STEP for {label} could not be read back.",
                [str(exc)]) from exc

        if reimported is None or reimported.is_null:
            raise StepExportError(f"Re-importing the STEP for {label} produced an empty shape.")
        if not reimported.is_valid:
            raise StepExportError(f"The re-imported STEP for {label} is not a valid shape.")

        bb = reimported.bounding_box()
        height = bb.max.Z - bb.min.Z
        od = max(bb.max.X - bb.min.X, bb.max.Y - bb.min.Y)

        problems = []
        if abs(height - expected_height_mm) > CAD_LENGTH_VALIDATION_TOL_MM:
            problems.append(
                f"Round-tripped height {height:.6f} mm != expected {expected_height_mm:.6f} mm.")
        if abs(od - expected_od_mm) > CAD_OD_VALIDATION_TOL_MM:
            problems.append(
                f"Round-tripped radial envelope {od:.4f} mm != expected {expected_od_mm:.4f} mm.")
        if problems:
            raise StepExportError(
                f"The exported STEP for {label} does not round-trip dimensionally.", problems)

        return {
            "reimportValid": True,
            "roundTripHeightMm": round(height, 6),
            "roundTripOdMm": round(od, 6),
        }
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
