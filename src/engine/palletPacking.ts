import type { CargoItem, ContainerSpec, Placement } from './types';

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

const EPS = 1e-9;
const FLAT_TOP_TOLERANCE = 0.03;
const cargoVolume = (item: CargoItem) => item.length * item.width * item.height;
const fitCount = (available: number, size: number) => size > 0 ? Math.floor((available + EPS) / size) : 0;

function palletPositions(container: ContainerSpec, pallet: PalletSpec) {
  const positions: Array<{ x: number; y: number }> = [];
  for (let x = 0; x + pallet.length <= container.length + EPS; x += pallet.length) {
    const row: Array<{ x: number; y: number }> = [];
    for (let y = 0; y + pallet.width <= container.width + EPS; y += pallet.width) row.push({ x, y });
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

function slotFor(load: PalletLoad, item: CargoItem, pallet: PalletSpec, container: ContainerSpec): Placement | null {
  if (load.cargoWeightKg + item.weightKg > pallet.maxLoadKg + EPS) return null;
  const reserveHeight = pallet.minimizePackaging ? 0 : (pallet.useCornerGuards ? pallet.cornerGuardExtraHeightM : 0) + (pallet.useWrapping ? pallet.wrappingExtraHeightM : 0);
  const availableHeight = container.height - pallet.height - reserveHeight;
  const maxLayers = Math.max(0, Math.min(item.maxStackLayers ?? Infinity, fitCount(availableHeight, item.height)));
  if (maxLayers < 1) return null;

  const options = orientations(item)
    .map((o) => ({ ...o, colsX: fitCount(pallet.length, o.length), colsY: fitCount(pallet.width, o.width) }))
    .filter((o) => o.colsX > 0 && o.colsY > 0)
    .sort((a, b) => (b.colsX * b.colsY) - (a.colsX * a.colsY) || Number(a.rotated) - Number(b.rotated));

  for (const option of options) {
    for (let layer = 0; layer < maxLayers; layer += 1) {
      for (let row = 0; row < option.colsX; row += 1) {
        for (let col = 0; col < option.colsY; col += 1) {
          const candidate: Placement = {
            cargoId: item.id,
            x: load.x + row * option.length,
            y: load.y + col * option.width,
            z: load.z + pallet.height + layer * item.height,
            length: option.length,
            width: option.width,
            height: item.height,
            weightKg: item.weightKg,
            rotated: option.rotated,
          };
          const collides = load.cargoPlacements.some((p) => candidate.x < p.x + p.length - EPS && candidate.x + candidate.length > p.x + EPS && candidate.y < p.y + p.width - EPS && candidate.y + candidate.width > p.y + EPS && candidate.z < p.z + p.height - EPS && candidate.z + candidate.height > p.z + EPS);
          if (!collides && candidate.z + candidate.height <= container.height + EPS) return candidate;
        }
      }
    }
  }
  return null;
}

function tryConsolidate(pallets: PalletLoad[], cargoMap: Map<string, CargoItem>, pallet: PalletSpec, container: ContainerSpec) {
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
        const candidate = slotFor(target, item, pallet, container);
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
  const requiredPerBox = upperWeightKg / supporters.length;
  return supporters.every((p) => {
    const item = cargoMap.get(p.cargoId);
    return item?.maxTopLoadKg != null && item.maxTopLoadKg + EPS >= requiredPerBox;
  });
}

function columnSupportsNewLoad(loads: PalletLoad[], newLoad: PalletLoad, cargoMap: Map<string, CargoItem>, pallet: PalletSpec) {
  for (let i = 0; i < loads.length; i += 1) {
    const existingAbove = loads.slice(i + 1).reduce((sum, p) => sum + p.totalWeightKg, 0);
    if (!canSupportUpper(loads[i], existingAbove + newLoad.totalWeightKg, cargoMap, pallet)) return false;
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

function arrangePalletStacks(pallets: PalletLoad[], positions: Array<{ x: number; y: number }>, container: ContainerSpec, pallet: PalletSpec, cargoMap: Map<string, CargoItem>) {
  pallets.sort((a, b) => b.totalWeightKg - a.totalWeightKg);
  const columns: Array<{ positionIndex: number; loads: PalletLoad[]; totalWeightKg: number }> = [];
  const maxLevels = Math.max(1, Math.min(3, Math.floor(pallet.maxStackLevels || 1)));
  for (const load of pallets) {
    let best: { column: number; level: number; z: number; score: number } | null = null;
    for (let c = 0; c < columns.length; c += 1) {
      const column = columns[c];
      if (column.loads.length >= maxLevels) continue;
      const lower = column.loads[column.loads.length - 1];
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
    const left = columns.filter((c) => positions[c.positionIndex].y + pallet.width / 2 < container.width / 2).reduce((s, c) => s + c.totalWeightKg, 0);
    const right = columns.reduce((s, c) => s + c.totalWeightKg, 0) - left;
    for (let p = 0; p < positions.length; p += 1) {
      if (used.has(p)) continue;
      const pos = positions[p];
      const goesLeft = pos.y + pallet.width / 2 < container.width / 2;
      const balance = Math.abs((left + (goesLeft ? load.totalWeightKg : 0)) - (right + (!goesLeft ? load.totalWeightKg : 0)));
      const score = pos.x * 100 + balance / Math.max(1, load.totalWeightKg);
      if (score < bestScore) { bestScore = score; bestPosition = p; }
    }
    if (bestPosition < 0) continue;
    const pos = positions[bestPosition];
    moveLoad(load, pos.x, pos.y, 0, 1, columns.length + 1, pallet);
    columns.push({ positionIndex: bestPosition, loads: [load], totalWeightKg: load.totalWeightKg });
  }
  let leftWeight = 0;
  let rightWeight = 0;
  for (const column of columns) {
    const pos = positions[column.positionIndex];
    if (pos.y + pallet.width / 2 < container.width / 2) leftWeight += column.totalWeightKg;
    else rightWeight += column.totalWeightKg;
  }
  pallets.forEach((p, i) => { p.palletIndex = i + 1; p.centerOfGravity = palletCog(p, pallet); });
  return { lateralImbalanceKg: Math.abs(leftWeight - rightWeight), stackedPallets: pallets.filter((p) => p.stackLevel > 1).length, maxUsedStackLevel: pallets.reduce((m, p) => Math.max(m, p.stackLevel), 1) };
}

export function packOnPallets(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec = defaultPalletSpec): PalletPackingResult {
  const queue = [...cargo].filter((item) => item.quantity > 0).sort((a, b) => b.weightKg - a.weightKg || cargoVolume(b) - cargoVolume(a));
  const cargoMap = new Map(queue.map((item) => [item.id, item]));
  const positions = palletPositions(container, pallet);
  const pallets: PalletLoad[] = [];
  const remaining: PalletPackingResult['remaining'] = [];
  let totalCargoWeight = 0;
  for (const item of queue) {
    let left = item.quantity;
    for (let p = 0; p < positions.length && left > 0; p += 1) {
      let load = pallets[p];
      if (!load) {
        const pos = positions[p];
        load = { palletIndex: p + 1, x: pos.x, y: pos.y, z: 0, stackLevel: 1, stackColumn: p + 1, length: pallet.length, width: pallet.width, height: pallet.height, cargoPlacements: [], cargoWeightKg: 0, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: pallet.tareWeightKg, centerOfGravity: { x: pos.x + pallet.length / 2, y: pos.y + pallet.width / 2, z: pallet.height / 2 } };
        pallets[p] = load;
      }
      while (left > 0) {
        const activePallets = pallets.filter(Boolean).length;
        if (totalCargoWeight + item.weightKg + activePallets * pallet.tareWeightKg > container.maxPayloadKg + EPS) break;
        const placement = slotFor(load, item, pallet, container);
        if (!placement) break;
        load.cargoPlacements.push(placement);
        load.cargoWeightKg += item.weightKg;
        load.totalWeightKg = load.cargoWeightKg + pallet.tareWeightKg;
        totalCargoWeight += item.weightKg;
        left -= 1;
      }
    }
    if (left > 0) remaining.push({ cargoId: item.id, quantity: left, reason: '회전을 포함해 팔레트 면적·높이·허용중량 또는 컨테이너 최대중량 조건 때문에 적재하지 못함' });
  }
  const usedPallets = pallets.filter((p) => p && p.cargoPlacements.length > 0);
  const consolidatedPallets = tryConsolidate(usedPallets, cargoMap, pallet, container);
  applyMinimumPackaging(usedPallets, pallet);
  const totalAfterPackaging = usedPallets.reduce((sum, p) => sum + p.totalWeightKg, 0);
  if (totalAfterPackaging > container.maxPayloadKg + EPS) remaining.push({ cargoId: 'PACKAGING', quantity: 1, reason: '선택된 포장재 중량을 포함하면 컨테이너 최대중량을 초과함' });
  const stackMetrics = arrangePalletStacks(usedPallets, positions, container, pallet, cargoMap);
  const placements = usedPallets.flatMap((p) => p.cargoPlacements);
  const loadedCargoWeightKg = usedPallets.reduce((sum, p) => sum + p.cargoWeightKg, 0);
  const totalPackagingWeightKg = usedPallets.reduce((sum, p) => sum + p.packagingWeightKg, 0);
  const fullPackagingPerPallet = (pallet.useCornerGuards ? pallet.cornerGuardWeightKg : 0) + (pallet.useWrapping ? pallet.wrappingWeightKg : 0);
  const avoidedPackagingWeightKg = Math.max(0, usedPallets.length * fullPackagingPerPallet - totalPackagingWeightKg);
  const packagedPalletCount = usedPallets.filter((p) => p.cornerGuardsUsed || p.wrappingUsed).length;
  return { pallets: usedPallets, placements, remaining, palletCount: usedPallets.length, loadedCargoWeightKg, totalPackagingWeightKg, avoidedPackagingWeightKg, packagedPalletCount, totalPalletizedWeightKg: usedPallets.reduce((sum, p) => sum + p.totalWeightKg, 0), consolidatedPallets, ...stackMetrics };
}
