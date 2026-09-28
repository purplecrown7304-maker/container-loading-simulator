import { describe, expect, it } from 'vitest';
import { packMixedMode } from './mixedModePacking';
import { packOnPallets, type PalletSpec } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 4.8,
  width: 2.4,
  height: 2.4,
  maxPayloadKg: 10000,
};

const pallet: PalletSpec = {
  length: 1.2,
  width: 1.2,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
  maxStackLevels: 1,
  maxSupportedTopWeightKg: 1000,
  useCornerGuards: false,
  cornerGuardWeightKg: 0,
  cornerGuardExtraHeightM: 0,
  useWrapping: false,
  wrappingWeightKg: 0,
  wrappingExtraHeightM: 0,
  minimizePackaging: true,
};

function cargo(quantity: number): CargoItem[] {
  return [{
    id: 'A',
    name: 'A',
    length: 0.6,
    width: 0.6,
    height: 0.5,
    weightKg: 20,
    quantity,
    maxStackLayers: 1,
    maxTopLoadKg: 0,
    allowRotation: true,
  }];
}

describe('MIXED pallet + direct-box planner', () => {
  it('demotes a sparse tail pallet to loose boxes without losing loaded quantity', () => {
    const input = cargo(6);
    const palletOnly = packOnPallets(container, input, pallet, 'capacity');
    const mixed = packMixedMode(container, input, pallet, 'capacity', { minPalletFillRatio: 0.7 });

    expect(palletOnly.placements.length).toBe(6);
    expect(palletOnly.palletCount).toBe(2);
    expect(mixed.placements.length).toBe(6);
    expect(mixed.palletCount).toBeLessThan(palletOnly.palletCount);
    expect(mixed.mixed.directBoxCount).toBeGreaterThan(0);
    expect(mixed.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(0);
  });

  it('keeps loaded quantity ahead of pallet-count reduction', () => {
    const tight: ContainerSpec = { length: 1.2, width: 1.2, height: 2.4, maxPayloadKg: 10000 };
    const input = cargo(4);
    const mixed = packMixedMode(tight, input, pallet, 'capacity', { minPalletFillRatio: 0.99 });

    expect(mixed.placements.length).toBe(4);
    expect(mixed.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(0);
  });

  it('is deterministic for identical inputs', () => {
    const first = packMixedMode(container, cargo(6), pallet, 'stability', { minPalletFillRatio: 0.7 });
    const second = packMixedMode(container, cargo(6), pallet, 'stability', { minPalletFillRatio: 0.7 });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
