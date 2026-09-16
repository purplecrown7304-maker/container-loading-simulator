import { describe, expect, it } from 'vitest';
import { compareHybridCandidates, packByHybridOptimizer } from './hybridLoadingOptimizer';
import { LOADING_STRATEGIES } from './loadingStrategies';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = {
  length: 2,
  width: 1,
  height: 1,
  maxPayloadKg: 2000,
};

const cargo: CargoItem[] = [
  {
    id: 'A',
    name: 'A',
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 30,
    quantity: 4,
    maxStackLayers: 2,
    maxTopLoadKg: 100,
    allowRotation: true,
    unloadPriority: 2,
  },
  {
    id: 'B',
    name: 'B',
    length: 0.5,
    width: 0.25,
    height: 0.5,
    weightKg: 10,
    quantity: 4,
    maxStackLayers: 2,
    maxTopLoadKg: 100,
    allowRotation: true,
    unloadPriority: 1,
  },
];

function signature(placements: Placement[]) {
  return placements
    .map((p) => [p.cargoId, p.x, p.y, p.z, p.length, p.width, p.height, p.rotated ? 1 : 0].join(':'))
    .sort();
}

describe('hybrid loading optimizer', () => {
  it('compares strict-wall and EMS beam plans with hard-safety gating', () => {
    const candidates = compareHybridCandidates(container, cargo, 'capacity');
    expect(candidates.map((candidate) => candidate.engine).sort()).toEqual(['ems-beam-v2', 'strict-wall']);
    expect(candidates.every((candidate) => candidate.validationIssueCount === 0)).toBe(true);
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[1].score);
  });

  it('keeps both PR #50 solvers active for every non-fast-path strategy', () => {
    for (const strategy of LOADING_STRATEGIES.map((item) => item.id)) {
      const candidates = compareHybridCandidates(container, cargo, strategy);
      expect(candidates).toHaveLength(2);
      expect(candidates.map((candidate) => candidate.engine).sort()).toEqual(['ems-beam-v2', 'strict-wall']);
      expect(candidates.every((candidate) => candidate.validationIssueCount === 0)).toBe(true);
      expect(candidates.every((candidate) => candidate.output.loadedWeightKg <= container.maxPayloadKg)).toBe(true);
    }
  });

  it('applies different objective weights across the six strategies', () => {
    const strictScores = LOADING_STRATEGIES.map(({ id }) => {
      const candidate = compareHybridCandidates(container, cargo, id).find((row) => row.engine === 'strict-wall');
      expect(candidate).toBeTruthy();
      return Number(candidate?.score.toFixed(6));
    });
    expect(new Set(strictScores).size).toBeGreaterThan(1);
  });

  it('returns a deterministic best plan for identical inputs', () => {
    const first = packByHybridOptimizer(container, cargo, 'stability');
    const second = packByHybridOptimizer(container, [...cargo].reverse(), 'stability');
    expect(signature(first.placements)).toEqual(signature(second.placements));
    expect(first.remaining).toEqual(second.remaining);
  });

  it('keeps the selected plan inside payload while loading the simple demand', () => {
    const result = packByHybridOptimizer(container, cargo, 'capacity');
    expect(result.loadedWeightKg).toBeLessThanOrEqual(container.maxPayloadKg);
    expect(result.placements).toHaveLength(8);
    expect(result.remaining).toEqual([]);
  });
});