import { describe, expect, it } from 'vitest';
import { analyzeCargoForAuto, DEFAULT_AUTO_WEIGHTS } from './loadingStrategy';
import { validateFinalLoadingCandidate } from './loadingSafetyGate';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 12000 };

function sumWeights(weights: Record<string, number>) {
  return Object.values(weights).reduce((sum, value) => sum + value, 0);
}

describe('adaptive loading strategy', () => {
  it('normalizes auto weights and increases grouping for a dominant SKU', () => {
    const cargo: CargoItem[] = [
      { id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 80 },
      { id: 'B', name: 'B', length: .5, width: .4, height: .3, weightKg: 10, quantity: 10 },
    ];
    const analyzed = analyzeCargoForAuto(cargo);
    expect(sumWeights(analyzed.weights)).toBeCloseTo(1, 8);
    expect(analyzed.weights.grouping).toBeGreaterThan(DEFAULT_AUTO_WEIGHTS.grouping);
    expect(analyzed.reasons.some(reason => reason.includes('동일 제품'))).toBe(true);
  });

  it('increases balance/stability when unit weights vary widely', () => {
    const cargo: CargoItem[] = [
      { id: 'LIGHT', name: 'light', length: .4, width: .4, height: .3, weightKg: 5, quantity: 10 },
      { id: 'HEAVY', name: 'heavy', length: .6, width: .5, height: .4, weightKg: 700, quantity: 10 },
    ];
    const analyzed = analyzeCargoForAuto(cargo);
    expect(analyzed.weights.balance).toBeGreaterThan(DEFAULT_AUTO_WEIGHTS.balance);
    expect(analyzed.weights.stability).toBeGreaterThan(DEFAULT_AUTO_WEIGHTS.stability);
  });
});

describe('final loading safety gate', () => {
  const cargo: CargoItem[] = [{
    id: 'BOX', name: 'box', length: 1, width: 1, height: .5, weightKg: 100,
    quantity: 2, maxStackLayers: 2, maxTopLoadKg: 150,
  }];

  it('rejects a floating placement even when it is inside the container', () => {
    const result: LoadingResult = {
      placements: [
        { cargoId: 'BOX', x: 0, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 100 },
        { cargoId: 'BOX', x: 1.2, y: 0, z: .5, length: 1, width: 1, height: .5, weightKg: 100 },
      ],
      remaining: [], loadedWeightKg: 200, usedVolumeM3: 1, validationIssues: [],
    };
    const gate = validateFinalLoadingCandidate(container, cargo, result);
    expect(gate.passed).toBe(false);
    expect(gate.reasons.some(reason => reason.includes('허공'))).toBe(true);
  });

  it('accepts a fully supported two-layer stack within top-load limits', () => {
    const result: LoadingResult = {
      placements: [
        { cargoId: 'BOX', x: 0, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 100 },
        { cargoId: 'BOX', x: 0, y: 0, z: .5, length: 1, width: 1, height: .5, weightKg: 100 },
      ],
      remaining: [], loadedWeightKg: 200, usedVolumeM3: 1, validationIssues: [],
    };
    expect(validateFinalLoadingCandidate(container, cargo, result).passed).toBe(true);
  });
});
