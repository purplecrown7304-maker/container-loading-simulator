import { describe, expect, it } from 'vitest';
import type { LoadingResult } from './types';
import type { PhysicsValidationSuite } from './physicsValidation';
import {
  comparePhysicsOptimizationCandidates,
  type PhysicsOptimizationCandidate,
} from './physicsOptimizer';

function candidate(options: {
  loaded: number;
  completion: number;
  physicsScore: number;
  unstable?: number;
  validationIssues?: number;
}): PhysicsOptimizationCandidate {
  const result = {
    placements: Array.from({ length: options.loaded }, (_, index) => ({ cargoId: `B${index}` })),
    remaining: [],
    loadedWeightKg: options.loaded * 10,
    usedVolumeM3: options.loaded,
    validationIssues: Array.from({ length: options.validationIssues ?? 0 }, (_, index) => ({
      type: 'collision',
      message: `hard issue ${index}`,
    })),
    autoCorrections: [],
  } as unknown as LoadingResult;

  const physics = {
    engine: 'Rapier 3D',
    score: options.physicsScore,
    stableCount: Math.max(0, options.loaded - (options.unstable ?? 0)),
    warningCount: 0,
    unstableCount: options.unstable ?? 0,
    supportStableCount: 0,
    supportWarningCount: 0,
    supportUnstableCount: 0,
    worstScenario: 'settle',
    maxHorizontalShiftM: 0,
    maxVerticalShiftM: 0,
    maxTiltDeg: 0,
    maxLinearSpeedMps: 0,
    maxAngularSpeedRadps: 0,
    settled: (options.unstable ?? 0) === 0,
    placements: [],
    supports: [],
  } as unknown as PhysicsValidationSuite;

  return {
    strategy: 'capacity',
    score: options.physicsScore,
    physicsScore: options.physicsScore,
    completionScore: options.completion,
    balanceScore: options.physicsScore,
    groupingScore: 100,
    utilizationScore: options.loaded,
    result,
    physics,
  };
}

describe('physics optimizer fill-first selection', () => {
  it('prefers more loaded cargo even when the fuller candidate has worse physics', () => {
    const fuller = candidate({ loaded: 100, completion: 100, physicsScore: 45, unstable: 3 });
    const saferButShort = candidate({ loaded: 95, completion: 95, physicsScore: 100 });

    expect(comparePhysicsOptimizationCandidates(fuller, saferButShort)).toBeLessThan(0);
  });

  it('still rejects a hard-validation candidate before comparing fill rate', () => {
    const invalidFuller = candidate({ loaded: 100, completion: 100, physicsScore: 100, validationIssues: 1 });
    const validShorter = candidate({ loaded: 95, completion: 95, physicsScore: 40, unstable: 2 });

    expect(comparePhysicsOptimizationCandidates(invalidFuller, validShorter)).toBeGreaterThan(0);
  });
});
