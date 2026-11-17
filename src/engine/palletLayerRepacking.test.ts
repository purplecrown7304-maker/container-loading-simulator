import { describe, expect, it } from 'vitest';
import { validatePlacements } from './constraints';
import { flattenPalletLayers } from './palletLayerRepacking';
import { buildPalletLoadFromDeckPlacements, defaultPalletSpec, palletTopLayerFill, type PalletPackingResult } from './palletPacking';
import { centerPalletPlan } from './palletCentering';
import { palletSupportBodies } from './palletPlanValidation';
import { validateOperationalLoading } from './operationalValidator';
import { packMixedMode } from './mixedModePacking';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 6, width: 2.35, height: 2.7, maxPayloadKg: 28600, ceilingClearanceM: .05 };
const spec = { ...defaultPalletSpec, height: .12, tareWeightKg: 6, maxLoadKg: 1000, maxStaticLoadKg: 1000 };
const cargo: CargoItem[] = [
  { id: 'FULL', name: 'Full', length: .235, width: .13, height: .265, weightKg: 1.42, quantity: 287,
    unitsPerPackage: 41, maxTopLoadKg: 34.3, maxStackLayers: 6, allowRotation: true },
  { id: 'TAIL', name: 'Tail', length: .235, width: .13, height: .265, weightKg: 1.02, quantity: 1,
    unitsPerPackage: 21, maxTopLoadKg: 34.3, maxStackLayers: 6, allowRotation: true },
];

function fixture(counts = [192, 96]): PalletPackingResult {
  let ordinal = 0;
  const total = counts.reduce((sum, count) => sum + count, 0);
  const pallets = counts.map((count, index) => {
    const local: Placement[] = Array.from({ length: count }, (_, n) => {
      const item = ordinal === total - 1 ? cargo[1] : cargo[0];
      return { cargoId: item.id, unitId: `unit-${ordinal++}`, x: Math.floor((n % 32) / 8) * item.length,
        y: (n % 8) * item.width, z: Math.floor(n / 32) * item.height,
        length: item.length, width: item.width, height: item.height, weightKg: item.weightKg };
    });
    const load = buildPalletLoadFromDeckPlacements(index + 1, local, spec);
    const x = 2.45, y = .075 + index * 1.1;
    return { ...load, x, y, stackColumn: 10 + index,
      bandingPlan: { straps: 4, securingLevel: 3 as const, wrapping: true },
      cargoPlacements: load.cargoPlacements.map(p => ({ ...p, x: p.x + x, y: p.y + y })),
      centerOfGravity: { ...load.centerOfGravity, x: load.centerOfGravity.x + x, y: load.centerOfGravity.y + y } };
  });
  return { pallets, placements: pallets.flatMap(load => load.cargoPlacements), remaining: [], palletCount: pallets.length,
    loadedCargoWeightKg: pallets.reduce((sum, load) => sum + load.cargoWeightKg, 0), totalPackagingWeightKg: 0,
    totalPalletizedWeightKg: pallets.reduce((sum, load) => sum + load.totalWeightKg, 0), avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0, consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1 };
}

function maxTiers(result: PalletPackingResult) {
  return Math.max(...result.pallets.map(load => new Set(load.cargoPlacements.map(p => Math.round(p.z * 1e6))).size));
}

describe('homogeneous pallet layer flattening', () => {
  it('uses rotated strips to lower the frozen shipment on the same bases, with complete validation', () => {
    const input = fixture(), before = structuredClone(input);
    const result = flattenPalletLayers(input, container, cargo, spec);
    expect(result).not.toBe(input);
    expect(input).toEqual(before);
    expect(result.palletCount).toBe(2);
    expect(result.placements).toHaveLength(288);
    expect(result.pallets.map(load => load.cargoPlacements.length)).toEqual([144, 144]);
    expect(maxTiers(input)).toBe(6);
    expect(maxTiers(result)).toBe(4);
    expect(result.pallets.every(load => palletTopLayerFill(load) >= .5)).toBe(true);
    expect(result.placements.some(p => p.rotated)).toBe(true);
    expect(result.placements.filter(p => p.cargoId === 'TAIL')).toHaveLength(1);
    expect(result.placements.map(p => p.unitId).sort()).toEqual(input.placements.map(p => p.unitId).sort());
    expect(result.pallets.map(load => [load.x, load.y, load.z, load.palletIndex, load.stackColumn, load.bandingPlan]))
      .toEqual(input.pallets.map(load => [load.x, load.y, load.z, load.palletIndex, load.stackColumn, load.bandingPlan]));
    const centered = centerPalletPlan(result, container);
    expect(validatePlacements(container, centered.placements)).toEqual([]);
    expect(validateOperationalLoading(container, cargo, centered.placements, palletSupportBodies(centered)).filter(f => f.severity === 'error')).toEqual([]);
    expect(flattenPalletLayers(input, container, cargo, spec)).toEqual(result);
    expect(flattenPalletLayers(result, container, cargo, spec)).toBe(result);
  });

  it('keeps lighter residual cartons above heavier cartons and preserves waiting quantities', () => {
    const input = fixture();
    input.remaining = [{ cargoId: 'FULL', quantity: 12, reason: 'capacity' }];
    const rows = [{ ...cargo[0], quantity: 299 }, cargo[1]];
    const result = flattenPalletLayers(input, container, rows, spec);
    expect(result).not.toBe(input);
    expect(result.remaining).toBe(input.remaining);
    const tail = result.placements.find(p => p.cargoId === 'TAIL')!;
    expect(tail.z).toBeCloseTo(spec.height + .265 * 3);
    expect(result.loadedCargoWeightKg).toBeCloseTo(input.loadedCargoWeightKg);
  });

  it('recombines a terminal tail only when every rebuilt regular top still meets rule 97', () => {
    const input = fixture([224, 8]);
    input.pallets[1].isMixedTail = true;
    const rows = [{ ...cargo[0], quantity: 231, maxStackLayers: 8 }, { ...cargo[1], maxStackLayers: 8 }];
    const result = flattenPalletLayers(input, container, rows, spec);
    expect(result).not.toBe(input);
    expect(result.pallets.map(load => load.cargoPlacements.length)).toEqual([116, 116]);
    expect(result.pallets.map(load => load.isMixedTail)).toEqual([undefined, true]);
    expect(result.pallets.every(load => palletTopLayerFill(load) >= .5)).toBe(true);
    expect(maxTiers(result)).toBe(4);
  });

  it('keeps a sparse final tail when balanced repacking cannot preserve the regular top minimum', () => {
    const input = fixture([224, 1]);
    input.pallets[1].isMixedTail = true;
    const rows = [{ ...cargo[0], quantity: 224, maxStackLayers: 8 }, { ...cargo[1], maxStackLayers: 8 }];
    expect(flattenPalletLayers(input, container, rows, spec)).toBe(input);
    input.pallets[0].isMixedTail = true;
    expect(flattenPalletLayers(input, container, rows, spec)).toBe(input);
  });

  it.each([
    ['rotation disabled', (rows: CargoItem[]) => rows.map(row => ({ ...row, allowRotation: false }))],
    ['one-layer limit', (rows: CargoItem[]) => rows.map(row => ({ ...row, maxStackLayers: 1 }))],
    ['declared layer depth', (rows: CargoItem[]) => rows.map(row => ({ ...row, maxStackLayers: 3 }))],
    ['unverified strength', (rows: CargoItem[]) => rows.map(row => ({ ...row, strengthUnverified: true }))],
    ['cumulative top load', (rows: CargoItem[]) => rows.map(row => ({ ...row, maxTopLoadKg: 2 }))],
    ['top pressure', (rows: CargoItem[]) => rows.map(row => ({ ...row, maxTopPressureKgPerM2: 1 }))],
    ['multiple unload stops', (rows: CargoItem[]) => rows.map((row, index) => ({ ...row, unloadPriority: index + 1 }))],
    ['different geometry', (rows: CargoItem[]) => rows.map((row, index) => ({ ...row, length: row.length + index * .01 }))],
    ['restricted orientation', (rows: CargoItem[]) => rows.map(row => ({ ...row, allowedOrientations: ['LWH'] as CargoItem['allowedOrientations'] }))],
  ] as const)('does not bypass %s', (_, alter) => {
    const input = fixture();
    expect(flattenPalletLayers(input, container, alter(cargo), spec)).toBe(input);
  });

  it('does not bypass pallet load, payload, static load, ceiling or regular top-fill limits', () => {
    const input = fixture();
    expect(flattenPalletLayers(input, container, cargo, { ...spec, maxLoadKg: 100 })).toBe(input);
    expect(flattenPalletLayers(input, container, cargo, { ...spec, maxStaticLoadKg: 100 })).toBe(input);
    expect(flattenPalletLayers(input, container, cargo, { ...spec, maxStaticLoadKg: 205, minimizePackaging: false,
      useWrapping: true, useCornerGuards: true })).toBe(input);
    expect(flattenPalletLayers(input, { ...container, maxPayloadKg: 100 }, cargo, spec)).toBe(input);
    expect(flattenPalletLayers(input, { ...container, height: .9 }, cargo, spec)).toBe(input);
    expect(flattenPalletLayers(input, container, cargo, { ...spec, minTopLayerFillRatio: .99 })).toBe(input);
  });

  it('leaves stacked pallets and A rules outside this postpass', () => {
    const input = fixture();
    const aContainer: ContainerSpec = { ...container, rules: { version: 'a-v1', equipmentId: 'test', kind: 'container', access: ['rear'], source: 'test' } };
    expect(flattenPalletLayers(input, aContainer, cargo, spec)).toBe(input);
    input.pallets[0].stackLevel = 2;
    expect(flattenPalletLayers(input, container, cargo, spec)).toBe(input);
  });

  it('keeps protected mixed-mode cargo palletized while retaining explicit loose cartons', () => {
    const rows: CargoItem[] = [
      ...cargo.map(item => ({ ...item, mixedLoadingMethod: 'pallet' as const })),
      { id: 'DIRECT', name: 'Direct', length: .2, width: .2, height: .2, weightKg: .1,
        quantity: 4, maxStackLayers: 1, maxTopLoadKg: 0, mixedLoadingMethod: 'direct' },
    ];
    const result = packMixedMode(container, rows, spec, 'capacity');
    expect(result.placements).toHaveLength(292);
    expect(result.remaining).toEqual([]);
    expect(result.pallets.flatMap(load => load.cargoPlacements).filter(p => p.cargoId !== 'DIRECT')).toHaveLength(288);
    expect(result.mixed.directBoxCount).toBe(4);
    expect(result.mixed.demotedPalletCount).toBe(0);
    expect(validatePlacements(container, result.placements)).toEqual([]);
    expect(validateOperationalLoading(container, rows, result.placements, palletSupportBodies(result)).filter(f => f.severity === 'error')).toEqual([]);
  }, 30_000);
});
