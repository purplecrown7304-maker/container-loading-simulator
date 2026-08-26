import { describe, expect, it } from 'vitest';
import { buildDirectResultReoptimizationCandidates } from './finalResultOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import type { PhysicsTarget } from '../physicsTarget';

const container: ContainerSpec = {
  length: 10,
  width: 2.5,
  height: 2.6,
  maxPayloadKg: 20000,
  transportKind: 'truck',
  transportType: 'custom-truck',
  sideWallModel: 'rigid',
  roofModel: 'rigid',
};

const cargo: CargoItem[] = [{
  id: 'A', name: 'A', length: 1, width: 1, height: 0.5, weightKg: 100,
  quantity: 4, maxStackLayers: 1, allowRotation: false,
}];

const currentResult: LoadingResult = {
  placements: [0, 1, 2, 3].map(index => ({
    cargoId: 'A', x: index, y: 0, z: 0, length: 1, width: 1, height: 0.5, weightKg: 100,
  })),
  remaining: [],
  loadedWeightKg: 400,
  usedVolumeM3: 2,
  validationIssues: [],
};

const target: PhysicsTarget = { mode: 'boxes', container, cargo, result: currentResult };

describe('truck direct reoptimization', () => {
  it('generates longitudinally centered candidates without changing cargo count', () => {
    const candidates = buildDirectResultReoptimizationCandidates(target, 9999);
    const centered = candidates.find(item => item.label.includes('트럭 중앙균형'));
    expect(centered).toBeTruthy();
    expect(centered!.result.placements).toHaveLength(currentResult.placements.length);
    const minX = Math.min(...centered!.result.placements.map(item => item.x));
    const maxX = Math.max(...centered!.result.placements.map(item => item.x + item.length));
    expect((minX + maxX) / 2).toBeCloseTo(container.length / 2, 6);
  });
});
