import { describe, expect, it } from 'vitest';
import { runInertiaAnimation } from './inertiaSimulation';
import { fixedGapSupports, gapSecuringPlan, type GapFillKind } from './gapSecuring';
import { isInertiaStable } from '../inertiaCertification';
import type { ContainerSpec, Placement } from './types';
import type { PhysicsScenario } from './physicsValidation';

const lowFriction = { frictionCoefficient: 0.10 };
const options = { captureFrames: false as const };

const box = (
  cargoId: string,
  x: number,
  y: number,
  length: number,
  width: number,
  height = 0.8,
): Placement => ({
  cargoId,
  x,
  y,
  z: 0,
  length,
  width,
  height,
  weightKg: 120,
});

async function expectActualFillBlocksMotion(
  container: ContainerSpec,
  placements: Placement[],
  scenario: PhysicsScenario,
  expectedKind: GapFillKind,
) {
  const plan = gapSecuringPlan(container, placements);
  const expectedFill = plan.fills.find(fill => fill.kind === expectedKind);
  expect(expectedFill).toBeDefined();
  expect(expectedFill?.fixedSupportEligible).toBe(true);

  const supports = fixedGapSupports(plan);
  expect(supports.some(support => support.id === expectedFill!.id)).toBe(true);

  const withoutFill = await runInertiaAnimation(
    container,
    placements,
    scenario,
    [],
    undefined,
    lowFriction,
    options,
  );
  const withFill = await runInertiaAnimation(
    container,
    placements,
    scenario,
    supports,
    undefined,
    lowFriction,
    options,
  );

  console.info('GAP_FILL_INERTIA', {
    kind: expectedKind,
    scenario,
    withoutFill: { shiftM: withoutFill.maxHorizontalShiftM, tiltDeg: withoutFill.maxTiltDeg },
    withFill: { shiftM: withFill.maxHorizontalShiftM, tiltDeg: withFill.maxTiltDeg },
  });
  expect(isInertiaStable(withoutFill)).toBe(false);
  expect(isInertiaStable(withFill)).toBe(true);
  expect(withFill.maxHorizontalShiftM).toBeLessThanOrEqual(0.012);
  expect(withFill.maxTiltDeg).toBeLessThanOrEqual(1.8);
}

describe('actual gap-fill inertia regressions', () => {
  it('uses the computed door-face load bar to arrest braking motion', async () => {
    const container: ContainerSpec = {
      length: 4,
      width: 2.35,
      height: 2,
      maxPayloadKg: 2000,
    };
    const placements = [box('DOOR', 0, 0, 0.6, 2.35)];

    await expectActualFillBlocksMotion(container, placements, 'braking', 'door-face');
  }, 30_000);

  it('uses the computed side-gap air bag to arrest cornering motion', async () => {
    const container: ContainerSpec = {
      length: 0.6,
      width: 2.35,
      height: 2,
      maxPayloadKg: 2000,
    };
    const placements = [box('SIDE', 0, 0, 0.6, 1.95)];

    await expectActualFillBlocksMotion(container, placements, 'cornering', 'side-gap');
  }, 30_000);

  it('never treats an out-of-range gap as a fixed filled support', () => {
    const container: ContainerSpec = {
      length: 0.6,
      width: 2.35,
      height: 2,
      maxPayloadKg: 2000,
    };
    const placements = [box('OUT-OF-RANGE', 0, 0, 0.6, 1.75)];
    const plan = gapSecuringPlan(container, placements);
    const sideGap = plan.fills.find(fill => fill.kind === 'side-gap');
    expect(sideGap).toBeDefined();
    expect(sideGap?.material).toBe('unresolved');
    expect(sideGap?.fixedSupportEligible).toBe(false);
    expect(fixedGapSupports(plan).some(support => support.id === sideGap!.id)).toBe(false);
  });

  it('uses the computed in-row air bag while the far-side cargo remains wall-blocked', async () => {
    const container: ContainerSpec = {
      length: 0.6,
      width: 2.35,
      height: 2,
      maxPayloadKg: 2000,
    };
    const placements = [
      box('ROW-LEFT', 0, 0, 0.6, 0.8),
      box('ROW-RIGHT', 0, 1.2, 0.6, 1.15),
    ];

    await expectActualFillBlocksMotion(container, placements, 'cornering', 'row-gap');
  }, 30_000);
});
