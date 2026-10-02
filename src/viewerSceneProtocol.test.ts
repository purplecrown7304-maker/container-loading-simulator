import { expect, it } from 'vitest';
import { viewerPlan } from './viewerSceneProtocol';
it('sends product, box code, contents and actual package weight for labels on every box face', () => {
  const container = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };
  const placement = { cargoId: 'A', x: 0, y: 0, z: 0, length: .5, width: .4, height: .3, weightKg: 12.5 };
  const plan = viewerPlan(container, { placements: [placement], remaining: [], usedVolumeM3: .06, loadedWeightKg: 12.5, validationIssues: [] }, 1, [{ id: 'A', name: '화물', productName: '정밀 부품', boxId: 'BOX-42', unitsPerPackage: 24 }]);
  expect(plan.placements[0]).toMatchObject({ labelTitle: '정밀 부품', labelCode: 'BOX-42', labelDetail: '24 EA · 12.5 kg', labelSize: '500 × 400 × 300 mm' });
});
it('preserves engine dimensions and coordinates without changing the loading plan', () => {
  const container = { length: 12, width: 2.3, height: 2.7, maxPayloadKg: 1000 };
  const placement = { cargoId: 'A', x: 4, y: .3, z: 1, length: .5, width: .4, height: .3, weightKg: 10, rotated: true };
  const result = { placements: [placement], remaining: [], usedVolumeM3: .06, loadedWeightKg: 10, validationIssues: [{ type: 'UNSUPPORTED' as const, message: 'support', placementIndexes: [0] }] };
  const before = JSON.stringify(result);
  const plan = viewerPlan(container, result, 7);
  expect(plan.placements[0]).toMatchObject({ ...placement, invalid: true });
  expect(plan.revision).toBe(7);
  expect(plan.container).toEqual({ length: 12, width: 2.3, height: 2.7 });
  expect(JSON.stringify(result)).toBe(before);
});

it('keeps pallet bases in their existing units without counting tare as cargo weight', () => {
  const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
  const support = { id: 'P1', x: 1, y: .5, z: 0, length: 1.2, width: 1, height: .15, weightKg: 25 };
  const placement = { cargoId: 'A', x: 1.1, y: .6, z: .15, length: .6, width: .4, height: .5, weightKg: 10 };
  const result = { placements: [placement], remaining: [], validationIssues: [], usedVolumeM3: .12, loadedWeightKg: 35 };
  const plan = viewerPlan(container, result, 3, [], { supports: [support], geometry: 'platform' });
  expect(plan.supports).toEqual([support]);
  expect(plan.geometry).toBe('platform');
  expect(plan.cells.reduce((sum, cell) => sum + cell.loadKg, 0)).toBeCloseTo(10);
  expect(plan.centerOfGravity.x).toBeCloseTo((1.4 * 10 + 1.6 * 25) / 35);
  expect(plan.centerOfGravity.y).toBeCloseTo((.8 * 10 + 1 * 25) / 35);
  expect(plan.centerOfGravity.z).toBeCloseTo((.4 * 10 + .075 * 25) / 35);
});
