import type { CargoItem, ContainerSpec, Placement, LimitReviewMetadata } from './types';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules, projectedTopLoadKg } from './stacking';
import { packByBlockSpaceBeamV2 } from './blockSpaceBeamPackerV2';
import { planningContainer } from './constraints';
import { withinFloorLoadLimit, FLOOR_LOAD_REASON } from './floorLoadLimit';
import { palletCargoFloorLimit, palletFloorBody, palletLoadsWithinFloorLoadLimit } from './palletFloorLoad';

export type PalletSpec = {
  /** Operational minimum for a regular pallet's top tier; final mixed tails are exempt. */
  minTopLayerFillRatio?: number;
  /** 바닥 단 점유율 경고 기준(0 초과 1 이하). 미입력 시 0.9. 경고 전용이며 파렛트 구성을 바꾸지 않는다. */
  minBottomLayerCoverageRatio?: number;
  /** Share of the static tipping threshold a unit load may use under transport acceleration (0 초과 1 이하). 미입력 시 1. */
  maxTipUtilizationRatio?: number;
  /** Visual material metadata only; it does not change packing constraints. */
  material?: 'wood' | 'plastic';
  length: number;
  width: number;
  height: number;
  tareWeightKg: number;
  maxLoadKg: number;
  maxStackLevels: number;
  maxSupportedTopWeightKg: number;
  /** Total supported load on a pallet deck at rest; 0 means stacking data unavailable. */
  maxStaticLoadKg?: number;
  useCornerGuards: boolean;
  cornerGuardWeightKg: number;
  cornerGuardExtraHeightM: number;
  useWrapping: boolean;
  wrappingWeightKg: number;
  wrappingExtraHeightM: number;
  minimizePackaging: boolean;
};

export type PalletLoad = {
  /** Actual source securing-plan metadata retained through whole-unit moves.
   * No mass is added here; the existing securing budget owns material weight. */
  bandingPlan?: { straps: number; securingLevel: 0 | 1 | 2 | 3; wrapping?: boolean; cornerGuards?: boolean };
  /** Residual cartons collected after regular top tiers are completed. */
  isMixedTail?: boolean;
  palletIndex: number;
  x: number;
  y: number;
  z: number;
  stackLevel: number;
  stackColumn: number;
  length: number;
  width: number;
  height: number;
  cargoPlacements: Placement[];
  cargoWeightKg: number;
  packagingWeightKg: number;
  packagingExtraHeightM: number;
  cornerGuardsUsed: boolean;
  wrappingUsed: boolean;
  totalWeightKg: number;
  centerOfGravity: { x: number; y: number; z: number };
};

export type PalletPackingResult = {
  limitReview?: LimitReviewMetadata;
  pallets: PalletLoad[];
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string; reasonCode?: string }>;
  palletCount: number;
  loadedCargoWeightKg: number;
  totalPackagingWeightKg: number;
  avoidedPackagingWeightKg: number;
  packagedPalletCount: number;
  totalPalletizedWeightKg: number;
  consolidatedPallets: number;
  lateralImbalanceKg: number;
  stackedPallets: number;
  maxUsedStackLevel: number;
};

export const defaultPalletSpec: PalletSpec = {
  minTopLayerFillRatio: 0.5,
  length: 1.1,
  width: 1.1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1500,
  maxStackLevels: 2,
  maxSupportedTopWeightKg: 1000,
  useCornerGuards: false,
  cornerGuardWeightKg: 2,
  cornerGuardExtraHeightM: 0.03,
  useWrapping: false,
  wrappingWeightKg: 1.5,
  wrappingExtraHeightM: 0.01,
  minimizePackaging: true,
};

type Strategy = 'capacity' | 'stability' | 'unloading';
const EPS = 1e-9;
function stopOf(load: PalletLoad, cargo: Map<string, CargoItem>) { return cargo.get(load.cargoPlacements[0]?.cargoId)?.unloadPriority ?? 0; }
const CENTER_TOLERANCE = 1e-6;
const FLAT_TOP_TOLERANCE = 0.03;
const DENSE_REPACK_MAX_SKUS = 8;
const DENSE_REPACK_MAX_CARTONS = 120;
const cargoVolume = (item: CargoItem) => item.length * item.width * item.height;
const fitCount = (available: number, size: number) => size > 0 ? Math.floor((available + EPS) / size) : 0;

function lateralSide(centerY: number, containerWidth: number) {
  const delta = centerY - containerWidth / 2;
  if (Math.abs(delta) <= CENTER_TOLERANCE) return 0;
  return delta < 0 ? -1 : 1;
}

function palletPositions(container: ContainerSpec, pallet: PalletSpec) {
  const positions: Array<{ x: number; y: number }> = [];
  const lanes = fitCount(container.width, pallet.width);
  if (lanes < 1) return positions;
  const occupiedWidth = lanes * pallet.width;
  const yOffset = Math.max(0, (container.width - occupiedWidth) / 2);

  for (let x = 0; x + pallet.length <= container.length + EPS; x += pallet.length) {
    const row = Array.from({ length: lanes }, (_, lane) => ({ x, y: yOffset + lane * pallet.width }));
    row.sort((a, b) => Math.abs((a.y + pallet.width / 2) - container.width / 2) - Math.abs((b.y + pallet.width / 2) - container.width / 2));
    positions.push(...row);
  }
  return positions;
}

function cargoTop(load: PalletLoad) {
  return Math.max(load.z + load.height, ...load.cargoPlacements.map((p) => p.z + p.height));
}

function palletTop(load: PalletLoad) {
  return cargoTop(load) + load.packagingExtraHeightM;
}

function recalcPackaging(load: PalletLoad, pallet: PalletSpec) {
  load.packagingWeightKg = (load.cornerGuardsUsed ? pallet.cornerGuardWeightKg : 0) + (load.wrappingUsed ? pallet.wrappingWeightKg : 0);
  load.packagingExtraHeightM = (load.cornerGuardsUsed ? pallet.cornerGuardExtraHeightM : 0) + (load.wrappingUsed ? pallet.wrappingExtraHeightM : 0);
  load.totalWeightKg = load.cargoWeightKg + pallet.tareWeightKg + load.packagingWeightKg;
}

function applyMinimumPackaging(loads: PalletLoad[], pallet: PalletSpec) {
  for (const load of loads) {
    if (!pallet.minimizePackaging) {
      load.cornerGuardsUsed = pallet.useCornerGuards;
      load.wrappingUsed = pallet.useWrapping;
      recalcPackaging(load, pallet);
      continue;
    }
    const uniqueCargo = new Set(load.cargoPlacements.map((p) => p.cargoId)).size;
    const cargoHeight = Math.max(0, cargoTop(load) - load.z - pallet.height);
    const tallLoad = cargoHeight >= Math.min(pallet.length, pallet.width) * 0.9;
    const fragmentedLoad = uniqueCargo > 1 || load.cargoPlacements.length >= 8;
    load.cornerGuardsUsed = pallet.useCornerGuards && pallet.maxStackLevels > 1 && load.cargoPlacements.length > 0;
    load.wrappingUsed = pallet.useWrapping && (tallLoad || fragmentedLoad);
    recalcPackaging(load, pallet);
  }
}

function palletCog(load: PalletLoad, pallet: PalletSpec) {
  const packagingZ = Math.max(load.z + pallet.height, cargoTop(load)) + load.packagingExtraHeightM / 2;
  const parts = [
    ...load.cargoPlacements.map((p) => ({ weight: p.weightKg, x: p.x + p.length / 2, y: p.y + p.width / 2, z: p.z + p.height / 2 })),
    { weight: pallet.tareWeightKg, x: load.x + pallet.length / 2, y: load.y + pallet.width / 2, z: load.z + pallet.height / 2 },
    { weight: load.packagingWeightKg, x: load.x + pallet.length / 2, y: load.y + pallet.width / 2, z: packagingZ },
  ].filter((part) => part.weight > 0);
  const total = parts.reduce((sum, p) => sum + p.weight, 0) || 1;
  return {
    x: parts.reduce((sum, p) => sum + p.x * p.weight, 0) / total,
    y: parts.reduce((sum, p) => sum + p.y * p.weight, 0) / total,
    z: parts.reduce((sum, p) => sum + p.z * p.weight, 0) / total,
  };
}

function orientations(item: CargoItem) {
  const base = [{ length: item.length, width: item.width, rotated: false }];
  if (item.allowRotation !== false && Math.abs(item.length - item.width) > EPS) {
    base.push({ length: item.width, width: item.length, rotated: true });
  }
  return base;
}

function slotFor(
  load: PalletLoad,
  item: CargoItem,
  pallet: PalletSpec,
  container: ContainerSpec,
  cargoMap: Map<string, CargoItem>,
  floorBlockedIds?: Set<string>,
): Placement | null {
  if (load.cargoWeightKg + item.weightKg > pallet.maxLoadKg + EPS) return null;
  const reserveHeight =
    (pallet.useCornerGuards ? pallet.cornerGuardExtraHeightM : 0)
    + (pallet.useWrapping ? pallet.wrappingExtraHeightM : 0);
  const availableHeight = container.height - pallet.height - reserveHeight;
  const maxLayers = Math.max(0, Math.min(item.maxStackLayers ?? Infinity, fitCount(availableHeight, item.height)));
  if (maxLayers < 1) return null;

  const options = orientations(item)
    .map((o) => {
      const colsX = fitCount(pallet.length, o.length);
      const colsY = fitCount(pallet.width, o.width);
      return {
        ...o,
        colsX,
        colsY,
      };
    })
    .filter((o) => o.colsX > 0 && o.colsY > 0)
    .sort((a, b) => (b.colsX * b.colsY) - (a.colsX * a.colsY) || Number(a.rotated) - Number(b.rotated));

  const cargoFloorLimit = palletCargoFloorLimit(container, pallet);
  if (cargoFloorLimit !== undefined && options.length && item.weightKg / (item.length * item.width) > cargoFloorLimit + EPS) {
    floorBlockedIds?.add(item.id);
    return null;
  }
  const floorBodies = cargoFloorLimit === undefined ? null : [...load.cargoPlacements, palletFloorBody(load, pallet, true)];

  const baseSurface = { x: load.x, y: load.y, z: load.z + pallet.height, length: pallet.length, width: pallet.width };
  // Mixed-height cartons must sit on real surfaces, not multiples of their own height.
  // Support and cumulative layer/top-load checks below remain mandatory at every surface.
  // A single-layer carton can only sit on the deck. Elevated candidates always
  // have a supporting carton below and therefore fail the same stacking check.
  const deckOnly = item.strengthUnverified || (item.maxStackLayers !== undefined && item.maxStackLayers < 2);
  const surfaces = [...new Set([baseSurface.z, ...(deckOnly ? [] : load.cargoPlacements.map(placement => placement.z + placement.height))])]
    .filter(z => z + item.height + reserveHeight <= container.height + EPS)
    .sort((a, b) => a - b);

  for (const z of surfaces) {
    const supporters = load.cargoPlacements
      .filter(placement => Math.abs(placement.z + placement.height - z) <= EPS)
      .sort((a, b) => a.x - b.x || a.y - b.y || a.length - b.length || a.width - b.width);
    // Every candidate of this surface occupies the same vertical slab, so only the
    // cartons crossing that slab can collide. Filtering them once keeps the search
    // linear in the tier size instead of the whole pallet for each candidate.
    const slabTop = z + item.height;
    if (slabTop > container.height + EPS) continue;
    const blockers = load.cargoPlacements.filter(p => z < p.z + p.height - EPS && slabTop > p.z + EPS);
    const seen = new Set<string>();
    // First grid cell of `surface` that passes every check, in row/column order.
    // Cells are visited lazily and plain numbers are tested before a placement is
    // allocated: one tiny carton must not allocate every cell on the deck.
    const firstFit = (surface: { x: number; y: number; length: number; width: number }, option: typeof options[number]): Placement | null => {
      const colsX = fitCount(surface.length, option.length);
      const colsY = fitCount(surface.width, option.width);
      const offsetX = Math.max(0, (surface.length - colsX * option.length) / 2);
      const offsetY = Math.max(0, (surface.width - colsY * option.width) / 2);
      for (let row = 0; row < colsX; row += 1) {
        for (let col = 0; col < colsY; col += 1) {
          const x = surface.x + offsetX + row * option.length;
          const y = surface.y + offsetY + col * option.width;
          // Cheap geometric rejections run before the duplicate key is formatted:
          // identical geometry is rejected identically, so the result is unchanged.
          if (x < load.x - EPS || y < load.y - EPS
            || x + option.length > load.x + pallet.length + EPS
            || y + option.width > load.y + pallet.width + EPS) continue;
          let collides = false;
          for (const p of blockers) {
            if (x < p.x + p.length - EPS && x + option.length > p.x + EPS && y < p.y + p.width - EPS && y + option.width > p.y + EPS) { collides = true; break; }
          }
          if (collides) continue;
          const key = [x, y, option.length, option.width].map(value => value.toFixed(9)).join(':');
          if (seen.has(key)) continue;
          seen.add(key);
          const candidate: Placement = { cargoId: item.id, x, y, z, length: option.length,
            width: option.width, height: item.height, weightKg: item.weightKg, rotated: option.rotated };
          if (!hasAdequateSupport(candidate, load.cargoPlacements, baseSurface)) continue;
          if (!canPlaceByStackingRules(item, candidate, load.cargoPlacements, cargoMap)) continue;
          if (floorBodies && !withinFloorLoadLimit(container, candidate, floorBodies)) {
            floorBlockedIds?.add(item.id);
            continue;
          }
          return candidate;
        }
      }
      return null;
    };
    // At an elevated surface, first align cartons within real supporters. A single
    // pallet-centred grid can unnecessarily bridge adjacent larger cartons, spreading
    // cumulative compression through several support chains and stranding a legal
    // next tier. Keep the original grid too for boxes that need several supporters.
    for (const option of options) {
      for (const supporter of supporters) {
        const placement = firstFit(supporter, option);
        if (placement) return placement;
      }
    }
    for (const option of options) {
      const placement = firstFit(baseSurface, option);
      if (placement) return placement;
    }
  }
  return null;
}

/** Work copies only append cartons. Cache misses on their untouched original;
 * an append may create a new support surface, even for a previously failed SKU. */
function createSlotSearch(pallet: PalletSpec, container: ContainerSpec, cargoMap: Map<string, CargoItem>) {
  const unavailable = new WeakMap<PalletLoad, Set<string>>();
  // slotFor only reads the work copy's carton list and weight. Both change solely
  // by appending, so the carton count identifies the state a slot was found for.
  // A sparse-pallet pass asks every target for every carton but changes one target
  // per carton; the other answers stay valid until that target receives a carton.
  const found = new WeakMap<PalletLoad, Map<string, { count: number; placement: Placement | null }>>();
  return (original: PalletLoad, work: PalletLoad, item: CargoItem) => {
    const untouched = work.cargoPlacements.length === original.cargoPlacements.length;
    if (untouched && unavailable.get(original)?.has(item.id)) return null;
    let byItem = found.get(work);
    const known = byItem?.get(item.id);
    if (known && known.count === work.cargoPlacements.length) return known.placement;
    const placement = slotFor(work, item, pallet, container, cargoMap);
    if (!byItem) { byItem = new Map(); found.set(work, byItem); }
    byItem.set(item.id, { count: work.cargoPlacements.length, placement });
    if (!placement && untouched) {
      const failed = unavailable.get(original) ?? new Set<string>();
      failed.add(item.id);
      unavailable.set(original, failed);
    }
    return placement;
  };
}

function centerCargoOnPallet(load: PalletLoad, pallet: PalletSpec) {
  if (!load.cargoPlacements.length) return;
  const minX = Math.min(...load.cargoPlacements.map((p) => p.x));
  const maxX = Math.max(...load.cargoPlacements.map((p) => p.x + p.length));
  const minY = Math.min(...load.cargoPlacements.map((p) => p.y));
  const maxY = Math.max(...load.cargoPlacements.map((p) => p.y + p.width));
  const usedLength = maxX - minX;
  const usedWidth = maxY - minY;
  const targetMinX = load.x + Math.max(0, (pallet.length - usedLength) / 2);
  const targetMinY = load.y + Math.max(0, (pallet.width - usedWidth) / 2);
  const dx = targetMinX - minX;
  const dy = targetMinY - minY;
  if (Math.abs(dx) <= EPS && Math.abs(dy) <= EPS) return;
  load.cargoPlacements = load.cargoPlacements.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function tryConsolidate(pallets: PalletLoad[], cargoMap: Map<string, CargoItem>, pallet: PalletSpec, container: ContainerSpec, strategy: Strategy) {
  let removed = 0;
  const findSlot = createSlotSearch(pallet, container, cargoMap);
  for (let sourceIndex = pallets.length - 1; sourceIndex > 0; sourceIndex -= 1) {
    const source = pallets[sourceIndex];
    const targets = pallets.slice(0, sourceIndex).map(original => ({ original, work: { ...original, cargoPlacements: [...original.cargoPlacements] } }));
    let success = true;
    for (const placement of source.cargoPlacements) {
      const item = cargoMap.get(placement.cargoId);
      if (!item) { success = false; break; }
      let moved = false;
      for (const target of targets) {
        if (strategy === 'unloading' && stopOf(target.work, cargoMap) !== (item.unloadPriority ?? 0)) continue;
        const candidate = findSlot(target.original, target.work, item);
        if (!candidate) continue;
        target.work.cargoPlacements.push(candidate);
        target.work.cargoWeightKg += item.weightKg;
        moved = true;
        break;
      }
      if (!moved) { success = false; break; }
    }
    if (success) {
      for (let i = 0; i < targets.length; i += 1) pallets[i] = targets[i].work;
      pallets.splice(sourceIndex, 1);
      removed += 1;
    }
  }
  return removed;
}

function topSupportingBoxes(load: PalletLoad) {
  if (!load.cargoPlacements.length) return [] as Placement[];
  const top = cargoTop(load);
  return load.cargoPlacements.filter((p) => Math.abs(p.z + p.height - top) <= FLAT_TOP_TOLERANCE);
}

export function canSupportUpper(lower: PalletLoad, upperWeightKg: number, cargoMap: Map<string, CargoItem>, pallet: PalletSpec) {
  if (pallet.maxStaticLoadKg !== undefined && lower.cargoWeightKg + lower.packagingWeightKg + upperWeightKg > pallet.maxStaticLoadKg + EPS) return false;
  if (upperWeightKg > pallet.maxSupportedTopWeightKg + EPS) return false;
  const supporters = topSupportingBoxes(lower);
  if (!supporters.length) return false;
  // The upper pallet's load travels through every layer, not only the top cartons.
  // Distribute its external load by contact area; retain the existing conservative
  // accounting for each carton's own descendants when checking compression limits.
  const external = new Map<Placement, number>();
  const area = supporters.reduce((sum, p) => sum + p.length * p.width, 0);
  for (const p of supporters) external.set(p, upperWeightKg * p.length * p.width / area);
  const ordered = [...lower.cargoPlacements].sort((a, b) => b.z - a.z);
  for (const p of ordered) {
    const transmitted = external.get(p) ?? 0;
    const limit = cargoMap.get(p.cargoId)?.maxTopLoadKg;
    if (limit != null && projectedTopLoadKg(p, p, lower.cargoPlacements) + transmitted > limit + EPS) return false;
    const contacts = ordered.filter(q => q !== p && Math.abs(q.z + q.height - p.z) < .001).map(q => ({
      q, area: Math.max(0, Math.min(p.x + p.length, q.x + q.length) - Math.max(p.x, q.x))
        * Math.max(0, Math.min(p.y + p.width, q.y + q.width) - Math.max(p.y, q.y)),
    })).filter(contact => contact.area > EPS);
    const contactArea = contacts.reduce((sum, contact) => sum + contact.area, 0);
    for (const contact of contacts) external.set(contact.q, (external.get(contact.q) ?? 0) + transmitted * contact.area / contactArea);
  }
  return true;
}

/** Whether the cartons at the top of `lower` carry a pallet set on it: the shared support
 * rule (at least 80% of the pallet's base in contact, its centre inside that contact) at
 * the cargo top. Wrapping and corner guards sit between the two and are not a gap. The
 * planner and, since the owner's 2026-11-19 decision, pallets stacked by hand both use it. */
export function hasPalletFootprintSupport(lower: PalletLoad, pallet: PalletSpec) {
  const top = cargoTop(lower);
  const footprint: Placement = {
    cargoId: '__PALLET_SUPPORT_CHECK__',
    x: lower.x,
    y: lower.y,
    z: top,
    length: pallet.length,
    width: pallet.width,
    height: pallet.height,
    weightKg: pallet.tareWeightKg,
  };
  return hasAdequateSupport(footprint, lower.cargoPlacements);
}

function columnSupportsNewLoad(loads: PalletLoad[], newLoad: PalletLoad, cargoMap: Map<string, CargoItem>, pallet: PalletSpec,
  container: ContainerSpec, floorBlockedIds: Set<string>) {
  for (let i = 0; i < loads.length; i += 1) {
    const existingAbove = loads.slice(i + 1).reduce((sum, p) => sum + p.totalWeightKg, 0);
    if (!canSupportUpper(loads[i], existingAbove + newLoad.totalWeightKg, cargoMap, pallet)) return false;
  }
  const immediateLower = loads[loads.length - 1];
  if (!immediateLower || !hasPalletFootprintSupport(immediateLower, pallet)) return false;
  if (palletCargoFloorLimit(container, pallet) !== undefined) {
    const dx = immediateLower.x - newLoad.x, dy = immediateLower.y - newLoad.y;
    const moved = { ...newLoad, x: immediateLower.x, y: immediateLower.y,
      cargoPlacements: newLoad.cargoPlacements.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) };
    if (!palletLoadsWithinFloorLoadLimit(container, [...loads, moved], pallet)) {
      newLoad.cargoPlacements.forEach(p => floorBlockedIds.add(p.cargoId));
      return false;
    }
  }
  return true;
}

function moveLoad(load: PalletLoad, x: number, y: number, z: number, level: number, column: number, pallet: PalletSpec) {
  const dx = x - load.x;
  const dy = y - load.y;
  const dz = z - load.z;
  load.x = x; load.y = y; load.z = z; load.stackLevel = level; load.stackColumn = column;
  load.cargoPlacements = load.cargoPlacements.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz }));
  load.centerOfGravity = palletCog(load, pallet);
}

function arrangePalletStacks(pallets: PalletLoad[], positions: Array<{ x: number; y: number }>, container: ContainerSpec, pallet: PalletSpec, cargoMap: Map<string, CargoItem>, strategy: Strategy,
  floorBlockedIds: Set<string>) {
  // Keep the final residual tail last within its stop, even when it is heavier.
  pallets.sort((a, b) => (strategy === 'unloading' ? stopOf(b, cargoMap) - stopOf(a, cargoMap) : 0)
    || Number(Boolean(a.isMixedTail)) - Number(Boolean(b.isMixedTail))
    || (a.isMixedTail && b.isMixedTail ? a.palletIndex - b.palletIndex : b.totalWeightKg - a.totalWeightKg));
  const columns: Array<{ positionIndex: number; loads: PalletLoad[]; totalWeightKg: number }> = [];
  const unplaced: PalletLoad[] = [];
  const maxLevels = Math.max(1, Math.floor(pallet.maxStackLevels || 1));
  for (const load of pallets) {
    if (!palletLoadsWithinFloorLoadLimit(container, [load], pallet)) {
      load.cargoPlacements.forEach(p => floorBlockedIds.add(p.cargoId));
      unplaced.push(load);
      continue;
    }
    let best: { column: number; level: number; z: number; score: number } | null = null;
    for (let c = 0; c < columns.length; c += 1) {
      const column = columns[c];
      if (column.loads.length >= maxLevels) continue;
      const lower = column.loads[column.loads.length - 1];
      if (strategy === 'unloading' && stopOf(lower, cargoMap) !== stopOf(load, cargoMap)) continue;
      const z = palletTop(lower);
      const movedTop = z + (palletTop(load) - load.z);
      if (movedTop > container.height + EPS) continue;
      if (!columnSupportsNewLoad(column.loads, load, cargoMap, pallet, container, floorBlockedIds)) continue;
      const score = column.positionIndex * 10 + column.loads.length;
      if (!best || score < best.score) best = { column: c, level: column.loads.length + 1, z, score };
    }
    if (best) {
      const column = columns[best.column];
      const pos = positions[column.positionIndex];
      moveLoad(load, pos.x, pos.y, best.z, best.level, best.column + 1, pallet);
      column.loads.push(load);
      column.totalWeightKg += load.totalWeightKg;
      continue;
    }
    const used = new Set(columns.map((c) => c.positionIndex));
    let bestPosition = -1;
    let bestScore = Infinity;
    const left = columns
      .filter((c) => lateralSide(positions[c.positionIndex].y + pallet.width / 2, container.width) < 0)
      .reduce((sum, c) => sum + c.totalWeightKg, 0);
    const right = columns
      .filter((c) => lateralSide(positions[c.positionIndex].y + pallet.width / 2, container.width) > 0)
      .reduce((sum, c) => sum + c.totalWeightKg, 0);
    for (let p = 0; p < positions.length; p += 1) {
      if (used.has(p)) continue;
      const pos = positions[p];
      const side = lateralSide(pos.y + pallet.width / 2, container.width);
      const balance = Math.abs(
        (left + (side < 0 ? load.totalWeightKg : 0))
        - (right + (side > 0 ? load.totalWeightKg : 0)),
      );
      const depth = pos.x;
      const score = depth * 100 + balance * 0.01;
      if (score < bestScore) { bestPosition = p; bestScore = score; }
    }
    if (bestPosition < 0) {
      unplaced.push(load);
      continue;
    }
    const pos = positions[bestPosition];
    const column = { positionIndex: bestPosition, loads: [] as PalletLoad[], totalWeightKg: 0 };
    moveLoad(load, pos.x, pos.y, 0, 1, columns.length + 1, pallet);
    column.loads.push(load);
    column.totalWeightKg = load.totalWeightKg;
    columns.push(column);
  }
  return unplaced;
}


function placementVolume(placements: Placement[]) {
  return placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0);
}

function palletShapeMetrics(placements: Placement[]) {
  if (!placements.length) return { maxTop: Number.POSITIVE_INFINITY, rectangleFill: 0, footprint: 0 };
  const minX = Math.min(...placements.map((p) => p.x));
  const maxX = Math.max(...placements.map((p) => p.x + p.length));
  const minY = Math.min(...placements.map((p) => p.y));
  const maxY = Math.max(...placements.map((p) => p.y + p.width));
  const maxTop = Math.max(...placements.map((p) => p.z + p.height));
  const footprint = Math.max(EPS, (maxX - minX) * (maxY - minY));
  const envelope = Math.max(EPS, footprint * maxTop);
  return {
    maxTop,
    rectangleFill: placementVolume(placements) / envelope,
    footprint,
  };
}

function densePackOnePallet(cargo: CargoItem[], pallet: PalletSpec, container: ContainerSpec, strategy: Strategy) {
  const reserveHeight =
    (pallet.useCornerGuards ? pallet.cornerGuardExtraHeightM : 0)
    + (pallet.useWrapping ? pallet.wrappingExtraHeightM : 0);
  const availableHeight = Math.max(0, container.height - pallet.height - reserveHeight);
  if (availableHeight <= EPS) return null;

  const cargoFloorLimit = palletCargoFloorLimit(container, pallet);
  if (cargoFloorLimit !== undefined && cargoFloorLimit <= 0) return null;

  const packAt = (height: number) => packByBlockSpaceBeamV2({
    length: pallet.length,
    width: pallet.width,
    height,
    maxPayloadKg: pallet.maxLoadKg,
    ...(cargoFloorLimit === undefined ? {} : { floorLoadLimitKgPerM2: cargoFloorLimit }),
  }, cargo, strategy);

  // One full-height run establishes the maximum quantity this heuristic can place.
  // Lower-height reruns are only tie-break candidates, so "make it flat" can never
  // reduce the number of cartons carried by the pallet.
  const baseline = packAt(availableHeight);
  if (!baseline.placements.length) return null;
  let best = baseline;
  let bestMetrics = { count: baseline.placements.length, ...palletShapeMetrics(baseline.placements) };

  const loadedVolume = placementVolume(baseline.placements);
  const averageHeightNeeded = loadedVolume / Math.max(EPS, pallet.length * pallet.width);
  const tallestLoaded = Math.max(...baseline.placements.map((placement) => placement.height));
  const baselineTop = bestMetrics.maxTop;
  const candidateHeights = new Set<number>([
    Math.max(tallestLoaded, averageHeightNeeded * 1.04),
    baselineTop * 0.7,
    baselineTop * 0.85,
  ]);
  const unitHeights = [...new Set(cargo.filter((item) => item.quantity > 0).map((item) => item.height))]
    .sort((a, b) => a - b)
    .slice(0, 4);
  for (const unitHeight of unitHeights) {
    candidateHeights.add(Math.ceil((averageHeightNeeded - EPS) / unitHeight) * unitHeight);
  }

  const profiles = [...candidateHeights]
    .map((value) => Math.round(Math.min(availableHeight, Math.max(tallestLoaded, value)) * 1_000_000) / 1_000_000)
    .filter((value) => value < availableHeight - EPS)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a - b)
    .slice(0, 6);

  for (const height of profiles) {
    const packed = packAt(height);
    const count = packed.placements.length;
    if (count < bestMetrics.count) continue;
    const metrics = palletShapeMetrics(packed.placements);
    const better =
      count > bestMetrics.count
      || (count === bestMetrics.count && metrics.maxTop < bestMetrics.maxTop - EPS)
      || (count === bestMetrics.count && Math.abs(metrics.maxTop - bestMetrics.maxTop) <= EPS && metrics.rectangleFill > bestMetrics.rectangleFill + EPS)
      || (count === bestMetrics.count && Math.abs(metrics.maxTop - bestMetrics.maxTop) <= EPS && Math.abs(metrics.rectangleFill - bestMetrics.rectangleFill) <= EPS && metrics.footprint > bestMetrics.footprint + EPS);
    if (better) {
      best = packed;
      bestMetrics = { count, ...metrics };
    }
  }
  return best;
}

function cargoRowsFromCounts(counts: Map<string, number>, cargoMap: Map<string, CargoItem>) {
  return [...counts.entries()]
    .filter(([, quantity]) => quantity > 0)
    .flatMap(([id, quantity]) => {
      const item = cargoMap.get(id);
      return item ? [{ ...item, quantity }] : [];
    });
}

function loadedCounts(pallets: PalletLoad[]) {
  const counts = new Map<string, number>();
  for (const load of pallets) {
    for (const placement of load.cargoPlacements) {
      counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1);
    }
  }
  return counts;
}

function makeDenseLoad(index: number, placements: Placement[], pallet: PalletSpec): PalletLoad {
  const cargoPlacements = placements.map((placement) => ({ ...placement, z: placement.z + pallet.height }));
  const cargoWeightKg = cargoPlacements.reduce((sum, placement) => sum + placement.weightKg, 0);
  const load: PalletLoad = {
    palletIndex: index,
    x: 0,
    y: 0,
    z: 0,
    stackLevel: 1,
    stackColumn: index,
    length: pallet.length,
    width: pallet.width,
    height: pallet.height,
    cargoPlacements,
    cargoWeightKg,
    packagingWeightKg: 0,
    packagingExtraHeightM: 0,
    cornerGuardsUsed: false,
    wrappingUsed: false,
    totalWeightKg: cargoWeightKg + pallet.tareWeightKg,
    centerOfGravity: { x: pallet.length / 2, y: pallet.width / 2, z: pallet.height / 2 },
  };
  centerCargoOnPallet(load, pallet);
  return load;
}

/**
 * Build a pallet load from already validated local deck placements (z starts at 0).
 * Packaging and centre-of-gravity are recalculated exactly like normal pallet loads.
 */
export function buildPalletLoadFromDeckPlacements(
  index: number,
  placements: Placement[],
  pallet: PalletSpec,
): PalletLoad {
  const load = makeDenseLoad(index, placements, pallet);
  applyMinimumPackaging([load], pallet);
  load.centerOfGravity = palletCog(load, pallet);
  return load;
}

/**
 * Rebuild all already-loadable cartons into the fewest dense pallet loads we can find.
 * Loaded quantity is frozen before this pass, so pallet reduction can never be achieved
 * by silently dropping cartons. For non-unloading strategies all compatible SKUs compete
 * together; the final tail therefore becomes a deliberately mixed pallet instead of
 * several nearly-empty SKU pallets. For unloading, mixing is limited to the same stop.
 *
 * Within one pallet, quantity comes first. When two candidates carry the same quantity,
 * the lower/flatter candidate wins, then the more rectangular envelope. This suppresses
 * the "horn" shape where a few cartons form a needless tower over an otherwise sparse load.
 */
function repackLoadedCargoDensely(
  input: PalletLoad[],
  cargoMap: Map<string, CargoItem>,
  pallet: PalletSpec,
  container: ContainerSpec,
  strategy: Strategy,
) {
  if (!input.length) return { pallets: input, removed: 0 };
  // palletOptimization uses this base packer recursively with a one-pallet virtual
  // container while testing pair consolidation. Running another Beam repack inside
  // that inner probe multiplies cost without changing pallet count or shape.
  if (container.length <= pallet.length + EPS && container.width <= pallet.width + EPS) {
    return { pallets: input, removed: 0 };
  }
  const frozen = loadedCounts(input);
  // Homogeneous SKU pallets are already generated as aligned grids by slotFor().
  // The expensive repack is reserved for the mixed-SKU case where tail consolidation
  // and uneven towers are actually possible.
  if (frozen.size <= 1) return { pallets: input, removed: 0 };
  const frozenCount = [...frozen.values()].reduce((sum, value) => sum + value, 0);
  // Dense multi-profile repacking is intentionally bounded. Large portfolio jobs keep
  // the existing linear consolidation path instead of multiplying Beam Search cost.
  if (frozen.size > DENSE_REPACK_MAX_SKUS || frozenCount > DENSE_REPACK_MAX_CARTONS) {
    return { pallets: input, removed: 0 };
  }
  const groups = new Map<number, Map<string, number>>();
  for (const [id, quantity] of frozen) {
    const item = cargoMap.get(id);
    if (!item || quantity <= 0) continue;
    const key = strategy === 'unloading' ? (item.unloadPriority ?? Number.MAX_SAFE_INTEGER) : 0;
    const counts = groups.get(key) ?? new Map<string, number>();
    counts.set(id, quantity);
    groups.set(key, counts);
  }

  const rebuilt: PalletLoad[] = [];
  for (const [, initialCounts] of [...groups.entries()].sort(([a], [b]) => b - a)) {
    const counts = new Map(initialCounts);
    let guard = 0;
    while ([...counts.values()].some((quantity) => quantity > 0) && guard < 1000) {
      guard += 1;
      const rows = cargoRowsFromCounts(counts, cargoMap);
      const packed = densePackOnePallet(rows, pallet, container, strategy);
      if (!packed?.placements.length) return { pallets: input, removed: 0 };

      const packedCounts = new Map<string, number>();
      for (const placement of packed.placements) {
        packedCounts.set(placement.cargoId, (packedCounts.get(placement.cargoId) ?? 0) + 1);
      }
      for (const [id, quantity] of packedCounts) {
        counts.set(id, Math.max(0, (counts.get(id) ?? 0) - quantity));
      }
      rebuilt.push(makeDenseLoad(rebuilt.length + 1, packed.placements, pallet));
      if (rebuilt.length > input.length) return { pallets: input, removed: 0 };
    }
    if ([...counts.values()].some((quantity) => quantity > 0)) return { pallets: input, removed: 0 };
  }

  if (rebuilt.length > input.length) return { pallets: input, removed: 0 };
  applyMinimumPackaging(rebuilt, pallet);
  if (rebuilt.some(load => !palletLoadsWithinFloorLoadLimit(container, [load], pallet))) return { pallets: input, removed: 0 };
  rebuilt.forEach((load) => { load.centerOfGravity = palletCog(load, pallet); });
  const originalCount = [...frozen.values()].reduce((sum, value) => sum + value, 0);
  const rebuiltCount = rebuilt.reduce((sum, load) => sum + load.cargoPlacements.length, 0);
  const gross = rebuilt.reduce((sum, load) => sum + load.totalWeightKg, 0);
  if (rebuiltCount !== originalCount || gross > container.maxPayloadKg + EPS) return { pallets: input, removed: 0 };

  return { pallets: rebuilt, removed: Math.max(0, input.length - rebuilt.length) };
}

function buildInitialPallets(cargo: CargoItem[], pallet: PalletSpec, container: ContainerSpec, strategy: Strategy) {
  const active = cargo
    .filter((item) => item.quantity > 0)
    .sort((a, b) =>
      (b.weightKg * b.quantity) - (a.weightKg * a.quantity)
      || (cargoVolume(b) * b.quantity) - (cargoVolume(a) * a.quantity)
      || b.weightKg - a.weightKg
      || a.id.localeCompare(b.id));
  const cargoMap = new Map(active.map((item) => [item.id, item]));
  const remaining = new Map(active.map((item) => [item.id, item.quantity]));
  const pallets: PalletLoad[] = [];
  const floorBlockedIds = new Set<string>();
  let totalPalletizedWeight = 0;
  const packagingReserveWeight =
    (pallet.useCornerGuards ? pallet.cornerGuardWeightKg : 0) +
    (pallet.useWrapping ? pallet.wrappingWeightKg : 0);

  const makeLoad = (): PalletLoad => ({
    palletIndex: pallets.length + 1,
    x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: pallets.length + 1,
    length: pallet.length, width: pallet.width, height: pallet.height,
    cargoPlacements: [], cargoWeightKg: 0, packagingWeightKg: 0, packagingExtraHeightM: 0,
    cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: pallet.tareWeightKg,
    centerOfGravity: { x: pallet.length / 2, y: pallet.width / 2, z: pallet.height / 2 },
  });

  for (const item of active) {
    let left = remaining.get(item.id) ?? 0;
    // A failed load is unchanged for the rest of this SKU's append-only loop.
    // Retry it for the next SKU (including partial cartons), and in every later
    // consolidation/repacking pass: other cartons can create new support surfaces.
    const unavailable = new Set<PalletLoad>();
    while (left > 0) {
      let target: PalletLoad | undefined;
      let placement: Placement | null = null;
      for (const load of pallets) {
        // Fill compatible residual space before paying for another pallet base.
        // Unloading keeps each pallet within one stop so it can be removed intact.
        if (unavailable.has(load)) continue;
        if (strategy === 'unloading' && stopOf(load, cargoMap) !== (item.unloadPriority ?? 0)) continue;
        const candidate = slotFor(load, item, pallet, container, cargoMap, floorBlockedIds);
        if (!candidate) { unavailable.add(load); continue; }
        if (!(totalPalletizedWeight + item.weightKg <= container.maxPayloadKg + EPS)) continue;
        target = load;
        placement = candidate;
        break;
      }
      if (!target) {
        const empty = makeLoad();
        const candidate = slotFor(empty, item, pallet, container, cargoMap, floorBlockedIds);
        if (!candidate) break;
        if (totalPalletizedWeight + pallet.tareWeightKg + packagingReserveWeight + item.weightKg > container.maxPayloadKg + EPS) break;
        pallets.push(empty);
        totalPalletizedWeight += pallet.tareWeightKg + packagingReserveWeight;
        target = empty;
        placement = candidate;
      }
      if (!placement) break;
      target.cargoPlacements.push(placement);
      target.cargoWeightKg += item.weightKg;
      target.totalWeightKg += item.weightKg;
      totalPalletizedWeight += item.weightKg;
      left -= 1;
      remaining.set(item.id, left);
    }
  }

  const consolidated = tryConsolidate(pallets, cargoMap, pallet, container, strategy);

  let mixedReservedWeight = pallets.reduce(
    (sum, load) => sum + load.cargoWeightKg + pallet.tareWeightKg + packagingReserveWeight,
    0,
  );
  for (const item of active) {
    let left = remaining.get(item.id) ?? 0;
    while (left > 0 && mixedReservedWeight + item.weightKg <= container.maxPayloadKg + EPS) {
      let target: PalletLoad | undefined;
      let placement: Placement | null = null;
      for (let index = pallets.length - 1; index >= 0; index -= 1) {
        if (strategy === 'unloading' && stopOf(pallets[index], cargoMap) !== (item.unloadPriority ?? 0)) continue;
        const candidate = slotFor(pallets[index], item, pallet, container, cargoMap, floorBlockedIds);
        if (!candidate) continue;
        target = pallets[index];
        placement = candidate;
        break;
      }
      if (!target || !placement) break;
      target.cargoPlacements.push(placement);
      target.cargoWeightKg += item.weightKg;
      mixedReservedWeight += item.weightKg;
      left -= 1;
      remaining.set(item.id, left);
    }
  }

  pallets.forEach((load) => centerCargoOnPallet(load, pallet));
  applyMinimumPackaging(pallets, pallet);
  pallets.forEach((load) => { load.centerOfGravity = palletCog(load, pallet); });

  const dense = repackLoadedCargoDensely(pallets, cargoMap, pallet, container, strategy);
  return { pallets: dense.pallets, remaining, consolidated: consolidated + dense.removed, cargoMap, floorBlockedIds };
}

function isColumnTop(load: PalletLoad, all: PalletLoad[]) {
  return !all.some((other) => other !== load && other.stackColumn === load.stackColumn && other.stackLevel > load.stackLevel);
}

function columnBelow(load: PalletLoad, all: PalletLoad[]) {
  return all
    .filter((other) => other !== load && other.stackColumn === load.stackColumn && other.stackLevel < load.stackLevel)
    .sort((a, b) => a.stackLevel - b.stackLevel);
}

/**
 * Field practice: a nearly empty pallet (often the one riding on top of another
 * stack) is not shipped on its own; its cartons go onto the spare top layers of
 * another pallet. Starting from the sparsest pallet, move every carton onto pallets
 * that are the top of their column. A source is removed only when all of its
 * cartons move; otherwise every target is restored.
 *
 * Hard constraints are the same ones used when the pallets were built: container
 * height with packaging reserve, pallet max load, carton support, declared stack
 * layers and top load, and the top-load limits of every pallet below the target.
 * Unloading keeps each pallet within one stop. `maxCargoHeight` bounds the resulting
 * unit-load height. Center of gravity is intentionally not considered here.
 */
export function absorbSparsePallets(
  input: PalletLoad[],
  cargo: CargoItem[],
  pallet: PalletSpec,
  container: ContainerSpec,
  strategy: Strategy,
  maxCargoHeight: number,
) {
  const cargoMap = new Map(cargo.map((item) => [item.id, item]));
  const maxPackagingWeight = (pallet.useCornerGuards ? pallet.cornerGuardWeightKg : 0) + (pallet.useWrapping ? pallet.wrappingWeightKg : 0);
  let pallets = input.map((load) => ({ ...load, cargoPlacements: load.cargoPlacements.map((p) => ({ ...p })), centerOfGravity: { ...load.centerOfGravity } }));
  let removed = 0;
  let changed = true;
  const findSlot = createSlotSearch(pallet, container, cargoMap);
  type AbsorbTarget = { original: PalletLoad; work: PalletLoad };
  // The verdict for one carton on one target depends only on that target's own work
  // copy: the pallets below a column top are never targets and stay untouched while a
  // source is being moved. Each carton changes a single target, so the other targets'
  // verdicts (slot, column support and floor load) are reused until they receive one.
  const verdicts = new WeakMap<PalletLoad, Map<string, { count: number; placement: Placement | null }>>();
  const acceptedSlot = (target: AbsorbTarget, item: CargoItem): Placement | null => {
    let byItem = verdicts.get(target.work);
    const known = byItem?.get(item.id);
    if (known && known.count === target.work.cargoPlacements.length) return known.placement;
    const placement = evaluateSlot(target, item);
    if (!byItem) { byItem = new Map(); verdicts.set(target.work, byItem); }
    byItem.set(item.id, { count: target.work.cargoPlacements.length, placement });
    return placement;
  };
  const evaluateSlot = (target: AbsorbTarget, item: CargoItem): Placement | null => {
    if (strategy === 'unloading' && stopOf(target.work, cargoMap) !== (item.unloadPriority ?? 0)) return null;
    const placement = findSlot(target.original, target.work, item);
    if (!placement) return null;
    if (placement.z + placement.height - target.work.z - target.work.height > maxCargoHeight + EPS) return null;
    // Pallets below the target must carry the extra carton. Packaging is counted at
    // its maximum because the minimum-packaging recount happens after the move.
    const below = columnBelow(target.original, pallets);
    const upperWeight = target.work.cargoWeightKg + item.weightKg + pallet.tareWeightKg + maxPackagingWeight;
    for (let i = 0; i < below.length; i += 1) {
      const stackedAbove = below.slice(i + 1).reduce((sum, load) => sum + load.totalWeightKg, 0) + upperWeight;
      if (!canSupportUpper(below[i], stackedAbove, cargoMap, pallet)) return null;
    }
    if (below.length && !palletLoadsWithinFloorLoadLimit(container, [...below, { ...target.work,
      cargoPlacements: [...target.work.cargoPlacements, placement] }], pallet, true)) return null;
    return placement;
  };
  while (changed && pallets.length > 1) {
    changed = false;
    const sources = pallets
      .filter((load) => load.cargoPlacements.length > 0 && isColumnTop(load, pallets))
      .sort((a, b) => a.cargoPlacements.length - b.cargoPlacements.length || b.stackLevel - a.stackLevel || a.palletIndex - b.palletIndex);
    for (const source of sources) {
      const targets = pallets
        .filter((load) => load !== source && isColumnTop(load, pallets))
        .map((load) => ({ original: load, work: { ...load, cargoPlacements: [...load.cargoPlacements] } }));
      if (!targets.length) continue;
      const items = source.cargoPlacements
        .map((placement) => cargoMap.get(placement.cargoId))
        .sort((a, b) => (b?.weightKg ?? 0) - (a?.weightKg ?? 0) || (a?.id ?? '').localeCompare(b?.id ?? ''));
      let success = true;
      for (const item of items) {
        if (!item) { success = false; break; }
        let best: { target: typeof targets[number]; placement: Placement; index: number } | null = null;
        targets.forEach((target, index) => {
          const placement = acceptedSlot(target, item);
          if (!placement) return;
          if (!best || placement.z < best.placement.z - EPS || (Math.abs(placement.z - best.placement.z) <= EPS && index < best.index)) {
            best = { target, placement, index };
          }
        });
        if (!best) { success = false; break; }
        const chosen = best as { target: typeof targets[number]; placement: Placement };
        chosen.target.work.cargoPlacements.push(chosen.placement);
        chosen.target.work.cargoWeightKg += item.weightKg;
      }
      if (!success) continue;
      const touched = targets
        .filter((target) => target.work.cargoPlacements.length !== target.original.cargoPlacements.length)
        .map((target) => target.work);
      const updated = new Map(targets.map((target) => [target.original, target.work]));
      pallets = pallets
        .filter((load) => load !== source)
        .map((load) => updated.get(load) ?? load);
      applyMinimumPackaging(touched, pallet);
      touched.forEach((load) => { load.centerOfGravity = palletCog(load, pallet); });
      // Packaging may add height after the recount; never exceed the ceiling.
      if (touched.some((load) => palletTop(load) > container.height + EPS)) return { pallets: input, removed: 0 };
      removed += 1;
      changed = true;
      break;
    }
  }
  if (!removed) return { pallets: input, removed: 0 };
  const beforeCount = input.reduce((sum, load) => sum + load.cargoPlacements.length, 0);
  const afterCount = pallets.reduce((sum, load) => sum + load.cargoPlacements.length, 0);
  if (beforeCount !== afterCount) return { pallets: input, removed: 0 };
  return { pallets, removed };
}

export function unsupportedReviewPalletResult(container: ContainerSpec, cargo: CargoItem[]): PalletPackingResult {
  const reason='WHAT-IF REVIEW는 팔레트·MIXED 적재를 지원하지 않습니다. 엄격 모드로 전환하세요.';
  return {pallets:[],placements:[],remaining:cargo.filter(c=>c.quantity>0).map(c=>({cargoId:c.id,quantity:c.quantity,reason})),
    palletCount:0,loadedCargoWeightKg:0,totalPackagingWeightKg:0,avoidedPackagingWeightKg:0,packagedPalletCount:0,totalPalletizedWeightKg:0,consolidatedPallets:0,lateralImbalanceKg:0,stackedPallets:0,maxUsedStackLevel:0,
    ...(container.limitReview!==undefined?{limitReview:{mode:'what-if' as const,label:'WHAT-IF REVIEW' as const,status:'unsupported' as const,config:container.limitReview,metrics:[],errors:[reason]}}:{}),
  };
}

export function packOnPallets(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec = defaultPalletSpec, strategy: Strategy = 'capacity'): PalletPackingResult {
  if (container.limitReview !== undefined) return unsupportedReviewPalletResult(container,cargo);
  container = planningContainer(container);
  const { pallets, remaining, consolidated, cargoMap, floorBlockedIds } = buildInitialPallets(cargo, pallet, container, strategy);
  return finishPalletPacking(pallets, remaining, consolidated, cargoMap, container, pallet, strategy, floorBlockedIds);
}

/** Footprint at the highest occupied tier, measured against the usable pallet deck. */
export function palletTopLayerFill(load: PalletLoad) {
  if (!load.cargoPlacements.length) return 0;
  const z = Math.max(...load.cargoPlacements.map(p => p.z));
  return load.cargoPlacements.filter(p => Math.abs(p.z - z) <= EPS)
    .reduce((area, p) => area + p.length * p.width, 0) / (load.length * load.width);
}

/**
 * Owner rule #97: a regular top tier below the minimum is moved in its entirety to
 * the final mixed tail. This runs AFTER sparse-pallet absorption, which must never
 * put these cartons back onto regular pallets. Extra bases are permitted, but every
 * placement and the rebuilt pallet stacks still pass the ordinary hard checks.
 */
export function applyTopLayerFillPolicy(input: PalletPackingResult, cargo: CargoItem[], pallet: PalletSpec, container: ContainerSpec, strategy: Strategy): PalletPackingResult {
  const minimum = pallet.minTopLayerFillRatio ?? 0.5;
  if (minimum <= 0 || !input.pallets.length) return input;
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const floorBlockedIds = new Set(input.remaining.filter(row => row.reasonCode === 'FLOOR_LOAD_LIMIT').map(row => row.cargoId));
  const pending = new Map<string, number>();
  const putBack = (placements: Placement[]) => placements.forEach(p => pending.set(p.cargoId, (pending.get(p.cargoId) ?? 0) + 1));
  const strip = (load: PalletLoad) => {
    while (load.cargoPlacements.length && palletTopLayerFill(load) + EPS < minimum) {
      const z = Math.max(...load.cargoPlacements.map(p => p.z));
      const tier = load.cargoPlacements.filter(p => Math.abs(p.z - z) <= EPS);
      putBack(tier);
      load.cargoPlacements = load.cargoPlacements.filter(p => Math.abs(p.z - z) > EPS);
    }
  };
  const local = input.pallets.map((load, i) => makeDenseLoad(i + 1, load.cargoPlacements.map(p => ({ ...p, x: p.x - load.x, y: p.y - load.y, z: p.z - load.z - load.height })), pallet));
  if (local.every(load => palletTopLayerFill(load) + EPS >= minimum)) return input;
  // Keep one existing residual load per compatible stop in the tail pool. Otherwise
  // splitting the already-final 20/20/5 example would pointlessly produce 20/20/4/1.
  const groups = new Map<number, PalletLoad[]>();
  for (const load of local) {
    const key = strategy === 'unloading' ? stopOf(load, cargoMap) : 0;
    groups.set(key, [...(groups.get(key) ?? []), load]);
  }
  const reservedTails = new Set<PalletLoad>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const tail = [...group].sort((a, b) => a.cargoPlacements.length - b.cargoPlacements.length || b.palletIndex - a.palletIndex)
      .find(load => palletTopLayerFill(load) + EPS < minimum || (
        new Set(load.cargoPlacements.map(p => p.z.toFixed(6))).size === 1 && cargo.some(item => {
          if (strategy === 'unloading' && stopOf(load, cargoMap) !== (item.unloadPriority ?? 0)) return false;
          const candidate = slotFor(load, item, pallet, container, cargoMap, floorBlockedIds);
          return candidate && Math.abs(candidate.z - load.cargoPlacements[0].z) <= EPS;
        })
      ));
    if (tail) reservedTails.add(tail);
  }
  local.forEach(load => {
    if (reservedTails.has(load)) { putBack(load.cargoPlacements); load.cargoPlacements = []; }
    else strip(load);
    load.cargoWeightKg = load.cargoPlacements.reduce((sum, p) => sum + p.weightKg, 0);
  });
  if (!pending.size) return input;
  let regular = local.filter(load => load.cargoPlacements.length);
  // Include an existing unfinished floor pallet when it can take a lifted carton
  // on that same floor. Do not leave an old partial pallet beside the new mixed tail.
  regular = regular.filter(load => {
    if (new Set(load.cargoPlacements.map(p => p.z.toFixed(6))).size !== 1) return true;
    const base = load.cargoPlacements[0].z;
    const accepts = [...pending.keys()].some(id => {
      const item = cargoMap.get(id)!;
      if (strategy === 'unloading' && stopOf(load, cargoMap) !== (item.unloadPriority ?? 0)) return false;
      const candidate = slotFor(load, item, pallet, container, cargoMap, floorBlockedIds);
      return candidate && Math.abs(candidate.z - base) <= EPS;
    });
    if (accepts) putBack(load.cargoPlacements);
    return !accepts;
  });
  regular = regular.map((load, i) => makeDenseLoad(i + 1, load.cargoPlacements.map(p => ({ ...p, z: p.z - pallet.height })), pallet));
  applyMinimumPackaging(regular, pallet);
  let gross = regular.reduce((sum, load) => sum + load.totalWeightKg, 0);
  const packagingWeight = (pallet.useCornerGuards ? pallet.cornerGuardWeightKg : 0) + (pallet.useWrapping ? pallet.wrappingWeightKg : 0);
  const tails: PalletLoad[] = [];
  const rows = [...cargoMap.values()].sort((a, b) => (strategy === 'unloading' ? (b.unloadPriority ?? 0) - (a.unloadPriority ?? 0) : 0) || b.weightKg - a.weightKg || a.id.localeCompare(b.id));
  while ([...pending.values()].some(n => n > 0)) {
    const load = makeDenseLoad(regular.length + tails.length + 1, [], pallet);
    const available = container.maxPayloadKg - gross - pallet.tareWeightKg - packagingWeight;
    while (true) {
      let best: { item: CargoItem; placement: Placement } | undefined;
      for (const item of rows) {
        if (!(pending.get(item.id) ?? 0) || load.cargoWeightKg + item.weightKg > available + EPS) continue;
        if (strategy === 'unloading' && load.cargoPlacements.length && stopOf(load, cargoMap) !== (item.unloadPriority ?? 0)) continue;
        const placement = slotFor(load, item, pallet, container, cargoMap, floorBlockedIds);
        if (placement && (!best || placement.z < best.placement.z - EPS)) best = { item, placement };
      }
      if (!best) break;
      load.cargoPlacements.push(best.placement);
      load.cargoWeightKg += best.item.weightKg;
      pending.set(best.item.id, pending.get(best.item.id)! - 1);
    }
    if (!load.cargoPlacements.length) break;
    const hasNextInGroup = rows.some(item => (pending.get(item.id) ?? 0) > 0 && (strategy !== 'unloading' || (item.unloadPriority ?? 0) === stopOf(load, cargoMap)));
    // Complete earlier tail pallets too. The unavoidable final tail for each stop
    // is exempt. A weight/geometry-limited single tier must not be split forever.
    if (hasNextInGroup) {
      const before = [...load.cargoPlacements];
      strip(load);
      if (!load.cargoPlacements.length) {
        load.cargoPlacements = before;
        before.forEach(p => pending.set(p.cargoId, pending.get(p.cargoId)! - 1));
      }
    }
    load.cargoWeightKg = load.cargoPlacements.reduce((sum, p) => sum + p.weightKg, 0);
    load.isMixedTail = true;
    centerCargoOnPallet(load, pallet);
    applyMinimumPackaging([load], pallet);
    load.centerOfGravity = palletCog(load, pallet);
    tails.push(load);
    gross += load.totalWeightKg;
  }
  const remaining = new Map(input.remaining.map(row => [row.cargoId, row.quantity]));
  for (const [id, quantity] of pending) if (quantity > 0) remaining.set(id, (remaining.get(id) ?? 0) + quantity);
  const result = finishPalletPacking([...regular, ...tails], remaining, input.consolidatedPallets, cargoMap, container, pallet, strategy, floorBlockedIds);
  result.remaining = result.remaining.map(row => row.quantity > (input.remaining.find(old => old.cargoId === row.cargoId)?.quantity ?? 0)
    ? { ...row, reason: `최상단 최소충전율 ${Math.round(minimum * 100)}% 적용 후: ${row.reason}` } : row);
  return result;
}

const sameValue = (a: number, b: number) => Math.abs(a - b) <= 1e-6;

/**
 * Field practice for a weight-limited top tier: never leave avoidable holes inside the visible
 * top surface. Put unavoidable empty slots on the perimeter first, in point-symmetric pairs when
 * possible so the pallet centre of gravity stays balanced. This keeps the top tier contiguous
 * instead of producing "windows" between cartons. Only uniform tiers that sit exactly on a lower
 * tier of the same carton footprint are rearranged; carton counts and every support/stacking/
 * top-load check are unchanged or re-verified, otherwise the pallet is left as is.
 */
export function placeTopTierHolesInside(load: PalletLoad, cargoMap: Map<string, CargoItem>): PalletLoad {
  const placements = load.cargoPlacements;
  if (placements.length < 2) return load;
  const topZ = Math.max(...placements.map(p => p.z));
  const tier = placements.filter(p => sameValue(p.z, topZ));
  const first = tier[0];
  if (!tier.every(p => sameValue(p.length, first.length) && sameValue(p.width, first.width) && sameValue(p.height, first.height))) return load;
  const below = placements.filter(p => sameValue(p.z + p.height, topZ));
  const slots = below.filter(p => sameValue(p.length, first.length) && sameValue(p.width, first.width));
  if (slots.length <= tier.length || slots.length !== below.length) return load;
  const key = (p: Pick<Placement, 'x' | 'y'>) => `${p.x.toFixed(6)}:${p.y.toFixed(6)}`;
  const slotKeys = new Set(slots.map(key));
  if (!tier.every(p => slotKeys.has(key(p)))) return load;

  const minX = Math.min(...slots.map(p => p.x));
  const maxX = Math.max(...slots.map(p => p.x + p.length));
  const minY = Math.min(...slots.map(p => p.y));
  const maxY = Math.max(...slots.map(p => p.y + p.width));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const center = (p: Placement) => ({ x: p.x + p.length / 2, y: p.y + p.width / 2 });
  const ranked = [...slots].sort((a, b) => {
    const ca = center(a), cb = center(b);
    // Empty the outside first. The previous ascending order deliberately put holes
    // near the centre and produced visible cavities on almost every weight-limited
    // pallet top (for example 30/32 cartons).
    return Math.hypot(cb.x - cx, cb.y - cy) - Math.hypot(ca.x - cx, ca.y - cy) || a.x - b.x || a.y - b.y;
  });
  const holeCount = slots.length - tier.length;
  const holes = new Set<string>();
  for (const slot of ranked) {
    if (holes.size >= holeCount) break;
    if (holes.has(key(slot))) continue;
    holes.add(key(slot));
    if (holes.size >= holeCount) break;
    const c = center(slot);
    const mirror = slots.find(q => {
      const m = center(q);
      return sameValue(m.x, 2 * cx - c.x) && sameValue(m.y, 2 * cy - c.y);
    });
    if (mirror && !holes.has(key(mirror))) holes.add(key(mirror));
  }
  const target = slots.filter(slot => !holes.has(key(slot)));
  const targetKeys = new Set(target.map(key));
  const staying = tier.filter(p => targetKeys.has(key(p)));
  if (staying.length === tier.length) return load;
  const stayingKeys = new Set(staying.map(key));
  const freeSlots = target.filter(slot => !stayingKeys.has(key(slot)));
  const moving = tier.filter(p => !targetKeys.has(key(p)));
  const moved = new Map<Placement, Placement>();
  moving.forEach((p, index) => moved.set(p, { ...p, x: freeSlots[index].x, y: freeSlots[index].y }));
  const next = placements.map(p => moved.get(p) ?? p);

  for (const placement of moved.values()) {
    const item = cargoMap.get(placement.cargoId);
    const others = next.filter(p => p !== placement);
    const base = { x: load.x, y: load.y, z: load.z + load.height, length: load.length, width: load.width };
    if (!item || !hasAdequateSupport(placement, others, base) || !canPlaceByStackingRules(item, placement, others, cargoMap)) return load;
  }
  return { ...load, cargoPlacements: next };
}

/** Applies {@link placeTopTierHolesInside} and keeps any stacked pallet on it supported. */
export function placeTopTierHolesInsideAll(pallets: PalletLoad[], cargoMap: Map<string, CargoItem>, pallet: PalletSpec,
  container?: ContainerSpec) {
  const arranged = pallets.map(load => {
    const next = placeTopTierHolesInside(load, cargoMap);
    if (next === load) return load;
    if (container && !palletLoadsWithinFloorLoadLimit(container,
      pallets.filter(other => other.stackColumn === load.stackColumn).map(other => other === load ? next : other), pallet)) return load;
    const above = pallets.filter(other => other !== load && other.stackColumn === load.stackColumn && other.stackLevel > load.stackLevel);
    if (above.length) {
      const aboveWeight = above.reduce((sum, other) => sum + other.totalWeightKg, 0);
      if (!hasPalletFootprintSupport(next, pallet) || !canSupportUpper(next, aboveWeight, cargoMap, pallet)) return load;
    }
    return { ...next, centerOfGravity: palletCog(next, pallet) };
  });
  return container && !palletLoadsWithinFloorLoadLimit(container, arranged, pallet) ? pallets : arranged;
}

function finishPalletPacking(pallets: PalletLoad[], remaining: Map<string, number>, consolidated: number, cargoMap: Map<string, CargoItem>, container: ContainerSpec, pallet: PalletSpec, strategy: Strategy,
  floorBlockedIds = new Set<string>()): PalletPackingResult {
  const positions = palletPositions(container, pallet);
  const unplaced = arrangePalletStacks(pallets, positions, container, pallet, cargoMap, strategy, floorBlockedIds);
  const unplacedSet = new Set(unplaced);
  for (const load of unplaced) {
    for (const placement of load.cargoPlacements) {
      remaining.set(placement.cargoId, (remaining.get(placement.cargoId) ?? 0) + 1);
    }
  }
  const placedPallets = pallets.filter((load) => !unplacedSet.has(load));
  placedPallets.forEach((load, index) => { load.palletIndex = index + 1; });

  const placements = placedPallets.flatMap((load) => load.cargoPlacements);
  const totalPackagingWeightKg = placedPallets.reduce((sum, load) => sum + load.packagingWeightKg, 0);
  const totalPalletizedWeightKg = placedPallets.reduce((sum, load) => sum + load.totalWeightKg, 0);
  const loadedCargoWeightKg = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  const remainingRows = [...remaining.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([cargoId, quantity]) => {
      const item = cargoMap.get(cargoId)!;
      const footprintFits = orientations(item).some(o => o.length <= pallet.length + EPS && o.width <= pallet.width + EPS);
      const reason = pallet.length > container.length + EPS || pallet.width > container.width + EPS
        ? '파렛트 규격이 컨테이너 바닥 크기에 맞지 않음'
        : !footprintFits || item.height + pallet.height > container.height + EPS
          ? '박스 크기가 파렛트 바닥 또는 컨테이너 유효 높이에 맞지 않음 · 허용 회전 검사 완료'
          : item.weightKg > pallet.maxLoadKg + EPS ? '박스 1개 중량이 파렛트 허용 적재중량을 초과함'
          : totalPalletizedWeightKg + item.weightKg > container.maxPayloadKg + EPS ? '컨테이너 최대 적재 중량 초과 · 파렛트와 포장재 중량 포함'
          : floorBlockedIds.has(cargoId) ? `FLOOR_LOAD_LIMIT: ${FLOOR_LOAD_REASON}`
          : '사용 가능한 파렛트 공간에서 지지·적층단·누적 상부하중·포장 여유를 만족하는 추가 위치 없음';
      return { cargoId, quantity, reason, ...(reason.startsWith('FLOOR_LOAD_LIMIT:') ? { reasonCode: 'FLOOR_LOAD_LIMIT' } : {}) };
    });
  const left = placedPallets
    .filter((p) => lateralSide(p.centerOfGravity.y, container.width) < 0)
    .reduce((sum, p) => sum + p.totalWeightKg, 0);
  const right = placedPallets
    .filter((p) => lateralSide(p.centerOfGravity.y, container.width) > 0)
    .reduce((sum, p) => sum + p.totalWeightKg, 0);

  return {
    pallets: placedPallets,
    placements,
    remaining: remainingRows,
    palletCount: placedPallets.length,
    loadedCargoWeightKg,
    totalPackagingWeightKg,
    avoidedPackagingWeightKg: pallet.minimizePackaging
      ? placedPallets.reduce((sum, load) => sum + (load.cornerGuardsUsed ? 0 : pallet.cornerGuardWeightKg) + (load.wrappingUsed ? 0 : pallet.wrappingWeightKg), 0)
      : 0,
    packagedPalletCount: placedPallets.filter((load) => load.cornerGuardsUsed || load.wrappingUsed).length,
    totalPalletizedWeightKg,
    consolidatedPallets: consolidated,
    lateralImbalanceKg: Math.abs(left - right),
    stackedPallets: placedPallets.filter((load) => load.stackLevel > 1).length,
    maxUsedStackLevel: placedPallets.length ? placedPallets.reduce((max, load) => Math.max(max, load.stackLevel), 1) : 0,
  };
}
