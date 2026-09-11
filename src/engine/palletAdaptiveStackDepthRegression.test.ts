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
  it('does not invent a four-level pallet stack when the lower pallet footprint lacks enough support', () => {
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

    expect(result.maxUsedStackLevel).toBe(1);
    expect(result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBeGreaterThan(0);
    // Adaptive search may expose a 4-level configuration knob, but it must never preserve
    // cargo by manufacturing an unsupported four-pallet tower.
    for (const candidate of candidates.filter(item => item.spec.maxStackLevels === 4)) {
      expect(candidate.result.maxUsedStackLevel).toBeLessThan(4);
    }
  }, 10000);
});
