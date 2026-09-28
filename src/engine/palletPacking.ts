import type { CargoItem, ContainerSpec, Placement } from './types';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules, projectedTopLoadKg } from './stacking';
import { packByBlockSpaceBeamV2 } from './blockSpaceBeamPackerV2';

export type PalletSpec = {
  length: number;
  width: number;
  height: number;
  tareWeightKg: number;
  maxLoadKg: number;
  maxStackLevels: number;
  maxSupportedTopWeightKg: number;
  useCornerGuards: boolean;
  cornerGuardWeightKg: number;
  cornerGuardExtraHeightM: number;
  useWrapping: boolean;
  wrappingWeightKg: number;
  wrappingExtraHeightM: number;
  minimizePackaging: boolean;
};

export type PalletLoad = {
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
  pallets: PalletLoad[];
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>;
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
  length: 1.1,
  width: 1.1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
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
        offsetX: Math.max(0, (pallet.length - colsX * o.length) / 2),
        offsetY: Math.max(0, (pallet.width - colsY * o.width) / 2),
      };
    })
    .filter((o) => o.colsX > 0 && o.colsY > 0)
    .sort((a, b) => (b.colsX * b.colsY) - (a.colsX * a.colsY) || Number(a.rotated) - Number(b.rotated));

  const baseSurface = { x: load.x, y: load.y, z: load.z + pallet.height, length: pallet.length, width: pallet.width };
  // Mixed-height cartons must sit on real surfaces, not multiples of their own height.
  // Support and cumulative layer/top-load checks below remain mandatory at every surface.
  const surfaces = [...new Set([baseSurface.z, ...load.cargoPlacements.map(placement => placement.z + placement.height)])]
    .filter(z => z + item.height + reserveHeight <= container.height + EPS)
    .sort((a, b) => a - b);

  for (const option of options) {
    for (const z of surfaces) {
      for (let row = 0; row < option.colsX; row += 1) {
        for (let col = 0; col < option.colsY; col += 1) {
          const candidate: Placement = {
            cargoId: item.id,
            x: load.x + option.offsetX + row * option.length,
            y: load.y + option.offsetY + col * option.width,
            z,
            length: option.length,
            width: option.width,
            height: item.height,
            weightKg: item.weightKg,
            rotated: option.rotated,
          };
          const collides = load.cargoPlacements.some((p) => candidate.x < p.x + p.length - EPS && candidate.x + candidate.length > p.x + EPS && candidate.y < p.y + p.width - EPS && candidate.y + candidate.width > p.y + EPS && candidate.z < p.z + p.height - EPS && candidate.z + candidate.height > p.z + EPS);
          if (collides || candidate.z + candidate.height > container.height + EPS) continue;
          if (!hasAdequateSupport(candidate, load.cargoPlacements, baseSurface)) continue;
          if (!canPlaceByStackingRules(item, candidate, load.cargoPlacements, cargoMap)) continue;
          return candidate;
        }
      }
    }
  }
  return null;
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
  for (let sourceIndex = pallets.length - 1; sourceIndex > 0; sourceIndex -= 1) {
    const source = pallets[sourceIndex];
    const targets = pallets.slice(0, sourceIndex).map((p) => ({ ...p, cargoPlacements: [...p.cargoPlacements] }));
    let success = true;
    for (const placement of source.cargoPlacements) {
      const item = cargoMap.get(placement.cargoId);
      if (!item) { success = false; break; }
      let moved = false;
      for (const target of targets) {
        if (strategy === 'unloading' && stopOf(target, cargoMap) !== (item.unloadPriority ?? 0)) continue;
        const candidate = slotFor(target, item, pallet, container, cargoMap);
        if (!candidate) continue;
        target.cargoPlacements.push(candidate);
        target.cargoWeightKg += item.weightKg;
        moved = true;
        break;
      }
      if (!moved) { success = false; break; }
    }
    if (success) {
      for (let i = 0; i < targets.length; i += 1) pallets[i] = targets[i];
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

function canSupportUpper(lower: PalletLoad, upperWeightKg: number, cargoMap: Map<string, CargoItem>, pallet: PalletSpec) {
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

function hasPalletFootprintSupport(lower: PalletLoad, pallet: PalletSpec) {
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

function columnSupportsNewLoad(loads: PalletLoad[], newLoad: PalletLoad, cargoMap: Map<string, CargoItem>, pallet: PalletSpec) {
  for (let i = 0; i < loads.length; i += 1) {
    const existingAbove = loads.slice(i + 1).reduce((sum, p) => sum + p.totalWeightKg, 0);
    if (!canSupportUpper(loads[i], existingAbove + newLoad.totalWeightKg, cargoMap, pallet)) return false;
  }
  const immediateLower = loads[loads.length - 1];
  return Boolean(immediateLower && hasPalletFootprintSupport(immediateLower, pallet));
}

function moveLoad(load: PalletLoad, x: number, y: number, z: number, level: number, column: number, pallet: PalletSpec) {
  const dx = x - load.x;
  const dy = y - load.y;
  const dz = z - load.z;
  load.x = x; load.y = y; load.z = z; load.stackLevel = level; load.stackColumn = column;
  load.cargoPlacements = load.cargoPlacements.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz }));
  load.centerOfGravity = palletCog(load, pallet);
}

function arrangePalletStacks(pallets: PalletLoad[], positions: Array<{ x: number; y: number }>, container: ContainerSpec, pallet: PalletSpec, cargoMap: Map<string, CargoItem>, strategy: Strategy) {
  pallets.sort((a, b) => (strategy === 'unloading' ? stopOf(b, cargoMap) - stopOf(a, cargoMap) : 0) || b.totalWeightKg - a.totalWeightKg);
  const columns: Array<{ positionIndex: number; loads: PalletLoad[]; totalWeightKg: number }> = [];
  const unplaced: PalletLoad[] = [];
  const maxLevels = Math.max(1, Math.floor(pallet.maxStackLevels || 1));
  for (const load of pallets) {
    let best: { column: number; level: number; z: number; score: number } | null = null;
    for (let c = 0; c < columns.length; c += 1) {
      const column = columns[c];
      if (column.loads.length >= maxLevels) continue;
      const lower = column.loads[column.loads.length - 1];
      if (strategy === 'unloading' && stopOf(lower, cargoMap) !== stopOf(load, cargoMap)) continue;
      const z = palletTop(lower);
      const movedTop = z + (palletTop(load) - load.z);
      if (movedTop > container.height + EPS) continue;
      if (!columnSupportsNewLoad(column.loads, load, cargoMap, pallet)) continue;
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

  const packAt = (height: number) => packByBlockSpaceBeamV2({
    length: pallet.length,
    width: pallet.width,
    height,
    maxPayloadKg: pallet.maxLoadKg,
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
  const frozen = loadedCounts(input);
  // Homogeneous SKU pallets are already generated as aligned grids by slotFor().
  // The expensive repack is reserved for the mixed-SKU case where tail consolidation
  // and uneven towers are actually possible.
  if (frozen.size <= 1) return { pallets: input, removed: 0 };
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
    while (left > 0) {
      let target = pallets.find((load) => {
        // Fill compatible residual space before paying for another pallet base.
        // Unloading keeps each pallet within one stop so it can be removed intact.
        if (strategy === 'unloading' && stopOf(load, cargoMap) !== (item.unloadPriority ?? 0)) return false;
        if (!slotFor(load, item, pallet, container, cargoMap)) return false;
        return totalPalletizedWeight + item.weightKg <= container.maxPayloadKg + EPS;
      });
      if (!target) {
        const empty = makeLoad();
        const candidate = slotFor(empty, item, pallet, container, cargoMap);
        if (!candidate) break;
        if (totalPalletizedWeight + pallet.tareWeightKg + packagingReserveWeight + item.weightKg > container.maxPayloadKg + EPS) break;
        pallets.push(empty);
        totalPalletizedWeight += pallet.tareWeightKg + packagingReserveWeight;
        target = empty;
      }
      const placement = slotFor(target, item, pallet, container, cargoMap);
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
        const candidate = slotFor(pallets[index], item, pallet, container, cargoMap);
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
  return { pallets: dense.pallets, remaining, consolidated: consolidated + dense.removed, cargoMap };
}

export function packOnPallets(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec = defaultPalletSpec, strategy: Strategy = 'capacity'): PalletPackingResult {
  const { pallets, remaining, consolidated, cargoMap } = buildInitialPallets(cargo, pallet, container, strategy);
  const positions = palletPositions(container, pallet);
  const unplaced = arrangePalletStacks(pallets, positions, container, pallet, cargoMap, strategy);
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
          : '사용 가능한 파렛트 공간에서 지지·적층단·누적 상부하중·포장 여유를 만족하는 추가 위치 없음';
      return { cargoId, quantity, reason };
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
