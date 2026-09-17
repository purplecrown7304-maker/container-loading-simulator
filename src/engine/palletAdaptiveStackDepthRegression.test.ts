import { describe, expect, it } from 'vitest';
import { buildPalletAdaptiveCandidates, type PalletSnapshot } from './palletAdaptiveSearch';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import type { PhysicsTarget } from '../physicsTarget';

const container: ContainerSpec = {
  length: 1,
  width: 1,
  height: 2.4,
  maxPayloadKg: 5000,
};

const cargo: CargoItem = {
  id: 'ADAPT-4',
  name: 'ADAPT-4',
  length: 0.6,
  width: 0.4,
  height: 0.4,
  weightKg: 10,
  quantity: 8,
  maxStackLayers: 1,
  maxTopLoadKg: 1000,
  allowRotation: true,
};

const spec = {
  ...defaultPalletSpec,
  length: 1,
  width: 1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
  maxStackLevels: 4,
  maxSupportedTopWeightKg: 1000,
  useCornerGuards: false,
  useWrapping: false,
};

describe('pallet adaptive configured stack depth regression', () => {
  it('preserves loaded cargo while respecting configured stack depth and support safety', () => {
    const result = packOnPallets(container, [cargo], spec);
    const loadingResult: LoadingResult = {
      placements: result.placements,
      remaining: result.remaining,
      loadedWeightKg: result.totalPalletizedWeightKg,
      usedVolumeM3: result.placements.reduce((sum, item) => sum + item.length * item.width * item.height, 0),
      validationIssues: [],
    };
    const current: PhysicsTarget = {
      mode: 'pallets',
      container,
      cargo: [cargo],
      result: loadingResult,
    };
    const snapshot: PalletSnapshot = { spec, result };

    const candidates = buildPalletAdaptiveCandidates(current, snapshot);
    const currentCounts = new Map<string, number>();
    result.placements.forEach((item) => currentCounts.set(item.cargoId, (currentCounts.get(item.cargoId) ?? 0) + 1));

    expect(result.maxUsedStackLevel).toBe(1);
    expect(result.placements.length + result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(cargo.quantity);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.spec.maxStackLevels).toBeGreaterThanOrEqual(1);
      expect(candidate.spec.maxStackLevels).toBeLessThanOrEqual(spec.maxStackLevels);
      const candidateCounts = new Map<string, number>();
      candidate.result.placements.forEach((item) => candidateCounts.set(item.cargoId, (candidateCounts.get(item.cargoId) ?? 0) + 1));
      expect(candidateCounts).toEqual(currentCounts);
    }
  }, 10000);
});
