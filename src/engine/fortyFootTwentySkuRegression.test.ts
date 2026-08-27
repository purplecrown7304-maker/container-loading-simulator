import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec, Placement } from './types';

const fortyFt: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
};

const cargo: CargoItem[] = Array.from({ length: 20 }, (_, index) => ({
  id: `SKU-${String(index + 1).padStart(2, '0')}`,
  name: `Field SKU ${index + 1}`,
  length: 0.32 + (index % 4) * 0.055,
  width: 0.27 + (index % 3) * 0.045,
  height: 0.21 + (index % 5) * 0.028,
  weightKg: 8 + index * 1.7,
  quantity: 4 + (index % 6),
  maxStackLayers: 3 + (index % 5),
  maxTopLoadKg: 110 + index * 16,
  allowRotation: true,
}));

function signature(placements: Placement[]) {
  return placements
    .map((p) => [
      p.cargoId,
      p.x.toFixed(6),
      p.y.toFixed(6),
      p.z.toFixed(6),
      p.length.toFixed(6),
      p.width.toFixed(6),
      p.height.toFixed(6),
    ].join(':'))
    .sort();
}

function assertInside(placements: Placement[]) {
  for (const p of placements) {
    expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    expect(p.y).toBeGreaterThanOrEqual(-1e-9);
    expect(p.z).toBeGreaterThanOrEqual(-1e-9);
    expect(p.x + p.length).toBeLessThanOrEqual(fortyFt.length + 1e-9);
    expect(p.y + p.width).toBeLessThanOrEqual(fortyFt.width + 1e-9);
    expect(p.z + p.height).toBeLessThanOrEqual(fortyFt.height + 1e-9);
  }
}

describe('40ft twenty-SKU deterministic stress regression', () => {
  it('keeps DIRECT BOX safe and input-order independent across 20 SKUs', () => {
    const forward = loadContainer(fortyFt, cargo, { strategy: 'capacity', publish: false });
    const reversed = loadContainer(fortyFt, [...cargo].reverse(), { strategy: 'capacity', publish: false });

    expect(forward.validationIssues).toEqual([]);
    expect(reversed.validationIssues).toEqual([]);
    expect(forward.loadedWeightKg).toBeLessThanOrEqual(fortyFt.maxPayloadKg + 1e-9);
    expect(signature(forward.placements)).toEqual(signature(reversed.placements));
    expect(forward.remaining).toEqual(reversed.remaining);
    expect(forward.placements.length).toBeGreaterThan(80);
    assertInside(forward.placements);
  }, 15000);

  it('keeps PALLET optimization safe and input-order independent across 20 SKUs', () => {
    const spec = {
      ...defaultPalletSpec,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      tareWeightKg: 25,
      maxLoadKg: 900,
      maxStackLevels: 3,
      maxSupportedTopWeightKg: 900,
      useCornerGuards: true,
      useWrapping: true,
      minimizePackaging: true,
    };
    const forward = packOnPallets(fortyFt, cargo, spec);
    const reversed = packOnPallets(fortyFt, [...cargo].reverse(), spec);

    expect(forward.totalPalletizedWeightKg).toBeLessThanOrEqual(fortyFt.maxPayloadKg + 1e-9);
    expect(reversed.totalPalletizedWeightKg).toBeLessThanOrEqual(fortyFt.maxPayloadKg + 1e-9);
    expect(signature(forward.placements)).toEqual(signature(reversed.placements));
    expect(forward.remaining).toEqual(reversed.remaining);
    expect(forward.palletCount).toBe(reversed.palletCount);
    expect(forward.placements.length).toBeGreaterThan(50);
    assertInside(forward.placements);
    for (const pallet of forward.pallets) {
      expect(pallet.x).toBeGreaterThanOrEqual(-1e-9);
      expect(pallet.y).toBeGreaterThanOrEqual(-1e-9);
      expect(pallet.x + pallet.length).toBeLessThanOrEqual(fortyFt.length + 1e-9);
      expect(pallet.y + pallet.width).toBeLessThanOrEqual(fortyFt.width + 1e-9);
      expect(pallet.stackLevel).toBeLessThanOrEqual(spec.maxStackLevels);
    }
  }, 20000);
});
