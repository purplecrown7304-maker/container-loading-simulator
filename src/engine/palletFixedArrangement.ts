import { isARules } from './loadingRuleset';
import type { LoadingStrategy } from './loadingEngine';
import { lateralCgLimitM, longitudinalCgLimitM } from './operationalValidator';
import { centerPalletCargo, centerPalletPlan } from './palletCentering';
import { packOnPallets, type OptimizedPalletPackingResult } from './palletOptimization';
import { palletPositions, type PalletLoad, type PalletSpec } from './palletPacking';
import { rebuildStagingPalletResult } from './stagingCommands';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

/** Automatic pallet loading around pallets the operator has put in place by hand
 * (owner instruction 2026-11-19: pressing automatic loading again keeps a moved pallet
 * where it was put and plans the rest around it).
 *
 * The hand-placed pallets are returned exactly as given: same position, same cartons.
 * Everything else is planned by the normal planner as if they were not there. That plan
 * is then set down in its own order, lane by lane from the inner wall: a column that
 * would stand in a hand-placed pallet slides toward the door until it stands clear, so
 * it touches the pallet it gave way to and the columns behind it close up again (owner
 * rule 2026-11-18: a load that cannot move comes first). The planned group leaves the
 * inner wall only as far as the longitudinal centre-of-gravity verdict of the whole
 * load, hand-placed pallets included, requires.
 *
 * Nothing is stacked onto or under a hand-placed pallet. Whether the combined load
 * passes is decided afterwards by the same checks as any plan; this function relaxes
 * none of them and may leave cargo unloaded, with the reason. */

const EPS = 1e-6;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
type Footprint = Pick<PalletLoad, 'x' | 'y' | 'length' | 'width'>;
const overlapsFloor = (a: Footprint, b: Footprint) => a.x < b.x + b.length - EPS && b.x < a.x + a.length - EPS && a.y < b.y + b.width - EPS && b.y < a.y + a.width - EPS;
const unitHeight = (load: PalletLoad) => Math.max(load.height, ...load.cargoPlacements.map(p => p.z + p.height - load.z)) + load.packagingExtraHeightM;

export const FIXED_PALLET_NO_FLOOR_REASON = '손으로 고정한 파렛트 주변에 놓을 바닥 자리가 없어 적재하지 못했습니다.';
export const FIXED_PALLET_PAYLOAD_REASON = '손으로 고정한 파렛트가 허용 적재 중량을 모두 사용해 적재하지 못했습니다.';

/** How often the planned group may be set further toward the door to bring the centre of
 * gravity of the whole load into range. A fixed count, so the result never depends on
 * the device. */
export const FIXED_PALLET_ARRANGEMENT_PROFILE = { shiftPasses: 4 } as const;

export type FixedPalletArrangement = {
  result: OptimizedPalletPackingResult;
  /** Hand-placed pallets kept, columns of the automatic plan that had to give way, and
   * columns for which no floor place was left. */
  kept: number; moved: number; unplaced: number;
};

/** Identity is not kept through a calculation: every carton of the result is numbered
 * afresh by the staging inventory, as after any automatic plan. */
const withoutIdentity = (load: PalletLoad): PalletLoad => ({ ...load, cargoPlacements: load.cargoPlacements.map(({ unitId: _unitId, ...p }) => p as Placement) });

function translate(load: PalletLoad, x: number, y: number): PalletLoad {
  const dx = x - load.x, dy = y - load.y;
  if (!dx && !dy) return load;
  return { ...load, x: round6(x), y: round6(y), cargoPlacements: load.cargoPlacements.map(p => ({ ...p, x: round6(p.x + dx), y: round6(p.y + dy) })),
    centerOfGravity: { ...load.centerOfGravity, x: round6(load.centerOfGravity.x + dx), y: round6(load.centerOfGravity.y + dy) } };
}

/** Hand-placed pallets the plan can honour: built on the pallet of this job, inside the
 * equipment, clear of one another on the floor unless stacked, and made only of cargo
 * that is still on the list in that quantity. If any of that fails the pallets are not a
 * description of this job any more and none is kept. */
function usableFixed(container: ContainerSpec, cargo: readonly CargoItem[], spec: PalletSpec, fixed: readonly PalletLoad[]): PalletLoad[] {
  if (!fixed.length) return [];
  const counts = new Map<string, number>();
  for (const load of fixed) {
    if (![load.x, load.y, load.z, load.length, load.width, load.height, load.totalWeightKg].every(Number.isFinite) || !load.cargoPlacements.length) return [];
    if (Math.abs(load.length - spec.length) > EPS || Math.abs(load.width - spec.width) > EPS || Math.abs(load.height - spec.height) > EPS) return [];
    if (load.x < -EPS || load.y < -EPS || load.z < -EPS || load.x + load.length > container.length + EPS || load.y + load.width > container.width + EPS
      || load.z + unitHeight(load) > container.height + EPS) return [];
    for (const p of load.cargoPlacements) counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
  }
  const quantities = new Map(cargo.map(item => [item.id, item.quantity]));
  for (const [id, count] of counts) if (count > (quantities.get(id) ?? 0)) return [];
  for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) {
    const a = fixed[i], b = fixed[j];
    if (!overlapsFloor(a, b)) continue;
    const below = a.z <= b.z ? a : b, above = below === a ? b : a;
    if (above.z < below.z + unitHeight(below) - .001) return [];
  }
  return [...fixed];
}

type Layout = { placed: PalletLoad[][]; lost: PalletLoad[][]; moved: number; cartons: number;
  /** Longitudinal centre of gravity of all loaded cargo against the equipment centre, and
   * how far the proportional verdict lets it be. */
  deviationM: number; allowedM: number; plannedWeightKg: number; cargoWeightKg: number;
  /** The same across the width, as a distance from the centreline. */
  lateralM: number; lateralAllowedM: number };

const cargoWeight = (rows: readonly Placement[]) => rows.reduce((sum, p) => sum + Math.max(0, p.weightKg), 0);
const cargoOf = (loads: readonly PalletLoad[]) => loads.flatMap(load => load.cargoPlacements);

/** The planned group as its mirror image across the width: the same plan, with what stood
 * left now standing right. */
function mirrored(container: ContainerSpec, columns: readonly PalletLoad[][]): PalletLoad[][] {
  const flip = (load: PalletLoad): PalletLoad => ({ ...load, y: round6(container.width - load.y - load.width),
    cargoPlacements: load.cargoPlacements.map(p => ({ ...p, y: round6(container.width - p.y - p.width) })),
    centerOfGravity: { ...load.centerOfGravity, y: round6(container.width - load.centerOfGravity.y) } });
  return columns.map(column => column.map(flip)).sort((a, b) => a[0].x - b[0].x || a[0].y - b[0].y || a[0].palletIndex - b[0].palletIndex);
}

/** The planner centres its group across the width by weight. With hand-placed pallets in
 * the load the group is centred for the whole load instead, as far as the walls allow. */
function centredAcross(container: ContainerSpec, kept: readonly PalletLoad[], columns: readonly PalletLoad[][]): PalletLoad[][] {
  const group = cargoOf(columns.flat()), all = [...cargoOf(kept), ...group], groupWeightKg = cargoWeight(group), weightKg = cargoWeight(all);
  if (groupWeightKg <= EPS) return columns.map(column => [...column]);
  const cog = all.reduce((sum, p) => sum + (p.y + p.width / 2) * Math.max(0, p.weightKg), 0) / weightKg;
  const floor = columns.map(column => column[0]);
  const low = -Math.min(...floor.map(load => load.y)), high = container.width - Math.max(...floor.map(load => load.y + load.width));
  const dy = round6(Math.min(high, Math.max(low, (container.width / 2 - cog) * weightKg / groupWeightKg)));
  return columns.map(column => column.map(load => translate(load, load.x, load.y + dy)));
}

/** Sets the planned columns down around the hand-placed pallets, the group starting
 * `shift` metres from the inner wall. */
function layOut(container: ContainerSpec, spec: PalletSpec, kept: readonly PalletLoad[], columns: readonly PalletLoad[][], shift: number): Layout {
  const occupied: Footprint[] = kept.map(load => ({ x: load.x, y: load.y, length: load.length, width: load.width }));
  const clear = (body: Footprint) => !occupied.some(other => overlapsFloor(body, other));
  const inside = (body: Footprint) => body.x > -EPS && body.y > -EPS && body.x + body.length <= container.length + EPS && body.y + body.width <= container.width + EPS;
  const grid = palletPositions(container, spec);
  const placed: PalletLoad[][] = [], lost: PalletLoad[][] = [];
  let moved = 0;
  for (const column of columns) {
    const base = column[0], wanted = round6(base.x + shift);
    // Toward the door in its own lane until nothing hand-placed or already set down is in
    // the way. Each step ends past a body that was in the way, so the walk is finite.
    let x = wanted;
    for (;;) {
      const blocking = occupied.filter(other => overlapsFloor({ x, y: base.y, length: base.length, width: base.width }, other));
      if (!blocking.length) break;
      x = round6(Math.max(...blocking.map(other => other.x + other.length)));
    }
    let spot: { x: number; y: number } | undefined = { x, y: base.y };
    // Its lane is full: any free place of the planner's own floor grid, inner wall first.
    if (!inside({ ...spot, length: base.length, width: base.width }))
      spot = grid.find(position => { const body = { x: position.x, y: position.y, length: base.length, width: base.width }; return inside(body) && clear(body); });
    if (!spot) { lost.push(column); continue; }
    if (Math.abs(spot.x - wanted) > EPS || Math.abs(spot.y - base.y) > EPS) moved++;
    occupied.push({ x: spot.x, y: spot.y, length: base.length, width: base.width });
    placed.push(column.map(load => translate(load, spot.x, spot.y)));
  }
  const planned = cargoOf(placed.flat()), all = [...cargoOf(kept), ...planned];
  const cargoWeightKg = cargoWeight(all);
  const cog = (centre: (p: Placement) => number, empty: number) => cargoWeightKg > EPS ? all.reduce((sum, p) => sum + centre(p) * Math.max(0, p.weightKg), 0) / cargoWeightKg : empty;
  return { placed, lost, moved, cartons: all.length, deviationM: cog(p => p.x + p.length / 2, container.length / 2) - container.length / 2,
    allowedM: longitudinalCgLimitM(container, cargoWeightKg, true), plannedWeightKg: cargoWeight(planned), cargoWeightKg,
    lateralM: Math.abs(cog(p => p.y + p.width / 2, container.width / 2) - container.width / 2), lateralAllowedM: lateralCgLimitM(container) };
}

const excess = (layout: Layout) => Math.max(0, Math.abs(layout.deviationM) - layout.allowedM);
const lateralExcess = (layout: Layout) => Math.max(0, layout.lateralM - layout.lateralAllowedM);
const mm = (value: number) => Math.round(value * 1000);

export function arrangePalletsAroundFixed(container: ContainerSpec, cargo: CargoItem[], spec: PalletSpec, strategy: LoadingStrategy, fixed: readonly PalletLoad[]): FixedPalletArrangement {
  const plain = () => centerPalletCargo(packOnPallets(container, cargo, spec, strategy), container);
  // The A rules plan and judge with their own margins and have no notion of a given pallet.
  const kept = isARules(container) || container.limitReview !== undefined ? [] : usableFixed(container, cargo, spec, fixed);
  if (!kept.length) return { result: plain(), kept: 0, moved: 0, unplaced: 0 };

  const fixedCount = new Map<string, number>();
  for (const load of kept) for (const p of load.cargoPlacements) fixedCount.set(p.cargoId, (fixedCount.get(p.cargoId) ?? 0) + 1);
  const rest = cargo.map(item => ({ ...item, quantity: item.quantity - (fixedCount.get(item.id) ?? 0) })).filter(item => item.quantity > 0);
  const payloadLeft = container.maxPayloadKg - kept.reduce((sum, load) => sum + load.totalWeightKg, 0);
  // The rest is planned with what the hand-placed pallets leave of the payload, so the two
  // together cannot be planned past it.
  const planning = { ...container, maxPayloadKg: payloadLeft };
  const planned = payloadLeft > EPS && rest.length ? centerPalletPlan(packOnPallets(planning, rest, spec, strategy), container) : packOnPallets(container, [], spec, strategy);
  const remaining = payloadLeft > EPS ? [...planned.remaining]
    : rest.map(item => ({ cargoId: item.id, quantity: item.quantity, reason: FIXED_PALLET_PAYLOAD_REASON, reasonCode: 'PAYLOAD_LIMIT' }));

  // One column is a floor pallet with whatever the planner stacked on it; it moves as one.
  // The group is taken back to the inner wall: where it stands along the length is decided
  // below for the whole load, not for the planned part alone.
  const atWall = Math.min(Infinity, ...planned.pallets.map(load => load.x));
  const byColumn = new Map<number, PalletLoad[]>();
  for (const load of planned.pallets) { const column = byColumn.get(load.stackColumn) ?? []; column.push(translate(load, load.x - atWall, load.y)); byColumn.set(load.stackColumn, column); }
  const columns = [...byColumn.values()].map(loads => loads.sort((a, b) => a.z - b.z || a.palletIndex - b.palletIndex))
    .sort((a, b) => a[0].x - b[0].x || a[0].y - b[0].y || a[0].palletIndex - b[0].palletIndex);
  const reach = columns.length ? Math.max(0, container.length - Math.max(...columns.map(column => column[0].x + column[0].length))) : 0;

  // The plan as the planner made it comes first. A pallet set down by hand on one side may
  // need the planner's odd pallet on the other, so its mirror image across the width is
  // tried too, and both again centred across the width for the whole load.
  const flipped = mirrored(container, columns);
  const variants = [columns, flipped, centredAcross(container, kept, columns), centredAcross(container, kept, flipped)];
  const tried: Array<Layout & { shift: number; variant: number; endM: number }> = [];
  variants.forEach((group, variant) => {
    // Against the inner wall first. While the whole load is too far toward the inner wall
    // for the verdict, the planned group is set toward the door by what is still missing.
    let shift = 0;
    for (let pass = 0; pass < FIXED_PALLET_ARRANGEMENT_PROFILE.shiftPasses; pass++) {
      const layout = layOut(container, spec, kept, group, shift);
      tried.push({ ...layout, shift, variant, endM: Math.max(0, ...layout.placed.map(column => column[0].x + column[0].length)) });
      const missing = -layout.allowedM - layout.deviationM;
      if (missing <= 1e-9 || layout.plannedWeightKg <= EPS) break;
      const next = Math.min(reach, round6(shift + missing * layout.cargoWeightKg / layout.plannedWeightKg + 1e-6));
      if (next <= shift + EPS) break;
      shift = next;
    }
  });
  // Loaded quantity first, then the two centre-of-gravity verdicts. Among plans that agree
  // on those the tightest wins: the shortest planned block, the fewest columns that had to
  // give way; then the plan nearest to the planner's own and nearest the inner wall.
  // Balance is a verdict here, never a reason to spread the load (owner rule 2026-11-18).
  const best = [...tried].sort((a, b) => b.cartons - a.cartons || excess(a) - excess(b) || lateralExcess(a) - lateralExcess(b)
    || mm(a.endM) - mm(b.endM) || a.moved - b.moved || a.variant - b.variant || a.shift - b.shift)[0];

  for (const column of best.lost) {
    const gone = new Map<string, number>();
    for (const load of column) for (const p of load.cargoPlacements) gone.set(p.cargoId, (gone.get(p.cargoId) ?? 0) + 1);
    for (const [cargoId, quantity] of gone) remaining.push({ cargoId, quantity, reason: FIXED_PALLET_NO_FLOOR_REASON, reasonCode: 'NO_FEASIBLE_EMS' });
  }
  // Hand-placed pallets keep their numbers; the planned ones are numbered after them.
  let index = Math.max(0, ...kept.map(load => load.palletIndex)), stackColumn = Math.max(0, ...kept.map(load => load.stackColumn));
  const arranged = [...best.placed].sort((a, b) => a[0].x - b[0].x || a[0].y - b[0].y).flatMap(column => { stackColumn++; return column.map(load => ({ ...load, palletIndex: ++index, stackColumn })); });
  const pallets = [...kept.map(withoutIdentity), ...arranged];
  const placements = pallets.flatMap(load => load.cargoPlacements);
  const totals = { placements, remaining, loadedWeightKg: pallets.reduce((sum, load) => sum + load.totalWeightKg, 0),
    usedVolumeM3: placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0), validationIssues: [] } as LoadingResult;
  return { result: rebuildStagingPalletResult(planned, totals, pallets, container), kept: kept.length, moved: best.moved, unplaced: best.lost.length };
}

/** The pallet plan the worker publishes: the normal one, or the one arranged around the
 * hand-placed pallets when there are any it can honour. */
export function packOnPalletsAroundFixed(container: ContainerSpec, cargo: CargoItem[], spec: PalletSpec, strategy: LoadingStrategy, fixed: readonly PalletLoad[] = []): OptimizedPalletPackingResult {
  return arrangePalletsAroundFixed(container, cargo, spec, strategy, fixed).result;
}
