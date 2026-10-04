import { describe, expect, it } from 'vitest';
import { assessGroupMove, groupSupportsOutside, selectPlacementGroup } from './groupPlacement';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
const cargo: CargoItem[] = [
  { id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 100, quantity: 3, maxStackLayers: 3, maxTopLoadKg: 500 },
  { id: 'B', name: 'B', length: 1, width: 1, height: 1, weightKg: 80, quantity: 1, maxStackLayers: 3, maxTopLoadKg: 500 },
];

function baseResult(): LoadingResult {
  return {
    placements: [
      { cargoId: 'A', x: 2, y: 0.2, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
      { cargoId: 'A', x: 2, y: 1.2, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
      { cargoId: 'A', x: 3.2, y: 0.7, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
    ], remaining: [], loadedWeightKg: 300, usedVolumeM3: 3, validationIssues: [], autoCorrections: [], ruleEngine: 'load-sim',
  };
}

function expectAccepted(assessment: ReturnType<typeof assessGroupMove>) {
  expect(assessment.valid, assessment.reasons.join('; ')).toBe(true);
  for (const index of assessment.indices) {
    expect(canPlaceWithLoadSim(container, cargo, assessment.result.placements.filter((_, i) => i !== index), assessment.result.placements[index])).toEqual([]);
  }
  expect(validateExistingWithLoadSim(container, cargo, assessment.result.placements).validation.ok).toBe(true);
}

describe('group placement with A rules', () => {
  it('selects cargo, row, and layer groups from an A-valid anchor layout', () => {
    const source = baseResult();
    expect(validateExistingWithLoadSim(container, cargo, source.placements).validation.ok).toBe(true);
    expect(selectPlacementGroup(source, container, 0, 'cargo')).toEqual([0, 1, 2]);
    expect(selectPlacementGroup(source, container, 0, 'row')).toEqual([0, 1]);
    expect(selectPlacementGroup(source, container, 0, 'layer')).toEqual([0, 1, 2]);
  });
  it('moves a whole row while preserving relative spacing', () => {
    const source = baseResult();
    const assessment = assessGroupMove(container, cargo, source, selectPlacementGroup(source, container, 0, 'row'), { x: 0.2, y: 0, z: 0 });
    expectAccepted(assessment);
    expect(assessment.result.placements[0].x).toBeCloseTo(2.2);
    expect(assessment.result.placements[1].x).toBeCloseTo(2.2);
    expect(assessment.result.placements[1].y - assessment.result.placements[0].y).toBeCloseTo(1);
  });
  it('rejects a move that leaves cargo outside the group unsupported', () => {
    const source = baseResult();
    source.placements.push({ cargoId: 'B', x: 2, y: 0.2, z: 1, length: 1, width: 1, height: 1, weightKg: 80 });
    source.loadedWeightKg += 80;
    source.usedVolumeM3 += 1;
    expect(groupSupportsOutside([0, 1], source.placements)).toBe(true);
    const assessment = assessGroupMove(container, cargo, source, [0, 1], { x: -1, y: 0, z: 0 });
    expect(assessment.valid).toBe(false);
    expect(assessment.result.operationalFindings?.some(f => f.code === 'FLOATING')).toBe(true);
  });
  it('allows a supporting group to stay in place when the whole layout passes A', () => {
    const source = baseResult();
    source.placements.push({ cargoId: 'B', x: 2, y: 0.2, z: 1, length: 1, width: 1, height: 1, weightKg: 80 });
    source.loadedWeightKg += 80;
    source.usedVolumeM3 += 1;
    expectAccepted(assessGroupMove(container, cargo, source, [0, 1], { x: 0, y: 0, z: 0 }));
  });
  it('supports signed five-centimeter movement deltas', () => {
    const assessment = assessGroupMove(container, cargo, baseResult(), [2], { x: -0.95, y: 0, z: 0 });
    expect(assessment.delta.x).toBeCloseTo(-0.95);
    expect(assessment.result.placements[2].x).toBeCloseTo(2.25);
  });
  it('rejects an otherwise collision-free group translation outside A CG limits', () => {
    const assessment = assessGroupMove(container, cargo, baseResult(), [0, 1, 2], { x: 1, y: 0, z: 0 });
    expect(assessment.valid).toBe(false);
    expect(assessment.result.operationalFindings?.some(f => f.code === 'CG_LONGITUDINAL')).toBe(true);
  });
});
