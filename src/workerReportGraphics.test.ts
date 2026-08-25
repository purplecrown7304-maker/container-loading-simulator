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
  it('groups consecutive work by cargo, zone and layer', () => {
    const groups = buildWorkerStepGroups(container, cargo, result);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups[0].group).toBe(1);
    expect(groups[0].quantity).toBeGreaterThanOrEqual(1);
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
  });
});
