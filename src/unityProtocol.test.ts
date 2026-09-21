import { expect, it } from 'vitest';
import { unityPlan } from './unityProtocol';
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
