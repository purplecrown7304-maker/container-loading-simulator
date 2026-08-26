import { describe, expect, it } from 'vitest';
import { assessWeightBalance } from './weightBalance';
import type { ContainerSpec, LoadingResult } from './types';

const resultAt = (x: number): LoadingResult => ({
  placements: [{ cargoId: 'A', x, y: 0.8, z: 0, length: 1, width: 0.8, height: 0.8, weightKg: 1000 }],
  remaining: [],
  loadedWeightKg: 1000,
  usedVolumeM3: 0.64,
  validationIssues: [],
});

const truck: ContainerSpec = {
  length: 10,
  width: 2.5,
  height: 2.6,
  maxPayloadKg: 20000,
  transportKind: 'truck',
  transportType: 'custom-truck',
  sideWallModel: 'rigid',
  roofModel: 'rigid',
};

describe('truck weight balance', () => {
  it('prefers cargo COG near the middle of the truck body', () => {
    const front = assessWeightBalance(truck, resultAt(0));
    const middle = assessWeightBalance(truck, resultAt(4.5));
    expect(middle.balanceScore).toBeGreaterThan(front.balanceScore);
    expect(middle.longitudinalDeviationPct).toBeLessThan(front.longitudinalDeviationPct);
  });

  it('reports normalized longitudinal COG for truck review', () => {
    const assessment = assessWeightBalance(truck, resultAt(4.5));
    expect(assessment.messages.some(message => message.includes('적재함 길이'))).toBe(true);
  });
});
