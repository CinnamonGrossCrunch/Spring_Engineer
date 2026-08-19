"""
Structured CAD errors.

Every failure the service can produce is one of these, so the API layer never
has to translate a raw exception (or leak a Python traceback) to the browser.
"""

from __future__ import annotations


class CadError(Exception):
    """Base class for all CAD failures that should reach the user as data."""

    code = "CAD_ERROR"
    http_status = 400

    def __init__(self, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or []

    def to_dict(self, candidate_key: str | None = None) -> dict:
        payload = {
            "success": False,
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }
        if candidate_key is not None:
            payload["candidateKey"] = candidate_key
        return payload


class GeometryInconsistentError(CadError):
    """Redundant candidate values disagree (OD vs D + d, Nt vs Na + 2, ...)."""

    code = "GEOMETRY_INCONSISTENT"


class InvalidStateLengthError(CadError):
    """A requested state length cannot be built (typically below solid height)."""

    code = "INVALID_STATE_LENGTH"


class CoilInterferenceError(CadError):
    """The requested configuration would drive wire volume through wire volume."""

    code = "COIL_INTERFERENCE"


class SweepFailureError(CadError):
    """OpenCascade could not produce a valid swept solid."""

    code = "SWEEP_FAILED"
    http_status = 422


class GrindFailureError(CadError):
    """The planar seating-plane Boolean failed or produced invalid topology."""

    code = "GRIND_FAILED"
    http_status = 422


class InvalidBrepError(CadError):
    """The finished solid failed B-rep validation, so it must not be exported."""

    code = "INVALID_BREP"
    http_status = 422


class StepExportError(CadError):
    """STEP writing or the verification re-import failed."""

    code = "STEP_EXPORT_FAILED"
    http_status = 500


class PackagingError(CadError):
    """ZIP or STEP-assembly packaging failed."""

    code = "PACKAGING_FAILED"
    http_status = 500
