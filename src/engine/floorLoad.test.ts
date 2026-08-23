import { describe, expect, it } from 'vitest';
import { analyzeFloorLoad } from './floorLoad';
import { analyzeConstraints } from './constraintAnalysis';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };

function result(placements: LoadingResult['placements']): LoadingResult {
  return {
    placements,
    remaining: [],
    loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0),
    usedVolumeM3: placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0),
    validationIssues: [],
  };
}

const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 1, width: 1, height: .5, weightKg: 100, quantity: 2, maxStackLayers: 2, maxTopLoadKg: 150 }];

describe('analyzeFloorLoad', () => {
  it('preserves total projected weight across grid cells', () => {
    const r = result([
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 100 },
      { cargoId: 'A', x: 0, y: 0, z: .5, length: 1, width: 1, height: .5, weightKg: 100 },
    ]);
    const analysis = analyzeFloorLoad(container, r, 2, 1);
    expect(analysis.totalProjectedKg).toBeCloseTo(200, 6);
    expect(analysis.averageKgPerM2).toBeCloseTo(100, 6);
    expect(analysis.maxKgPerM2).toBeCloseTo(200, 6);
  });

  it('splits a placement proportionally across cell boundaries', () => {
    const r = result([{ cargoId: 'A', x: .5, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 100 }]);
    const analysis = analyzeFloorLoad(container, r, 2, 1);
    expect(analysis.cells[0].loadKg).toBeCloseTo(50, 6);
    expect(analysis.cells[1].loadKg).toBeCloseTo(50, 6);
  });
});

describe('analyzeConstraints', () => {
  it('passes a valid two-layer stack', () => {
    const r = result([
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 100 },
      { cargoId: 'A', x: 0, y: 0, z: .5, length: 1, width: 1, height: .5, weightKg: 100 },
    ]);
    const checks = analyzeConstraints(container, cargo, r, analyzeFloorLoad(container, r));
    expect(checks.find(c => c.id === 'payload')?.status).toBe('pass');
    expect(checks.find(c => c.id === 'height')?.status).toBe('pass');
    expect(checks.find(c => c.id === 'stack')?.status).toBe('pass');
    expect(checks.find(c => c.id === 'topLoad')?.status).toBe('pass');
  });

  it('warns on conservative top-load excess', () => {
    const r = result([
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: .25, weightKg: 100 },
      { cargoId: 'A', x: 0, y: 0, z: .25, length: 1, width: 1, height: .25, weightKg: 100 },
      { cargoId: 'A', x: 0, y: 0, z: .5, length: 1, width: 1, height: .25, weightKg: 100 },
    ]);
    const checks = analyzeConstraints(container, [{ ...cargo[0], maxStackLayers: 4 }], r, analyzeFloorLoad(container, r));
    expect(checks.find(c => c.id === 'topLoad')?.status).toBe('warn');
  });
});
