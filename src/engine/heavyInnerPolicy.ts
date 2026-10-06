import { isARules } from './loadingRuleset';
import type { CargoItem, ContainerSpec, OperationalRuleFinding, Placement } from './types';
import type { StrictWallStrategy } from './strictWallPacker';

const EPS = 1e-8;

/** Owner's direct-box work rule. Rigid pallet / MIXED search and A remain independent. */
export function usesHeavyInnerLoading(container: ContainerSpec, cargo: CargoItem[]) {
  return !isARules(container) && cargo.every(item => item.unitKind !== 'pallet' && item.sourcePalletIndex == null);
}

export function heavyInnerStrictUnloading(container: ContainerSpec, strategy: StrictWallStrategy) {
  return container.unloadingPolicy === 'strict'
    || (container.unloadingPolicy !== 'soft' && strategy === 'unloading');
}

/** Individual gross package weight, never SKU totals, density, CBM or product EA. */
export function heavyInnerCargoOrder(container: ContainerSpec, cargo: CargoItem[], strategy: StrictWallStrategy) {
  const strict = heavyInnerStrictUnloading(container, strategy);
  return [...cargo].sort((a, b) =>
    (strict ? (b.unloadPriority ?? 1) - (a.unloadPriority ?? 1) : 0)
    || b.weightKg - a.weightKg
    || b.quantity - a.quantity
    || b.length * b.width - a.length * a.width
    || a.id.localeCompare(b.id));
}

/** Only a rigid lateral shift is permitted. The first working front stays at X=0. */
export function centerHeavyInnerLaterally(container: ContainerSpec, placements: Placement[]): Placement[] {
  if (!placements.length) return placements;
  const weight = placements.reduce((s, p) => s + p.weightKg, 0);
  if (weight <= EPS) return placements;
  const y = placements.reduce((s, p) => s + (p.y + p.width / 2) * p.weightKg, 0) / weight;
  const minY = Math.min(...placements.map(p => p.y));
  const maxY = Math.max(...placements.map(p => p.y + p.width));
  const dy = Math.min(container.width - maxY, Math.max(-minY, container.width / 2 - y));
  if (Math.abs(dy) <= EPS) return placements;
  return placements.map(p => ({ ...p, y: p.y + dy }));
}

/** Count prohibited backtracking between distinct working fronts (equal X is one row). */
export function heavyInnerOrderViolations(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], strategy: StrictWallStrategy) {
  const byId = new Map(cargo.map(item => [item.id, item]));
  const strict = heavyInnerStrictUnloading(container, strategy);
  let violations = 0;
  for (let i = 0; i < placements.length; i++) for (let j = i + 1; j < placements.length; j++) {
    let a = placements[i], b = placements[j];
    if (a.x > b.x) [a, b] = [b, a];
    if (Math.abs(a.x - b.x) <= EPS) continue;
    const firstStop = byId.get(a.cargoId)?.unloadPriority ?? 1;
    const laterStop = byId.get(b.cargoId)?.unloadPriority ?? 1;
    if (strict && firstStop !== laterStop) {
      if (firstStop < laterStop) violations++;
    } else if (a.weightKg < b.weightKg - EPS) violations++;
  }
  return violations;
}

export function heavyInnerConflictFindings(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], strategy: StrictWallStrategy): OperationalRuleFinding[] {
  if (!usesHeavyInnerLoading(container, cargo) || !heavyInnerStrictUnloading(container, strategy)) return [];
  const loaded = new Set(placements.map(p => p.cargoId));
  const active = cargo.filter(item => loaded.has(item.id));
  const conflict = active.some(a => active.some(b => (a.unloadPriority ?? 1) > (b.unloadPriority ?? 1) && a.weightKg < b.weightKg - EPS));
  return conflict ? [{
    code: 'HEAVY_INNER_UNLOAD_CONFLICT', severity: 'warning', placementIndexes: [],
    message: '명시된 하역 순서가 중량순 적재와 충돌하여 하역 경로를 우선했습니다. 각 하역 구역 안에서는 박스 1개 총중량이 무거운 순서로 안쪽부터 연속 적재했습니다.',
  }] : [];
}
