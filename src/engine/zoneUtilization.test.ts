import { describe, expect, it } from 'vitest';
import { assessZoneUtilization, detectZoneFlowWarning } from './zoneUtilization';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 3, width: 1, height: 1, maxPayloadKg: 1000 };

const placement = (x: number, length: number): Placement => ({
  cargoId: 'A', x, y: 0, z: 0, length, width: 1, height: 1, weightKg: 10,
});

describe('zone utilization', () => {
  it('splits a box volume across zone boundaries', () => {
    const zones = assessZoneUtilization(container, [placement(0.5, 1)]);
    expect(zones[0].usedVolumeM3).toBeCloseTo(0.5, 6);
    expect(zones[1].usedVolumeM3).toBeCloseTo(0.5, 6);
    expect(zones[2].usedVolumeM3).toBeCloseTo(0, 6);
  });

  it('reports percentage and free space for each third', () => {
    const zones = assessZoneUtilization(container, [placement(0, 1)]);
    expect(zones[0].fillPct).toBeCloseTo(100, 6);
    expect(zones[0].freePct).toBeCloseTo(0, 6);
    expect(zones[1].freePct).toBeCloseTo(100, 6);
  });

  it('warns when the middle is much fuller than the inside', () => {
    const zones = assessZoneUtilization(container, [placement(1, 1)]);
    expect(detectZoneFlowWarning(zones)).toContain('중앙 구역');
  });
});
