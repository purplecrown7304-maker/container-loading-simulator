import { describe, expect, it } from 'vitest';
import { analyzeConstraints } from './constraintAnalysis';
import type { FloorLoadAnalysis } from './floorLoad';
import { FOOTPRINT_GRID_MIN_ITEMS, setFootprintGridsEnabledForTests } from './footprintGrid';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const cargo: CargoItem[] = [{
  id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 100, quantity: 1,
  maxStackLayers: 3, maxTopLoadKg: 1000,
}];

const result: LoadingResult = {
  placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 100 }],
  remaining: [],
  loadedWeightKg: 100,
  usedVolumeM3: 1,
  validationIssues: [],
};

const floor = (maxKgPerM2: number, averageKgPerM2: number): FloorLoadAnalysis => ({
  rows: 1,
  columns: 1,
  cells: [],
  maxKgPerM2,
  averageKgPerM2,
  totalProjectedKg: 100,
});

describe('report-driven constraint analysis', () => {
  it('renames the door check and exposes a separate door-space utilization metric', () => {
    const container: ContainerSpec = { length: 10, width: 2, height: 2.5, maxPayloadKg: 10000 };
    const checks = analyzeConstraints(container, cargo, result, floor(100, 50));
    expect(checks.find((check) => check.id === 'door')?.label).toBe('문쪽 낙하 위험');
    const doorSpace = checks.find((check) => check.id === 'doorSpace');
    expect(doorSpace?.label).toBe('문쪽 공간 활용도');
    expect(doorSpace?.status).toBe('warn');
    expect(doorSpace?.detail).toContain('문쪽 공백');
  });

  it('counts only the length cargo occupies, not an empty stretch in front of it', () => {
    const container: ContainerSpec = { length: 10, width: 2, height: 2.5, maxPayloadKg: 10000 };
    const parked: LoadingResult = { ...result, placements: [
      { ...result.placements[0], x: 4 }, { ...result.placements[0], x: 5 },
    ] };
    const doorSpace = analyzeConstraints(container, cargo, parked, floor(100, 50)).find((check) => check.id === 'doorSpace');
    // 2 m of 10 m is occupied (4..6 m): 20%, not the 60% the far end alone suggested.
    expect(doorSpace?.detail).toBe('길이 활용 20.0% · 문쪽 공백 4000 mm');
    expect(doorSpace?.status).toBe('warn');
    const tight: LoadingResult = { ...result, placements: Array.from({ length: 9 }, (_, index) => ({ ...result.placements[0], x: index })) };
    expect(analyzeConstraints(container, cargo, tight, floor(100, 50)).find((check) => check.id === 'doorSpace')?.detail).toBe('길이 활용 90.0% · 문쪽 공백 1000 mm');
  });

  it('counts stack and top-load findings exactly as the all-pairs comparison does', () => {
    // 6 × 4 footprint columns, five tiers, with every third column shifted by a third of a
    // carton so that upper cartons bridge two lower ones and partial overlaps are summed.
    const container: ContainerSpec = { length: 12, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
    const placements: LoadingResult['placements'] = [];
    for (let ix = 0; ix < 6; ix += 1) for (let iy = 0; iy < 4; iy += 1) for (let iz = 0; iz < 5; iz += 1) {
      const shift = iz % 2 === 1 && ix % 3 === 0 ? .2 : 0;
      placements.push({ cargoId: iz < 3 ? 'LOW' : 'HIGH', x: ix * .6 + shift, y: iy * .5, z: iz * .4, length: .6, width: .5, height: .4, weightKg: 10 + iz * 3 + ix });
    }
    const mixed: CargoItem[] = [
      { id: 'LOW', name: 'LOW', length: .6, width: .5, height: .4, weightKg: 10, quantity: 72, maxStackLayers: 2, maxTopLoadKg: 30 },
      { id: 'HIGH', name: 'HIGH', length: .6, width: .5, height: .4, weightKg: 16, quantity: 48, maxStackLayers: 1, maxTopLoadKg: 12 },
    ];
    const plan: LoadingResult = { ...result, placements, loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0) };
    expect(placements.length).toBeGreaterThanOrEqual(FOOTPRINT_GRID_MIN_ITEMS);
    const fast = analyzeConstraints(container, mixed, plan, floor(100, 50));
    setFootprintGridsEnabledForTests(false);
    const reference = analyzeConstraints(container, mixed, plan, floor(100, 50));
    setFootprintGridsEnabledForTests(true);
    expect(fast).toEqual(reference);
    expect(fast.find((check) => check.id === 'stack')?.status).toBe('fail');
    expect(fast.find((check) => check.id === 'topLoad')?.status).toBe('warn');
  });

  it('uses container-specific floor-load warning settings', () => {
    const strict: ContainerSpec = {
      length: 10, width: 2, height: 2.5, maxPayloadKg: 10000,
      floorLoadLimitKgPerM2: 900,
      floorLoadWarningMultiplier: 2,
    };
    const relaxed: ContainerSpec = {
      ...strict,
      floorLoadLimitKgPerM2: 2000,
      floorLoadWarningMultiplier: 5,
    };
    expect(analyzeConstraints(strict, cargo, result, floor(1200, 400)).find((check) => check.id === 'floorLoad')?.status).toBe('warn');
    expect(analyzeConstraints(relaxed, cargo, result, floor(1200, 400)).find((check) => check.id === 'floorLoad')?.status).toBe('pass');
  });
});
