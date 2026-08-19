"""
HTTP surface: content on success, structured errors on failure, and never a
Python traceback.
"""

from __future__ import annotations

import base64
import io
import json
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.main import app

from .fixtures import reference_request

client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------- health ---

def test_health_reports_the_kernel():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["cadKernel"] == "OpenCascade"
    assert body["library"] == "build123d"
    assert body["libraryVersion"] != "unavailable"
    assert body["generatorVersion"]
    assert body["endModelVersion"] == "squared-ground-v1"


# -------------------------------------------------------------- generate ---

@pytest.fixture(scope="module")
def zip_response():
    return client.post("/generate", json=reference_request(packageMode="zip"))


def test_generate_all_states_as_zip(zip_response):
    assert zip_response.status_code == 200, zip_response.text
    body = zip_response.json()
    assert body["success"] is True
    assert body["configurations"] == ["free", "armed", "contact", "release"]
    assert len(body["files"]) == 1
    assert body["files"][0]["contentType"] == "application/zip"
    assert body["files"][0]["filename"].endswith(".zip")


def test_zip_contains_only_requested_states_plus_manifest(zip_response):
    payload = base64.b64decode(zip_response.json()["files"][0]["content"])
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        names = set(zf.namelist())
    assert names == {
        "spring_d143_Na300_FREE.step",
        "spring_d143_Na300_ARMED.step",
        "spring_d143_Na300_CONTACT.step",
        "spring_d143_Na300_RELEASE.step",
        "candidate_manifest.json",
        "README.txt",
    }


def test_manifest_carries_provenance(zip_response):
    payload = base64.b64decode(zip_response.json()["files"][0]["content"])
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        manifest = json.loads(zf.read("candidate_manifest.json"))

    assert manifest["candidateKey"] == "d143_Na300"
    assert manifest["cadGeneratorVersion"]
    assert manifest["endModelVersion"] == "squared-ground-v1"
    assert manifest["units"]["stepUnits"] == "mm"
    assert manifest["geometry"]["d"] == 0.143
    assert manifest["stateLengths"]["Lf"] == 2.500
    assert manifest["performance"]["k"] == 12.4
    assert manifest["materialName"] == "302 Stainless"
    assert manifest["handedness"] == "right"
    assert "endModelParameters" in manifest
    assert "cadTolerances" in manifest
    assert any("not FEA" in note or "not vendor" in note.lower()
               for note in manifest["notes"])


def test_manifest_records_validation_per_state(zip_response):
    payload = base64.b64decode(zip_response.json()["files"][0]["content"])
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        manifest = json.loads(zf.read("candidate_manifest.json"))

    for configuration in ("free", "armed", "contact", "release"):
        entry = manifest["validation"][configuration]
        assert entry["isValid"] is True
        assert entry["solidCount"] == 1
        assert entry["bottomSeatingFaces"] >= 1
        assert entry["topSeatingFaces"] >= 1
        assert entry["reimportValid"] is True


def test_single_state_returns_a_bare_step():
    response = client.post("/generate", json=reference_request(
        configurations=["free"], packageMode="single"))
    assert response.status_code == 200, response.text
    files = response.json()["files"]
    assert len(files) == 1
    assert files[0]["contentType"] == "application/step"
    assert files[0]["filename"] == "spring_d143_Na300_FREE.step"
    assert files[0]["configuration"] == "free"


def test_single_mode_with_several_states_still_returns_one_artifact():
    """
    'single' with multiple states must fall back to a ZIP, not silently
    produce nothing for the states it cannot fit in one file.
    """
    response = client.post("/generate", json=reference_request(
        configurations=["free", "armed"], packageMode="single"))
    assert response.status_code == 200, response.text
    files = response.json()["files"]
    assert len(files) == 1
    assert files[0]["contentType"] == "application/zip"


def _assembly_step_bytes(body: dict) -> bytes:
    """The assembly STEP, whether returned bare or wrapped in a ZIP by the
    payload-size guard."""
    artifact = body["files"][0]
    payload = base64.b64decode(artifact["content"])
    if artifact["contentType"] == "application/step":
        return payload
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        return zf.read(next(n for n in zf.namelist() if n.endswith("_ALL_STATES.step")))


def test_assembly_mode_returns_one_artifact():
    response = client.post("/generate", json=reference_request(packageMode="assembly-step"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["files"]) == 1
    assert any("side by side" in w for w in body["warnings"])
    # however it is delivered, an assembly STEP must be in there
    assert _assembly_step_bytes(body).lstrip().startswith(b"ISO-10303-21")


def test_every_response_fits_the_function_payload_limit():
    """
    Artifacts ride base64 inside JSON across two Vercel Functions, each capped
    at a 4.5 MB body. Measured before the guard existed, the all-states assembly
    came to 4.38 MB - 97% of the limit - so this asserts real headroom rather
    than a near miss.
    """
    limit = 4.5 * 1024 * 1024
    for mode, configs in (
        ("single", ["free"]),
        ("zip", ["free", "armed", "contact", "release"]),
        ("assembly-step", ["free", "armed", "contact", "release"]),
    ):
        response = client.post("/generate", json=reference_request(
            packageMode=mode, configurations=configs))
        assert response.status_code == 200, response.text
        size = len(response.content)
        assert size < limit * 0.75, (
            f"{mode} response is {size / 1024 / 1024:.2f} MB, too close to the "
            f"{limit / 1024 / 1024:.1f} MB function limit")


def test_oversized_step_is_zipped_rather_than_truncated():
    """The assembly STEP exceeds the inline threshold, so it must arrive zipped."""
    response = client.post("/generate", json=reference_request(packageMode="assembly-step"))
    body = response.json()
    artifact = body["files"][0]

    assert artifact["contentType"] == "application/zip"
    assert any("response size limit" in w for w in body["warnings"])

    # the assembly STEP itself must still be inside, intact
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(artifact["content"]))) as zf:
        names = zf.namelist()
        assert any(n.endswith("_ALL_STATES.step") for n in names)
        assert "candidate_manifest.json" in names
        step = zf.read(next(n for n in names if n.endswith(".step")))
    assert step.lstrip().startswith(b"ISO-10303-21")


def test_assembly_names_its_components():
    response = client.post("/generate", json=reference_request(packageMode="assembly-step"))
    step = _assembly_step_bytes(response.json()).decode("ascii", errors="replace")
    for component in ("FREE", "ARMED", "HAMMER_CONTACT", "LATCH_FOLLOW_THROUGH"):
        assert component in step


def test_only_selected_states_are_generated():
    response = client.post("/generate", json=reference_request(
        configurations=["armed", "release"]))
    body = response.json()
    assert body["configurations"] == ["armed", "release"]
    payload = base64.b64decode(body["files"][0]["content"])
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        steps = [n for n in zf.namelist() if n.endswith(".step")]
    assert sorted(steps) == ["spring_d143_Na300_ARMED.step", "spring_d143_Na300_RELEASE.step"]


# ---------------------------------------------------------------- errors ---

def test_inconsistent_geometry_is_rejected():
    request = reference_request()
    request["geometry"] = dict(request["geometry"], outerDiameterIn=2.500)  # OD != D + d
    response = client.post("/generate", json=request)
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["code"] == "GEOMETRY_INCONSISTENT"
    assert body["details"]


def test_length_below_solid_height_is_rejected():
    request = reference_request(configurations=["armed"], packageMode="single")
    request["states"] = dict(request["states"], armedLengthIn=0.30)
    response = client.post("/generate", json=request)
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "COIL_INTERFERENCE"
    assert any("solid height" in d.lower() for d in body["details"])


def test_empty_configuration_list_is_rejected():
    response = client.post("/generate", json=reference_request(configurations=[]))
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REQUEST"


def test_unknown_configuration_is_rejected():
    response = client.post("/generate", json=reference_request(configurations=["sideways"]))
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REQUEST"


def test_negative_dimension_is_rejected():
    request = reference_request()
    request["geometry"] = dict(request["geometry"], wireDiameterIn=-0.1)
    response = client.post("/generate", json=request)
    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REQUEST"


def test_malformed_body_is_rejected():
    response = client.post("/generate", json={"nope": True})
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["details"]


def test_errors_never_leak_a_traceback():
    request = reference_request()
    request["geometry"] = dict(request["geometry"], outerDiameterIn=2.500)
    text = client.post("/generate", json=request).text
    assert "Traceback" not in text
    assert "File \"" not in text
    assert ".py\", line" not in text


def test_error_shape_is_stable():
    request = reference_request()
    request["geometry"] = dict(request["geometry"], outerDiameterIn=2.500)
    body = client.post("/generate", json=request).json()
    assert set(body) >= {"success", "code", "message", "details"}
    assert isinstance(body["details"], list)
