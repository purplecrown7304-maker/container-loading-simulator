import { describe, expect, it } from 'vitest';
import { analyzeConstraints } from './constraintAnalysis';
import type { FloorLoadAnalysis } from './floorLoad';
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
