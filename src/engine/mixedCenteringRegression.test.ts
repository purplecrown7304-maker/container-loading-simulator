import { describe, expect, it } from 'vitest';
import { centerLegacyMixedPlan } from './mixedPlanCentering';
import { packMixedMode } from './mixedModePacking';
import { defaultPalletSpec } from './palletOptimization';
import { palletSupportBodies } from './palletPlanValidation';
import { validateOperationalLoading, validateOperationalWeightAndCog } from './operationalValidator';
import type { PalletPackingResult } from './palletPacking';
import type { CargoItem, ContainerSpec, Placement } from './types';

const big: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, unloadingPolicy: 'strict', floorLoadLimitKgPerM2: 1500 };
const small: ContainerSpec = { length: 3.6, width: 2.2, height: 2.4, maxPayloadKg: 6000, unloadingPolicy: 'strict', floorLoadLimitKgPerM2: 1500 };
const pallet = { ...defaultPalletSpec, maxStackLevels: 1, maxLoadKg: 1000, maxStaticLoadKg: 1500 };
const box = (id: string, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: .4, width: .3, height: .25, weightKg: 5, quantity: 30,
  maxStackLayers: 6, maxTopLoadKg: 150, allowRotation: true, ...overrides,
});
const errors = (container: ContainerSpec, cargo: CargoItem[], result: PalletPackingResult) =>
  validateOperationalLoading(container, cargo, result.placements, palletSupportBodies(result)).filter(f => f.severity === 'error');

function rawTail() {
  const cargo = [box('TAIL', { length: .6, width: .6, height: .5, weightKg: 20, quantity: 6, maxStackLayers: 1, maxTopLoadKg: 0 })];
  const place = (x: number, y: number, z: number): Placement => ({ cargoId: 'TAIL', x, y, z, length: .6, width: .6, height: .5, weightKg: 20 });
  const cartons = [place(.6, .6, .15), place(.6, 1.2, .15), place(1.2, .6, .15), place(1.2, 1.2, .15)];
  const result: PalletPackingResult = {
    pallets: [{ palletIndex: 1, x: .6, y: .6, z: 0, stackLevel: 1, stackColumn: 1, length: 1.2, width: 1.2, height: .15,
      cargoPlacements: cartons, cargoWeightKg: 80, packagingWeightKg: 0, packagingExtraHeightM: 0,
      cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 105,
      centerOfGravity: { x: 1.2, y: 1.2, z: (80 * .4 + 25 * .075) / 105 } }],
    placements: [...cartons, place(0, 0, 0), place(0, .6, 0)], remaining: [], palletCount: 1,
    loadedCargoWeightKg: 120, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0, totalPalletizedWeightKg: 105, consolidatedPallets: 0,
    lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 1,
  };
  return { cargo, result, container: { ...small, length: 4.8, width: 2.4 } };
}

describe('legacy MIXED whole-plan CG correction', () => {
  it('moves pallet bases, pallet cartons, loose cartons and CG metadata by one tare-aware vector', () => {
    const { cargo, result, container } = rawTail();
    const original = structuredClone(result);
    expect(errors(container, cargo, result).map(f => f.code)).toEqual(['CG_LONGITUDINAL', 'CG_LATERAL']);
    const centered = centerLegacyMixedPlan(result, container, cargo);
    expect(errors(container, cargo, centered)).toEqual([]);
    expect(centered.placements).toHaveLength(6);
    expect(centered.palletCount).toBe(1);
    expect(centered.remaining).toEqual(result.remaining);
    const dx = centered.placements[0].x - result.placements[0].x;
    const dy = centered.placements[0].y - result.placements[0].y;
    for (let i = 0; i < result.placements.length; i++) {
      expect(centered.placements[i]).toEqual({ ...result.placements[i], x: result.placements[i].x + dx, y: result.placements[i].y + dy });
    }
    expect(centered.pallets[0]).toEqual({ ...result.pallets[0], x: result.pallets[0].x + dx, y: result.pallets[0].y + dy,
      cargoPlacements: centered.placements.slice(0, 4), centerOfGravity: { ...result.pallets[0].centerOfGravity,
        x: result.pallets[0].centerOfGravity.x + dx, y: result.pallets[0].centerOfGravity.y + dy } });
    const bodies = [...centered.placements, ...palletSupportBodies(centered).map(p => ({ ...p, cargoId: p.id }))];
    const mass = bodies.reduce((sum, p) => sum + p.weightKg, 0);
    expect(bodies.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weightKg, 0) / mass).toBeCloseTo(container.length / 2, 10);
    expect(bodies.reduce((sum, p) => sum + (p.y + p.width / 2) * p.weightKg, 0) / mass).toBeCloseTo(container.width / 2, 10);
    expect(validateOperationalWeightAndCog(container, bodies).filter(f => f.severity === 'error')).toEqual([]);
    expect(centerLegacyMixedPlan(result, container, cargo)).toEqual(centered);
    expect(result).toEqual(original);
  });

  it('fixes the sparse tail regression without demoting another pallet or losing direct cartons', () => {
    const { cargo, container } = rawTail();
    const result = packMixedMode(container, cargo, { ...pallet, length: 1.2, width: 1.2 });
    expect(result.placements).toHaveLength(6);
    expect(result.palletCount).toBe(1);
    expect(result.mixed.directBoxCount).toBe(2);
    expect(errors(container, cargo, result)).toEqual([]);
  });

  it('fixes the explicit pallet/direct regression with the original 16 palletized + 20 direct cartons', () => {
    const cargo = [box('PAL', { quantity: 16, mixedLoadingMethod: 'pallet' }), box('DIRECT', { quantity: 20, maxStackLayers: 2, mixedLoadingMethod: 'direct' })];
    const input = structuredClone(cargo);
    const result = packMixedMode(big, cargo, pallet);
    expect(result.placements).toHaveLength(36);
    // The 16 palletized cartons fill two complete mixed-orientation tiers of eight on
    // one base (LOADING_RULES 7A); the former 12 + 4 split needed a second pallet.
    expect(result.palletCount).toBe(1);
    expect(result.mixed.palletBoxCount).toBe(16);
    expect(result.mixed.directBoxCount).toBe(20);
    expect(errors(big, cargo, result)).toEqual([]);
    expect(packMixedMode(big, cargo, pallet)).toEqual(result);
    expect(cargo).toEqual(input);
  });

  it('corrects the strict-stop plan without errors once its palletized cartons share one base', () => {
    const cargo = [box('S1', { quantity: 10, unloadPriority: 1, mixedLoadingMethod: 'direct' }), box('S2', { quantity: 15, unloadPriority: 2, mixedLoadingMethod: 'pallet' })];
    const result = packMixedMode(big, cargo, pallet, 'unloading');
    expect(result.placements).toHaveLength(25);
    // Fifteen palletized cartons: one full tier of eight and seven above, on one base.
    expect(result.palletCount).toBe(1);
    expect(result.mixed.directBoxCount).toBe(10);
    // Two bases side by side pinned the full width and left a lateral CG error. One base
    // can be centred; uncorrectable CG errors stay visible in the payload-limited case below.
    expect(errors(big, cargo, result)).toEqual([]);
    expect(packMixedMode(big, cargo, pallet, 'unloading')).toEqual(result);
  });

  it('does not hide a payload-limited plan whose scattered cartons pin both vehicle axes', () => {
    const container = { ...small, maxPayloadKg: 240 };
    const cargo = [box('P', { quantity: 20, weightKg: 40 }), box('D', { quantity: 20, weightKg: 20, mixedLoadingMethod: 'direct' })];
    const result = packMixedMode(container, cargo, pallet);
    expect(result.placements).toHaveLength(12);
    expect(result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(28);
    expect(errors(container, cargo, result).map(f => f.code)).toEqual(['CG_LONGITUDINAL', 'CG_LATERAL']);
    expect(centerLegacyMixedPlan(result, container, cargo)).toBe(result);
  });

  it('keeps rejected invalid rows and a pinned lateral failure while correcting longitudinal position', () => {
    const cargo = [box('GOOD', { quantity: 4, mixedLoadingMethod: 'direct' }), box('BAD', { width: 0, quantity: 5, mixedLoadingMethod: 'direct' })];
    const result = packMixedMode(small, cargo, pallet);
    expect(result.placements).toHaveLength(4);
    expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'BAD', quantity: 5 })]);
    expect(errors(small, cargo, result).map(f => f.code)).toEqual(['CG_LATERAL']);
  });

  it('keeps floor overload blocking after a successful positional CG correction', () => {
    const { cargo, result, container } = rawTail();
    const constrained = { ...container, floorLoadLimitKgPerM2: 30 };
    const centered = centerLegacyMixedPlan(result, constrained, cargo);
    expect(centered.placements).toHaveLength(6);
    expect(errors(constrained, cargo, centered).map(f => f.code)).toEqual(['FLOOR_LOAD_LIMIT']);
  });

  it('does not touch independent A rules or numerical review plans', () => {
    const { cargo, result, container } = rawTail();
    expect(centerLegacyMixedPlan(result, { ...container, rules: { version: 'a-v1', equipmentId: 'QA', kind: 'container', access: ['rear'], source: 'test' } }, cargo)).toBe(result);
    expect(centerLegacyMixedPlan(result, { ...container, limitReview: { mode: 'what-if' } }, cargo)).toBe(result);
  });

  it('leaves an impossible group footprint unchanged rather than moving cargo through walls', () => {
    const { cargo, result, container } = rawTail();
    const impossible = { ...result, placements: [...result.placements, { ...result.placements[4], x: container.length }] };
    expect(centerLegacyMixedPlan(impossible, container, cargo)).toBe(impossible);
  });
});
