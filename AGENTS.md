# Container Loading Simulator Development Rules

## Current owner decision

On 2026-10-04 the owner explicitly replaced the previous loading method with the supplied `load-sim-all-in-one(3).md` method. The previous B loading method and selection flag are retired. Git history retains the old implementation for review; it must not be an active fallback.

## Single loading authority

- `src/load-sim/pack.ts`, `validate.ts`, `types.ts`, and `presets.ts` implement A.
- `loadingEngine.loadContainer` is a stable application facade for A only. Its compatibility strategy argument must never select a retired algorithm.
- A `pack` determines placement. A `canPlace` is incremental and intentionally does not cover every final rule. Always perform A `validate` after the final transform.
- A may return a packed candidate with final hard errors. Preserve those errors and quantities; do not call that result accepted.
- Do not reintroduce Hybrid/StrictWall/container Beam, residual/trench/top-layer corrections, B centering, strategy retries, or old final-result optimizers.
- Support, top-load, tier, clearance, CG, orientation and unload semantics are the supplied A semantics. Do not silently add the old B conservative guards back.
- Performance changes must preserve candidate/order selection, numeric settings, deterministic results and every A check. Never use wall-clock cutoffs to publish partial success.

## Adapters and inputs

- App length and coordinates are metres; A uses millimetres. Weight remains kilograms. X is depth toward the door, Y width, Z height.
- Preserve exact six-axis orientation metadata. A carton defaults may tip; explicit `thisSideUp`, `allowedOrientations`, or no-rotation inputs constrain that policy.
- SKU quantity expands into unique per-instance IDs and collapses back without losing cargo, waiting quantity, product EA, gross weight, or package metadata.
- Validate source identity, dimensions, orientation agreement, finite coordinates/weights, duplicate-SKU metadata conflicts and quantities at the boundary.
- Missing top-load means no declared limit; zero means no cargo above.
- kg/m² floor-area measurements are not A kg/m line-load limits. Never copy or convert one into the other without an actual physical model.
- Equipment and cargo inputs remain explicit data. Do not insert example truck axle geometry or loads into actual equipment.
- A representative defaults and example presets are not independently verified law, manufacturer ratings, or real transport safety certification. Label the source and unconfigured checks accurately.

## Pallet preparation boundary

A accepts completed pallet units but does not construct pallets. Existing deck/package preparation may remain as an explicitly separate preprocessing function.

- Shared deck-only geometry, support, packaging and consolidation helpers may be retained for preparation; they may not become a container-placement fallback.
- All completed rigid pallets and any actual loose remainder enter A once for container placement. Remove container-specific lane/stack arrangers, demotion thresholds, recentering and adaptive alternative layouts.
- A rigid pallet uses its actual gross weight, loaded height and CG. Never count both the rigid unit and its displayed child boxes in vehicle payload.
- Preserve explicit stop, temperature and segregation metadata while preparing compatible units.
- Apply a rigid unit transform to every child box and its CG. Keep canonical A input and displayed geometry in the result proof, including their complete mapping.
- Explain preparation-only rules separately from A container rules in developer reports.

## Result acceptance and optional inspection

- `rule-engine/acceptance.ts` supplies an exact-input, exact-layout proof of A static validation.
- Every result/work-order/export entry validates the current source. Stale requests may not overwrite a newer current target before comparison.
- A hard errors prevent accepted output; warnings stay visible. Empty/remaining-only results provide reasons without issuing a loading approval.
- Rapier and inertia are optional separate inspections. They cannot grant or revoke A static acceptance or silently repack its layout.
- Never fabricate an inertia certificate from A static success. Use the label `A 정적 규칙 검증` and state that it is not actual transport safety certification.
- Input, dimensions, orientation, metadata, packing or rigid/display mapping changes invalidate stale proof.
- Cancellation and late worker responses must never publish an obsolete layout.

## Verification

- Test direct A output parity, determinism, conservation per SKU and package/demand distinctions.
- Cover orientation/CG round-trips, finite inputs, zero/omitted limits, final hard errors, stale-proof rejection, manual/group movement and worker cancellation.
- Cover pallet rigid-unit transforms, actual gross payload once, loose remainder and complete display mapping.
- Run tests, TypeScript, architecture checks, build and bundle checks on final code. Distinguish browser tests that passed, failed, or could not run.
- Compare the same input against B historical baseline `8f80a6c9de2a7f2e9c86bcfa32b24c0a742d8510` when explaining changed outcomes. Never ship the old solver as runtime compatibility.
- Preserve surrounding application input, assets, user data and output functionality unless needed for the authorized method change.
- No direct main commits, push, merge or deployment without the owner's authorization. Reports belong in PR descriptions or requested deliverables, not ad hoc repository-root report files.

## Team workflow

Follow `docs/agents/COLLABORATION.md` for implementer/reviewer assignment and PR review format. Check explicit issue/PR labels. Work on a scoped implementation branch, preserve unaffected user work, and report safety or business-policy conflicts for owner judgment. The current A-method instruction supersedes older algorithm descriptions, not unrelated collaboration or publication boundaries.
