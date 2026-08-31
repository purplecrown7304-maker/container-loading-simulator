# Container Loading Simulator — Codex Development Rules

## 1. Project goal
Build and maintain a web-based 3D container loading simulator that optimizes box and pallet placement while respecting physical, operational, weight, support, compression, balance, height, and accessibility constraints.

## 2. Development principles
- Preserve existing functionality unless an explicit change is requested.
- Keep UI logic and loading-engine logic separated.
- Prefer TypeScript for application and engine code.
- All loading decisions must be deterministic for identical inputs unless a stochastic optimizer is explicitly introduced.
- Any algorithm change must include or update tests for the changed rule.
- Never silently relax a physical or safety constraint to obtain a higher fill rate.
- Hard safety constraints always outrank optimization preferences.
- Mobile usability must be considered for all major UI changes.

## 3. DIRECT BOX baseline algorithm
The legacy fixed sequence of `CBM/weight sort -> full vertical stacks -> x shelf progression -> door-side tail mixing` is retired.

The default DIRECT BOX engine is:
1. Generate compact homogeneous rectangular block candidates for every SKU and allowed floor orientation.
2. Maintain three-dimensional Maximal Empty Spaces (EMS) after every accepted block.
3. Search several competing packing states with deterministic Beam Search instead of committing to the first greedy placement.
4. Score candidates using space utilization, contact/compactness, low center of gravity, longitudinal/lateral balance, and the selected operating strategy.
5. After homogeneous-block search, allow residual single-box candidates on the same EMS + Beam Search so leftovers may fill any physically safe gap.
6. Validate the final placements again for bounds and collisions; all support/stack/top-load/payload rules must already have been enforced during candidate generation.

## 4. Loading direction and weight distribution
- Prefer the deepest usable empty space toward the door as a compactness/work-sequence preference, not as a rule that forces heavy cargo into one end.
- Prefer floor positions before elevated positions when other constraints and optimization quality are comparable.
- Heavy cargo should preferentially remain low to reduce vertical center of gravity.
- Do not reward a plan merely because more weight is in the inner half of the container.
- Penalize excessive longitudinal or lateral concentration. As an operational warning target, avoid putting more than about 60% of loaded cargo weight in either longitudinal half when a feasible alternative exists.
- Center-of-gravity and weight-distribution objectives are optimization preferences; container payload, support, stacking, and compression limits are hard constraints.

## 5. Box candidate generation
- Keep identical box types together by generating homogeneous rectangular blocks whenever feasible.
- Do not use a fixed global CBM/weight SKU order as the primary packing algorithm.
- Evaluate competing SKU blocks against the current empty-space geometry.
- CBM, block fill ratio, quantity, contact area, weight, center of gravity, and unloading order may contribute to candidate scores.
- Use cargo ID only as the final deterministic tie-break, not as a business priority.
- Respect `allowRotation`; never invent an orientation that the cargo input disallows.
- Avoid isolated center boxes, L-shaped fragmentation, unsupported bridging, wall penetration, and unnecessary holes when a compact rectangular alternative exists.

## 6. Maximal Empty Space rules
- Empty spaces are three-dimensional rectangular regions derived from the container and accepted occupied blocks.
- After placement, subtract the occupied block from intersecting spaces, de-duplicate equivalent spaces, and remove spaces fully contained by a larger equivalent candidate space.
- EMS regions may overlap each other as a search representation; actual cargo placements may never overlap.
- Residual mixed loading may reuse a safe inner/side/top EMS. It must not be artificially restricted to a door-side tail zone.

## 7. Beam Search rules
- Keep multiple high-quality candidate states so an early greedy choice does not permanently damage utilization or balance.
- Beam width and candidate caps may be tuned for browser performance, but must remain deterministic.
- `capacity` strategy emphasizes safe space utilization.
- `stability` strategy emphasizes low center of gravity, balanced weight distribution, and stable contact more strongly.
- `unloading` strategy adds unload-order placement preference while retaining all hard safety constraints.
- Never increase fill rate by weakening support, top-load, stacking, bounds, collision, or payload checks.

## 8. Weight, support, and compression constraints
- Respect each cargo item's maximum supported/top-load weight when data exists.
- Cumulative transmitted load through all supported boxes above a lower box must be considered; checking only the immediately upper box is insufficient.
- Respect maximum stacking-layer settings when configured, including mixed-SKU support chains.
- Elevated cargo must satisfy the configured support ratio and must keep its projected center of gravity inside the support envelope.
- Total container payload must not exceed the configured container weight limit.
- Prefer lower center of gravity for heavy cargo.
- Do not treat CBM or loaded-count improvement as justification for violating any of these constraints.

## 9. Pallet rules
- Pallet mode and box-only mode must remain separately controllable.
- DIRECT BOX algorithm changes do not silently rewrite pallet optimization rules.
- No pallet or cargo overhang outside its allowed footprint.
- Cargo on a pallet must stay centered/balanced unless an explicit loading rule allows otherwise.
- Do not stack above configured pallet stacking limits.
- Respect pallet load, top-load, support, packaging-clearance, and container payload limits.

## 10. Accessibility / working height
When an operational retrieval-height rule is enabled, use it as an ergonomic constraint rather than an arbitrary stacking cap. The rule must be configurable and clearly separated from the physical ceiling constraint.

## 11. Validation after every loading run
The engine should be able to report or validate:
- collisions/overlaps
- wall or ceiling penetration
- floor penetration
- unsupported cargo
- stacking-limit violations
- cumulative top-load/support-weight violations
- container payload violation
- remaining CBM
- loaded quantity vs waiting quantity
- center of gravity / longitudinal and lateral weight distribution
- floor-load distribution
- pallet count when pallet mode is used
- residual/mixed cargo and the reason it could not be loaded

## 12. Architecture guidance
Prefer separation similar to:
- `app/` or `src/app/`: pages and routing
- `components/`: UI and 3D visualization
- `engine/`: loading algorithms and constraints
- `types/`: shared domain types
- `lib/`: utilities/data access
- `tests/`: deterministic loading-engine tests

DIRECT BOX core modules include:
- `loadingEngine.ts`: stable public entry point and result publishing
- `blockSpaceBeamPacker.ts`: homogeneous blocks + EMS + Beam Search
- `constraints.ts`: container bounds/collision checks
- `support.ts`: support-area and support-envelope checks
- `stacking.ts`: stacking depth and cumulative top-load checks
- `weightBalance.ts`: 3D center-of-gravity and distribution evaluation

## 13. Codex workflow
Before modifying loading logic:
1. Identify the current rule and relevant code path.
2. Explain which hard constraints and optimization preferences are affected.
3. Make one coherent algorithm change with matching regression tests.
4. Run available type checks, tests, architecture checks, and build checks.
5. Report what changed and any remaining performance/safety trade-offs.

If two project rules conflict, preserve hard physical constraints first and document the conflict in the result or code comments.
