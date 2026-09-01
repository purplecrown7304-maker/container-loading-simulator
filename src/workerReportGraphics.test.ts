import { describe, expect, it } from 'vitest';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { buildProgressSvgs, buildSideViewSvg, buildTopViewSvg, buildWorkerStepGroups } from './workerReportGraphics';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.4, maxPayloadKg: 20000 };
const cargo: CargoItem[] = [
  { id: 'A', name: 'Heavy A', length: 1, width: 1.2, height: 0.5, weightKg: 100, quantity: 4 },
  { id: 'B', name: 'Light B', length: 1, width: 1.2, height: 0.5, weightKg: 50, quantity: 2 },
];
const result: LoadingResult = {
  placements: [
    { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1.2, height: 0.5, weightKg: 100 },
    { cargoId: 'A', x: 0, y: 1.2, z: 0, length: 1, width: 1.2, height: 0.5, weightKg: 100 },
    { cargoId: 'A', x: 0, y: 0, z: 0.5, length: 1, width: 1.2, height: 0.5, weightKg: 100 },
    { cargoId: 'A', x: 0, y: 1.2, z: 0.5, length: 1, width: 1.2, height: 0.5, weightKg: 100 },
    { cargoId: 'B', x: 1, y: 0, z: 0, length: 1, width: 1.2, height: 0.5, weightKg: 50 },
    { cargoId: 'B', x: 1, y: 1.2, z: 0, length: 1, width: 1.2, height: 0.5, weightKg: 50 },
  ],
  remaining: [],
  loadedWeightKg: 500,
  usedVolumeM3: 3.6,
  validationIssues: [],
};

describe('worker report graphics', () => {
  it('groups the work order by height layer instead of alternating SKU runs', () => {
    const groups = buildWorkerStepGroups(container, cargo, result);
    expect(groups).toHaveLength(2);
    expect(groups.map(group => group.layer)).toEqual([1, 2]);
    expect(groups.map(group => group.quantity)).toEqual([4, 2]);
    expect(groups[0].cargoId).toBe('1단 전체');
    expect(groups[0].label).toContain('A(Heavy A) 2EA');
    expect(groups[0].label).toContain('B(Light B) 2EA');
    expect(groups[0].fromStep).toBe(1);
    expect(groups[0].toStep).toBe(1);
    expect(groups[1].fromStep).toBe(2);
    expect(groups[1].toStep).toBe(2);
    expect(groups.reduce((sum, group) => sum + group.quantity, 0)).toBe(result.placements.length);
  });

  it('builds top, side and three progress diagrams with door direction', () => {
    const groups = buildWorkerStepGroups(container, cargo, result);
    const top = buildTopViewSvg(container, cargo, result, groups);
    const side = buildSideViewSvg(container, cargo, result, groups);
    const progress = buildProgressSvgs(container, result, groups);
    expect(top).toContain('<svg');
    expect(top).toContain('문쪽');
    expect(side).toContain('바닥');
    expect(progress).toHaveLength(3);
    expect(progress[2]).toContain('3단계');
    expect(progress[2]).toContain('2단까지');
  });
});
