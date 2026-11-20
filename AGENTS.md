# Container Loading Simulator — Codex Development Rules (Revised)

> Revision baseline: Claude review, 2026-09-28. Numeric defaults must remain configurable rather than being buried as engine constants.

## 1. Project goal
Build and maintain a web-based 3D container loading simulator that optimizes box and pallet placement, including mixed loads of directly loaded boxes and palletized cargo in a single container, while respecting physical, operational, weight, support, compression, balance, height, unloading-order, and accessibility constraints.

## 2. Development principles
- Preserve existing functionality unless an explicit change is requested.
- Keep UI logic and loading-engine logic separated.
- Prefer TypeScript for application and engine code.
- All loading decisions must be deterministic for identical inputs unless a stochastic optimizer is explicitly introduced.
- Determinism includes performance limits: beam width, candidate caps, and iteration limits must be fixed functions of input. Wall-clock/device-speed cutoffs are forbidden inside the engine. Cancellation must never publish a partial layout as a normal result.
- Any algorithm change must include or update tests for the changed rule.
- Never silently relax a physical or safety constraint to obtain a higher fill rate, fewer pallets, or better balance.
- Hard safety constraints always outrank optimization preferences.
- Mobile usability must be considered for all major UI changes.

## 2A. Owner-approved scoped rule repair (2026-10-06)

For legacy **direct-box** loading, the owner's latest work sequence supersedes older
conflicting optimization preferences below: load continuously from the inner X=0
end toward the +X door, by **individual gross package weight descending**. Keep
SKU/height blocks contiguous. Explicit strict unloading constraints take priority;
when they conflict with the weight order, retain strict stops and disclose the
conflict. Hard geometry, support, cumulative compression, stacking, floor load,
payload including required securing, and the existing operational CG acceptance
range remain unchanged or more conservative. Exact 50:50 is not a reason to reorder
working blocks. Do not apply X-centering, wall swaps, residual back-filling or
sparse-top postpasses that undo this sequence. The order-preserving solver may
compare safe tier/orientation profiles instead.

This scoped policy does **not** remove the independent A-rules or pallet/MIXED
planners. Shared legacy final acceptance uses at least 80% support and 1 mm contact;
manual/residual insertion may be more conservative. Failed/incomplete results may
be exported only as clearly marked review documents. Export permission, completed
scenario execution, and a current static-plus-physics PASS are distinct states.
See `docs/engine/LOADING_RULES.md` for the consolidated acceptance contract.

## 2B. Owner-approved numerical review scenarios (2026-10-06)

The owner explicitly requested selecting ranges above normal limits with warnings.
Implement this only as an opt-in **WHAT-IF REVIEW** for legacy direct boxes; the
strict default, original equipment/catalog values and original cargo strength
metadata remain unchanged. A-rules, pallet and MIXED planners do not silently
inherit numerical exceptions. Selected finite, bounded scenario values may allow
continued calculation for payload (including securing), floor load, support ratio,
stack depth and top load. Unselected limits, geometry, collision, positive physical
contact/center support, valid input, and explicit strict unloading remain blocking.

Every review output is exploratory and never dispatch approval or safety PASS.
Preserve all actual-limit findings and their severity, original/scenario/actual
values, excess amounts and unknown provenance. Internal inertia comparison values
are separate from equipment ratings; changing a scenario threshold does not erase
baseline failures. The review designation must survive 3D/result UI, manual edits,
save/restore, JSON/CSV/Excel and printable reports. Any scenario/input change
invalidates old certification; returning to strict requires original checks again.
Computational input bounds are not safety margins. See the review section in
`docs/engine/LOADING_RULES.md` for scope and UI behavior.

## 2C. Owner-approved rule consolidation (2026-10-06)

The owner approved one priority table for legacy **direct-box** loading. It is in
`docs/engine/LOADING_RULES.md` section 1 and overrides any conflicting sentence in
sections 2A, 3, 3A, 4 and 5 of this file:

- Hard limits and explicit strict unloading block a placement. Loaded quantity comes
  next. The inner-to-door weight sequence of 2A is used while it loads all cargo within
  the CG range; otherwise the engine switches to level loading (heavy cartons in the
  lowest tiers, lighter cartons above, one common low height).
- Longitudinal CG is a verdict, not a silent reason to drop cargo. A full load that
  fails CG is shown with its error and a separate CG-compliant alternative; cartons
  removed there carry `CG_LIMIT`. The allowed deviation scales with
  `maxPayload / loadedWeight` and equals the previous 5% at full payload.
- Securing and void fill follow actual voids, not carton count. `VOID_FILL_REQUIRED`
  must reach every output. `VOID_FILL_KG_PER_M3` is a placeholder until the company
  material table exists; do not treat it as a verified value. Owner decision 2026-11-19:
  the 3D view draws planned fill materials only. A void with no applicable material is
  not drawn there (formerly a red wire box); it stays in the plan, the finding, the result
  list and every report and export.
- Section 3 (EMS + Beam Search) describes the pallet/MIXED search, not the direct-box
  default. Section 5's sparse top-tier re-insertion (#86) applies to pallet, MIXED and
  A paths only. Section 4's "CG is an optimization preference" is replaced by the
  verdict rule above.
- A-rules, pallet and MIXED planners are unchanged by this consolidation.

## 2D. Owner-approved pallet rule: a load that cannot move comes first (2026-11-18)

Owner instruction: "무게 중심보다는 적재물이나 파렛트가 움직이지 않게 잘 적재되는 것이
우선이다." For legacy **pallet** loading this overrides conflicting sentences in sections
4 and 9 and the "centre alignment" wording of C-13. Full text:
`docs/engine/LOADING_RULES.md` section 7A.

- Pallets are loaded tight: the group stays against the inner wall (X=0) with its rows
  touching; lanes touch and are centred across the width. Do not translate the group to
  the container centre or spread it over the length to even out weight.
- Longitudinal CG for pallets uses the proportional verdict of section 2C. Move the
  group toward the door only when, and only as far as, that verdict requires.
- A banded pallet unit that overturns under the certification's own acceleration cannot
  pass. Compare this static tipping limit after loaded quantity (and strict unloading)
  and **before** pallet count. Never leave cargo behind for it. Section 9's "centre of
  gravity is the last preference" still holds for balance; it does not permit a unit
  load that tips.
- Pallet count may be reduced with denser mixed-orientation tier patterns only while
  every rebuilt unit stays inside the tipping limit and every hard limit holds.
- The inertia certification, its thresholds and all hard limits are unchanged, and the
  static check never replaces the certification result. A-rules keep their own path.

## 2E. Owner-approved manual staging rules (2026-11-19)

Owner decisions for cargo moved by hand in the staging view (`engine/stagingCommands.ts`:
load, in-vehicle move, withdraw, undo), legacy rules only. Full text:
`docs/engine/LOADING_RULES.md` section 7B.

- A pallet stacked by hand is judged by the planner's own stacking support rule: the lower
  pallet's top cartons carry at least 80% of the upper pallet's base, through that
  pallet's wrapping and corner guards. The operational validator uses the same rule, so
  a packaged second tier is no longer reported as floating. Stack levels, static load,
  top load, ceiling, floor load, payload and collision checks are unchanged.
- The vehicle's centre of gravity (`CG_LONGITUDINAL`, `CG_LATERAL`) is a verdict on a
  manual move, not a reason to refuse it. The move is applied, the error stays on the
  plan, and the plan cannot pass transport verification or be dispatched while it stands.
  Every other new or worsened error still refuses the move.
- A position the program itself proposes keeps the centre of gravity in range whenever
  any position does.
- Drag aiming (onto the cargo under the pointer, flush against a wall or neighbour within
  0.1 m) only chooses coordinates; the checks above decide.
- A-rules, the WHAT-IF review, the coordinate-entry manual editor and group moves are
  unchanged.

## 2F. Owner-approved automatic loading around hand-placed pallets (2026-11-19)

Owner instruction: "팔렛트를 옮기고 오른쪽 아래 자동 적재 버튼을 다시 누르면 옮긴 위치에서의
최적화 적재가 된다." Legacy **pallet** mode only (`engine/palletFixedArrangement.ts`,
`stagingPins.ts`). Full text: `docs/engine/LOADING_RULES.md` section 7C.

- A pallet set down by dragging in the staging view is kept exactly where it is, position
  and cartons, by the next automatic loading; a pallet it stands on is kept with it. A
  place the program chose is not kept. Unpin, withdrawal and undo release it. Pins hold for
  one input and one session and are never stored.
- The rest is planned by the normal planner within the payload the kept pallets leave and
  set down in the planner's order from the inner wall. A column that would stand in a kept
  pallet slides toward the door in its lane until it stands clear and touches it (2D).
  Cargo with no floor place left stays waiting with `NO_FEASIBLE_EMS`; with no payload
  left, `PAYLOAD_LIMIT`. Nothing is stacked onto or under a kept pallet.
- The centre of gravity is judged for the whole load. The planned group leaves the inner
  wall only as far as the longitudinal verdict requires. Compare the planner's layout, its
  mirror image across the width and both centred across the width, in this order: loaded
  quantity, longitudinal verdict, lateral verdict, shortest planned block, fewest columns
  that gave way, the planner's own layout. Pass counts are fixed; the result is deterministic.
- No hard limit is relaxed. The combined plan goes through the same operational validation
  and inertia certification as any plan, and an error caused by a kept position stays on it.
- Kept pallets that no longer describe the job (outside the equipment, overlapping, cargo
  not on the list, another pallet specification) are all ignored and the normal plan is
  used. A-rules, the WHAT-IF review, MIXED and BOX_ONLY replan everything as before.

## 2G. Owner-approved rule: no hole inside a level load (2026-11-19)

Owner instruction: "빨간 테두리 빈공간에도 적재물이 채워져야 한다." Legacy **direct-box**
level loading only (`engine/levelBlockPacker.ts`). Full text: `docs/engine/LOADING_RULES.md`
section 1.

- The columns of one zone do not all reach the same height: a column with two heavy
  cartons meets the floor-load or top-load limit one carton earlier, and a carton of
  another height leaves its column lower. Such columns must not stand at the inner wall
  with an unusable hole above them.
- The finished stacks are set down from the inner wall in order of height, tallest first,
  equal ones in the order they were built. A stack is never rebuilt and stands on a floor
  place of the same size, so every limit checked for it still holds and the loaded
  quantity is unchanged. The top of the load steps down only toward the door.
- This moves weight along the length. The CG verdict outranks it: the as-built order is
  used only when the ordered plan fails the verdict and the as-built one passes it.
- The inner-to-door weight sequence of 2A, pallets, MIXED and the A-rules are unchanged.

## 2H. Owner-approved rule: leftovers stand in the last rows (2026-11-19)

Owner instruction: "애매하게 남는 경우는 맨 뒷줄로 옮기는 게 맞다. 적재시 앞쪽부터 맨 뒷줄 전까지는
빈공간이 없이 적재가 되어야 한다." Legacy **direct-box** weight sequence only
(`engine/heavyInnerBlockPacker.ts`). Full text: `docs/engine/LOADING_RULES.md` section 1.

- In the sequence of 2A only a row that one cargo fills by itself, wall to wall and to its
  full height, keeps its place. Whatever cannot fill such a row (the remainder of each
  cargo, part-filled cartons) is loaded in the same weight order behind those rows, at the
  door end. This overrides "keep SKU/height blocks contiguous" of 2A for those leftovers.
- Leftovers first go on top of an equal or heavier leftover carton of the same footprint,
  under every check a carton at the open front gets. Leftover rows that leave free width
  stand side by side, and the fullest rows come first, so the load ends in its sparsest
  row. Rows are moved whole and never rebuilt.
- Payload for a heavier leftover is kept while lighter rows are loaded before it. Under
  strict unloading the rule applies inside each stop.
- Loaded quantity and the CG verdict outrank it: the sequence as built is used when the
  other plan loads less, or fails a verdict the as-built plan passes.
- Level loading, pallets, MIXED and the A-rules are unchanged. Height differences between
  blocks that come from each cargo's own stacking limit are not removed by this rule.

## 2I. Owner-approved rule: heavy cartons on the floor, low blocks filled up (2026-11-20)

Owner instructions: "앞부분이 비었잖아. 그 뒷줄 단이랑 높이를 맞추던가 해야지", "적재공간이 작은데 상자가
많아 다 못 실으면 일단 차량을 두 대를 써야 한다. 우선 갯수가 많은 상자부터 채운다. 단 무게가 무거운 건
바닥에 채우는 것을 우선으로 한다." Legacy **direct-box** weight sequence only
(`engine/heavyInnerBlockPacker.ts`, `stackLedger.ts`). Full text: `docs/engine/LOADING_RULES.md`
section 1.

- The floor rows keep the weight sequence of 2A: heavier cartons take the floor first, from
  the inner wall.
- A block of rows that ends below the rows of lighter cargo behind it is filled up with
  lighter cargo of the same stop, the cargo there is most of first, in whole tiers, until the
  next tier would stand above that cargo's own rows. Every carton laid passes the checks a
  carton on the open front passes (bounds, floor load, support, stack depth including
  mixed-SKU chains, cumulative top load, unloading path). This replaces the last sentence
  of 2H.
- A cargo is stacked lower than its own limit only where that brings the finished block
  higher; otherwise it keeps its own height.
- Loaded quantity (LOADING_RULES 1, row 3) is the number of cartons loaded. The plan that
  loads more comes first, so that as little as possible waits for a second vehicle; between
  plans that load as many, the one that loads more of the heavier cargo. This replaces the
  earlier comparison, cargo by cargo from the heaviest.
- A filled load is shorter. Where it then fails the CG verdict although it stops short of
  the door, the rows behind the inner rows stand one tier lower, with as few inner rows at
  full height as still load as much, so that the top only steps down toward the door. This
  is the one exception to "no step laid low to fit the centre of gravity" of LOADING_RULES 1.
- Order of judgement: loaded quantity, CG verdict, weight sequence before level loading,
  leftovers at the back (2H), filled before open (this rule), then the preferences. The plan
  that leaves a block open is used only when the filled one loads less or fails the verdict
  the open one passes.
- Search sizes are fixed functions of the input (the plans kept for comparison, two step
  searches). No hard limit and no certification threshold changes. Level loading, pallets,
  MIXED and the A-rules are unchanged.
- Planning a second vehicle for the cargo that still waits is not part of this rule and is
  not built: the waiting cargo is listed with its reason as before.
## 2K. Owner decision: no space-efficiency goal (2026-11-20)

Owner instruction: "최적화 목표에 공간 효율 목표는 그냥 없애자." Product UI and stored
preference only (`LoadingMethodStage.tsx`, `loadingStrategyPreference.ts`).

- STEP 04 "최적화 목표" offers one goal, 안정성 우선 (`stability`). It is in force as soon as
  the packaging is confirmed; the user does not pick it and no step waits for a goal.
- A job with no stored goal plans with `stability`. A stored or legacy `capacity` is read
  as `stability` everywhere the product reads the preference, and the product never stores
  `capacity` again. A legacy `unloading` preference keeps its meaning; unloading order is
  set by the stop numbers and the strict/soft policy as before.
- A staging plan or pallet snapshot saved under `capacity` is a different input now: it is
  kept as a reference only and the job is planned again. Nothing is restored as a current
  plan under a goal the product no longer applies.
- The STEP 04 estimate is one calculation for that goal, not a comparison of goals.
- The engine keeps the `capacity` strategy and the `LoadingStrategy` type: its own tests,
  the worker-parity fixtures and engine-internal defaults (for example the A-rule adapter's
  parameter) still use it. Section 7's `capacity` bullet describes that engine strategy; it
  is no longer selectable in the product, and every planner the product calls (legacy,
  A-rules, pallet, MIXED) receives the stored goal.
- No hard limit, certification threshold or loading rule is changed by this decision.
  Pallet, MIXED and A-rule plans that were made under `capacity` can come out differently
  under `stability`. The legacy direct-box plan is the same under both goals; only the
  order in which alternative layouts are tried after a failed certification differs.

## 3. DIRECT BOX baseline algorithm
The legacy fixed sequence of `CBM/weight sort -> full vertical stacks -> x shelf progression -> door-side tail mixing` is retired.

The default DIRECT BOX engine is:
1. Generate compact homogeneous rectangular block candidates for every SKU and allowed floor orientation.
2. Maintain three-dimensional Maximal Empty Spaces (EMS) after every accepted block.
3. Search several competing packing states with deterministic Beam Search instead of committing to the first greedy placement.
4. Score candidates using space utilization, contact/compactness, low center of gravity, longitudinal/lateral balance, and the selected operating strategy.
5. After homogeneous-block search, allow residual single-box candidates on the same EMS + Beam Search so leftovers may fill any physically safe gap.
6. Validate the final placements again for bounds and collisions; all support/stack/top-load/payload rules must already have been enforced during candidate generation.

## 3A. Load modes and objective hierarchy

### Load modes
```
loadMode: "BOX_ONLY" | "PALLET_ONLY" | "MIXED"
```
- `BOX_ONLY`: only direct boxes; behavior must remain identical to the DIRECT BOX baseline.
- `PALLET_ONLY`: only palletized units.
- `MIXED`: palletized units and direct boxes share one container and the same deterministic EMS/Beam Search at container-placement stage.
- Pallet building remains independent from container placement. A built pallet enters MIXED search as a rigid unit with footprint, loaded height, gross weight, center of gravity, top-load/handling limits, and source metadata.
- MIXED placement order is determined by candidate scoring, never by a fixed "pallets first" or "boxes first" loop.
- Default mixed policy keeps well-filled pallets palletized and converts only low-fill tail pallets to direct boxes. Otherwise "minimize pallet count" trivially degenerates to BOX_ONLY whenever direct floor loading is possible.
- The partial-pallet threshold is configurable. Current product default is 70% and must not be hard-coded into unrelated engine modules.

### Objective hierarchy
Objectives are lexicographic. A lower item may not be improved at the expense of a higher item.
1. Hard constraints: bounds, collision, support, stacking, top-load, payload, floor/axle load when configured, handling attributes, segregation, and pallet limits.
2. Under `unloading`, blocking must be zero when feasible.
3. Maximize loaded demand units, honoring explicit cargo priority when present.
4. Within MIXED policy, minimize avoidable partial pallets without demoting protected/full pallets.
5. Minimize loose floor boxes when pallet count is otherwise equal.
6. Improve center of gravity and weight distribution.
7. Improve space utilization and compactness.

## 4. Loading direction and weight distribution
- Prefer the deepest usable empty space toward the door as a compactness/work-sequence preference, not as a rule that forces heavy cargo into one end.
- Prefer floor positions before elevated positions when other constraints and optimization quality are comparable.
- Heavy cargo should preferentially remain low to reduce vertical center of gravity.
- Do not reward a plan merely because more weight is in the inner half of the container.
- Penalize excessive longitudinal or lateral concentration. As an operational warning target, avoid putting more than about 60% of loaded cargo weight in either longitudinal half when a feasible alternative exists.
- Center-of-gravity and weight-distribution objectives are optimization preferences; container payload, support, stacking, compression, and configured floor/axle limits are hard constraints.

### Vertical placement by weight class
- Heavy-cargo height policy is configurable and is not inferred as a universal legal rule.
- When enabled, heavy/medium/light thresholds are fixed functions of the input set and configuration.
- Elevated-heavy penalties grow with height, and a configured hard cap must be enforced before utilization scoring.
- A pallet unit is evaluated by its gross weight as one rigid container-level unit.

## 5. Box candidate generation
- Keep identical box types together by generating homogeneous rectangular blocks whenever feasible.
- Do not use a fixed global CBM/weight SKU order as the primary packing algorithm.
- Evaluate competing SKU blocks against the current empty-space geometry.
- CBM, block fill ratio, quantity, contact area, weight, center of gravity, and unloading order may contribute to candidate scores.
- Use cargo ID only as the final deterministic tie-break, not as a business priority.
- Respect `allowRotation`; never invent an orientation that the cargo input disallows.
- Cargo may additionally declare `allowedOrientations`, `thisSideUp`, `fragile`, `noStackAbove`, and `segregationGroup`. Missing attributes preserve legacy behavior.
- Avoid isolated center boxes, L-shaped fragmentation, unsupported bridging, wall penetration, and unnecessary holes when a compact rectangular alternative exists.
- Field practice for every strategy: when a load has three or more tiers and its top tier holds at most 25% of the fullest tier, lift that tier and re-insert it below its base under the same hard checks. Cartons with no lower gap go into any remaining safe space (lowest first); this rule never drops cargo (대표 지시 2026-09-29, #86).

## 6. Maximal Empty Space rules
- Empty spaces are three-dimensional rectangular regions derived from the container and accepted occupied blocks.
- After placement, subtract the occupied block from intersecting spaces, de-duplicate equivalent spaces, and remove spaces fully contained by a larger equivalent candidate space.
- EMS regions may overlap each other as a search representation; actual cargo placements may never overlap.
- Reserved spaces such as door clearance, lashing/load-lock space, forklift access corridors, and user keep-out zones must be removed from usable search space when configured.
- Residual mixed loading may reuse a safe inner/side/top EMS under capacity/stability. Under unloading it may only use an EMS that preserves the unload path.
- Residual direct boxes beside pallets must respect configured pallet-to-cargo clearance.

## 7. Beam Search rules
- Keep multiple high-quality candidate states so an early greedy choice does not permanently damage utilization or balance.
- Beam width and candidate caps may be tuned for browser performance, but must remain deterministic.
- `capacity` strategy emphasizes safe space utilization.
- `stability` strategy emphasizes low center of gravity, balanced weight distribution, and stable contact more strongly.
- `unloading` strategy adds unload-order placement preference while retaining all hard safety constraints.
- Under unloading, a later-stop unit blocks an earlier-stop unit when it sits between that unit and the +X door along an overlapping path or sits above it. Default target is zero blocking; impossible units remain waiting unless the user explicitly selects soft blocking.
- Never increase fill rate by weakening support, top-load, stacking, bounds, collision, or payload checks.

## 8. Weight, support, and compression constraints
- Respect each cargo item's maximum supported/top-load weight when data exists.
- Cumulative transmitted load through all supported boxes above a lower box must be considered; checking only the immediately upper box is insufficient.
- Respect maximum stacking-layer settings when configured, including mixed-SKU support chains.
- Elevated cargo must satisfy the configured support ratio and must keep its projected center of gravity inside the support envelope.
- Total container payload must not exceed the configured container weight limit.
- When floor-load or axle-load limits exist in equipment data they are hard constraints. Local load uses actual contact footprint; no unmodeled spreader-board assumption may be used to rescue an overload.
- Prefer lower center of gravity for heavy cargo.
- Do not treat CBM or loaded-count improvement as justification for violating any of these constraints.

## 9. Pallet rules
- Pallet mode, box-only mode, and mixed mode must remain separately controllable.
- DIRECT BOX algorithm changes do not silently rewrite pallet-building rules. Shared MIXED interfaces require regression coverage for all modes.
- No pallet or cargo overhang outside its allowed footprint. Default overhang is 0 mm unless a pallet type explicitly configures otherwise.
- Cargo on a pallet must stay centered/balanced unless an explicit loading rule allows otherwise. The pallet-unit center of gravity enters container-level balance.
- Do not stack above configured pallet stacking limits.
- Respect pallet load, top-load, support, packaging-clearance, ceiling clearance, and container payload limits.
- Forklift-loaded pallets must retain configured fork-entry/access clearance at loading time.
- Owner banding rule (2026-09-29): four pallet straps form a grid with two across length and two across width. Keep all 3D viewers, work-order diagrams/instructions, and material length/weight calculations on the same directional layout. Preserve reinforcement-level strap counts and restraint coefficients; shorter-count stages distribute straps across both axes.
- Pallet/pallet and pallet/wall spacing is configurable.

### Pallet count minimization
- Owner rule #97 (2026-09-29): a regular pallet's highest occupied tier must cover at least 50% of the usable pallet deck (`minTopLayerFillRatio`, default 0.5). Move the ENTIRE tier below this threshold into a final mixed tail, even if another pallet base is needed. Exactly 50% stays. This terminal rule takes priority over pallet-count minimization and sparse absorption; no later pass may put those cartons back. Recombine an existing unfinished floor pallet when compatible. The final residual pallet per unloading stop may remain below 50%; if weight/geometry forces multiple single-tier tails, preserve every carton and every hard limit. Extra bases consume payload and floor/stack capacity; infeasible cartons remain explicitly waiting.
- Fill existing compatible pallets before creating a new partial pallet.
- Pallet count may only be reduced by legal consolidation, better assignment, or MIXED conversion of eligible low-fill tail pallets.
- Loaded quantity outranks pallet count. Never drop cargo merely to reduce pallet count.
- Well-filled/protected pallets are not demoted in default MIXED policy solely to chase a lower pallet count.
- Compatible residual boxes may use spare pallet height only when pallet support, top-load, overhang, unloading, and handling rules all remain valid.
- Compatible SKUs should be mixed when doing so removes an avoidable pallet. SKU purity is not a reason to create a new pallet unless unloading/segregation/handling rules require separation.
- For equal loaded quantity and pallet count, prefer complete lower layers, lower maximum unit-load height, and a compact rectangular envelope. A narrow upper tower ("horn") must lose to a flatter candidate whenever both carry the same demand safely.
- After primary pallet building, collect compatible tail cartons across SKUs and deterministically repack them into the minimum feasible number of mixed tail pallets. Only the unavoidable final pallet should remain partially filled.
- Field practice applies to every strategy (capacity, stability, unloading): cartons of a nearly empty pallet — including one riding on top of another stack — move onto the spare top layers of other column-top pallets when every hard limit holds, and that pallet is removed. Unloading only merges within one stop.
- In pallet loading, center of gravity is the last preference: never keep an extra pallet or choose a candidate with more pallets only to lower the center of gravity (대표 지시 2026-09-29, #84).

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
- unloading blocking count and blocking pairs
- configured floor/axle-load violations
- handling-attribute violations
- pallet overhang/clearance/access violations
- MIXED summary: pallet count, loose/direct count, per-pallet fill rate, demoted partial pallets, and total loaded demand
- deterministic conflict log for resolved objective conflicts

Every waiting item should expose a stable primary reason code. Target codes include `NO_FEASIBLE_EMS`, `PAYLOAD_LIMIT`, `FLOOR_LOAD_LIMIT`, `AXLE_LOAD_LIMIT`, `SUPPORT_RULE`, `STACK_LIMIT`, `TOP_LOAD_LIMIT`, `ORIENTATION_RESTRICTED`, `SEGREGATION_CONFLICT`, `BLOCKS_UNLOAD_PATH`, `PALLET_LIMIT`, `PALLET_ACCESS_BLOCKED`, `HEAVY_HEIGHT_CAP`, and `RESERVED_SPACE`.

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
- `mixedModePacking.ts`: current MIXED orchestration; partial-pallet eligibility + rigid pallet units + direct boxes entering the shared EMS/Beam Search
- future dedicated modules may split pallet building, unload-order evaluation, handling attributes, and reason-code/conflict-log types as those rules are implemented

## 13. Codex workflow
Before modifying loading logic:
1. Identify the current rule and relevant code path.
2. Explain which hard constraints and optimization preferences are affected.
3. Make one coherent algorithm change with matching regression tests.
4. Run available type checks, tests, architecture checks, and build checks.
5. Report what changed and any remaining performance/safety trade-offs.

If two project rules conflict, preserve hard physical constraints first and document the conflict in the result or code comments.


## 14. Regression-test requirements
- Determinism: identical input produces identical output for BOX_ONLY, PALLET_ONLY, and MIXED.
- Mode isolation: pallet changes must not alter BOX_ONLY output.
- MIXED: pallet rigid units and direct boxes may not collide; loaded demand outranks pallet reduction; low-fill tail pallets may be converted to direct boxes; full/protected pallets remain palletized by default.
- Unloading: zero blocking when feasible, otherwise stable waiting reason.
- Stacking/support: mixed-SKU cumulative top load and declared stack depth remain enforced.
- Floor/axle and handling constraints require deterministic tests when their configuration fields are introduced.
- Reserved spaces require regression coverage before they become user-facing defaults.

## 15. Implementation, verification and release workflow
Owner decision (2026-10-06): remove GitHub Claude review automation and mandatory alternating AI review. Full rules: `docs/agents/COLLABORATION.md`.
- Work on a task branch and publish a PR; never commit directly to `main`.
- Fill in the PR template with changes, verification results and remaining risks.
- Run applicable tests, type checks, architecture checks, security checks and builds. Preserve normal GitHub CI and Vercel deployment checks.
- Independent review may be performed when requested or useful; no specific AI reviewer is required.
- The owner authorizes merging and deployment. An explicit deployment instruction authorizes the normal PR merge after applicable checks pass.
- Do not create report or deploy-trigger files in the repo root. Put reports in the PR description; summarize releases only in `CHANGELOG.md`.
