"""
Output packaging: manifest, ZIP bundles, and the side-by-side STEP assembly.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import datetime, timezone

from build123d import Compound, Pos

from .errors import PackagingError
from .spring_end_model import (
    CAD_GENERATOR_VERSION,
    END_MODEL_VERSION,
    EndModelV1,
)
from .schemas import CONFIGURATION_META, CadSpringRequest
from .spring_geometry import BuiltSpring, SpringGeometryMm
from .tolerances import (
    CAD_GRIND_DEPTH_TOL_MM,
    CAD_LENGTH_VALIDATION_TOL_MM,
    CAD_LINEAR_TOL_MM,
    CAD_OD_VALIDATION_TOL_MM,
    CAD_TANGENCY_CLEARANCE_MM,
    IN_TO_MM,
    SAMPLES_PER_TURN,
)

ZIP_CONTENT_TYPE = "application/zip"

#: Centre-to-centre spacing of assembly components, in multiples of OD.
ASSEMBLY_SPACING_OD_MULTIPLE = 1.75

DISCLAIMERS = [
    "Nominal engineering CAD representation.",
    "Not vendor validated.",
    "State geometry is a geometric configuration representation, not FEA deformation.",
    "Exact squared/ground end manufacturing geometry remains supplier dependent.",
]


def safe_token(value: str) -> str:
    """Filesystem-safe form of a candidate key."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_")
    return cleaned or "candidate"


def step_filename(candidate_key: str, configuration: str) -> str:
    return f"spring_{safe_token(candidate_key)}_{CONFIGURATION_META[configuration]['token']}.step"


def assembly_filename(candidate_key: str) -> str:
    return f"spring_{safe_token(candidate_key)}_ALL_STATES.step"


def zip_filename(candidate_key: str) -> str:
    return f"SpringCandidate_{safe_token(candidate_key)}_CAD.zip"


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def build_manifest(request: CadSpringRequest, geom: SpringGeometryMm,
                   built: dict[str, BuiltSpring], reports: dict[str, dict],
                   end_model: EndModelV1, warnings: list[str]) -> dict:
    """Provenance for the generated package. Everything a reviewer needs to
    tell what is measured, what is assumed, and what is unverified."""
    g = request.geometry
    s = request.states

    return {
        "candidateKey": request.candidateKey,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cadGeneratorVersion": CAD_GENERATOR_VERSION,
        "endModelVersion": END_MODEL_VERSION,
        "units": {
            "requestUnits": "in",
            "cadUnits": "mm",
            "conversion": f"1 in = {IN_TO_MM} mm",
            "stepUnits": "mm",
        },
        "geometry": {
            "d": g.wireDiameterIn,
            "D": g.meanDiameterIn,
            "OD": g.outerDiameterIn,
            "ID": g.innerDiameterIn,
            "Na": g.activeCoils,
            "Nt": g.totalCoils,
        },
        "stateLengths": {
            "Lf": s.freeLengthIn,
            "Lc": s.armedLengthIn,
            "L2": s.contactLengthIn,
            "L3": s.releaseLengthIn,
        },
        "generatedConfigurations": [
            {
                "key": key,
                "label": CONFIGURATION_META[key]["label"],
                "requestedLengthIn": round(built[key].length_mm / IN_TO_MM, 6),
                "requestedLengthMm": round(built[key].length_mm, 6),
                "file": step_filename(request.candidateKey, key),
            }
            for key in built
        ],
        "performance": (request.performance.model_dump(exclude_none=True)
                        if request.performance else None),
        "materialName": request.materialName,
        "handedness": request.handedness,
        "endModelParameters": end_model.as_metadata(),
        "cadTolerances": {
            "linearToleranceMm": CAD_LINEAR_TOL_MM,
            "lengthValidationToleranceMm": CAD_LENGTH_VALIDATION_TOL_MM,
            "odValidationToleranceMm": CAD_OD_VALIDATION_TOL_MM,
            "grindDepthToleranceMm": CAD_GRIND_DEPTH_TOL_MM,
            "coilTangencyClearanceMm": CAD_TANGENCY_CLEARANCE_MM,
            "centerlineSamplesPerTurn": SAMPLES_PER_TURN,
        },
        "validation": reports,
        "warnings": warnings,
        "notes": DISCLAIMERS,
    }


README_TEMPLATE = """\
Spring CAD package
==================

Candidate : {candidate}
Generated : {timestamp}
Generator : {generator} / end model {end_model}
Units     : millimetres (STEP), converted from inches at 1 in = 25.4 mm

Contents
--------
{file_list}
candidate_manifest.json   full provenance, dimensions, tolerances, validation

What these files are
--------------------
True B-rep STEP geometry, exported directly from the OpenCascade kernel via
build123d. No mesh or STL intermediate exists anywhere in the pipeline. Each
file is one continuous swept round-wire spring with squared (closed) ends that
have been trimmed by real planar Boolean cuts, so the flat bearing faces are
actual planar surfaces in the solid.

Every configuration is the SAME nominal spring: identical d, D, OD, ID, Na and
Nt. Only the active-coil pitch differs, solved so that each state reaches its
requested overall length geometrically. Nothing is scaled in Z and the circular
wire section is never distorted.

What these files are NOT
------------------------
{disclaimers}

The four states are geometric configuration representations. They are not FEA
solutions and do not model coil-contact redistribution, presetting, relaxation,
residual stress, or grinding-process variation.

The end-form heuristics (how the inactive end turn is split between the closed
bearing region and the tangent transition, and how much wire the grind removes)
are CAD representation choices, documented in the manifest under
endModelParameters. Confirm them with your spring vendor before manufacture.
"""


def build_readme(request: CadSpringRequest, manifest: dict, configurations: list[str]) -> str:
    file_list = "\n".join(
        f"{step_filename(request.candidateKey, key):<25} {CONFIGURATION_META[key]['label']}"
        for key in configurations
    )
    return README_TEMPLATE.format(
        candidate=request.candidateKey,
        timestamp=manifest["timestamp"],
        generator=CAD_GENERATOR_VERSION,
        end_model=END_MODEL_VERSION,
        file_list=file_list,
        disclaimers="\n".join(f"- {d}" for d in DISCLAIMERS),
    )


# ---------------------------------------------------------------------------
# ZIP
# ---------------------------------------------------------------------------

def build_zip(step_files: dict[str, bytes], manifest: dict, readme: str) -> bytes:
    """
    Bundle the selected STEP files with the manifest and README.

    Deterministic: fixed member timestamps and sorted-by-insertion order, so
    the same request produces the same archive bytes.
    """
    try:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for name, data in step_files.items():
                info = zipfile.ZipInfo(name, date_time=(2000, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                zf.writestr(info, data)

            info = zipfile.ZipInfo("candidate_manifest.json", date_time=(2000, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, json.dumps(manifest, indent=2, sort_keys=True))

            info = zipfile.ZipInfo("README.txt", date_time=(2000, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, readme)

        return buffer.getvalue()
    except Exception as exc:  # noqa: BLE001
        raise PackagingError("Could not build the ZIP package.", [str(exc)]) from exc


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def build_assembly(built: dict[str, BuiltSpring], geom: SpringGeometryMm):
    """
    One STEP assembly with the selected states laid out side by side along X.

    This is a design-review artifact for visual comparison only. It does not
    imply the four states coexist in the mechanism.
    """
    try:
        spacing = ASSEMBLY_SPACING_OD_MULTIPLE * geom.outer_diameter
        keys = list(built.keys())
        offset0 = -spacing * (len(keys) - 1) / 2.0

        children = []
        for i, key in enumerate(keys):
            part = Pos(offset0 + i * spacing, 0, 0) * built[key].solid
            part.label = CONFIGURATION_META[key]["component"]
            children.append(part)

        assembly = Compound(children=children)
        assembly.label = "SPRING_STATES"
        return assembly
    except Exception as exc:  # noqa: BLE001
        raise PackagingError("Could not build the STEP assembly.", [str(exc)]) from exc
