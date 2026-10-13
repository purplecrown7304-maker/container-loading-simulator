import { expect, it } from 'vitest';
import { gapSecuringPlan, fixedGapSupports } from './gapSecuring';
import { steppedDirectLoad } from '../testFixtures/steppedDirectLoad';
import { buildSecuringUsage, isInertiaStable, securingProfileForUsage } from '../inertiaCertification';
import { runInertiaAnimation } from './inertiaSimulation';

it('braces both the high cargo face and low tail without crossing cargo or losing material weight', () => {
  const target = steppedDirectLoad();
  const before = structuredClone(target);
  const plan = gapSecuringPlan(target.container, target.result.placements);
  const bars = plan.fills.filter(fill => fill.kind === 'door-face');
  expect(bars).toHaveLength(2);
  expect(bars[0]).toMatchObject({ x: 12, z: 0, height: .225, quantity: 1, weightKg: 5.1 });
  expect(bars[1].x).toBeCloseTo(11.76);
  expect(bars[1].z).toBeCloseTo(.225);
  expect(bars[1].height).toBeCloseTo(1.35);
  expect(bars[1].quantity).toBe(2);
  expect(plan.weightKg).toBeCloseTo(15.3);
  expect(plan.volumeM3).toBeCloseTo(.9795168);
  for (const bar of bars) for (const p of target.result.placements) {
    const overlap = Math.min(bar.x + bar.length, p.x + p.length) - Math.max(bar.x, p.x) > 1e-6
      && Math.min(bar.y + bar.width, p.y + p.width) - Math.max(bar.y, p.y) > 1e-6
      && Math.min(bar.z + bar.height, p.z + p.height) - Math.max(bar.z, p.z) > 1e-6;
    expect(overlap).toBe(false);
  }
  expect(target).toEqual(before);
  expect(gapSecuringPlan(target.container, [...target.result.placements].reverse())).toEqual(plan);
  const narrow = gapSecuringPlan({ ...target.container, width: 2 }, target.result.placements);
  expect(narrow.fills.filter(fill => fill.kind === 'door-face').every(fill => !fill.fixedSupportEligible && fill.quantity === 0)).toBe(true);
});

it('retains a high-face bar even when a lower remnant reaches the door', () => {
  const target = steppedDirectLoad();
  const plan = gapSecuringPlan({ ...target.container, length: 12 }, target.result.placements);
  const bars = plan.fills.filter(fill => fill.kind === 'door-face');
  expect(bars).toHaveLength(1);
  expect(bars[0].x).toBeCloseTo(11.76);
  expect(bars[0].z).toBeCloseTo(.225);
});

it('passes unchanged braking limits for all 3,089 cartons with stepped blocking', async () => {
  const target = steppedDirectLoad();
  const plan = gapSecuringPlan(target.container, target.result.placements);
  const result = await runInertiaAnimation(target.container, target.result.placements, 'braking', fixedGapSupports(plan), undefined,
    securingProfileForUsage('boxes', buildSecuringUsage(target, 3)), { captureFrames: false });
  expect(result.cargoCount).toBe(3089);
  expect(isInertiaStable(result)).toBe(true);
}, 120_000);
