"""
Stable CAD test fixtures.

Deliberately NOT derived from whatever candidate the V2 optimizer currently
picks: the optimizer's answer moves as the scenario changes, and a CAD
regression suite that moves with it cannot detect a CAD regression. These are
frozen values in the current design region.
"""

from __future__ import annotations

from build123d import Box, Pos

from app.spring_geometry import SpringGeometryMm
from app.tolerances import IN_TO_MM

# Representative candidate: d ~ 0.143 in, OD ~ 1.110 in, Na = 3, Nt = 5.
REFERENCE = {
    "candidateKey": "d143_Na300",
    "geometry": {
        "wireDiameterIn": 0.143,
        "meanDiameterIn": 0.967,   # OD - d
        "outerDiameterIn": 1.110,
        "innerDiameterIn": 0.824,  # D - d
        "activeCoils": 3.0,
        "totalCoils": 5.0,
    },
    "states": {
        "freeLengthIn": 2.500,
        "armedLengthIn": 0.900,
        "contactLengthIn": 1.400,
        "releaseLengthIn": 1.900,
    },
    "configurations": ["free", "armed", "contact", "release"],
    "endModel": "squared-ground-v1",
    "handedness": "right",
    "packageMode": "zip",
    "performance": {
        "k": 12.4, "F0": 3.1, "F2": 9.8, "F3": 6.2,
        "Whammer": 7.7, "Wlatch": 2.1, "WreleaseIdeal": 9.8,
        "stressPctConservative": 0.52,
    },
    "materialName": "302 Stainless",
}

STATE_LENGTH_IN = {
    "free": REFERENCE["states"]["freeLengthIn"],
    "armed": REFERENCE["states"]["armedLengthIn"],
    "contact": REFERENCE["states"]["contactLengthIn"],
    "release": REFERENCE["states"]["releaseLengthIn"],
}


def reference_request(**overrides) -> dict:
    """A deep-ish copy of the reference request with top-level overrides."""
    req = {k: (dict(v) if isinstance(v, dict) else list(v) if isinstance(v, list) else v)
           for k, v in REFERENCE.items()}
    req.update(overrides)
    return req


def geometry_mm(d_in: float = 0.143, od_in: float = 1.110,
                na: float = 3.0, nt: float = 5.0) -> SpringGeometryMm:
    """Build a consistent SpringGeometryMm from d and OD (D and ID derived)."""
    D = od_in - d_in
    ID = D - d_in
    return SpringGeometryMm(
        wire_diameter=d_in * IN_TO_MM,
        mean_diameter=D * IN_TO_MM,
        outer_diameter=od_in * IN_TO_MM,
        inner_diameter=ID * IN_TO_MM,
        active_coils=na,
        total_coils=nt,
    )


def state_length_mm(configuration: str) -> float:
    return STATE_LENGTH_IN[configuration] * IN_TO_MM


# ---------------------------------------------------------------------------
# Measurement helpers
# ---------------------------------------------------------------------------

def radial_section(solid, geom: SpringGeometryMm, length_mm: float, slab_thickness: float = 0.02):
    """
    Slice the spring with a thin slab on the +X side of the axis and return the
    resulting blobs, sorted by height.

    Each blob is one crossing of the theta = 0 half-plane, so this measures
    what the B-rep actually contains rather than what we asked for: the blob
    width is the true wire diameter, the blob's inner x is ID/2, and the blob
    count is the true number of coil crossings.
    """
    slab = Pos(geom.outer_diameter / 2.0, 0, length_mm / 2.0) * Box(
        geom.outer_diameter, slab_thickness, length_mm * 1.2)
    section = solid & slab
    return sorted(section.solids(), key=lambda s: s.bounding_box().min.Z)


def measured_wire_diameter(solid, geom: SpringGeometryMm, length_mm: float) -> float:
    """Widest radial extent of any coil crossing == the real wire diameter."""
    blobs = radial_section(solid, geom, length_mm)
    return max(b.bounding_box().max.X - b.bounding_box().min.X for b in blobs)


def measured_inner_radius(solid, geom: SpringGeometryMm, length_mm: float) -> float:
    """Closest approach of material to the axis == ID / 2."""
    blobs = radial_section(solid, geom, length_mm)
    return min(b.bounding_box().min.X for b in blobs)


def coil_crossing_count(solid, geom: SpringGeometryMm, length_mm: float) -> int:
    """
    Number of times the wire crosses the theta = 0 half-plane.
    For an integer total-coil count this is Nt + 1.
    """
    return len(radial_section(solid, geom, length_mm))
