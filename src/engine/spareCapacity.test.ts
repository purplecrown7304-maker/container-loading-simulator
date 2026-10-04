import { describe, expect, it } from 'vitest';
import { estimateAdditionalCargo, recommendSpareCapacity } from './spareCapacity';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 2, width: 1, height: 1.6, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [
  { id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5, weightKg: 10, quantity: 1, maxStackLayers: 3, maxTopLoadKg: 100, allowRotation: false },
  { id: 'B', name: 'B', length: 1, width: 1, height: 1, weightKg: 100, quantity: 1, maxStackLayers: 1, allowRotation: false },
];
function centeredResult(): LoadingResult {
  return { placements: [{ cargoId: 'A', x: 0.75, y: 0.25, z: 0, length: 0.5, width: 0.5, height: 0.5, weightKg: 10 }],
    remaining: [], loadedWeightKg: 10, usedVolumeM3: 0.125, validationIssues: [], ruleEngine: 'load-sim' };
}

describe('spare capacity recommendations with A rules', () => {
  it('estimates extra quantity with the actual A support, tier, margin and CG rules', () => {
    const source = centeredResult();
    expect(validateExistingWithLoadSim(container, cargo, source.placements).validation.ok).toBe(true);
    const rec = estimateAdditionalCargo(container, cargo, source, cargo[0], 100);
    expect(rec.additionalQuantity).toBe(2);
    expect(rec.additionalWeightKg).toBe(20);
    expect(rec.zones).toEqual(['중앙']);
    expect(rec.firstPlacement).toMatchObject({ x: 0.75, y: 0.25, z: 0.5 });
    const expandedCargo = cargo.map(item => item.id === 'A' ? { ...item, quantity: 3 } : item);
    const placements = [...source.placements];
    for (let z = 0.5; z <= 1; z += 0.5) {
      const candidate = { ...source.placements[0], z };
      expect(canPlaceWithLoadSim(container, expandedCargo, placements, candidate)).toEqual([]);
      placements.push(candidate);
      expect(validateExistingWithLoadSim(container, expandedCargo, placements).validation.ok).toBe(true);
    }
  });
  it('respects payload limit while keeping the additional candidate A-valid', () => {
    const limited = { ...container, maxPayloadKg: 25 };
    const source = centeredResult();
    const rec = estimateAdditionalCargo(limited, cargo, source, cargo[0], 100);
    expect(rec.additionalQuantity).toBe(1);
    expect(rec.stopReason).toContain('최대 적재중량');
    const expandedCargo = cargo.map(item => item.id === 'A' ? { ...item, quantity: 2 } : item);
    expect(canPlaceWithLoadSim(limited, expandedCargo, source.placements, rec.firstPlacement!)).toEqual([]);
    expect(validateExistingWithLoadSim(limited, expandedCargo, [...source.placements, rec.firstPlacement!]).validation.ok).toBe(true);
  });
  it('returns only candidates that satisfy A, including its width margin', () => {
    const recs = recommendSpareCapacity(container, cargo, centeredResult());
    expect(recs.some(item => item.cargoId === 'A')).toBe(true);
    expect(recs.some(item => item.cargoId === 'B')).toBe(false);
  });
  it('does not claim boundary-first empty-space candidates that fail A center-of-gravity validation', () => {
    const empty: LoadingResult = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
    expect(estimateAdditionalCargo(container, cargo, empty, cargo[0], 100).additionalQuantity).toBe(0);
  });
});
