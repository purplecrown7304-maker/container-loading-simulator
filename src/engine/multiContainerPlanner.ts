import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

export type PlannedContainer = {
  index: number;
  result: LoadingResult;
  requestedCount: number;
  loadedCount: number;
  remainingCount: number;
  fillRatePct: number;
  weightRatePct: number;
};

export type MultiContainerPlan = {
  containers: PlannedContainer[];
  totalRequested: number;
  totalLoaded: number;
  totalRemaining: number;
  complete: boolean;
  stoppedReason?: string;
};

function positiveCargo(cargo: CargoItem[]) {
  return cargo.filter(item => item.quantity > 0);
}

export function planMultipleContainers(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy = 'capacity',
  maxContainers = 20,
): MultiContainerPlan {
  const totalRequested = cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const cargoById = new Map(cargo.map(item => [item.id, item]));
  let pending = positiveCargo(cargo.map(item => ({ ...item })));
  const containers: PlannedContainer[] = [];
  let stoppedReason: string | undefined;

  for (let index = 1; index <= Math.max(1, maxContainers) && pending.length > 0; index += 1) {
    const requestedCount = pending.reduce((sum, item) => sum + item.quantity, 0);
    const result = loadContainer(container, pending, { strategy, publish: false });
    const loadedCount = result.placements.length;
    const remainingCount = result.remaining.reduce((sum, item) => sum + item.quantity, 0);
    const totalVolume = Math.max(container.length * container.width * container.height, 1e-9);
    const fillRatePct = Math.max(0, Math.min(100, result.usedVolumeM3 / totalVolume * 100));
    const weightRatePct = container.maxPayloadKg > 0 ? Math.max(0, Math.min(100, result.loadedWeightKg / container.maxPayloadKg * 100)) : 0;

    containers.push({ index, result, requestedCount, loadedCount, remainingCount, fillRatePct, weightRatePct });

    if (remainingCount === 0) {
      pending = [];
      break;
    }
    if (loadedCount === 0) {
      stoppedReason = '남은 화물 중 현재 컨테이너 규격과 제약조건으로 1개도 적재할 수 없는 품목이 있습니다.';
      break;
    }

    pending = result.remaining.map(rem => {
      const source = cargoById.get(rem.cargoId);
      return source ? { ...source, quantity: rem.quantity } : null;
    }).filter((item): item is CargoItem => Boolean(item));
  }

  const totalLoaded = containers.reduce((sum, item) => sum + item.loadedCount, 0);
  const totalRemaining = Math.max(0, totalRequested - totalLoaded);
  if (pending.length > 0 && !stoppedReason && containers.length >= maxContainers) {
    stoppedReason = `최대 ${maxContainers}대 계산 제한에 도달했습니다.`;
  }

  return {
    containers,
    totalRequested,
    totalLoaded,
    totalRemaining,
    complete: totalRemaining === 0,
    stoppedReason,
  };
}
