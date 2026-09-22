import { expect, it } from 'vitest';
import { unityPlan, unityFrame } from './unityProtocol';
it('preserves engine dimensions and coordinates without changing the loading plan', () => {
  const container = { length: 12, width: 2.3, height: 2.7, maxPayloadKg: 1000 };
  const placement = { cargoId: 'A', x: 4, y: .3, z: 1, length: .5, width: .4, height: .3, weightKg: 10, rotated: true };
  const result = { placements: [placement], remaining: [], usedVolumeM3: .06, loadedWeightKg: 10, validationIssues: [{ type: 'UNSUPPORTED' as const, message: 'support', placementIndexes: [0] }] };
  const before = JSON.stringify(result);
  const plan = unityPlan(container, result, 7);
  expect(plan.placements[0]).toMatchObject({ ...placement, invalid: true });
  expect(plan.revision).toBe(7);
  expect(plan.container).toEqual({ length: 12, width: 2.3, height: 2.7 });
  expect(JSON.stringify(result)).toBe(before);
});

it('keeps pallet bases and rotated physics poses in their existing units without counting tare as cargo weight', () => {
  const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
  const support = { id: 'P1', x: 1, y: .5, z: 0, length: 1.2, width: 1, height: .15, weightKg: 25 };
  const placement = { cargoId: 'A', x: 1.1, y: .6, z: .15, length: .6, width: .4, height: .5, weightKg: 10 };
  const result = { placements: [placement], remaining: [], validationIssues: [], usedVolumeM3: .12, loadedWeightKg: 35 };
  const plan = unityPlan(container, result, 3, [], { supports: [support], geometry: 'platform' });
  expect(plan.supports).toEqual([support]);
  expect(plan.geometry).toBe('platform');
  expect(plan.cells.reduce((sum, cell) => sum + cell.loadKg, 0)).toBeCloseTo(10);
  const frame = { cargo: new Float32Array([-1.6, .4, -.4, Math.SQRT1_2, 0, 0, Math.SQRT1_2]), supports: new Float32Array([-1.4, .075, -.2, 0, 0, 0, 1]), phase: 'force' as const, step: 72 };
  const transformed = unityFrame(frame, plan.revision, 1, 1)!;
  expect(transformed.revision).toBe(3);
  expect(transformed.cargo).toEqual(Array.from(frame.cargo));
  expect(transformed.supports).toEqual(Array.from(frame.supports));
  expect(unityFrame(frame, 4, 2, 1)).toBeNull();
  frame.supports[0] = NaN;
  expect(unityFrame(frame, 4, 1, 1)).toBeNull();
});
