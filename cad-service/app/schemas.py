"""
Request / response schemas.

These mirror `lib/cad/types.ts` on the Next.js side. Requests speak INCHES,
because that is what V2 speaks; conversion to millimetres happens exactly once,
in `to_geometry_mm()` / `state_lengths_mm()`, and nothing downstream sees inches
again.

The service deliberately does not need k, F0, F2, F3 or stress to build
geometry. Those may ride along in `performance` for the manifest only.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .spring_geometry import SpringGeometryMm
from .tolerances import IN_TO_MM

SpringConfiguration = Literal["free", "armed", "contact", "release"]
CadPackageMode = Literal["single", "zip", "assembly-step"]
Handedness = Literal["right", "left"]
EndModelName = Literal["squared-ground-v1"]

#: Display label + filename token for each configuration.
CONFIGURATION_META: dict[str, dict[str, str]] = {
    "free": {"label": "Free", "token": "FREE", "component": "FREE"},
    "armed": {"label": "Armed / Compressed", "token": "ARMED", "component": "ARMED"},
    "contact": {"label": "Hammer Contact", "token": "CONTACT", "component": "HAMMER_CONTACT"},
    "release": {"label": "Latch Follow-Through", "token": "RELEASE",
                "component": "LATCH_FOLLOW_THROUGH"},
}


class SpringGeometryIn(BaseModel):
    """Candidate geometry, inches. Redundant values are cross-checked."""

    model_config = ConfigDict(extra="forbid")

    wireDiameterIn: float = Field(gt=0)
    meanDiameterIn: float = Field(gt=0)
    outerDiameterIn: float = Field(gt=0)
    innerDiameterIn: float = Field(gt=0)
    activeCoils: float = Field(gt=0)
    totalCoils: float = Field(gt=0)

    def to_mm(self) -> SpringGeometryMm:
        return SpringGeometryMm(
            wire_diameter=self.wireDiameterIn * IN_TO_MM,
            mean_diameter=self.meanDiameterIn * IN_TO_MM,
            outer_diameter=self.outerDiameterIn * IN_TO_MM,
            inner_diameter=self.innerDiameterIn * IN_TO_MM,
            active_coils=self.activeCoils,
            total_coils=self.totalCoils,
        )


class SpringStatesIn(BaseModel):
    """The four state lengths, inches. Computed by V2, never recomputed here."""

    model_config = ConfigDict(extra="forbid")

    freeLengthIn: float = Field(gt=0)
    armedLengthIn: float = Field(gt=0)
    contactLengthIn: float = Field(gt=0)
    releaseLengthIn: float = Field(gt=0)

    def length_mm(self, configuration: str) -> float:
        return {
            "free": self.freeLengthIn,
            "armed": self.armedLengthIn,
            "contact": self.contactLengthIn,
            "release": self.releaseLengthIn,
        }[configuration] * IN_TO_MM


class PerformanceMeta(BaseModel):
    """V2 performance values. Manifest only - these never drive geometry."""

    model_config = ConfigDict(extra="allow")

    k: float | None = None
    F0: float | None = None
    F2: float | None = None
    F3: float | None = None
    Whammer: float | None = None
    Wlatch: float | None = None
    WreleaseIdeal: float | None = None
    stressPctConservative: float | None = None


class CadSpringRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidateKey: str = Field(min_length=1)
    geometry: SpringGeometryIn
    states: SpringStatesIn
    configurations: list[SpringConfiguration] = Field(min_length=1)
    endModel: EndModelName = "squared-ground-v1"
    handedness: Handedness = "right"
    packageMode: CadPackageMode = "zip"
    performance: PerformanceMeta | None = None
    materialName: str | None = None

    def ordered_configurations(self) -> list[str]:
        """De-duplicated, in canonical free -> armed -> contact -> release order."""
        order = ["free", "armed", "contact", "release"]
        return [c for c in order if c in set(self.configurations)]


class CadFile(BaseModel):
    """One generated artifact, base64 encoded."""

    filename: str
    content: str
    contentType: str
    configuration: SpringConfiguration | None = None
    byteLength: int


class CadHealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    cadKernel: str
    library: str
    libraryVersion: str
    generatorVersion: str
    endModelVersion: str
    timestamp: str


class CadSpringResponse(BaseModel):
    success: Literal[True] = True
    candidateKey: str
    configurations: list[SpringConfiguration]
    packageMode: CadPackageMode
    files: list[CadFile]
    manifest: dict
    warnings: list[str] = []


class CadErrorResponse(BaseModel):
    success: Literal[False] = False
    code: str
    message: str
    details: list[str] = []
    candidateKey: str | None = None
