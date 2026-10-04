import { expect, it } from 'vitest';
import { centerPalletCargo } from './palletCentering';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';

it('never recenters or mutates an A-validated pallet layout', () => {
  const container = { length: 5, width: 2.4, height: 2.5, maxPayloadKg: 1000 };
  const result = packOnPallets(container, [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 10, quantity: 8 }], defaultPalletSpec);
  const before = structuredClone(result);
  expect(centerPalletCargo(result, container)).toBe(result);
  expect(result).toEqual(before);
});
