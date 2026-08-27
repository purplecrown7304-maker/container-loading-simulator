import type { CargoItem, ContainerSpec, Placement } from './types';
import { hasAdequateSupport } from './support';

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
  // 최소포장 모드에서도 활성화 가능한 각대/랩핑의 최악 추가 높이를 예약한다.
  // 실제 포장을 덜 쓰면 여유가 남지만, 포장 적용 후 천장을 넘는 적재안은 생성하지 않는다.
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

  for (const option of options) {
    for (let layer = 0; layer < maxLayers; layer += 1) {
      for (let row = 0; row < option.colsX; row += 1) {
        for (let col = 0; col < option.colsY; col += 1) {
          const candidate: Placement = {
            cargoId: item.id,
            x: load.x + option.offsetX + row * option.length,
            y: load.y + option.offsetY + col * option.width,
            z: load.z + pallet.height + layer * item.height,
            length: option.length,
            width: option.width,
            height: item.height,
            weightKg: item.weightKg,
            rotated: option.rotated,
          };
          const collides = load.cargoPlacements.some((p) => candidate.x < p.x + p.length - EPS && candidate.x + candidate.length > p.x + EPS && candidate.y < p.y + p.width - EPS && candidate.y + candidate.width > p.y + EPS && candidate.z < p.z + p.height - EPS && candidate.z + candidate.height > p.z + EPS);
          if (collides || candidate.z + candidate.height > container.height + EPS) continue;
          if (!hasAdequateSupport(candidate, load.cargoPlacements, baseSurface)) continue;
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
    const configuredLimit = item?.maxTopLoadKg;
    return configuredLimit == null || configuredLimit + EPS >= requiredPerBox;
  });
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

function arrangePalletStacks(pallets: PalletLoad[], positions: Array<{ x: number; y: number }>, container: ContainerSpec, pallet: PalletSpec, cargoMap: Map<string, CargoItem>) {
  pallets.sort((a, b) => b.totalWeightKg - a.totalWeightKg);
  const columns: Array<{ positionIndex: number; loads: PalletLoad[]; totalWeightKg: number }> = [];
  const unplaced: PalletLoad[] = [];
  const maxLevels = Math.max(1, Math.floor(pallet.maxStackLevels || 1));
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

function buildInitialPallets(cargo: CargoItem[], pallet: PalletSpec, container: ContainerSpec) {
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
        if (!load.cargoPlacements.length || !load.cargoPlacements.every((placement) => placement.cargoId === item.id)) return false;
        if (!slotFor(load, item, pallet, container)) return false;
        return totalPalletizedWeight + item.weightKg <= container.maxPayloadKg + EPS;
      });
      if (!target) {
        const empty = makeLoad();
        const candidate = slotFor(empty, item, pallet, container);
        if (!candidate) break;
        if (totalPalletizedWeight + pallet.tareWeightKg + packagingReserveWeight + item.weightKg > container.maxPayloadKg + EPS) break;
        pallets.push(empty);
        totalPalletizedWeight += pallet.tareWeightKg + packagingReserveWeight;
        target = empty;
      }
      const placement = slotFor(target, item, pallet, container);
      if (!placement) break;
      target.cargoPlacements.push(placement);
      target.cargoWeightKg += item.weightKg;
      target.totalWeightKg += item.weightKg;
      totalPalletizedWeight += item.weightKg;
      left -= 1;
      remaining.set(item.id, left);
    }
  }

  // 1차 적재에서는 동일 품목을 분리 유지하고, 모든 품목의 순수 적재가 끝난 뒤에만
  // 팔레트 수를 줄일 수 있는 잔여 공간에 한해 혼합 병합한다.
  const consolidated = tryConsolidate(pallets, cargoMap, pallet, container);
  pallets.forEach((load) => centerCargoOnPallet(load, pallet));
  applyMinimumPackaging(pallets, pallet);
  pallets.forEach((load) => { load.centerOfGravity = palletCog(load, pallet); });
  return { pallets, remaining, consolidated, cargoMap };
}

export function packOnPallets(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec = defaultPalletSpec): PalletPackingResult {
  const { pallets, remaining, consolidated, cargoMap } = buildInitialPallets(cargo, pallet, container);
  const positions = palletPositions(container, pallet);
  const unplaced = arrangePalletStacks(pallets, positions, container, pallet, cargoMap);
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
    .map(([cargoId, quantity]) => ({ cargoId, quantity, reason: '팔레트 적재공간·중량·적층 제약으로 미적재' }));
  const left = placedPallets.filter((p) => p.centerOfGravity.y < container.width / 2).reduce((sum, p) => sum + p.totalWeightKg, 0);
  const right = placedPallets.reduce((sum, p) => sum + p.totalWeightKg, 0) - left;

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
