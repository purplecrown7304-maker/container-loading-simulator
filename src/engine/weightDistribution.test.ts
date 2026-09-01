import { describe, expect, it } from 'vitest';
import type { ContainerSpec, LoadingResult } from './types';
import { analyzeWeightDistribution } from './weightDistribution';

const container: ContainerSpec = {
  length: 4,
  width: 2,
  height: 2.5,
  maxPayloadKg: 10000,
  floorLoadLimitKgPerM2: 1000,
  floorLoadWarningMultiplier: 2,
};

function result(placements: LoadingResult['placements']): LoadingResult {
  return {
    placements,
    remaining: [],
    loadedWeightKg: placements.reduce((sum, placement) => sum + placement.weightKg, 0),
    usedVolumeM3: placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
    validationIssues: [],
  };
}

describe('analyzeWeightDistribution', () => {
  it('preserves projected weight and reports balanced halves', () => {
    const analysis = analyzeWeightDistribution(container, result([
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 2, width: 2, height: 1, weightKg: 400 },
      { cargoId: 'B', x: 2, y: 0, z: 0, length: 2, width: 2, height: 1, weightKg: 400 },
    ]), 4, 2);

    expect(analysis.totalWeightKg).toBeCloseTo(800, 6);
    expect(analysis.innerRatio).toBeCloseTo(0.5, 6);
    expect(analysis.doorRatio).toBeCloseTo(0.5, 6);
    expect(analysis.leftRatio).toBeCloseTo(0.5, 6);
    expect(analysis.rightRatio).toBeCloseTo(0.5, 6);
    expect(analysis.centerOffsetMm.longitudinal).toBeCloseTo(0, 6);
    expect(analysis.centerOffsetMm.lateral).toBeCloseTo(0, 6);
    expect(analysis.status).toBe('balanced');
  });

  it('flags a configured local-load or half-balance concentration', () => {
    const analysis = analyzeWeightDistribution(container, result([
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 0.5, width: 0.5, height: 1, weightKg: 1000 },
    ]), 8, 4);

    expect(analysis.totalWeightKg).toBeCloseTo(1000, 6);
    expect(analysis.innerRatio).toBeCloseTo(1, 6);
    expect(analysis.leftRatio).toBeCloseTo(1, 6);
    expect(analysis.maxCell?.kgPerM2 ?? 0).toBeGreaterThan(analysis.localWarningKgPerM2);
    expect(analysis.status).toBe('caution');
    expect(analysis.messages.some(message => message.includes('집중'))).toBe(true);
  });

  it('keeps empty results stable', () => {
    const analysis = analyzeWeightDistribution(container, result([]));
    expect(analysis.status).toBe('empty');
    expect(analysis.totalWeightKg).toBe(0);
    expect(analysis.maxCell?.loadKg ?? 0).toBe(0);
  });
});
