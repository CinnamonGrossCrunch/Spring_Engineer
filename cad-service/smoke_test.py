#!/usr/bin/env python
"""
Standalone CAD smoke test.

Generates all four states for the reference candidate, writes real STEP files
to disk, reads each one back through OpenCascade, and re-measures it. Exits
non-zero on any failure, so it can be used as a deployment gate.

    python smoke_test.py [--keep] [--out DIR]

--keep leaves the generated STEP files behind for inspection in CAD.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

from build123d import import_step

from app.export import export_solid_to_step_bytes
from app.spring_end_model import CAD_GENERATOR_VERSION, END_MODEL_VERSION
from app.spring_geometry import build_spring_state, planar_seating_faces
from app.tolerances import (
    CAD_LENGTH_VALIDATION_TOL_MM,
    CAD_OD_VALIDATION_TOL_MM,
    IN_TO_MM,
)
from app.validation import validate_brep, validate_candidate_consistency
from tests.fixtures import geometry_mm, state_length_mm

CONFIGURATIONS = ["free", "armed", "contact", "release"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", action="store_true", help="keep the generated STEP files")
    parser.add_argument("--out", default=None, help="output directory")
    args = parser.parse_args()

    out_dir = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="spring-cad-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    geom = geometry_mm()
    print(f"spring-cad smoke test  ({CAD_GENERATOR_VERSION} / {END_MODEL_VERSION})")
    print(f"  d  = {geom.wire_diameter / IN_TO_MM:.4f} in   OD = {geom.outer_diameter / IN_TO_MM:.4f} in")
    print(f"  Na = {geom.active_coils:g}        Nt = {geom.total_coils:g}")
    print(f"  output -> {out_dir}\n")

    validate_candidate_consistency(geom)
    print("  candidate consistency          OK\n")

    failures: list[str] = []
    started = time.time()

    for configuration in CONFIGURATIONS:
        length_mm = state_length_mm(configuration)
        label = configuration.upper()

        try:
            built = build_spring_state(geom, length_mm, configuration)
            report = validate_brep(built, geom)

            data = export_solid_to_step_bytes(built.solid, configuration)
            path = out_dir / f"spring_smoke_{label}.step"
            path.write_bytes(data)

            shape = import_step(str(path))
            bb = shape.bounding_box()
            height = bb.max.Z - bb.min.Z
            od = max(bb.max.X - bb.min.X, bb.max.Y - bb.min.Y)
            bottom, top = planar_seating_faces(built.solid, length_mm)

            problems = []
            if not shape.is_valid:
                problems.append("re-imported shape invalid")
            if abs(height - length_mm) > CAD_LENGTH_VALIDATION_TOL_MM:
                problems.append(f"height {height:.5f} != {length_mm:.5f}")
            if abs(od - geom.outer_diameter) > CAD_OD_VALIDATION_TOL_MM:
                problems.append(f"OD {od:.5f} != {geom.outer_diameter:.5f}")
            if bottom < 1 or top < 1:
                problems.append(f"missing bearing faces ({bottom}/{top})")
            if len(shape.solids()) != 1:
                problems.append(f"{len(shape.solids())} solids after round trip")

            status = "OK  " if not problems else "FAIL"
            print(
                f"  {label:<8} {status} "
                f"L={length_mm:8.4f}mm  p={built.active_pitch_mm:7.4f}mm  "
                f"grind={built.grind_depth_mm:.4f}mm  OD={od:8.4f}mm  "
                f"faces={bottom}/{top}  vol={report.volume_mm3:8.1f}mm3  "
                f"{len(data) // 1024}KB"
            )
            if problems:
                failures.append(f"{label}: {'; '.join(problems)}")
                for problem in problems:
                    print(f"           - {problem}")

        except Exception as exc:  # noqa: BLE001
            print(f"  {label:<8} FAIL {type(exc).__name__}: {exc}")
            failures.append(f"{label}: {exc}")

    elapsed = time.time() - started
    print(f"\n  {len(CONFIGURATIONS)} configurations in {elapsed:.1f}s")

    if not args.keep:
        shutil.rmtree(out_dir, ignore_errors=True)
    else:
        print(f"  STEP files kept in {out_dir}")

    if failures:
        print(f"\nSMOKE TEST FAILED ({len(failures)})")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("\nSMOKE TEST PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
