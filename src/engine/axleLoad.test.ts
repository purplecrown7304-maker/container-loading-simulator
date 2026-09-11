import { describe, expect, it } from 'vitest';
import { assessAxleLoads } from './axleLoad';
import type { ContainerSpec, LoadingResult } from './types';

function resultAt(x: number): LoadingResult {
  return {
    placements: [{ cargoId: 'LOAD', x, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 1000 }],
    remaining: [], loadedWeightKg: 1000, usedVolumeM3: 1, validationIssues: [],
  };
}

describe('assessAxleLoads', () => {
  it('does not invent axle loads when axle geometry is absent', () => {
    const container: ContainerSpec = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 5000 };
    expect(assessAxleLoads(container, resultAt(2.5))).toBeUndefined();
  });

  it('splits cargo reaction evenly when CG is midway between two axles', () => {
    const truck: ContainerSpec = {
      length: 6, width: 2.4, height: 2.5, maxPayloadKg: 5000,
      frontAxleX: 1, rearAxleX: 5, frontAxleMaxKg: 3000, rearAxleMaxKg: 3000,
    };
    const assessment = assessAxleLoads(truck, resultAt(2.5)); // box CG = 3.0m
    expect(assessment?.frontKg).toBeCloseTo(500, 6);
    expect(assessment?.rearKg).toBeCloseTo(500, 6);
    expect(assessment?.score).toBeGreaterThan(95);
  });
});
