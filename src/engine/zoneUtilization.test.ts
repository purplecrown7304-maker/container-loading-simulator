import { describe, expect, it } from 'vitest';
import { assessZoneUtilization, detectZoneFlowWarning } from './zoneUtilization';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 3, width: 1, height: 2, maxPayloadKg: 1000 };

const placement = (x: number, length: number, height = 1, z = 0): Placement => ({
  cargoId: 'A', x, y: 0, z, length, width: 1, height, weightKg: 10,
});

describe('zone utilization', () => {
  it('splits a box volume across zone boundaries', () => {
    const zones = assessZoneUtilization(container, [placement(0.5, 1)]);
    expect(zones[0].usedVolumeM3).toBeCloseTo(0.5, 6);
    expect(zones[1].usedVolumeM3).toBeCloseTo(0.5, 6);
    expect(zones[2].usedVolumeM3).toBeCloseTo(0, 6);
  });

  it('reports percentage and free space for each third', () => {
    const zones = assessZoneUtilization(container, [placement(0, 1, 2)]);
    expect(zones[0].fillPct).toBeCloseTo(100, 6);
    expect(zones[0].freePct).toBeCloseTo(0, 6);
    expect(zones[1].freePct).toBeCloseTo(100, 6);
  });

  it('calculates floor-area-weighted average height and max height', () => {
    const zones = assessZoneUtilization(container, [
      { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 0.5, height: 2, weightKg: 10 },
    ]);
    expect(zones[0].averageHeightM).toBeCloseTo(1, 1);
    expect(zones[0].maxHeightM).toBeCloseTo(2, 6);
    expect(zones[0].label).toContain('평균');
  });

  it('warns when the middle is much fuller than the inside', () => {
    const zones = assessZoneUtilization(container, [placement(1, 1, 1)]);
    expect(detectZoneFlowWarning(zones)).toContain('중앙 구역');
  });

  it('warns when the middle forms a height spike versus the inside', () => {
    const zones = assessZoneUtilization(container, [
      placement(0, 1, 0.5),
      placement(1, 1, 1.8),
    ]);
    const warning = detectZoneFlowWarning(zones);
    expect(warning).toContain('뿔 모양');
    expect(warning).toContain('평균 높이');
  });

  it('warns when the door zone is significantly taller than the middle', () => {
    const zones = assessZoneUtilization(container, [
      placement(0, 1, 0.7),
      placement(1, 1, 0.7),
      placement(2, 1, 1.8),
    ]);
    expect(detectZoneFlowWarning(zones)).toContain('문쪽 평균 적재 높이');
  });
});
