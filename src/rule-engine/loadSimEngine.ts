import { containerInputError, preflightCargoInput } from '../engine/inputPreflight';
import type { CargoItem, ContainerSpec, LoadingResult, Placement, ValidationIssue } from '../engine/types';
import { allowedOrientations, orientedSize, pack, validate, canPlace, type Config as LoadSimConfig, type Violation } from '../load-sim';
import { bPlacementToLoadSim, containerToLoadSimSpace, expandCargoToLoadSim, loadSimValidationType, packResultToLoadingResult, validationToFindings } from './loadSimAdapter';

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


function existingPlacementIntegrityIssues(cargo: CargoItem[], placements: Placement[]): ValidationIssue[] {
  const byCargo = new Map(cargo.map(item => [item.id, item]));
  const counts = new Map<string, number>();
  const issues: ValidationIssue[] = [];
  placements.forEach((placement, index) => {
    const item = byCargo.get(placement.cargoId);
    counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1);
    if (!item) {
      issues.push({ type: 'INVALID_CARGO', message: `${placement.cargoId}: 등록된 품목 정보가 없습니다.`, placementIndexes: [index] });
      return;
    }
    if (Math.abs(placement.weightKg - item.weightKg) > 1e-6) {
      issues.push({ type: 'INVALID_CARGO', message: `${placement.cargoId}: 배치 중량이 등록 중량과 다릅니다.`, placementIndexes: [index] });
    }
    const dims = { l: item.length * 1000, w: item.width * 1000, h: item.height * 1000 };
    const matched = allowedOrientations(bPlacementToLoadSim(placement, item).item).some(orientation => {
      const size = orientedSize(dims, orientation);
      return Math.abs(size.x - placement.length * 1000) <= 0.5
        && Math.abs(size.y - placement.width * 1000) <= 0.5
        && Math.abs(size.z - placement.height * 1000) <= 0.5;
    });
    if (!matched) {
      issues.push({ type: 'INVALID_CARGO', message: `${placement.cargoId}: 배치 치수/방향이 등록 규격과 일치하지 않습니다.`, placementIndexes: [index] });
    }
  });
  for (const [cargoId, count] of counts) {
    const item = byCargo.get(cargoId);
    if (item && count > item.quantity) {
      issues.push({
        type: 'QUANTITY',
        message: `${cargoId}: 등록 수량 ${item.quantity}EA를 초과해 ${count}EA가 배치되었습니다.`,
        placementIndexes: placements.flatMap((placement, index) => placement.cargoId === cargoId ? [index] : []),
      });
    }
  }
  return issues;
}

export function validateExistingWithLoadSim(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
  config?: Partial<LoadSimConfig>,
) {
  const result = validatePlacementsWithLoadSim(container, cargo, placements, config);
  const byCargo = new Map(cargo.map(item => [item.id, item]));
  const occurrence = new Map<string, number>();
  const indexByExpandedId = new Map<string, number>();
  placements.forEach((placement, index) => {
    if (!byCargo.has(placement.cargoId)) return;
    const count = (occurrence.get(placement.cargoId) ?? 0) + 1;
    occurrence.set(placement.cargoId, count);
    indexByExpandedId.set(`${placement.cargoId}#${String(count).padStart(6, '0')}`, index);
  });
  const errors = result.violations.filter(v => v.severity === 'error');
  const integrityIssues = existingPlacementIntegrityIssues(cargo, placements);
  return {
    validation: result,
    validationIssues: [
      ...integrityIssues,
      ...errors.map(v => ({
        type: loadSimValidationType(v.code),
        message: `[${v.code}] ${v.message}`,
        placementIndexes: [...new Set(v.itemIds.flatMap(id => {
          const index = indexByExpandedId.get(id);
          return index == null ? [] : [index];
        }))],
      })),
    ],
    operationalFindings: validationToFindings(result, indexByExpandedId),
  };
}
