import { describe, expect, it } from 'vitest';
import { suggestGroupMoves } from './groupMoveSuggestions';
import { assessGroupMove } from './groupPlacement';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 100, quantity: 2, maxStackLayers: 3, maxTopLoadKg: 500 }];
const result: LoadingResult = { placements: [
  { cargoId: 'A', x: 2, y: 0.7, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
  { cargoId: 'A', x: 3, y: 0.7, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
], remaining: [], loadedWeightKg: 200, usedVolumeM3: 2, validationIssues: [], autoCorrections: [], ruleEngine: 'load-sim' };

describe('group move suggestions with A rules', () => {
  it('returns at most three ranked candidates that pass A candidate and final validation', () => {
    expect(validateExistingWithLoadSim(container, cargo, result.placements).validation.ok).toBe(true);
    const list = suggestGroupMoves(container, cargo, result, [0, 1], { x: 0.15, y: 0, z: 0 }, 3);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(list.every((item, i) => i === 0 || list[i - 1].score >= item.score)).toBe(true);
    for (const suggestion of list) {
      const moved = assessGroupMove(container, cargo, result, [0, 1], suggestion.delta);
      expect(moved.valid).toBe(true);
      moved.result.placements.forEach((candidate, index, placements) => {
        expect(canPlaceWithLoadSim(container, cargo, placements.filter((_, i) => i !== index), candidate)).toEqual([]);
      });
      expect(validateExistingWithLoadSim(container, cargo, moved.result.placements).validation.ok).toBe(true);
    }
  });
  it('returns no candidates for empty selection', () => {
    expect(suggestGroupMoves(container, cargo, result, [], { x: 0, y: 0, z: 0 }, 3)).toEqual([]);
  });
  it('returns no candidates if A rejects the load payload', () => {
    expect(suggestGroupMoves({ ...container, maxPayloadKg: 199 }, cargo, result, [0, 1])).toEqual([]);
  });
});
