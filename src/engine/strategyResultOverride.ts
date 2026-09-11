import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import type { LoadingStrategy } from './loadingEngine';

let nextOverride: { signature: string; strategy: LoadingStrategy; result: LoadingResult } | null = null;

function signature(container: ContainerSpec, cargo: CargoItem[]) {
  const cargoKey = [...cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [item.id, item.quantity, item.length, item.width, item.height, item.weightKg, item.maxStackLayers ?? '', item.maxTopLoadKg ?? '', item.allowRotation === false ? 0 : 1, item.unloadPriority ?? ''].join(':'))
    .join('|');
  return [container.length, container.width, container.height, container.maxPayloadKg, cargoKey].join('::');
}

export function setNextStrategyResultOverride(container: ContainerSpec, cargo: CargoItem[], strategy: LoadingStrategy, result: LoadingResult) {
  nextOverride = { signature: signature(container, cargo), strategy, result: { ...result, placements: result.placements.map(item => ({ ...item })), remaining: result.remaining.map(item => ({ ...item })) } };
}

export function consumeNextStrategyResultOverride(container: ContainerSpec, cargo: CargoItem[], strategy: LoadingStrategy) {
  const current = nextOverride;
  nextOverride = null;
  if (!current || current.strategy !== strategy || current.signature !== signature(container, cargo)) return null;
  return { ...current.result, placements: current.result.placements.map(item => ({ ...item })), remaining: current.result.remaining.map(item => ({ ...item })) };
}
