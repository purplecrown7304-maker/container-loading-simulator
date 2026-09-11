import { centerPalletCargo } from './palletCentering';
import { packOnPallets, type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';
import { analyzeCargoForAuto, readUserLoadingStrategy, type ConcreteLoadingStrategy } from './loadingStrategy';

const EPS = 1e-9;

type Column = {
  id: number;
  loads: PalletLoad[];
  x: number;
  y: number;
  weightKg: number;
  averageUnloadPriority: number;
  dominantCargoId: string;
};

type Slot = { x: number; y: number; centerDistance: number };

function dominantCargoId(loads: PalletLoad[]) {
  const counts = new Map<string, number>();
  for (const load of loads) for (const item of load.cargoPlacements) counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

function averageUnloadPriority(loads: PalletLoad[], cargoById: Map<string, CargoItem>) {
  let weighted = 0;
  let count = 0;
  for (const load of loads) {
    for (const item of load.cargoPlacements) {
      const priority = cargoById.get(item.cargoId)?.unloadPriority;
      if (!Number.isFinite(priority)) continue;
      weighted += priority as number;
      count += 1;
    }
  }
  return count ? weighted / count : 0;
}

function columns(result: OptimizedPalletPackingResult, cargo: CargoItem[]) {
  const cargoById = new Map(cargo.map(item => [item.id, item]));
  const grouped = new Map<number, PalletLoad[]>();
  for (const load of result.pallets) {
    const list = grouped.get(load.stackColumn) ?? [];
    list.push(load);
    grouped.set(load.stackColumn, list);
  }
  return [...grouped.entries()].map(([id, loads]) => {
    const floor = loads.find(item => item.stackLevel === 1) ?? loads[0];
    return {
      id,
      loads: [...loads].sort((a, b) => a.stackLevel - b.stackLevel),
      x: floor.x,
      y: floor.y,
      weightKg: loads.reduce((sum, item) => sum + item.totalWeightKg, 0),
      averageUnloadPriority: averageUnloadPriority(loads, cargoById),
      dominantCargoId: dominantCargoId(loads),
    } satisfies Column;
  });
}

function moveLoad(load: PalletLoad, x: number, y: number): PalletLoad {
  const dx = x - load.x;
  const dy = y - load.y;
  return {
    ...load,
    x,
    y,
    cargoPlacements: load.cargoPlacements.map(item => ({ ...item, x: item.x + dx, y: item.y + dy })),
    centerOfGravity: { ...load.centerOfGravity, x: load.centerOfGravity.x + dx, y: load.centerOfGravity.y + dy },
  };
}

function recalcLateralImbalance(pallets: PalletLoad[], container: ContainerSpec) {
  let left = 0;
  let right = 0;
  for (const pallet of pallets) {
    const delta = pallet.centerOfGravity.y - container.width / 2;
    if (Math.abs(delta) <= EPS) continue;
    if (delta < 0) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  }
  return Math.abs(left - right);
}

function slotList(cols: Column[], container: ContainerSpec, spec: PalletSpec): Slot[] {
  return cols.map(col => ({
    x: col.x,
    y: col.y,
    centerDistance: Math.hypot(
      col.x + spec.length / 2 - container.length / 2,
      col.y + spec.width / 2 - container.width / 2,
    ),
  }));
}

function selectAutoMode(cargo: CargoItem[]): ConcreteLoadingStrategy {
  const active = cargo.filter(item => item.quantity > 0);
  const { weights } = analyzeCargoForAuto(active);
  const stops = new Set(active.map(item => item.unloadPriority).filter((value): value is number => Number.isFinite(value)));
  if (stops.size >= 2 && weights.operations >= 0.20) return 'unloading';
  if (weights.grouping >= 0.16) return 'grouping';
  if (weights.balance + weights.stability >= 0.43) return 'balance';
  return 'capacity';
}

export function resolvePalletLoadingStrategy(cargo: CargoItem[]): ConcreteLoadingStrategy {
  const requested = readUserLoadingStrategy();
  return requested === 'auto' ? selectAutoMode(cargo) : requested;
}

function orderedColumns(cols: Column[], mode: ConcreteLoadingStrategy) {
  if (mode === 'unloading') {
    // 큰 unloadPriority일수록 마지막 하차이므로 안쪽(x가 작은 슬롯)으로 보낸다.
    return [...cols].sort((a, b) => b.averageUnloadPriority - a.averageUnloadPriority || b.weightKg - a.weightKg || a.id - b.id);
  }
  if (mode === 'grouping') {
    return [...cols].sort((a, b) => a.dominantCargoId.localeCompare(b.dominantCargoId) || b.weightKg - a.weightKg || a.id - b.id);
  }
  if (mode === 'safety' || mode === 'balance') {
    return [...cols].sort((a, b) => b.weightKg - a.weightKg || a.id - b.id);
  }
  return [...cols].sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
}

function orderedSlots(slots: Slot[], mode: ConcreteLoadingStrategy) {
  if (mode === 'unloading') return [...slots].sort((a, b) => a.x - b.x || a.y - b.y);
  if (mode === 'grouping') return [...slots].sort((a, b) => a.x - b.x || a.y - b.y);
  if (mode === 'safety' || mode === 'balance') return [...slots].sort((a, b) => a.centerDistance - b.centerDistance || a.x - b.x || a.y - b.y);
  return [...slots].sort((a, b) => a.x - b.x || a.y - b.y);
}

function reorderColumns(
  input: OptimizedPalletPackingResult,
  container: ContainerSpec,
  cargo: CargoItem[],
  spec: PalletSpec,
  mode: ConcreteLoadingStrategy,
): OptimizedPalletPackingResult {
  const cols = columns(input, cargo);
  if (cols.length < 2 || mode === 'capacity') return input;
  const source = orderedColumns(cols, mode);
  const slots = orderedSlots(slotList(cols, container, spec), mode);
  if (source.length !== slots.length) return input;

  const moved: PalletLoad[] = [];
  source.forEach((column, index) => {
    const slot = slots[index];
    const floor = column.loads.find(item => item.stackLevel === 1) ?? column.loads[0];
    const dx = slot.x - floor.x;
    const dy = slot.y - floor.y;
    for (const load of column.loads) moved.push(moveLoad(load, load.x + dx, load.y + dy));
  });
  moved.sort((a, b) => a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel);
  return {
    ...input,
    pallets: moved,
    placements: moved.flatMap(item => item.cargoPlacements),
    lateralImbalanceKg: recalcLateralImbalance(moved, container),
  };
}

/**
 * 기존 packOnPallets의 중량/충돌/적층 안전 규칙을 먼저 통과한 결과만 사용한다.
 * 이후 동일한 팔레트 슬롯 집합 안에서 '열 전체'를 교환하므로 파렛트 간 충돌과 적층 관계를 새로 만들지 않는다.
 * 마지막에 전체 그룹을 강체 이동해 무게중심을 컨테이너 중앙에 최대한 가깝게 맞춘다.
 */
export function packPalletsForSelectedStrategy(
  container: ContainerSpec,
  cargo: CargoItem[],
  spec: PalletSpec,
): OptimizedPalletPackingResult {
  const active = cargo.filter(item => item.quantity > 0);
  const mode = resolvePalletLoadingStrategy(active);
  const base = packOnPallets(container, active, spec);
  const reordered = reorderColumns(base, container, active, spec, mode);
  return centerPalletCargo(reordered, container);
}
