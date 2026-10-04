import { describe, expect, it } from 'vitest';
import { assessManualMove, snapManualCoordinate, supportsOtherPlacement } from './manualPlacement';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 0.5, width: 1, height: 0.5, weightKg: 20, quantity: 2, maxStackLayers: 3, maxTopLoadKg: 100, allowRotation: false }];
const source: LoadingResult = {
  placements: [
    { cargoId: 'A', x: 1.6, y: 0.5, z: 0, length: 0.5, width: 1, height: 0.5, weightKg: 20 },
    { cargoId: 'A', x: 1.6, y: 0.5, z: 0.5, length: 0.5, width: 1, height: 0.5, weightKg: 20 },
  ], remaining: [], loadedWeightKg: 40, usedVolumeM3: 0.5, validationIssues: [], ruleEngine: 'load-sim',
};

function expectAccepted(assessment: ReturnType<typeof assessManualMove>, index: number) {
  expect(assessment.valid, assessment.reasons.join('; ')).toBe(true);
  expect(canPlaceWithLoadSim(container, cargo, assessment.result.placements.filter((_, i) => i !== index), assessment.candidate)).toEqual([]);
  expect(validateExistingWithLoadSim(container, cargo, assessment.result.placements).validation.ok).toBe(true);
}

describe('manual placement with A rules', () => {
  it('starts from an A-valid centered layout', () => expect(validateExistingWithLoadSim(container, cargo, source.placements).validation.ok).toBe(true));
  it('snaps coordinates', () => expect(snapManualCoordinate(1.027, 0.05)).toBe(1.05));
  it('identifies a lower box supporting another box', () => expect(supportsOtherPlacement(0, source.placements)).toBe(true));
  it('rejects moving a lower box away and leaving the top unsupported', () => {
    const assessment = assessManualMove(container, cargo, source, 0, { x: 2.1, y: 0.5, z: 0 });
    expect(assessment.valid).toBe(false);
    expect(assessment.result.operationalFindings?.some(f => f.code === 'FLOATING')).toBe(true);
  });
  it('allows a top box to move to an A-valid floor position', () => {
    const assessment = assessManualMove(container, cargo, source, 1, { x: 2.1, y: 0.5, z: 0 });
    expectAccepted(assessment, 1);
    expect(assessment.result.placements[1].x).toBe(2.1);
  });
  it('allows a supporting box to stay in place when A validates the whole layout', () => {
    expectAccepted(assessManualMove(container, cargo, source, 0, source.placements[0]), 0);
  });
  it('rejects collision through A', () => {
    const assessment = assessManualMove(container, cargo, source, 1, { x: 1.6, y: 0.5, z: 0 });
    expect(assessment.valid).toBe(false);
    expect(assessment.result.operationalFindings?.some(f => f.code === 'OVERLAP')).toBe(true);
  });
  it('rejects a geometrically empty location outside the A CG limit', () => {
    const assessment = assessManualMove(container, cargo, source, 1, { x: 3, y: 0.5, z: 0 });
    expect(assessment.valid).toBe(false);
    expect(assessment.result.operationalFindings?.some(f => f.code === 'CG_LONGITUDINAL')).toBe(true);
  });
  it('respects A orientation restrictions during rotation', () => {
    const assessment = assessManualMove(container, cargo, source, 1, { x: 2.1, y: 0.5, z: 0 }, true);
    expect(assessment.valid).toBe(false);
    expect(assessment.result.validationIssues.some(issue => issue.type === 'INVALID_CARGO')).toBe(true);
  });
});
