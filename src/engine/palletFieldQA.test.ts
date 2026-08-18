import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletPacking';
import type { CargoItem, ContainerSpec } from './types';

const fortyFoot: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

const cargo = (id: string, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id,
  name: id,
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 15,
  quantity: 30,
  maxStackLayers: 6,
  maxTopLoadKg: 500,
  allowRotation: true,
  ...overrides,
});

function palletTop(load: ReturnType<typeof packOnPallets>['pallets'][number]) {
  const cargoTop = Math.max(load.z + load.height, ...load.cargoPlacements.map((p) => p.z + p.height));
  return cargoTop + load.packagingExtraHeightM;
}

function assertInsideContainer(result: ReturnType<typeof packOnPallets>, container: ContainerSpec) {
  for (const load of result.pallets) {
    expect(load.x).toBeGreaterThanOrEqual(-1e-9);
    expect(load.y).toBeGreaterThanOrEqual(-1e-9);
    expect(load.z).toBeGreaterThanOrEqual(-1e-9);
    expect(load.x + load.length).toBeLessThanOrEqual(container.length + 1e-9);
    expect(load.y + load.width).toBeLessThanOrEqual(container.width + 1e-9);
    expect(palletTop(load)).toBeLessThanOrEqual(container.height + 1e-9);
  }
}

describe('pallet field QA', () => {
  it('handles a realistic multi-SKU pallet load without exceeding payload or stack levels', () => {
    const result = packOnPallets(
      fortyFoot,
      [
        cargo('HEAVY', { length: 0.6, width: 0.4, height: 0.35, weightKg: 28, quantity: 44, maxTopLoadKg: 800 }),
        cargo('MID', { length: 0.5, width: 0.35, height: 0.3, weightKg: 18, quantity: 60, maxTopLoadKg: 650 }),
        cargo('LIGHT', { length: 0.4, width: 0.3, height: 0.25, weightKg: 9, quantity: 80, maxTopLoadKg: 350 }),
      ],
      { ...defaultPalletSpec, maxStackLevels: 3, maxSupportedTopWeightKg: 1800, maxLoadKg: 1100 },
    );
    expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(fortyFoot.maxPayloadKg + 1e-9);
    expect(result.maxUsedStackLevel).toBeLessThanOrEqual(3);
    expect(result.palletCount).toBeGreaterThan(0);
    expect(result.placements.length).toBeGreaterThan(100);
    assertInsideContainer(result, fortyFoot);
  });

  it('does not stack pallets when lower boxes cannot support the accumulated upper weight', () => {
    const result = packOnPallets(
      { ...fortyFoot, length: 4.4, maxPayloadKg: 12000 },
      [cargo('FRAGILE', { quantity: 90, weightKg: 24, maxTopLoadKg: 30, maxStackLayers: 4 })],
      { ...defaultPalletSpec, maxStackLevels: 3, maxSupportedTopWeightKg: 5000, maxLoadKg: 900 },
    );
    expect(result.maxUsedStackLevel).toBe(1);
    expect(result.stackedPallets).toBe(0);
    assertInsideContainer(result, { ...fortyFoot, length: 4.4, maxPayloadKg: 12000 });
  });

  it('includes packaging weight and extra height when packaging is forced on every pallet', () => {
    const spec = {
      ...defaultPalletSpec,
      maxStackLevels: 1,
      useCornerGuards: true,
      cornerGuardWeightKg: 3,
      cornerGuardExtraHeightM: 0.04,
      useWrapping: true,
      wrappingWeightKg: 2,
      wrappingExtraHeightM: 0.02,
      minimizePackaging: false,
    };
    const result = packOnPallets(
      { ...fortyFoot, length: 4.4, maxPayloadKg: 8000 },
      [cargo('PACKED', { quantity: 50, height: 0.28 })],
      spec,
    );
    expect(result.palletCount).toBeGreaterThan(0);
    expect(result.packagedPalletCount).toBe(result.palletCount);
    expect(result.totalPackagingWeightKg).toBeCloseTo(result.palletCount * 5, 6);
    for (const load of result.pallets) expect(load.packagingExtraHeightM).toBeCloseTo(0.06, 6);
    assertInsideContainer(result, { ...fortyFoot, length: 4.4, maxPayloadKg: 8000 });
  });

  it('uses less packaging when minimum-packaging optimization is enabled', () => {
    const baseSpec = {
      ...defaultPalletSpec,
      maxStackLevels: 2,
      useCornerGuards: true,
      cornerGuardWeightKg: 2,
      useWrapping: true,
      wrappingWeightKg: 1.5,
      maxSupportedTopWeightKg: 1800,
    };
    const input = [
      cargo('A', { quantity: 16, height: 0.2, weightKg: 10 }),
      cargo('B', { quantity: 6, height: 0.18, weightKg: 8 }),
    ];
    const optimized = packOnPallets({ ...fortyFoot, length: 4.4 }, input, { ...baseSpec, minimizePackaging: true });
    const forced = packOnPallets({ ...fortyFoot, length: 4.4 }, input, { ...baseSpec, minimizePackaging: false });
    expect(optimized.totalPackagingWeightKg).toBeLessThanOrEqual(forced.totalPackagingWeightKg + 1e-9);
    expect(optimized.avoidedPackagingWeightKg).toBeGreaterThanOrEqual(0);
  });

  it('keeps left-right palletized weight reasonably balanced across multiple columns', () => {
    const result = packOnPallets(
      { ...fortyFoot, length: 8.8, maxPayloadKg: 18000 },
      [
        cargo('H1', { quantity: 50, weightKg: 32, maxTopLoadKg: 900 }),
        cargo('H2', { quantity: 46, weightKg: 27, maxTopLoadKg: 800 }),
        cargo('L1', { quantity: 70, weightKg: 10, maxTopLoadKg: 400 }),
      ],
      { ...defaultPalletSpec, maxStackLevels: 2, maxSupportedTopWeightKg: 1800, maxLoadKg: 1000 },
    );
    expect(result.palletCount).toBeGreaterThan(1);
    expect(result.lateralImbalanceKg).toBeLessThanOrEqual(Math.max(1000, result.totalPalletizedWeightKg * 0.35));
    assertInsideContainer(result, { ...fortyFoot, length: 8.8, maxPayloadKg: 18000 });
  });

  it('honors box rotation policy inside pallet loads under mixed dimensions', () => {
    const rotatable = packOnPallets(
      { length: 2.5, width: 1.1, height: 1.4, maxPayloadKg: 5000 },
      [cargo('ROT', { length: 0.7, width: 0.4, height: 0.3, quantity: 12, allowRotation: true })],
      { ...defaultPalletSpec, length: 1.25, width: 1.0, maxStackLevels: 1 },
    );
    const fixed = packOnPallets(
      { length: 2.5, width: 1.1, height: 1.4, maxPayloadKg: 5000 },
      [cargo('FIX', { length: 0.7, width: 0.4, height: 0.3, quantity: 12, allowRotation: false })],
      { ...defaultPalletSpec, length: 1.25, width: 1.0, maxStackLevels: 1 },
    );
    expect(rotatable.placements.some((p) => p.rotated)).toBe(true);
    expect(fixed.placements.every((p) => !p.rotated)).toBe(true);
  });
});
