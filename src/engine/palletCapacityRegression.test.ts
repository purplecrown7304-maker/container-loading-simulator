import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A',
  name: 'A',
  length: 1.1,
  width: 1.1,
  height: 0.4,
  weightKg: 20,
  quantity: 2,
  maxStackLayers: 1,
  allowRotation: false,
  ...overrides,
});

describe('pallet physical container capacity regression', () => {
  it('returns cargo to remaining instead of leaving overlapping pallets at the origin', () => {
    const container: ContainerSpec = { length: 1.1, width: 1.1, height: 1.2, maxPayloadKg: 5000 };
    const result = packOnPallets(
      container,
      [box()],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, maxStackLevels: 1 },
    );

    expect(result.palletCount).toBe(1);
    expect(result.placements).toHaveLength(1);
    expect(result.remaining.find((item) => item.cargoId === 'A')?.quantity).toBe(1);
    expect(result.pallets[0].x).toBeGreaterThanOrEqual(0);
    expect(result.pallets[0].x + result.pallets[0].length).toBeLessThanOrEqual(container.length + 1e-9);
    expect(result.pallets[0].y + result.pallets[0].width).toBeLessThanOrEqual(container.width + 1e-9);
  });

  it('does not report phantom stack levels when no pallet can fit the container footprint', () => {
    const result = packOnPallets(
      { length: 0.9, width: 0.9, height: 1.2, maxPayloadKg: 5000 },
      [box({ quantity: 1 })],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, maxStackLevels: 2 },
    );

    expect(result.palletCount).toBe(0);
    expect(result.placements).toHaveLength(0);
    expect(result.maxUsedStackLevel).toBe(0);
    expect(result.remaining.find((item) => item.cargoId === 'A')?.quantity).toBe(1);
  });
});
