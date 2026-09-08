import { describe, expect, it } from 'vitest';
import { comparePhysicsOptimizationCandidates, type PhysicsOptimizationCandidate } from './physicsOptimizer';

function candidate({ completion, physicsScore, unstable = 0, settled = true }: { completion: number; physicsScore: number; unstable?: number; settled?: boolean }): PhysicsOptimizationCandidate {
  const placementCount = Math.max(1, Math.round(completion));
  return {
    strategy: 'capacity',
    score: 90,
    physicsScore,
    completionScore: completion,
    balanceScore: 95,
    groupingScore: 90,
    utilizationScore: completion,
    result: {
      placements: Array.from({ length: placementCount }, (_, index) => ({
        cargoId: 'TEST', x: index, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 1,
      })),
      remaining: [],
      loadedWeightKg: placementCount,
      usedVolumeM3: placementCount,
      validationIssues: [],
    },
    physics: {
      score: physicsScore,
      unstableCount: unstable,
      supportUnstableCount: 0,
      settled,
    } as PhysicsOptimizationCandidate['physics'],
  };
}

describe('physics candidate priority', () => {
  it('prefers the candidate that loads more cargo when both are in the same safe tier', () => {
    const fuller = candidate({ completion: 100, physicsScore: 86 });
    const prettierPhysics = candidate({ completion: 80, physicsScore: 99 });
    expect(comparePhysicsOptimizationCandidates(fuller, prettierPhysics)).toBeLessThan(0);
  });

  it('still rejects a physically unstable candidate even if it loads more cargo', () => {
    const unstableFull = candidate({ completion: 100, physicsScore: 99, unstable: 1 });
    const safePartial = candidate({ completion: 80, physicsScore: 90 });
    expect(comparePhysicsOptimizationCandidates(unstableFull, safePartial)).toBeGreaterThan(0);
  });
});
