import { containerInputError, preflightCargoInput } from '../engine/inputPreflight';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from '../engine/types';
import { pack, validate, canPlace, type Config as LoadSimConfig, type Violation } from '../load-sim';
import { bPlacementToLoadSim, containerToLoadSimSpace, expandCargoToLoadSim, packResultToLoadingResult } from './loadSimAdapter';

export type LoadSimRunOptions = { config?: Partial<LoadSimConfig>; iterations?: number; seed?: number; centerCargo?: boolean; maxAttemptsPerItem?: number };

export function loadContainerWithLoadSim(container: ContainerSpec, cargo: CargoItem[], options: LoadSimRunOptions = {}): LoadingResult {
  const preflight = preflightCargoInput(cargo);
  const invalidContainer = containerInputError(container);
  if (invalidContainer) {
    return {
      placements: [],
      remaining: [
        ...preflight.rejected,
        ...preflight.cargo.map(item => ({ cargoId: item.id, quantity: item.quantity, reason: invalidContainer })),
      ],
      loadedWeightKg: 0,
      usedVolumeM3: 0,
      validationIssues: [],
      operationalFindings: [],
      autoCorrections: [],
      ruleEngine: 'load-sim',
    };
  }
  const { items, context } = expandCargoToLoadSim(preflight.cargo);
  const packed = pack(items, containerToLoadSimSpace(container), {
    config: options.config,
    iterations: options.iterations,
    seed: options.seed,
    centerCargo: options.centerCargo,
    maxAttemptsPerItem: options.maxAttemptsPerItem,
  });
  const result = packResultToLoadingResult(packed, context);
  if (preflight.rejected.length) result.remaining = [...preflight.rejected, ...result.remaining];
  return result;
}

export function validatePlacementsWithLoadSim(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
  config?: Partial<LoadSimConfig>,
) {
  const byCargo = new Map(cargo.map(item => [item.id, item]));
  const occurrence = new Map<string, number>();
  const converted = placements.flatMap(p => {
    const item = byCargo.get(p.cargoId);
    if (!item) return [];
    const index = (occurrence.get(p.cargoId) ?? 0) + 1;
    occurrence.set(p.cargoId, index);
    return [bPlacementToLoadSim(p, item, `${p.cargoId}#${String(index).padStart(6, '0')}`)];
  });
  return validate(converted, containerToLoadSimSpace(container), config);
}

export function canPlaceWithLoadSim(
  container: ContainerSpec,
  cargo: CargoItem[],
  existing: Placement[],
  candidate: Placement,
  config?: Partial<LoadSimConfig>,
): Violation[] {
  const byCargo = new Map(cargo.map(item => [item.id, item]));
  const occurrence = new Map<string, number>();
  const convert = (p: Placement) => {
    const item = byCargo.get(p.cargoId);
    if (!item) return null;
    const index = (occurrence.get(p.cargoId) ?? 0) + 1;
    occurrence.set(p.cargoId, index);
    return bPlacementToLoadSim(p, item, `${p.cargoId}#${String(index).padStart(6, '0')}`);
  };
  const convertedExisting = existing.flatMap(p => {
    const v = convert(p);
    return v ? [v] : [];
  });
  const convertedCandidate = convert(candidate);
  if (!convertedCandidate) return [{ code: 'UNKNOWN_CARGO', severity: 'error', itemIds: [candidate.cargoId], message: `${candidate.cargoId}: 품목 정보를 찾을 수 없음` }];
  return canPlace(convertedExisting, convertedCandidate, containerToLoadSimSpace(container), config);
}
