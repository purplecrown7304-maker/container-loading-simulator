import { describe, expect, it } from 'vitest';
import { palletBandingLayout, palletBandingLengthM, palletBandingLabel } from './palletBanding';
import { buildSecuringUsage, createPhysicsTargetSignature } from './inertiaCertification';
import { buildPalletSecuringPlan } from './palletSecuringPlan';
import { securingGeometry } from './unitySecuring';
import type { PhysicsTarget } from './physicsTarget';

const target: PhysicsTarget = {
  mode: 'pallets',
  container: { length: 4, width: 2.4, height: 2.6, maxPayloadKg: 1000 },
  cargo: [],
  supports: [{ id: 'PALLET-1', x: .2, y: .3, z: 0, length: 1.2, width: .8, height: .12, weightKg: 20 }],
  result: {
    placements: [{ cargoId: 'A', x: .2, y: .3, z: .12, length: 1.2, width: .8, height: .6, weightKg: 100 }],
    remaining: [], loadedWeightKg: 120, usedVolumeM3: .576, validationIssues: [],
  },
};

describe('crossed pallet banding', () => {
  it.each([0, 2, 3, 4])('keeps %i straps and distributes them between both pallet axes', count => {
    const layout = palletBandingLayout(count);
    expect(layout.acrossLength.length + layout.acrossWidth.length).toBe(count);
    if (count) {
      expect(layout.acrossLength.length).toBeGreaterThan(0);
      expect(layout.acrossWidth.length).toBeGreaterThan(0);
    }
    if (count === 4) {
      expect(layout).toEqual({ acrossLength: [1 / 3, 2 / 3], acrossWidth: [1 / 3, 2 / 3] });
      expect(palletBandingLabel(count)).toBe('가로 2줄 + 세로 2줄 격자');
    }
  });

  it('renders two top runs in each direction and down all four sides without changing cargo', () => {
    const before = JSON.stringify(target);
    const usage = buildSecuringUsage(target, 3);
    const geometry = securingGeometry(target.container, target.result.placements, target.supports!, usage);
    const straps = geometry.filter(p => p.color === '#1f2937');
    expect(straps).toHaveLength(12);
    expect(straps.every(p => p.supportIndex === 0)).toBe(true);
    const top = straps.filter(p => Math.abs(p.z - .72) < 1e-8);
    expect(top.filter(p => p.length > p.width)).toHaveLength(2);
    expect(top.filter(p => p.width > p.length)).toHaveLength(2);
    const sides = straps.filter(p => p.height > .022);
    for (const [key, value] of [['x', .178], ['x', 1.4], ['y', .278], ['y', 1.1]] as const) {
      expect(sides.filter(p => Math.abs(p[key] - value) < 1e-8)).toHaveLength(2);
    }
    expect(JSON.stringify(target)).toBe(before);
  });

  it('uses both rectangular spans in material length, weight and the worker plan', () => {
    const usage = buildSecuringUsage(target, 3);
    const plan = buildPalletSecuringPlan(target, usage);
    expect(usage.bandingStraps).toBe(4);
    expect(usage.bandingLengthM).toBeCloseTo(14);
    expect(plan.items[0].bandingLengthM).toBeCloseTo(14);
    expect(plan.totalAddedWeightKg).toBeCloseTo(usage.estimatedAddedWeightKg);
    expect(palletBandingLengthM(.8, 1.2, .6, 4)).toBeCloseTo(14);
    expect(palletBandingLengthM(1.1, 1.1, .6, 4)).toBeCloseTo(4 * (2 * (1.1 + .6) + .3));
    expect(palletBandingLengthM(1.2, .8, .6, 0)).toBe(0);
  });

  it('versions pallet certificates when banding material calculations change, leaving box signatures alone', () => {
    expect(JSON.parse(createPhysicsTargetSignature(target)).bandingLayout).toBe('grid-v1');
    expect(JSON.parse(createPhysicsTargetSignature({ ...target, mode: 'boxes' }))).not.toHaveProperty('bandingLayout');
  });
});
