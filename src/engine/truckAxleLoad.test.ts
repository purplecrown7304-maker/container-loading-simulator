import { describe, expect, it } from 'vitest';
import { assessTruckAxleLoad } from './truckAxleLoad';
import type { ContainerSpec, LoadingResult } from './types';

const baseResult: LoadingResult = {
  placements: [
    { cargoId: 'A', x: 4.5, y: 0.2, z: 0, length: 1, width: 1, height: 1, weightKg: 1000 },
    { cargoId: 'B', x: 5.5, y: 0.2, z: 0, length: 1, width: 1, height: 1, weightKg: 1000 },
  ],
  remaining: [],
  loadedWeightKg: 2000,
  usedVolumeM3: 2,
  validationIssues: [],
};

const truck: ContainerSpec = {
  length: 10,
  width: 2.5,
  height: 2.6,
  maxPayloadKg: 20000,
  transportKind: 'truck',
  truckAxles: { frontSupportX: 2, rearSupportX: 8, frontMaxKg: 8000, rearMaxKg: 8000 },
};

describe('assessTruckAxleLoad', () => {
  it('splits a centered load evenly between configured supports', () => {
    const result = assessTruckAxleLoad(truck, baseResult)!;
    expect(result.validGeometry).toBe(true);
    expect(result.frontCargoReactionKg).toBeCloseTo(1000, 4);
    expect(result.rearCargoReactionKg).toBeCloseTo(1000, 4);
    expect(result.severity).toBe('ok');
  });

  it('marks a cargo center outside the support span as over', () => {
    const shifted: LoadingResult = {
      ...baseResult,
      placements: baseResult.placements.map(item => ({ ...item, x: item.x + 3.6 })),
    };
    const result = assessTruckAxleLoad(truck, shifted)!;
    expect(result.outsideSupportSpan).toBe(true);
    expect(result.severity).toBe('over');
  });

  it('does not invent an axle result when axle geometry is not configured', () => {
    expect(assessTruckAxleLoad({ ...truck, truckAxles: undefined }, baseResult)).toBeUndefined();
  });
});
