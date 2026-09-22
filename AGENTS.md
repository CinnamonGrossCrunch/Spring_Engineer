<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Spring Mechanism Explorer: agent working agreement

This file applies to the entire repository. It is the durable project context for any coding agent working here. Preserve the generated Next.js block above exactly; `next dev` owns it.

## Product mission

This application helps the user reason about a compression spring that accelerates a hammer and continues to drive a coupled hammer/latch assembly. It must make the governing mechanical tradeoffs understandable without pretending that a first-principles model is a supplier-certified spring design or a measured impact result.

The product has three distinct workflows:

- `/evaluate` is a deterministic constraint-to-spring evaluator. The user supplies two nominal load-at-height points and selected geometry assumptions; the app solves the linear force curve and back-solves coil count.
- `/optimize` contains the spring-first Package-Punch discovery workflow and the fixed-package geometry sweep. Discovery searches axial package, wire diameter, and active coils together. Fixed-package optimization holds the current axial budget and searches geometry within it.
- `/engineer` is the detailed equation graph and engineering workbench. It exposes more of the derivation and is not the preferred stakeholder summary view.

Do not silently transfer an input, constraint, or conclusion from one workflow to another. A fixed CAD height, for example, must not constrain spring-first discovery unless the user explicitly enables that constraint.

## The user's actual decision problem

The recurring design objective is:

> Find the smallest practical axial package that preserves as much useful hammer run-up work as possible while satisfying the load-at-height, radial-envelope, tolerance, stress-screen, and continuous-drive requirements.

The app is a decision aid for two audiences:

- Michael needs the few fundamentals that explain the package/performance tradeoff.
- A spring supplier such as Lee needs an unambiguous load-at-height and dimensional envelope, not internal hammer/latch terminology or speculative impact-force claims.

Keep those audiences separate. Do not turn a compact stakeholder view or vendor request into an engineering dump.

## Source-of-truth hierarchy

When values disagree, use this order:

1. Explicit current user requirements.
2. Shared domain types and pure calculations in `lib/`.
3. Regression assertions in `lib/engineering/validate.ts`.
4. UI defaults and explanatory copy.
5. Historical candidates, quotes, screenshots, and whiteboard references.

Historical values are reference points, not requirements. In particular, a supplier's earlier offer to pre-set a different spring to `0.80 in` does not establish `0.80 in` as the operating or preset height of a new geometry.

## Project map and ownership

Keep domain logic below the UI. React components should format and coordinate results, not invent spring equations.

- `lib/engineering/spring.ts`: canonical low-level spring equations.
- `lib/engineering/deflectionConstraint.ts`: utilization and clearance conversions.
- `lib/engineering/nomenclature.ts`: canonical labels and symbols. Reuse it instead of introducing synonyms.
- `lib/v2/evaluateCandidate.ts`: one pure V2 geometry evaluation.
- `lib/v2/sweepDesignSpace.ts`, `pareto.ts`, `candidateSort.ts`: fixed-package search and ranking.
- `lib/v2/packageDiscovery.ts`: spring-first package search and frontier recommendations.
- `lib/v2/toleranceEnvelope.ts`: independent manufacturing-corner estimate.
- `lib/v2/impactLens.ts`, `impactMaterials.ts`: idealized mass/collision lens.
- `lib/v2/scenarioStorage.ts`, `shortlist.ts`: persisted scenario migration and scenario-sensitive identity.
- `lib/v2/candidateCsv.ts`, `packageDiscoveryCsv.ts`, `dataSheet.ts`: exports.
- `lib/evaluator/evaluateSpring.ts`: two-load-point evaluator solve.
- `components/SpringStateIllustration/`: shared four-state rendering.
- `components/CommitNumberInput.tsx`: buffered numeric editing; use this for editable numeric controls.
- `components/v2/`: V2 presentation and interaction.
- `cad-service/`: geometry rendering service only. It consumes derived spring geometry; it must not become a second spring-physics implementation.
- `app/*/page.tsx`: thin route entry points. Keep them thin.

If a formula is needed by more than one view, implement it once in `lib/` and consume the same result in the UI and export code.

## Units and numerical conventions

- Internal spring calculations use inches, pounds-force, psi, pound-mass, and in·lbf unless the type or variable explicitly says otherwise.
- Convert only at input/output boundaries. Put units in exported column names.
- Keep full precision in calculations. Round only for display or stable keys.
- Use a small explicit epsilon for boundary comparisons; do not alter equations to make a candidate visually pass.
- Spring forces are quasi-static unless explicitly produced by the impact lens.

## Canonical spring model

For a round-wire compression spring:

```text
D  = OD - d
ID = OD - 2d
C  = D / d
k  = G d^4 / (8 D^3 Na)
Hs_nom = Nt d
Hs_max = (1 + solidHeightTolerance) Hs_nom
```

In the V2 squared-and-ground model, `Nt = Na + 2`. The evaluator makes inactive end coils editable, so do not hard-code `+2` there.

For the four mechanism states:

```text
B  = Lc + s
L1 = Lc
L2 = B
L3 = B + y_critical
L4 = B + y_total

x0 = F0 / k
Lf = Lc + x0

F2 = F0 - k s
F3 = F0 - k (s + y_critical)
F4 = F0 - k (s + y_total)
```

Definitions:

- `F0` is the nominal armed force target, not the tolerance-inclusive maximum.
- `Lc` is the armed/compressed operating height.
- `s` is hammer run-up before contact.
- `B` is axial budget and hammer-contact spring length; it is not the armed spring height.
- `y_critical` is travel from contact to the point of no return.
- `y_total` is total coupled travel after contact.
- `F4` is the quasi-static spring force at the final modeled length.
- `F4 - opposingPreload` is the net static driving force at the end.

The total-travel ordering must remain `0 < y_critical <= y_total`.

### Fixed-package optimizer

The V2 fixed-package evaluator starts with geometry and the nominal `F0`, then derives armed height from the configured deflection-utilization screen:

```text
x0 = F0 / k
clearanceAboveHsMax = x0 (1 / u_max - 1)
Lc = Hs_max + clearanceAboveHsMax
s  = B - Lc
Lf = Lc + x0
```

This is why changing wire diameter or coil count can change package allocation even when `F0` is fixed.

### Direct evaluator

The evaluator starts with two nominal load-at-height points:

```text
L4 = B + y_total
k  = (F0 - F4_target) / (L4 - Lc)
Lf = Lc + F0 / k
Na = G d^4 / (8 D^3 k)
```

Changing wire diameter in this workflow need not change the requested force curve. It changes the coil count required to realize that curve and can make the resulting geometry practical or impossible. Never imply that a mathematically back-solved coil count is automatically manufacturable.

## Radial envelope rules

The spring occupies an annulus, so OD and ID are independent hard checks:

- Finished spring OD must not exceed the housing bore.
- Nominal study OD normally equals the finished-OD ceiling minus the configured positive OD tolerance/clearance allowance.
- Spring ID must be at least the configured annulus/guide boundary.
- A spring that passes OD can still fail ID because `ID = OD - 2d`.
- Wire preference is not a dimensional requirement. In package discovery it is only a tie-breaker after work and critical-window work.

Do not assume that winding on a mandrel makes ID exact or removes the need for supplier tolerances. Treat both final OD and usable ID/guide clearance as vendor-confirmed dimensions.

## Work, energy, and impact language

Spring work is the area under the force-versus-travel curve. For a linear unloading interval of length `t` starting at force `F`:

```text
W = F t - 0.5 k t^2
```

Clip the interval at the point where the spring becomes slack; work cannot become negative.

Use the established meanings:

- `Whammer`: spring work during hammer run-up, from armed state to contact.
- `Wcritical`: spring work during the critical release window.
- `Wpost`: work after the critical point through the coupled-travel end.
- `Wcoupled`: work from contact through the full coupled travel.
- Net post-critical work subtracts opposing-preload work over only the post-critical distance.

Never equate spring force at hammer contact with dynamic impact force. The impact lens is an idealized, one-dimensional comparison aid:

- Volume mode resolves mass from density times volume.
- Direct mode uses the supplied effective moving mass.
- Efficiency and restitution are assumptions, not spring properties.
- Report its force-equivalent outputs as approximate (`~` or `approx.`), never as a predicted peak contact force.
- The actual contact-time force history depends on compliance, contact geometry, damping, deformation, friction, and measured material behavior that this app does not solve.

When impact assumptions appear in both UI and CSV, they must come from the same shared scenario and calculation result.

## Package-Punch discovery contract

Package discovery searches `B`, `d`, and `Na` together. For each axial budget it retains the accepted geometry with the greatest `Whammer`, using critical-window work, preferred-wire distance, and lower stress only as ordered tie-breakers. It then removes points dominated by a shorter package with equal or greater work.

Recommendation cards mean:

- Balanced knee: the greatest normalized departure from the straight line joining frontier endpoints; it is a heuristic tradeoff, not a physical discontinuity.
- Compact 90% punch: the shortest frontier package with at least 90% of the maximum work found in the searched range.
- Maximum punch: the greatest run-up work found inside the searched package range.

The displayed order must follow increasing package length: Balanced knee, Compact 90% punch, Maximum punch when those roles are distinct.

Changing the search range can change all three recommendations. Never describe a search-bound maximum as a global mathematical optimum.

## Constraints versus screens

Keep hard requirements, advisory screens, and supplier-review items visually and logically distinct.

Hard or explicitly configured constraints include:

- nominal armed-force target;
- absolute armed-force cap, including the enabled tolerance estimate;
- OD and ID envelope;
- ordered mechanism travel;
- positive run-up and positive spring force through the required states;
- end-force minimum and opposing-preload requirement;
- optional armed-height range when explicitly enabled.

Screens and modeling assumptions include:

- the default 84% maximum working-deflection utilization;
- the selected tensile-strength basis and maximum stress ratio;
- the usual spring-index range;
- independent rate/free-length tolerance corners;
- idealized impact efficiency and restitution.

The 40–60% tensile-strength band and the `>60%` redesign/preset-review region are Lee-derived design guidance, not yield criteria or universal allowable stress. Presetting can reduce subsequent set; it does not erase coil bind, stress, dimensional tolerance, buckling, fatigue, or manufacturability concerns.

## Tolerance model

The current manufacturing estimate independently stacks spring-rate and free-length corners at fixed mechanism heights. It is deliberately conservative and advisory.

- Do not call it a statistical confidence interval.
- Do not call its extrema supplier-guaranteed loads.
- Keep nominal target and absolute maximum as separate fields.
- Tolerance feasibility must check both the armed-force cap and end-force floor when enabled.
- Supplier-guaranteed loads at specified heights supersede this estimate.

If the tolerance model changes, update its UI copy, exports, persistence, scenario signature, and validation fixtures together.

## Terminology that must not drift

- Presetting is a manufacturing conditioning operation. “Preset to 0.80 in” means the supplier temporarily compresses the spring to that height during processing; it does not automatically make `0.80 in` the design's armed height or minimum operating height.
- Armed height, preset height, solid height, free length, axial budget, and maximum operating length are different quantities.
- Start force means nominal load at the armed height unless explicitly labeled as an absolute/tolerance-inclusive maximum.
- End force means quasi-static load at `L4`, not delivered impact force.
- “Critical” refers only to the configured point-of-no-return window.

Use the labels in `lib/engineering/nomenclature.ts`. When adding a new quantity, add its canonical label there before inventing UI-specific wording.

## UI behavior and communication

- Lead with the controlling inputs and decision-relevant outputs. Put secondary assumptions behind a disclosure or a small `Assumptions` control.
- Keep defaults visible and editable, but visually secondary to the main task.
- Distinguish user inputs, derived values, warnings, and vendor-review items.
- Reuse the four-state mechanism illustration for candidate comparisons instead of building divergent summaries.
- Numeric inputs must permit normal editing, including an empty draft. Use `CommitNumberInput` or `OptionalCommitNumberInput`; commit on Enter or blur rather than recalculating on each keystroke.
- Do not add warning walls. State a limitation once, close to the affected result, in plain language.
- Preserve keyboard access, labels, `aria-*` disclosure state, and discoverable test ids for export actions.
- Keep SVG output deterministic. Round generated coordinates where needed to avoid server/client hydration differences.

## Persistence and compatibility

The app stores user scenarios in browser storage. Treat stored data as a public compatibility surface.

- Merge saved values over current defaults.
- Validate and clamp every added numeric field.
- Add an explicit legacy migration when semantics change; do not reinterpret old values silently.
- Keep mode fields and nullable values backward compatible.
- Include every assumption that can change candidate validity or ranking in `v2ScenarioSignature`; otherwise stale shortlist entries can appear valid under a different scenario.
- Do not bump a storage key merely to avoid writing a migration.

## CSV and share-sheet contract

Exports are engineering records, not decorative downloads.

- Use explicit-unit headers such as `_in`, `_lbf`, `_psi`, `_lbm`, and `_in_lbf`.
- Export the same computed values shown in the UI; never recalculate formulas inside a React component or CSV formatter.
- Include the assumptions required to reproduce the result, including resolved effective masses and mass-input mode for impact metrics.
- Keep nominal values, tolerance estimates, and approximate impact-equivalent values separately labeled.
- Preserve row/header alignment and frontier/table order.
- Update `lib/engineering/validate.ts` whenever columns are added, removed, or reordered.

## Working procedure

Before editing:

1. Read this file and inspect `git status`.
2. Preserve unrelated user changes; do not reset or rewrite them.
3. Locate the pure calculation or shared component that owns the behavior.
4. For Next.js behavior, read the matching local guide under `node_modules/next/dist/docs/` as required by the generated block above.

While editing:

1. Change the smallest authoritative layer.
2. Keep calculations pure and deterministic.
3. Add or update a focused assertion in `lib/engineering/validate.ts` for every changed engineering invariant, migration, ranking rule, or export schema.
4. Keep presentation changes in components and domain changes in `lib/`.
5. Avoid unrelated formatting churn.

Before handing off:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Run all four for substantive calculation, persistence, export, or cross-component changes. For a narrow copy/style-only change, use proportionate checks but at minimum run lint on the changed code. Visually verify the affected workflow at its real route and test the boundary state that motivated the change, not only the default state.

## Regression cases that must stay covered

- Nominal armed force and absolute armed-force maximum are independent.
- A candidate can pass OD and fail minimum ID.
- `y_total` can exceed `y_critical`, with separate critical and post-critical work.
- Opposing preload reduces net post-critical work and net end force without changing gross spring force.
- The direct evaluator can preserve the same force curve across wire diameters by changing coil count.
- Fixed-package optimization derives armed height; spring-first discovery must not inherit a remembered fixed CAD height.
- Preferred wire diameter is a tie-breaker, not a forced choice.
- Enabled tolerance corners can reject a nominally passing candidate.
- Old stored scenarios receive sane defaults and preserve their prior intent.
- UI and CSV use the same resolved impact masses and approximate collision outputs.
- CSV headers and row values remain structurally aligned.

## Common failure modes to prevent

- Treating a supplier's preset compression height as the spring's operating height.
- Calling a nominal target an absolute cap, or vice versa.
- Checking housing OD while forgetting the annulus ID.
- Treating 84% deflection utilization as a material law.
- Claiming that presetting makes a high-stress geometry automatically acceptable.
- Calling a frontier recommendation globally optimal when it is bounded by the configured search.
- Optimizing fixed geometry when the actual question is package versus punch.
- Comparing spring force directly with dynamic impact force.
- Presenting an energy-over-distance equivalent as a peak impact force.
- Duplicating formulas in UI, export, or CAD code.
- Recalculating numeric fields during incomplete typing.
- Adding a stored field without migration, signature coverage, and regression tests.

## Git and deployment

- Default branch: `main`.
- Repository: `https://github.com/CinnamonGrossCrunch/Spring_Engineer.git`.
- Production app: `https://sigma-aerospace-spring-engine.vercel.app`.
- The linked Vercel project is `spring-mechanism-explorer`.
- A push to `main` is expected to trigger the production deployment through the Git integration.

Commit, push, or deploy only when the user asks. Before committing, review the diff and include only task-related files. After a requested deployment, verify the exact commit, the Vercel deployment result, and the changed production route. A successful local build or `git push` alone is not proof that production contains the change.

Never commit secrets, `.env*` values, or Vercel credentials.
