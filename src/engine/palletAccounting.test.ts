import { describe, expect, it } from 'vitest';
import { packOnPallets as packBase, defaultPalletSpec } from './palletPacking';
import { packOnPallets as packOptimized } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 1,
  width: 1,
  height: 2,
  maxPayloadKg: 1000,
};

const cargo: CargoItem[] = [{
  id: 'BOX-A',
  name: '회계 검증 박스',
  length: 0.5,
  width: 0.5,
  height: 0.5,
  weightKg: 10,
  quantity: 8,
  maxStackLayers: 1,
  allowRotation: true,
}];

const pallet = {
  ...defaultPalletSpec,
  length: 1,
  width: 1,
  maxLoadKg: 40,
  maxStackLevels: 1,
};

function expectAccounting(result: ReturnType<typeof packBase>) {
  expect(result.requestedPalletCount).toBe(result.loadedPalletCount + result.unloadedPalletCount);
  expect(result.palletCount).toBe(result.loadedPalletCount);
  expect(result.requestedBoxCount).toBe(result.loadedBoxCount + result.unloadedBoxCount);
  expect(result.loadedBoxCount).toBe(result.placements.length);
  expect(result.unloadedBoxCount).toBe(result.remaining.reduce((sum, item) => sum + item.quantity, 0));
}

describe('pallet accounting invariants', () => {
  it('keeps requested = loaded + unloaded for pallets and boxes in base packing', () => {
    const result = packBase(container, cargo, pallet);

    expectAccounting(result);
    expect(result.requestedPalletCount).toBe(2);
    expect(result.loadedPalletCount).toBe(1);
    expect(result.unloadedPalletCount).toBe(1);
    expect(result.requestedBoxCount).toBe(8);
    expect(result.loadedBoxCount).toBe(4);
    expect(result.unloadedBoxCount).toBe(4);
  });

  it('preserves the same accounting after pallet optimization', () => {
    const result = packOptimized(container, cargo, pallet);

    expectAccounting(result);
    expect(result.requestedPalletCount).toBe(result.loadedPalletCount + result.unloadedPalletCount);
    expect(result.requestedBoxCount).toBe(8);
  });

  it('counts rejected cargo as unloaded boxes without inventing pallets', () => {
    const invalidCargo: CargoItem[] = [{ ...cargo[0], quantity: 3, length: 0 }];
    const result = packOptimized(container, invalidCargo, pallet);

    expect(result.requestedPalletCount).toBe(0);
    expect(result.loadedPalletCount).toBe(0);
    expect(result.unloadedPalletCount).toBe(0);
    expect(result.requestedBoxCount).toBe(3);
    expect(result.loadedBoxCount).toBe(0);
    expect(result.unloadedBoxCount).toBe(3);
  });
});
