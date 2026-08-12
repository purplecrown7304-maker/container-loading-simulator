# Container Loading Simulator — Codex Development Rules

## 1. Project goal
Build and maintain a web-based 3D container loading simulator that optimizes box and pallet placement while respecting physical, operational, weight, height, and accessibility constraints.

## 2. Development principles
- Preserve existing functionality unless an explicit change is requested.
- Keep UI logic and loading-engine logic separated.
- Prefer TypeScript for application and engine code.
- All loading decisions must be deterministic for identical inputs unless a stochastic optimizer is explicitly introduced.
- Any algorithm change must include or update tests for the changed rule.
- Never silently relax a physical or safety constraint to obtain a higher fill rate.
- Mobile usability must be considered for all major UI changes.

## 3. Loading direction
- Load from the deepest inside area of the container toward the door.
- Within a loading region, fill from the floor upward.
- Heavy cargo should generally be placed deeper and lower before lighter cargo, unless another hard constraint prevents it.

## 4. Box-type priority
- Determine box-type loading priority using both CBM contribution and weight.
- Default ordering is descending priority so larger/heavier cargo is handled earlier.
- Keep identical box types together whenever feasible.
- For a box type, try to fill a complete vertical block from the inside toward the ceiling before moving toward the door.
- If the remaining quantity of that box type cannot form an acceptable full block, defer the remainder to a later phase instead of creating scattered partial stacks.
- Deferred remainders may be handled during the final mixed-loading phase.

## 5. Box-only loading rules
- Do not place isolated single boxes in the center of otherwise usable loading space when a stable edge/back position is available.
- Avoid L-shaped unstable or highly fragmented arrangements when a rectangular/block arrangement is possible.
- Prefer balanced rectangular blocks.
- Do not allow a middle region to become unnecessarily taller than the deeper region if swapping upper cargo can create a more stable profile.
- Prevent overlap and container-wall penetration.
- Do not exceed container internal dimensions.
- Do not apply a generic box-only height restriction unless a physical/container-specific rule requires it.

## 6. Pallet rules
- Pallet mode and box-only mode must remain separately controllable.
- When pallets are used, prioritize pallet groups by total weight, heavier groups deeper first.
- Minimize the number of pallets where feasible without violating stability or weight constraints.
- No pallet or cargo overhang outside its allowed footprint.
- Cargo on a pallet must stay centered/balanced unless an explicit loading rule allows otherwise.
- Do not stack above configured pallet stacking limits.
- If a pallet has unused capacity and consolidation is valid, prefer adding compatible cargo to the previous pallet rather than wasting an additional pallet.

## 7. Mixed loading
Mixed loading is the final fallback phase, not the first choice.

Recommended phase order:
1. Sort box types by CBM/weight priority.
2. Load identical box types into compact inside-first vertical blocks.
3. Defer residues that cannot make an acceptable block.
4. Load the deferred residues using mixed loading while preserving stability and physical constraints.

## 8. Weight and support constraints
- Respect each cargo item's maximum supported/top-load weight when such data exists.
- Respect maximum stacking-layer settings when configured.
- A lower box must not carry more supported weight than its allowed limit.
- Total container payload must not exceed the configured container weight limit.
- Prefer lower center of gravity for heavy cargo.

## 9. Accessibility / working height
When an operational retrieval-height rule is enabled, use it as an ergonomic constraint rather than an arbitrary stacking cap. The rule should be configurable and clearly separated from the physical ceiling constraint.

## 10. Validation after every loading run
The engine should be able to report or validate:
- collisions/overlaps
- wall or ceiling penetration
- floor penetration
- unsupported cargo
- stacking-limit violations
- top-load/support-weight violations
- container payload violation
- remaining CBM
- loaded quantity vs waiting quantity
- center of gravity / weight distribution
- pallet count when pallet mode is used
- deferred/mixed-loading cargo and the reason it was deferred

## 11. Architecture guidance
Prefer separation similar to:
- `app/` or `src/app/`: pages and routing
- `components/`: UI and 3D visualization
- `engine/`: loading algorithms and constraints
- `types/`: shared domain types
- `lib/`: utilities/data access
- `tests/`: deterministic loading-engine tests

Suggested engine modules:
- `loadingEngine.ts`
- `boxPacking.ts`
- `palletPacking.ts`
- `mixedPacking.ts`
- `collision.ts`
- `constraints.ts`
- `weightBalance.ts`

## 12. Codex workflow
Before modifying loading logic:
1. Identify the current rule and relevant code path.
2. Explain which hard constraints and optimization preferences are affected.
3. Make the smallest coherent change.
4. Run available type checks, tests, and build checks.
5. Report what changed and any remaining conflict between rules.

If two project rules conflict, do not guess silently. Preserve hard physical constraints first and document the conflict in the result or code comments.
