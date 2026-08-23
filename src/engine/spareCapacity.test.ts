import { describe, expect, it } from 'vitest';
import { estimateAdditionalCargo, recommendSpareCapacity } from './spareCapacity';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [
  { id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5, weightKg: 10, quantity: 1, maxStackLayers: 2, maxTopLoadKg: 100 },
  { id: 'B', name: 'B', length: 1, width: 1, height: 1, weightKg: 100, quantity: 1, maxStackLayers: 1 },
];

function emptyResult(): LoadingResult {
  return { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
}

describe('spare capacity recommendations', () => {
  it('estimates extra quantity using actual placement rules', () => {
    const rec = estimateAdditionalCargo(container, cargo, emptyResult(), cargo[0], 100);
    expect(rec.additionalQuantity).toBe(16);
    expect(rec.additionalWeightKg).toBe(160);
    expect(rec.zones.length).toBeGreaterThan(0);
  });

  it('respects payload limit', () => {
    const limited = { ...container, maxPayloadKg: 25 };
    const rec = estimateAdditionalCargo(limited, cargo, emptyResult(), cargo[0], 100);
    expect(rec.additionalQuantity).toBe(2);
    expect(rec.stopReason).toContain('최대 적재중량');
  });

  it('returns only candidates that can actually fit', () => {
    const occupied: LoadingResult = {
      placements: [{ cargoId: 'B', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 100 }],
      remaining: [], loadedWeightKg: 100, usedVolumeM3: 1, validationIssues: [],
    };
    const recs = recommendSpareCapacity(container, cargo, occupied);
    expect(recs.some(item => item.cargoId === 'A')).toBe(true);
    expect(recs.some(item => item.cargoId === 'B')).toBe(true);
  });
});
