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

  it('reserves enabled packaging weight before accepting cargo', () => {
    const result = packOnPallets(
      { length: 1.1, width: 1.1, height: 1.2, maxPayloadKg: 100 },
      [box({ length: 1.1, width: 1.1, height: 0.4, quantity: 1, weightKg: 70, maxStackLayers: 1, allowRotation: false })],
      {
        ...defaultPalletSpec,
        length: 1.1,
        width: 1.1,
        height: 0.15,
        tareWeightKg: 25,
        maxStackLevels: 2,
        useCornerGuards: true,
        cornerGuardWeightKg: 10,
        useWrapping: false,
        minimizePackaging: true,
      },
    );
    expect(result.placements).toHaveLength(0);
    expect(result.remaining[0]?.quantity).toBe(1);
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(100 + 1e-9);
  });

  it('prioritizes heavier cargo before lighter input rows when payload is tight', () => {
    const result = packOnPallets(
      { length: 2.2, width: 1.1, height: 1.2, maxPayloadKg: 100 },
      [
        box({ id: 'LIGHT', name: 'LIGHT', length: 1.1, width: 1.1, height: 0.4, quantity: 1, weightKg: 10, maxStackLayers: 1, allowRotation: false }),
        box({ id: 'HEAVY', name: 'HEAVY', length: 1.1, width: 1.1, height: 0.4, quantity: 1, weightKg: 70, maxStackLayers: 1, allowRotation: false }),
      ],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 25, maxStackLevels: 1 },
    );
    expect(result.placements.map((placement) => placement.cargoId)).toEqual(['HEAVY']);
    expect(result.remaining.find((item) => item.cargoId === 'LIGHT')?.quantity).toBe(1);
  });

  it('prioritizes the heavier total pallet group even when its unit boxes are lighter', () => {
    const result = packOnPallets(
      { length: 2, width: 1, height: 1.2, maxPayloadKg: 100 },
      [
        box({ id: 'HEAVY_UNIT', name: 'HEAVY UNIT', length: 1, width: 1, height: 0.4, quantity: 1, weightKg: 50, maxStackLayers: 1, allowRotation: false }),
        box({ id: 'HEAVIER_GROUP', name: 'HEAVIER GROUP', length: 0.5, width: 1, height: 0.4, quantity: 2, weightKg: 30, maxStackLayers: 1, allowRotation: false }),
      ],
      { ...defaultPalletSpec, length: 1, width: 1, height: 0.15, tareWeightKg: 25, maxStackLevels: 1 },
    );
    expect(result.placements).toHaveLength(2);
    expect(result.placements.every((placement) => placement.cargoId === 'HEAVIER_GROUP')).toBe(true);
    expect(result.remaining.find((item) => item.cargoId === 'HEAVY_UNIT')?.quantity).toBe(1);
  });

  it('keeps primary pallets single-SKU when a lower-priority pallet cannot be fully consolidated', () => {
    const result = packOnPallets(
      { length: 2.2, width: 1.1, height: 1.2, maxPayloadKg: 5000 },
      [
        box({ id: 'A', name: 'A', length: 0.5, width: 1.0, height: 0.4, quantity: 1, weightKg: 30, maxStackLayers: 1, allowRotation: false }),
        box({ id: 'B', name: 'B', length: 0.5, width: 1.0, height: 0.4, quantity: 2, weightKg: 20, maxStackLayers: 1, allowRotation: false }),
      ],
      { ...defaultPalletSpec, length: 1.0, width: 1.0, height: 0.15, maxStackLevels: 1 },
    );
    expect(result.palletCount).toBe(2);
    expect(result.pallets.every((pallet) => new Set(pallet.cargoPlacements.map((placement) => placement.cargoId)).size === 1)).toBe(true);
  });

  it('uses mixed loading only as a final consolidation fallback when the whole remainder fits', () => {
    const result = packOnPallets(
      { length: 2.0, width: 1.0, height: 1.2, maxPayloadKg: 5000 },
      [
        box({ id: 'A', name: 'A', length: 0.5, width: 1.0, height: 0.4, quantity: 1, weightKg: 30, maxStackLayers: 1, allowRotation: false }),
        box({ id: 'B', name: 'B', length: 0.5, width: 1.0, height: 0.4, quantity: 1, weightKg: 20, maxStackLayers: 1, allowRotation: false }),
      ],
      { ...defaultPalletSpec, length: 1.0, width: 1.0, height: 0.15, maxStackLevels: 1 },
    );
    expect(result.palletCount).toBe(1);
    expect(new Set(result.pallets[0].cargoPlacements.map((placement) => placement.cargoId))).toEqual(new Set(['A', 'B']));
    expect(result.consolidatedPallets).toBeGreaterThan(0);
  });

  it('centers the occupied cargo footprint on each pallet', () => {
    const result = packOnPallets(
      { length: 1.1, width: 1.1, height: 1.2, maxPayloadKg: 5000 },
      [box({ id: 'CENTER', name: 'CENTER', length: 0.4, width: 0.4, height: 0.4, quantity: 1, weightKg: 20, maxStackLayers: 1, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.15, maxStackLevels: 1 },
    );
    const pallet = result.pallets[0];
    const minX = Math.min(...pallet.cargoPlacements.map((p) => p.x));
    const maxX = Math.max(...pallet.cargoPlacements.map((p) => p.x + p.length));
    const minY = Math.min(...pallet.cargoPlacements.map((p) => p.y));
    const maxY = Math.max(...pallet.cargoPlacements.map((p) => p.y + p.width));
    expect((minX + maxX) / 2).toBeCloseTo(pallet.x + pallet.length / 2, 6);
    expect((minY + maxY) / 2).toBeCloseTo(pallet.y + pallet.width / 2, 6);
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
      { ...defaultPalletSpec, length: 1.25, width: 1.0 },
    );
    expect(result.placements.some((p) => p.rotated)).toBe(true);
  });

  it('does not rotate boxes on a pallet when rotation is disabled', () => {
    const result = packOnPallets(
      container,
      [box({ length: 0.7, width: 0.4, quantity: 4, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.25, width: 1.0 },
    );
    expect(result.placements.every((p) => !p.rotated)).toBe(true);
  });

  it('uses all exact-fit decimal pallet slots', () => {
    const result = packOnPallets(
      { length: 1.2, width: 0.9, height: 0.75, maxPayloadKg: 5000 },
      [box({ length: 0.4, width: 0.3, height: 0.3, quantity: 18, maxStackLayers: 2, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.2, width: 0.9, height: 0.15, maxStackLevels: 1 },
    );
    expect(result.placements).toHaveLength(18);
    expect(result.remaining).toHaveLength(0);
  });

  it('does not place a large box on a tiny supporting box', () => {
    const result = packOnPallets(
      { length: 2.2, width: 1.1, height: 2.0, maxPayloadKg: 5000 },
      [
        box({ id: 'SMALL', name: 'SMALL', length: 0.4, width: 0.4, height: 0.4, weightKg: 50, quantity: 1, allowRotation: false }),
        box({ id: 'LARGE', name: 'LARGE', length: 0.8, width: 0.8, height: 0.4, weightKg: 10, quantity: 1, allowRotation: false }),
      ],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.15, maxStackLevels: 1 },
    );
    expect(result.palletCount).toBe(2);
    const large = result.placements.find((placement) => placement.cargoId === 'LARGE');
    expect(large?.z).toBeCloseTo(0.15, 5);
  });

  it('does not block pallet stacking only because maxTopLoadKg is unspecified', () => {
    const result = packOnPallets(
      { length: 1.1, width: 1.1, height: 2.6, maxPayloadKg: 5000 },
      [box({ length: 0.55, width: 0.55, height: 0.45, quantity: 16, weightKg: 10, maxStackLayers: 2, maxTopLoadKg: undefined, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.15, maxLoadKg: 100, maxStackLevels: 2, maxSupportedTopWeightKg: 1000 },
    );
    expect(result.palletCount).toBeGreaterThan(1);
    expect(result.maxUsedStackLevel).toBe(2);
    expect(result.stackedPallets).toBeGreaterThan(0);
  });

  it('still blocks pallet stacking when a configured top-load limit is too low', () => {
    const result = packOnPallets(
      { length: 1.1, width: 1.1, height: 2.6, maxPayloadKg: 5000 },
      [box({ length: 0.55, width: 0.55, height: 0.45, quantity: 16, weightKg: 10, maxStackLayers: 2, maxTopLoadKg: 1, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.15, maxLoadKg: 100, maxStackLevels: 2, maxSupportedTopWeightKg: 1000 },
    );
    expect(result.palletCount).toBeGreaterThan(1);
    expect(result.maxUsedStackLevel).toBe(1);
    expect(result.stackedPallets).toBe(0);
  });
});
