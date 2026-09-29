import { expect, it } from 'vitest';
import { findPalletType, palletSpecForType } from './engine/palletCatalog';
import { defaultPalletSpec, packOnPallets } from './engine/palletPacking';
import { palletModelKey } from './palletModel';

it('carries catalog material into the saved specification and replaces previous material', () => {
  const plastic = palletSpecForType(findPalletType('t11-plastic')!);
  expect(palletModelKey(plastic)).toBe('plastic-pallet');
  expect(palletModelKey(palletSpecForType(findPalletType('t11-wood')!, plastic))).toBe('wood-pallet');
  expect(palletModelKey(defaultPalletSpec)).toBe('wood-pallet');
});

it('visual material alone does not change packing positions, weights, or remaining demand', () => {
  const container = { length: 2.4, width: 2.3, height: 2.4, maxPayloadKg: 1000 };
  const cargo = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 8 }];
  const original = packOnPallets(container, cargo, defaultPalletSpec);
  expect(packOnPallets(container, cargo, { ...defaultPalletSpec, material: 'plastic' })).toEqual(original);
});
