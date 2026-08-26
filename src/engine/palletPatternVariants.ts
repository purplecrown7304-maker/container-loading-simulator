import { hasAdequateSupport } from './support';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './palletOptimization';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-9;

export type PalletPattern = 'block' | 'brick' | 'split' | 'pinwheel';

export const PALLET_PATTERNS: PalletPattern[] = ['block', 'brick', 'split', 'pinwheel'];

export const PALLET_PATTERN_LABEL: Record<PalletPattern, string> = {
  block: '블록 적재',
  brick: '벽돌·교호열 적재',
  split: '스플릿 적재',
  pinwheel: '핀휠 적재',
};

export const PALLET_PATTERN_STATIC_PENALTY: Record<PalletPattern, number> = {
  block: 3,
  brick: 0.8,
  split: 6,
  pinwheel: 0.4,
};

type LocalSlot = {
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
};

function fitCount(available: number, size: number) {
  return size > 0 ? Math.floor((available + EPS) / size) : 0;
}

function orientation(item: CargoItem, rotated: boolean) {
  return rotated
    ? { length: item.width, width: item.length, rotated: true }
    : { length: item.length, width: item.width, rotated: false };
}

function bestBaseRotation(item: CargoItem, pallet: PalletSpec) {
  if (item.allowRotation === false || Math.abs(item.length - item.width) < EPS) return false;
  const normal = fitCount(pallet.length, item.length) * fitCount(pallet.width, item.width);
  const rotated = fitCount(pallet.length, item.width) * fitCount(pallet.width, item.length);
  return rotated > normal;
}

function gridSlots(item: CargoItem, pallet: PalletSpec, rotated: boolean, split: boolean): LocalSlot[] {
  const o = orientation(item, rotated);
  const cols = fitCount(pallet.length, o.length);
  const rows = fitCount(pallet.width, o.width);
  if (cols < 1 || rows < 1) return [];

  const freeX = Math.max(0, pallet.length - cols * o.length);
  const freeY = Math.max(0, pallet.width - rows * o.width);
  const gapX = split && cols > 1 ? freeX / (cols - 1) : 0;
  const gapY = split && rows > 1 ? freeY / (rows - 1) : 0;
  const startX = split && cols > 1 ? 0 : freeX / 2;
  const startY = split && rows > 1 ? 0 : freeY / 2;
  const slots: LocalSlot[] = [];

  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      slots.push({
        x: startX + x * (o.length + gapX),
        y: startY + y * (o.width + gapY),
        length: o.length,
        width: o.width,
        rotated: o.rotated,
      });
    }
  }
  return slots;
}

function pinwheelSlots(item: CargoItem, pallet: PalletSpec): LocalSlot[] {
  if (item.allowRotation === false || Math.abs(item.length - item.width) < EPS) return [];
  const long = Math.max(item.length, item.width);
  const short = Math.min(item.length, item.width);
  const motif = long + short;
  const motifsX = fitCount(pallet.length, motif);
  const motifsY = fitCount(pallet.width, motif);
  if (motifsX < 1 || motifsY < 1) return [];

  const totalX = motifsX * motif;
  const totalY = motifsY * motif;
  const ox = (pallet.length - totalX) / 2;
  const oy = (pallet.width - totalY) / 2;
  const originalLongX = item.length >= item.width;
  const slots: LocalSlot[] = [];

  const longX = (x: number, y: number): LocalSlot => ({
    x, y, length: long, width: short, rotated: !originalLongX,
  });
  const longY = (x: number, y: number): LocalSlot => ({
    x, y, length: short, width: long, rotated: originalLongX,
  });

  for (let mx = 0; mx < motifsX; mx += 1) {
    for (let my = 0; my < motifsY; my += 1) {
      const x = ox + mx * motif;
      const y = oy + my * motif;
      slots.push(
        longX(x, y),
        longY(x + long, y),
        longX(x + short, y + long),
        longY(x, y + short),
      );
    }
  }
  return slots;
}

function layerSlots(pattern: PalletPattern, item: CargoItem, pallet: PalletSpec, layer: number): LocalSlot[] {
  const baseRotated = bestBaseRotation(item, pallet);
  if (pattern === 'pinwheel') {
    const slots = pinwheelSlots(item, pallet);
    return layer % 2 === 0 ? slots : [...slots].reverse();
  }
  if (pattern === 'brick') {
    const rotateLayer = item.allowRotation !== false && Math.abs(item.length - item.width) > EPS
      ? (layer % 2 === 0 ? baseRotated : !baseRotated)
      : baseRotated;
    return gridSlots(item, pallet, rotateLayer, false);
  }
  if (pattern === 'split') {
    const rotateLayer = item.allowRotation !== false && Math.abs(item.length - item.width) > EPS
      ? (layer % 2 === 0 ? baseRotated : !baseRotated)
      : baseRotated;
    return gridSlots(item, pallet, rotateLayer, true);
  }
  return gridSlots(item, pallet, baseRotated, false);
}

function collides(candidate: Placement, placed: Placement[]) {
  return placed.some(item => candidate.x < item.x + item.length - EPS
    && candidate.x + candidate.length > item.x + EPS
    && candidate.y < item.y + item.width - EPS
    && candidate.y + candidate.width > item.y + EPS
    && candidate.z < item.z + item.height - EPS
    && candidate.z + candidate.height > item.z + EPS);
}

function recalcCog(load: PalletLoad, placements: Placement[]) {
  const nonCargoWeight = Math.max(0, load.totalWeightKg - load.cargoWeightKg);
  const parts = [
    ...placements.map(item => ({
      weight: item.weightKg,
      x: item.x + item.length / 2,
      y: item.y + item.width / 2,
      z: item.z + item.height / 2,
    })),
    {
      weight: nonCargoWeight,
      x: load.x + load.length / 2,
      y: load.y + load.width / 2,
      z: load.z + load.height / 2,
    },
  ].filter(part => part.weight > 0);
  const total = parts.reduce((sum, part) => sum + part.weight, 0) || 1;
  return {
    x: parts.reduce((sum, part) => sum + part.x * part.weight, 0) / total,
    y: parts.reduce((sum, part) => sum + part.y * part.weight, 0) / total,
    z: parts.reduce((sum, part) => sum + part.z * part.weight, 0) / total,
  };
}

function repackSingleSkuLoad(
  load: PalletLoad,
  item: CargoItem,
  pallet: PalletSpec,
  container: ContainerSpec,
  pattern: PalletPattern,
): PalletLoad | null {
  const quantity = load.cargoPlacements.length;
  if (!quantity) return load;
  const existingTop = Math.max(...load.cargoPlacements.map(box => box.z + box.height));
  const baseZ = load.z + load.height;
  const maxByExistingHeight = Math.max(1, Math.floor((existingTop - baseZ + EPS) / item.height));
  const maxLayers = Math.max(1, Math.min(item.maxStackLayers ?? Number.POSITIVE_INFINITY, maxByExistingHeight));
  const baseSurface = { x: load.x, y: load.y, z: baseZ, length: pallet.length, width: pallet.width };
  const placed: Placement[] = [];

  for (let layer = 0; layer < maxLayers && placed.length < quantity; layer += 1) {
    const slots = layerSlots(pattern, item, pallet, layer);
    if (!slots.length) return null;
    let placedThisLayer = 0;
    for (const slot of slots) {
      if (placed.length >= quantity) break;
      const candidate: Placement = {
        cargoId: item.id,
        x: load.x + slot.x,
        y: load.y + slot.y,
        z: baseZ + layer * item.height,
        length: slot.length,
        width: slot.width,
        height: item.height,
        weightKg: item.weightKg,
        rotated: slot.rotated,
      };
      if (candidate.x + candidate.length > load.x + pallet.length + EPS
        || candidate.y + candidate.width > load.y + pallet.width + EPS
        || candidate.z + candidate.height > container.height + EPS) continue;
      if (collides(candidate, placed)) continue;
      if (!hasAdequateSupport(candidate, placed, baseSurface)) continue;
      placed.push(candidate);
      placedThisLayer += 1;
    }
    if (placedThisLayer === 0) break;
  }

  if (placed.length !== quantity) return null;
  return {
    ...load,
    cargoPlacements: placed,
    centerOfGravity: recalcCog(load, placed),
  };
}

function lateralImbalance(pallets: PalletLoad[], container: ContainerSpec) {
  let left = 0;
  let right = 0;
  for (const pallet of pallets) {
    if (pallet.centerOfGravity.y < container.width / 2) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  }
  return Math.abs(left - right);
}

export function applyPalletPatternVariant(
  input: OptimizedPalletPackingResult,
  cargo: CargoItem[],
  pallet: PalletSpec,
  container: ContainerSpec,
  pattern: PalletPattern,
): OptimizedPalletPackingResult | null {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  let changed = false;
  const loads: PalletLoad[] = [];

  for (const load of input.pallets) {
    const ids = new Set(load.cargoPlacements.map(item => item.cargoId));
    if (ids.size !== 1) {
      loads.push({ ...load, cargoPlacements: load.cargoPlacements.map(item => ({ ...item })), centerOfGravity: { ...load.centerOfGravity } });
      continue;
    }
    const id = [...ids][0];
    const item = cargoMap.get(id);
    if (!item) return null;
    const repacked = repackSingleSkuLoad(load, item, pallet, container, pattern);
    if (!repacked) return null;
    if (repacked.cargoPlacements.some((placement, index) => {
      const before = load.cargoPlacements[index];
      return !before || Math.abs(before.x - placement.x) > 1e-6 || Math.abs(before.y - placement.y) > 1e-6 || Boolean(before.rotated) !== Boolean(placement.rotated);
    })) changed = true;
    loads.push(repacked);
  }

  if (!changed) return null;
  return {
    ...input,
    pallets: loads,
    placements: loads.flatMap(load => load.cargoPlacements),
    lateralImbalanceKg: lateralImbalance(loads, container),
  };
}
