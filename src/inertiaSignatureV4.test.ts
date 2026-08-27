import { describe, expect, it } from 'vitest';
import type { PhysicsTarget } from './physicsTarget';
import { createPhysicsTargetSignature } from './inertiaCertification';

const base: PhysicsTarget = {
  mode: 'boxes',
  container: { length: 2, width: 1, height: 1, maxPayloadKg: 1000 },
  cargo: [{
    id: 'A', name: 'Alpha', length: 0.5, width: 0.4, height: 0.3,
    weightKg: 10, quantity: 2, maxStackLayers: 3, maxTopLoadKg: 0,
    allowRotation: true, unloadPriority: 1,
  }],
  result: {
    placements: [{
      cargoId: 'A', x: 0, y: 0, z: 0, length: 0.5, width: 0.4,
      height: 0.3, weightKg: 10, rotated: false,
    }],
    remaining: [{ cargoId: 'A', quantity: 1, reason: 'test remainder' }],
    loadedWeightKg: 10,
    usedVolumeM3: 0.06,
    validationIssues: [],
  },
};

function changed(mutator: (target: PhysicsTarget) => PhysicsTarget) {
  return createPhysicsTargetSignature(mutator(structuredClone(base)));
}

describe('inertia certification signature v4', () => {
  it('changes when requested cargo quantity changes even if placements stay identical', () => {
    const first = createPhysicsTargetSignature(base);
    const next = changed(target => ({ ...target, cargo: target.cargo.map(item => ({ ...item, quantity: 3 })) }));
    expect(next).not.toBe(first);
  });

  it('changes when top-load safety constraints change', () => {
    const first = createPhysicsTargetSignature(base);
    const next = changed(target => ({ ...target, cargo: target.cargo.map(item => ({ ...item, maxTopLoadKg: 100 })) }));
    expect(next).not.toBe(first);
  });

  it('preserves the semantic difference between zero top-load and unlimited top-load', () => {
    const first = createPhysicsTargetSignature(base);
    const next = changed(target => ({ ...target, cargo: target.cargo.map(item => ({ ...item, maxTopLoadKg: undefined })) }));
    expect(next).not.toBe(first);
  });

  it('changes when remaining quantities change', () => {
    const first = createPhysicsTargetSignature(base);
    const next = changed(target => ({
      ...target,
      result: { ...target.result, remaining: [{ cargoId: 'A', quantity: 2, reason: 'test remainder' }] },
    }));
    expect(next).not.toBe(first);
  });

  it('changes when a placement rotation flag changes', () => {
    const first = createPhysicsTargetSignature(base);
    const next = changed(target => ({
      ...target,
      result: { ...target.result, placements: target.result.placements.map(item => ({ ...item, rotated: true })) },
    }));
    expect(next).not.toBe(first);
  });
});
