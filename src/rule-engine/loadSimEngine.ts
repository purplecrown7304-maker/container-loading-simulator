import { containerInputError, preflightCargoInput } from '../engine/inputPreflight';
import type { CargoItem, ContainerSpec, LoadingResult, Placement, ValidationIssue } from '../engine/types';
import { pack, validate, canPlace, type Config as LoadSimConfig, type Violation } from '../load-sim';
import { bPlacementToLoadSim, containerToLoadSimSpace, expandCargoToLoadSim, loadSimValidationType, packResultToLoadingResult, validationToFindings } from './loadSimAdapter';
import { existingPlacementIntegrityIssues } from './placementIntegrity';

export type LoadSimRunOptions = { config?: Partial<LoadSimConfig>; iterations?: number; seed?: number; centerCargo?: boolean; maxAttemptsPerItem?: number };

function inputIssues(container: ContainerSpec, cargo: CargoItem[]): ValidationIssue[] {
  const invalidContainer = containerInputError(container);
  return [
    ...(invalidContainer ? [{ type: 'INVALID_CARGO' as const, message: invalidContainer, placementIndexes: [] }] : []),
    ...preflightCargoInput(cargo).rejected.map(row => ({ type: 'INVALID_CARGO' as const, message: `${row.cargoId}: ${row.reason}`, placementIndexes: [] })),
  ];
}

function issueViolation(issue: ValidationIssue, placements: Placement[]): Violation {
  return { code: `INPUT_${issue.type}`, severity: 'error', message: issue.message, itemIds: issue.placementIndexes.map(i => placements[i]?.cargoId).filter(Boolean) };
}

function convertPlacements(cargo: CargoItem[], placements: Placement[]) {
  const byCargo = new Map(cargo.map(item => [item.id, item]));
  const occurrence = new Map<string, number>();
  const indexes = new Map<string, number>();
  const converted = placements.flatMap((p, placementIndex) => {
    const item = byCargo.get(p.cargoId);
    if (!item) return [];
    const index = (occurrence.get(p.cargoId) ?? 0) + 1;
    occurrence.set(p.cargoId, index);
    const id = `${p.cargoId}#${String(index).padStart(6, '0')}`;
    indexes.set(id, placementIndex);
    return [bPlacementToLoadSim(p, item, id)];
  });
  return { converted, indexes };
}

export function loadContainerWithLoadSim(container: ContainerSpec, cargo: CargoItem[], options: LoadSimRunOptions = {}): LoadingResult {
  const preflight = preflightCargoInput(cargo);
  const invalidContainer = containerInputError(container);
  if (invalidContainer) return {
    placements: [], remaining: [...preflight.rejected, ...preflight.cargo.map(item => ({ cargoId: item.id, quantity: item.quantity, reason: invalidContainer }))],
    loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: inputIssues(container, cargo), operationalFindings: [], autoCorrections: [], ruleEngine: 'load-sim',
  };
  const { items, context } = expandCargoToLoadSim(preflight.cargo);
  const packed = pack(items, containerToLoadSimSpace(container), {
    config: options.config, iterations: options.iterations, seed: options.seed,
    centerCargo: options.centerCargo, maxAttemptsPerItem: options.maxAttemptsPerItem,
  });
  const result = packResultToLoadingResult(packed, context);
  const checked = validateExistingWithLoadSim(container, preflight.cargo, result.placements, options.config);
  result.validationIssues = checked.validationIssues;
  result.operationalFindings = checked.operationalFindings;
  const cargoById = new Map(preflight.cargo.map(row => [row.id, row]));
  result.remaining = result.remaining.map(row => {
    const item = cargoById.get(row.cargoId);
    return item && result.loadedWeightKg + item.weightKg > container.maxPayloadKg + 1e-6
      ? { ...row, reason: '[PAYLOAD_LIMIT] 컨테이너 최대 적재 중량에 도달했습니다.' } : row;
  });
  if (preflight.rejected.length) result.remaining = [...preflight.rejected, ...result.remaining];
  return result;
}

/** Full public validator includes source identity and actual footprint checks, not just A geometry. */
export function validatePlacementsWithLoadSim(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], config?: Partial<LoadSimConfig>) {
  return validateExistingWithLoadSim(container, cargo, placements, config).validation;
}

export function canPlaceWithLoadSim(container: ContainerSpec, cargo: CargoItem[], existing: Placement[], candidate: Placement, config?: Partial<LoadSimConfig>): Violation[] {
  const all = [...existing, candidate];
  const rows = preflightCargoInput(cargo).cargo;
  const integrity = [...inputIssues(container, cargo), ...existingPlacementIntegrityIssues(rows, all)];
  if (integrity.length) return integrity.map(issue => issueViolation(issue, all));
  const { converted } = convertPlacements(rows, all);
  return [
    ...canPlace(converted.slice(0, -1), converted[converted.length - 1], containerToLoadSimSpace(container), config),
  ];
}

export function validateExistingWithLoadSim(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], config?: Partial<LoadSimConfig>) {
  const rows = preflightCargoInput(cargo).cargo;
  const integrity = [...inputIssues(container, cargo), ...existingPlacementIntegrityIssues(rows, placements)];
  const { converted, indexes } = convertPlacements(rows, integrity.length ? [] : placements);
  // Never feed NaN/invalid source geometry to A's numerical calculations.
  const safeContainer = containerInputError(container) ? { length: 1, width: 1, height: 1, maxPayloadKg: 1 } : container;
  const result = validate(converted, containerToLoadSimSpace(safeContainer), config);
  const boundaryIssues = integrity;
  const violations = [...result.violations, ...boundaryIssues.map(issue => issueViolation(issue, placements))];
  const validation = { ...result, violations, ok: !violations.some(v => v.severity === 'error') };
  return {
    validation,
    validationIssues: [
      ...boundaryIssues,
      ...result.violations.filter(v => v.severity === 'error').map(v => ({ type: loadSimValidationType(v.code), message: `[${v.code}] ${v.message}`,
        placementIndexes: [...new Set(v.itemIds.flatMap(id => indexes.has(id) ? [indexes.get(id)!] : []))] })),
    ],
    operationalFindings: [
      ...validationToFindings(result, indexes),
      ...boundaryIssues.map(issue => ({ code: `INPUT_${issue.type}`, severity: 'error' as const, message: issue.message, placementIndexes: issue.placementIndexes })),
    ],
  };
}
