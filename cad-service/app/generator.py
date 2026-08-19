"""
Orchestration: request -> validated candidate -> solids -> STEP -> package.

Kept separate from `main.py` so tests can drive the whole pipeline without an
HTTP layer.

The response always carries the artifacts the caller should download in
`files`. The service decides single-STEP vs ZIP vs assembly; the browser never
has to infer it, so there is no path where a "success" produces no download.
"""

from __future__ import annotations

import base64
import os

from .errors import CadError
from .export import (
    STEP_CONTENT_TYPE,
    export_solid_to_step_bytes,
    verify_step_roundtrip,
)
from .packaging import (
    ZIP_CONTENT_TYPE,
    assembly_filename,
    build_assembly,
    build_manifest,
    build_readme,
    build_zip,
    step_filename,
    zip_filename,
)
from .schemas import CONFIGURATION_META, CadFile, CadSpringRequest, CadSpringResponse
from .spring_end_model import CAD_END_MODEL_V1, minimum_buildable_length_mm
from .spring_geometry import BuiltSpring, build_spring_state, grind_depth_within_nominal
from .validation import validate_brep, validate_candidate_consistency

#: Round-trip every exported STEP through the kernel before returning it.
#: Costs roughly as much as the export itself; worth it, because a file that
#: cannot be re-read is worse than a clear error. Set CAD_VERIFY_ROUNDTRIP=0 to
#: skip it in latency-sensitive deployments.
VERIFY_ROUNDTRIP = os.environ.get("CAD_VERIFY_ROUNDTRIP", "1") not in ("0", "false", "False")


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _as_file(name: str, data: bytes, content_type: str,
             configuration: str | None = None) -> CadFile:
    return CadFile(
        filename=name,
        content=_b64(data),
        contentType=content_type,
        configuration=configuration,
        byteLength=len(data),
    )


def generate_cad(request: CadSpringRequest) -> CadSpringResponse:
    """Run the full pipeline. Raises CadError subclasses on any failure."""
    geom = request.geometry.to_mm()
    end_model = CAD_END_MODEL_V1
    warnings: list[str] = []

    # 1. the candidate must be self-consistent before we model anything
    validate_candidate_consistency(geom)

    configurations = request.ordered_configurations()
    if not configurations:
        raise CadError("No configurations were requested.")

    # 2. build + validate each state
    built: dict[str, BuiltSpring] = {}
    reports: dict[str, dict] = {}
    step_bytes: dict[str, bytes] = {}

    min_len = minimum_buildable_length_mm(geom.total_coils, geom.wire_diameter, end_model)

    for key in configurations:
        length_mm = request.states.length_mm(key)
        label = CONFIGURATION_META[key]["label"]

        solid = build_spring_state(geom, length_mm, key, request.handedness, end_model)
        report = validate_brep(solid, geom)

        data = export_solid_to_step_bytes(solid.solid, label)
        if VERIFY_ROUNDTRIP:
            report_extra = verify_step_roundtrip(
                data, label, expected_height_mm=length_mm, expected_od_mm=geom.outer_diameter)
            reports_dict = report.as_dict() | report_extra
        else:
            reports_dict = report.as_dict() | {"reimportValid": None}

        if not grind_depth_within_nominal(solid):
            warnings.append(
                f"{label}: realised grind depth {solid.grind_depth_mm:.4f} mm differs from the "
                f"nominal heuristic {solid.nominal_grind_depth_mm:.4f} mm.")

        # tangency, not penetration - worth surfacing, not worth failing
        if solid.min_one_turn_rise_mm <= geom.wire_diameter * 1.001:
            warnings.append(
                f"{label}: coils are effectively touching at this length "
                f"(one-turn rise {solid.min_one_turn_rise_mm:.4f} mm vs wire "
                f"{geom.wire_diameter:.4f} mm). This state is at or near solid height.")

        built[key] = solid
        reports[key] = reports_dict
        step_bytes[step_filename(request.candidateKey, key)] = data

    if min_len > 0:
        reports["nominalSolidHeightMm"] = round(min_len, 6)

    manifest = build_manifest(request, geom, built, reports, end_model, warnings)

    # 3. package
    files: list[CadFile] = []

    if request.packageMode == "assembly-step":
        assembly = build_assembly(built, geom)
        data = export_solid_to_step_bytes(assembly, "all-states assembly")
        files.append(_as_file(assembly_filename(request.candidateKey), data, STEP_CONTENT_TYPE))
        warnings.append(
            "The assembly places the selected states side by side for review only; "
            "they do not coexist in the mechanism.")

    elif len(configurations) == 1:
        key = configurations[0]
        name = step_filename(request.candidateKey, key)
        files.append(_as_file(name, step_bytes[name], STEP_CONTENT_TYPE, configuration=key))

    else:
        readme = build_readme(request, manifest, configurations)
        data = build_zip(step_bytes, manifest, readme)
        files.append(_as_file(zip_filename(request.candidateKey), data, ZIP_CONTENT_TYPE))

    return CadSpringResponse(
        candidateKey=request.candidateKey,
        configurations=configurations,
        packageMode=request.packageMode,
        files=files,
        manifest=manifest,
        warnings=warnings,
    )
