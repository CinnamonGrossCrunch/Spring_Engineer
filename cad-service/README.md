# Spring CAD Service

Generates nominal **squared-and-ground compression spring B-rep geometry** from
already-derived V2 candidate values and exports **STEP**.

Built on [build123d](https://build123d.readthedocs.io) 0.11.1 over the
OpenCascade kernel (via `cadquery-ocp` 7.9.x).

---

## What this service is and is not

**It is** a geometry generator. It receives numbers that V2 already computed —
`d`, `D`, `OD`, `ID`, `Na`, `Nt` and four state lengths — and turns them into
true B-rep solids.

**It is not** a spring calculator. It contains no spring rate, no stress, no
force and no work equations. It never recomputes anything the TypeScript
engineering model produced, and it never reads the SVG renderer. Performance
values may be passed in, but only so they can be written into the manifest.

```
ENGINEERING MODEL  ->  V2 CANDIDATE  ->  CAD REQUEST  ->  CAD SERVICE  ->  B-REP STEP
```

---

## Running it

### Local

```bash
cd cad-service
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Then, in another terminal, point the Next.js app at it:

```bash
CAD_SERVICE_URL=http://localhost:8000 npm run dev
```

On Windows PowerShell:

```powershell
$env:CAD_SERVICE_URL = "http://localhost:8000"; npm run dev
```

See `.env.example` in the repository root.

### Docker

OpenCascade ships native libraries, so containerised deployment is supported
from the start:

```bash
cd cad-service
docker build -t spring-cad .
docker run --rm -p 8000:8000 spring-cad
```

The server listens on `$PORT`, defaulting to 8000, so the same image works on
any platform that assigns a port at runtime.

### Vercel

This service deploys to Vercel as its **own project**, separate from the
Next.js app, using Vercel Functions' container support (an OCI image on Fluid
compute). Both projects live in this one repository.

1. Create a second Vercel project from the same Git repository.
2. Set its **Root Directory** to `cad-service`.
3. Vercel picks up [`Dockerfile.vercel`](Dockerfile.vercel) automatically,
   builds it, and pushes it to the Vercel Container Registry on every commit.
4. Copy the resulting deployment URL.
5. In the **Next.js** project, set `CAD_SERVICE_URL` to that URL and redeploy.

The architecture is unchanged by this — the browser still only ever calls the
Next.js app's `/api/cad/*` routes, which proxy to `CAD_SERVICE_URL`:

```
Next.js app  ->  /api/cad/*  ->  CAD_SERVICE_URL  ->  this service
```

Two constraints follow from running on Vercel Functions:

- **The server must listen on `$PORT`.** `Dockerfile.vercel` uses the shell form
  of `CMD` so the variable is expanded at runtime.
- **Request and response bodies are capped at 4.5 MB**, and artifacts cross two
  functions (the proxy and this service). See
  [Payload sizes](#payload-sizes) below.

### Tests

```bash
cd cad-service
pytest                 # 104 tests
python smoke_test.py   # end-to-end: build -> STEP -> re-import -> re-measure
```

`smoke_test.py --keep` leaves the STEP files on disk so you can open them in
SolidWorks / Fusion / FreeCAD.

---

## API

### `POST /generate`

```jsonc
{
  "candidateKey": "d143_Na300",
  "geometry": {                      // INCHES
    "wireDiameterIn": 0.143,
    "meanDiameterIn": 0.967,
    "outerDiameterIn": 1.110,
    "innerDiameterIn": 0.824,
    "activeCoils": 3.0,
    "totalCoils": 5.0
  },
  "states": {                        // INCHES, from V2 - never recomputed here
    "freeLengthIn": 2.500,
    "armedLengthIn": 0.900,
    "contactLengthIn": 1.400,
    "releaseLengthIn": 1.900
  },
  "configurations": ["free", "armed", "contact", "release"],
  "endModel": "squared-ground-v1",
  "handedness": "right",
  "packageMode": "zip",              // "single" | "zip" | "assembly-step"
  "performance": { "k": 12.4, "F0": 3.1 },   // manifest only
  "materialName": "302 Stainless"
}
```

Success returns `files[]`, each base64 with an explicit `contentType`. The
service — not the browser — decides whether that is one STEP, a ZIP, or an
assembly, so a successful response always has something to download.

Failures return `{ success: false, code, message, details[] }` with an
appropriate HTTP status. Python tracebacks are logged server-side and never
returned.

| Code | Meaning |
| --- | --- |
| `GEOMETRY_INCONSISTENT` | Redundant candidate values disagree |
| `INVALID_STATE_LENGTH` | A requested length is not positive |
| `COIL_INTERFERENCE` | The state is below solid height, or wire would meet wire |
| `SWEEP_FAILED` | OpenCascade could not sweep the wire |
| `GRIND_FAILED` | The seating-plane Boolean failed |
| `INVALID_BREP` | The finished solid failed validation, so it was not exported |
| `STEP_EXPORT_FAILED` | Writing or verifying the STEP failed |
| `PACKAGING_FAILED` | ZIP or assembly packaging failed |
| `INVALID_REQUEST` | Schema validation failed |

### `GET /health`

```json
{
  "status": "ok",
  "cadKernel": "OpenCascade",
  "library": "build123d",
  "libraryVersion": "0.11.1",
  "generatorVersion": "spring-cad-0.1",
  "endModelVersion": "squared-ground-v1"
}
```

Diagnostics only. The UI does not poll it.

---

## Units

Requests are in **inches** because V2 is. Conversion happens exactly once, at
the schema boundary (`SpringGeometryIn.to_mm()`), using `1 in = 25.4 mm`.
Everything downstream is millimetres, and STEP is exported with `Unit.MM`.
Original inch values are preserved in the manifest.

---

## How the geometry is built

```
solve active pitch -> sample variable-pitch centerline -> B-spline
    -> sweep circular wire section -> planar Boolean grind -> validate -> STEP
```

### Coordinate system

`Z` is the spring axis, the spring is centred on `X = Y = 0`, the bottom
seating plane is `Z = 0`, and the top seating plane is `Z = L` for the
requested state length. Mean radius `R = D/2`, wire radius `r = d/2`.
Right-hand winding is the default; left-hand negates `y`.

### Variable-pitch centerline

Not a constant-pitch helix. The axial rise per turn `p(t)` varies with the turn
coordinate `t ∈ [0, Nt]`, measured from whichever end is nearer:

| Region | Extent | Pitch |
| --- | --- | --- |
| Closed bearing region | `[0, 0.75)` turn | `p_closed` |
| Tangent transition | `[0.75, 1.0)` turn | smoothstep ramp |
| Active coils | `[1.0, Nt − 1.0]` | `p_active` |

and mirrored at the top, so the part is symmetric end to end.

The centerline is

```
x(theta) = R cos(theta)
y(theta) = R sin(theta)
z(theta) = integral of local pitch
```

sampled at 72 points per turn and interpolated as a single B-spline. `z` is
integrated **in closed form**, not numerically, so the only approximation is
the spline interpolation between samples — for a cubic interpolant through
points on a circle at 5° spacing the radial deviation is ~`1e-7 · R`.

A circular section of diameter `d` is then swept along that spline with a
Frenet frame, producing one continuous solid.

### Tangent continuity

The transition uses the cubic smoothstep `3x² − 2x³`, whose derivative vanishes
at both ends. That makes the pitch profile continuous, so the centerline has
continuous position *and* tangent direction: no kinks.

### On "zero pitch"

A squared end is often described as having "zero pitch". Taken literally, that
is self-intersecting geometry.

A helical wire of diameter `d` interpenetrates itself unless the axial rise
across one full turn is at least `d`. Writing that one-turn rise as
`delta(t) = z(t+1) − z(t)`, non-interpenetration requires `delta(t) >= d`
everywhere. If the terminal 0.75 turn had literally zero pitch and the next
0.25 turn ramped to `p_active` through a smoothstep (mean value ½), then

```
delta(0) = 0.25 · p_active · 0.5 = 0.125 · p_active
```

which needs `p_active >= 8d`. Springs in this design region run `p_active/d ≈ 5`,
so literal zero pitch would drive the terminal coil straight through its
neighbour.

**So "zero pitch" is implemented as zero coil *gap*:** the closed-end pitch
floor is `d` (plus a documented 1 µm kernel clearance). That is the standard
physical meaning of a closed end — coils touching — and it makes the model
*provably* non-interpenetrating: the minimum one-turn rise equals `p_closed`
whenever `p_active >= p_closed`, which every buildable state satisfies.
`SpringPitchProfile.min_one_turn_rise()` measures it rather than assuming it,
and the tests assert it.

### Grinding

Grinding is a real change to the B-rep, not a viewport clip. After sweeping,
the solid is intersected with a box spanning `[0, L]`, producing two genuine
planar faces perpendicular to the axis. `planar_seating_faces()` counts them
from the topology, and both the validator and the tests require at least one
face in each seating plane.

The seating planes are placed from the *measured* extent of the swept solid, so
the finished height is exactly the requested length. Any spline-versus-analytic
drift is absorbed by the grind depth — a heuristic dimension — rather than by
the state length, which is an engineering one.

### Solving the state length

Each state is reached by solving the active pitch *before* construction. The
solid is never scaled in Z and the circular section is never distorted.

With centerline rise `H_c`, the swept solid is `H_c + d` tall. Grinding removes
`g = gdf·d` from each end, so

```
L = H_c + d − 2·gdf·d
  = 2·p_c·e + (p_a − p_c)·tr + p_a·(Nt − 2e) + d·(1 − 2·gdf)
```

which is **linear in `p_a`** and inverts directly — no iteration needed, and
exact to floating point.

There is a pleasing consequence. At the closed limit `p_a → d`, with the
default heuristics (`e = 1`, `tr = 0.25`, `gdf = 0.5`), this reduces to

```
L = (Na + 2)·d = Nt·d
```

the textbook squared-and-ground solid height. So **"`p_a >= d`" and
"`L >= Nt·d`" are the same condition**: CAD buildability coincides exactly with
the engineering solid-height limit the app already uses. That is also why
`grind_depth_fraction` defaults to 0.5 — it is the value that makes the CAD
model reproduce `Hs = Nt·d`.

---

## Requirements vs heuristics

Be precise about what is certain.

**Engineering requirements** — exact, taken from the V2 candidate, never
adjusted to make the kernel succeed:

- `d`, `D`, `OD`, `ID`, `Na`, `Nt`
- the requested state length `L`
- a circular wire section
- planar, parallel bearing faces
- no material outside the seating planes

**CAD representation heuristics** — all in `spring_end_model.py`, replaceable
without touching the generator:

| Parameter | Default | Status |
| --- | --- | --- |
| `end_turns_per_side` | 1.0 | follows the `Nt ≈ Na + 2` convention |
| `closed_turns` | 0.75 | representation choice |
| `transition_turns` | 0.25 | representation choice |
| `grind_depth_fraction` | 0.5 | chosen to reproduce `Hs = Nt·d` |
| tangency clearance | 1e-3 mm | kernel robustness at exact tangency |

These are **not** Lee requirements, aerospace standards, or vendor-certified
manufacturing geometry. Confirm end-form details with your spring vendor.

---

## Validation

Nothing is exported until it passes. `validate_brep()` checks non-null,
`is_valid`, `is_manifold`, exactly one solid, finite positive volume, finite
bounding box, height matching the requested state, no material outside the
seating planes, radial envelope matching `OD`, and the presence of planar
bearing faces in both seating planes. Every check that passed is recorded in
the manifest.

### STEP round-trip

`export_step` returning `True` is not evidence the file is usable, so every
export is written, **read back through OpenCascade**, and re-measured for
validity, height and radial envelope. Set `CAD_VERIFY_ROUNDTRIP=0` to skip it
in latency-sensitive deployments.

### Tangency vs penetration

Coil-to-coil tangency is legitimate — a spring at solid height really does have
touching coils — and is allowed, and surfaced as a warning. Interpenetration is
rejected with a `COIL_INTERFERENCE` error. Engineering dimensions are never
quietly altered to make OpenCascade succeed.

---

## Determinism

The same request produces the same bytes. The STEP header timestamp is pinned
to a fixed epoch for this reason, with the real generation time recorded in the
manifest instead. The one remaining variance is OpenCascade's
`NEXT_ASSEMBLY_USAGE_OCCURRENCE` counter, which increments per export within a
process and carries no geometry.

---

## Package contents

For a multi-state request:

```
SpringCandidate_<key>_CAD.zip
├── spring_<key>_FREE.step
├── spring_<key>_ARMED.step
├── spring_<key>_CONTACT.step
├── spring_<key>_RELEASE.step
├── candidate_manifest.json
└── README.txt
```

Only the selected states are included. The manifest carries the candidate key,
timestamp, generator and end-model versions, the original inch geometry and
state lengths, V2 performance metadata, material, units, handedness, the
end-model parameters, the CAD tolerances, and the per-state validation results.

`packageMode: "assembly-step"` instead produces one STEP assembly with the
selected states spaced 1.75 × OD apart, with components named `FREE`, `ARMED`,
`HAMMER_CONTACT` and `LATCH_FOLLOW_THROUGH`. It is a design-review artifact; it
does not imply the states coexist in the mechanism.

---

## Payload sizes

Artifacts are returned base64-encoded inside the JSON body, which inflates them
by 4/3, and they cross two Vercel Functions — the Next.js proxy and this
service — each capped at **4.5 MB** per request/response body.

Measured for the reference candidate (d = 0.143 in, OD = 1.110 in, Na = 3,
Nt = 5), full JSON response:

| Mode | Artifact | Response | % of 4.5 MB |
| --- | --- | --- | --- |
| single STEP | 0.83 MB step | 1.12 MB | 25% |
| ZIP, 2 states | 0.47 MB zip | 0.63 MB | 14% |
| ZIP, 4 states | 0.95 MB zip | 1.27 MB | 28% |
| Assembly, 4 states *(before guard)* | 3.28 MB step | **4.38 MB** | **97%** |
| Assembly, 4 states *(after guard)* | 0.95 MB zip | 1.27 MB | 28% |

The all-states assembly was the one real problem: a bare assembly STEP came to
97% of the limit for the *reference* spring, and would exceed it for anything
larger. Rather than change the transport, any STEP over
`MAX_INLINE_ARTIFACT_BYTES` (2.5 MB raw) is zipped before encoding — STEP is
text and compresses about 3.5:1 — and a warning says so. ZIP bundles were never
close to the limit, so nothing else changed.

`test_every_response_fits_the_function_payload_limit` asserts every mode stays
under 75% of the cap, so a future geometry change that inflates output fails
the suite rather than production.

---

## Known limitations

- **The four states are geometric configuration representations, not FEA.**
  Each is the same nominal spring at a different active pitch. They do not
  model coil-contact redistribution, presetting, relaxation, residual stress,
  or grinding-process variation.
- The ground bearing face spans a partial arc set by the grind depth. Vendors
  achieve a fuller flat through end-coil tapering that this model does not
  represent.
- No feature history is preserved. STEP is a neutral B-rep exchange format;
  describe the output as *B-rep STEP geometry*, not as "NURBS".
- Not vendor validated.

---

## Extensibility

The architecture leaves room for IGES and native BREP export, GLB browser
preview, alternate end forms, vendor-specific end models, and full mechanism
assemblies. None of that is implemented; `endModel` and `handedness` exist as
explicit fields so those additions stay additive.

---

## Layout

```
app/
    main.py              FastAPI surface (thin)
    generator.py         request -> solids -> STEP -> package
    schemas.py           Pydantic request/response, mirrors lib/cad/types.ts
    spring_end_model.py  pitch profile, end heuristics, length solve
    spring_geometry.py   centerline, sweep, grind
    validation.py        input consistency + B-rep gate
    export.py            STEP write + round-trip verify
    packaging.py         manifest, ZIP, assembly
    errors.py            structured error taxonomy
    tolerances.py        every numerical threshold, in one place
tests/
    fixtures.py          stable candidate + measurement helpers
    test_geometry.py     construction and dimensional truth
    test_states.py       the four configurations
    test_step_roundtrip.py
    test_api.py          HTTP contract and error shapes
smoke_test.py            standalone end-to-end check
```
