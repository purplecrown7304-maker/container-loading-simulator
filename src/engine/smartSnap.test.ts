import { describe, expect, it } from 'vitest';
import { findBestSmartSnap, type SmartSnapCandidate } from './smartSnap';
import { assessManualMove } from './manualPlacement';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 100, quantity: 2, maxStackLayers: 3, maxTopLoadKg: 500 }];
function result(): LoadingResult {
  return { placements: [
    { cargoId: 'A', x: 2, y: 0.7, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
    { cargoId: 'A', x: 3, y: 0.7, z: 0, length: 1, width: 1, height: 1, weightKg: 100 },
  ], remaining: [], loadedWeightKg: 200, usedVolumeM3: 2, validationIssues: [], autoCorrections: [], ruleEngine: 'load-sim' };
}
function expectAccepted(snap: SmartSnapCandidate | null) {
  expect(snap).not.toBeNull();
  const assessment = assessManualMove(container, cargo, result(), 1, snap!.position);
  expect(assessment.valid).toBe(true);
  expect(canPlaceWithLoadSim(container, cargo, [assessment.result.placements[0]], assessment.candidate)).toEqual([]);
  expect(validateExistingWithLoadSim(container, cargo, assessment.result.placements).validation.ok).toBe(true);
}

describe('smart snap with A rules', () => {
  it('finds an A-valid aligned position instead of an overlapping raw point', () => {
    expect(validateExistingWithLoadSim(container, cargo, result().placements).validation.ok).toBe(true);
    const snap = findBestSmartSnap(container, cargo, result(), 1, { x: 2.3, y: 0.7, z: 0 });
    expectAccepted(snap);
    expect(snap?.position.x).toBeGreaterThanOrEqual(3);
  });
  it('returns an A-valid ranked candidate with an explainable snap reason', () => {
    const snap = findBestSmartSnap(container, cargo, result(), 1, { x: 3.08, y: 0.73, z: 0 });
    expectAccepted(snap);
    expect(snap?.score).toBeTypeOf('number');
    expect(snap?.reason).toBeTruthy();
  });
  it('returns null when selected placement does not exist', () => {
    expect(findBestSmartSnap(container, cargo, result(), 99, { x: 0, y: 0, z: 0 })).toBeNull();
  });
  it('does not suggest a candidate when A rejects the total payload', () => {
    expect(findBestSmartSnap({ ...container, maxPayloadKg: 199 }, cargo, result(), 1, { x: 3, y: 0.7, z: 0 })).toBeNull();
  });
});
