import { expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';

const cargo = [{ id: 'A', name: 'A', length: .5, width: 1, height: .4, weightKg: 30, quantity: 1, maxStackLayers: 1 }, { id: 'B', name: 'B', length: .5, width: 1, height: .4, weightKg: 20, quantity: 1, maxStackLayers: 1 }];
const pallet = { ...defaultPalletSpec, length: 1, width: 1, tareWeightKg: 25, useCornerGuards: true, cornerGuardWeightKg: 10 };
it('keeps an overweight rigid pallet waiting as a unit without deleting a child to fit', () => {
  const result = packOnPallets({ length: 2.2, width: 1.2, height: 1.2, maxPayloadKg: 84 }, cargo, pallet);
  expect(result.palletCount).toBe(0);
  expect(result.remaining.reduce((sum, p) => sum + p.quantity, 0)).toBe(2);
});
it('counts cargo, base and actual packaging exactly once at the A payload limit', () => {
  const result = packOnPallets({ length: 2.2, width: 1.2, height: 1.2, maxPayloadKg: 85 }, cargo, pallet);
  expect(result.placements).toHaveLength(2);
  expect(result.totalPalletizedWeightKg).toBe(85);
  expect(result.ruleEngineInput?.placements.reduce((sum, p) => sum + p.weightKg, 0)).toBe(85);
});
