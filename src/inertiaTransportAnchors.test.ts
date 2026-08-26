import { describe, expect, it } from 'vitest';
import { buildSecuringUsage, securingProfileForUsage } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

function target(loadBarAnchors: boolean): PhysicsTarget {
  return {
    mode: 'boxes',
    container: {
      length: 13.6,
      width: 2.5,
      height: 2.65,
      maxPayloadKg: 25000,
      transportKind: 'truck',
      transportType: 'tautliner',
      sideWallModel: 'curtain',
      roofModel: 'soft',
      loadBarAnchors,
    },
    cargo: [{ id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 40 }],
    result: {
      placements: Array.from({ length: 40 }, (_, index) => ({
        cargoId: 'A', x: (index % 10) * 0.5, y: Math.floor(index / 10) * 0.4, z: 0,
        length: 0.5, width: 0.4, height: 0.3, weightKg: 10,
      })),
      remaining: [], loadedWeightKg: 400, usedVolumeM3: 2.4, validationIssues: [],
    },
  };
}

describe('truck securing anchors', () => {
  it('does not generate load bars when rated anchors are not confirmed', () => {
    const usage = buildSecuringUsage(target(false), 3);
    expect(usage.loadBars).toBe(0);
    expect(usage.levelLabel).not.toContain('고정바');
  });

  it('allows load bars only after rated anchors are explicitly enabled', () => {
    const usage = buildSecuringUsage(target(true), 3);
    expect(usage.loadBars).toBe(2);
    expect(securingProfileForUsage('boxes', usage).cargoRestraint).toBeDefined();
  });
});
