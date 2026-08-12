import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 4.4,
  width: 2.2,
  height: 2.6,
  maxPayloadKg: 5000,
};

const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'BOX-A',
  name: 'BOX A',
  length: 0.6,
  width: 0.4,
  height: 0.4,
  weightKg: 20,
  quantity: 12,
  maxStackLayers: 4,
  maxTopLoadKg: 500,
  allowRotation: true,
  ...overrides,
});

describe('packOnPallets', () => {
  it('keeps palletized weight within the container payload', () => {
    const result = packOnPallets(
      { ...container, maxPayloadKg: 300 },
      [box({ quantity: 20, weightKg: 50 })],
      { ...defaultPalletSpec, tareWeightKg: 25, maxLoadKg: 1000 },
    );
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(300 + 1e-9);
  });

  it('never uses more than the configured pallet stack levels', () => {
    const result = packOnPallets(
      container,
      [box({ quantity: 36 })],
      { ...defaultPalletSpec, maxStackLevels: 2, maxSupportedTopWeightKg: 2000 },
    );
    expect(result.maxUsedStackLevel).toBeLessThanOrEqual(2);
  });

  it('can rotate boxes on a pallet when rotation increases capacity', () => {
    const result = packOnPallets(
      container,
      [box({ length: 0.7, width: 0.4, quantity: 4, allowRotation: true })],
      { ...defaultPalletSpec, length: 1.2, width: 1.0 },
    );
    expect(result.placements.some((p) => p.rotated)).toBe(true);
  });

  it('does not rotate boxes on a pallet when rotation is disabled', () => {
    const result = packOnPallets(
      container,
      [box({ length: 0.7, width: 0.4, quantity: 4, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.2, width: 1.0 },
    );
    expect(result.placements.every((p) => !p.rotated)).toBe(true);
  });
});
