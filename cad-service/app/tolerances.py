"""
Single source of truth for CAD modeling + validation tolerances.

Rule: no epsilon literals anywhere else in the service. If a new numerical
threshold is needed, add it here with a comment explaining what it protects.

All values are millimetres unless the name says otherwise. Parts are roughly
25 mm scale, so these are chosen conservatively relative to that.
"""

# ---------------------------------------------------------------- units ----

IN_TO_MM = 25.4
"""Exact inch -> millimetre conversion. V2 speaks inches; CAD speaks mm."""

# ------------------------------------------------------- centerline ----

SAMPLES_PER_TURN = 72
"""
Centerline sample density (one sample per 5 deg) used to interpolate the
B-spline. Radial deviation of a cubic interpolant through points on a circle
scales as R*dtheta^4/384; at 5 deg that is ~1e-7*R, i.e. far below
CAD_LINEAR_TOL_MM for any spring in this design region.
"""

# ------------------------------------------------------- modeling ----

CAD_LINEAR_TOL_MM = 1.0e-4
"""General linear modeling tolerance for geometry construction."""

CAD_ANGULAR_TOL_RAD = 1.0e-6
"""General angular tolerance."""

CAD_TANGENCY_CLEARANCE_MM = 1.0e-3
"""
Coil-to-coil clearance added to the closed-end pitch floor.

At nominal solid height the closed end coils are exactly tangent. Exact
tangency is a degenerate case for the B-rep kernel, so the closed-end pitch
floor is d + this clearance. It is ~1e-3 mm on a ~25 mm part (4e-5 of scale),
well below CAD_LINEAR_TOL_MM's effect on reported dimensions, and it is
recorded in the manifest. It never changes d, D, OD, ID, Na, Nt or the
requested state length -- those are achieved exactly.
"""

# ------------------------------------------------------ validation ----

CAD_LENGTH_VALIDATION_TOL_MM = 1.0e-3
"""
Post-build overall-height check. The grind planes define the height by
construction, so this only catches Boolean/bbox pathologies.
"""

CAD_OD_VALIDATION_TOL_MM = 5.0e-2
"""
Radial envelope check. Looser than the linear tolerance because it absorbs
the kernel's bounding-box padding on swept surfaces.
"""

CAD_GRIND_DEPTH_TOL_MM = 5.0e-2
"""
How far the realised grind depth may drift from nominal before we flag it.
Drift here absorbs spline-vs-analytic centerline error; it is a heuristic
dimension, not an engineering one.
"""

MIN_COIL_GAP_MM = 0.0
"""
Minimum permitted coil-to-coil axial gap measured centre-to-centre minus d.
Zero means exact tangency is allowed (springs at solid height legitimately
touch); anything negative is wire interpenetration and is rejected.
"""

# --------------------------------------- candidate consistency ----

GEOMETRY_CONSISTENCY_REL_TOL = 0.02
"""
Relative tolerance for the redundant candidate checks (OD vs D+d, ID vs D-d).
Loose enough for values rounded for display, tight enough to catch a candidate
that was assembled from mismatched sources. Mirrored in lib/cad/validation.ts.
"""

COIL_COUNT_ABS_TOL = 0.1
"""Absolute tolerance on Nt vs Na + 2, in turns."""
