import { describe, expect, it } from 'vitest';
import { validatePlacements } from './constraints';
import { buildPalletAdaptiveCandidates } from './palletAdaptiveSearch';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const spec = { ...defaultPalletSpec, length: 1, width: 1, maxStackLevels: 2 };
const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.4, weightKg: 10,
  quantity: 16, maxStackLayers: 6, maxTopLoadKg: 100, allowRotation: false, ...overrides,
});

function expectSafe(result: ReturnType<typeof packOnPallets>, cargo: CargoItem[]) {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  expect(validatePlacements(container, result.placements)).toEqual([]);
  expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(container.maxPayloadKg);
  for (const pallet of result.pallets) {
    expect(pallet.cargoWeightKg).toBeLessThanOrEqual(spec.maxLoadKg);
    const base = { x: pallet.x, y: pallet.y, z: pallet.z + pallet.height, length: pallet.length, width: pallet.width };
    const placed: typeof result.placements = [];
    for (const placement of [...pallet.cargoPlacements].sort((a, b) => a.z - b.z)) {
      expect(hasAdequateSupport(placement, placed, base)).toBe(true);
      expect(canPlaceByStackingRules(cargoMap.get(placement.cargoId)!, placement, placed, cargoMap)).toBe(true);
      placed.push(placement);
    }
  }
}

describe('pallet material efficiency', () => {
  it('uses allowed vertical layers before adding another pallet', () => {
    const cargo = [box()];
    const result = packOnPallets(container, cargo, spec);
    expect(result.placements).toHaveLength(16);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(1);
    expect(new Set(result.placements.map(item => item.z)).size).toBe(4);
    expectSafe(result, cargo);
    expect(packOnPallets(container, cargo, spec)).toEqual(result);
  });

  it('consolidates compatible boxes with different heights onto actual supporting surfaces', () => {
    const cargo = [
      box({ id: 'A', length: 1, width: 1, height: 0.35, quantity: 1, weightKg: 20 }),
      box({ id: 'B', length: 1, width: 1, height: 0.22, quantity: 1, weightKg: 10 }),
      box({ id: 'C', length: 1, width: 1, height: 0.18, quantity: 1, weightKg: 5 }),
    ];
    const result = packOnPallets(container, cargo, spec);
    expect(result.placements).toHaveLength(3);
    expect(result.palletCount).toBe(1);
    expect(new Set(result.placements.map(item => item.z)).size).toBe(3);
    expectSafe(result, cargo);
  });

  it('keeps material-efficient candidates ahead of extra pallets during inertia fallback search', () => {
    const cargo = [box()];
    const result = packOnPallets(container, cargo, spec);
    const candidates = buildPalletAdaptiveCandidates({
      mode: 'pallets', container, cargo,
      result: { placements: result.placements, remaining: [], loadedWeightKg: result.totalPalletizedWeightKg, usedVolumeM3: 1.6, validationIssues: [] },
    }, { spec, result }, 7);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].result.palletCount).toBe(1);
    const counts = candidates.map(candidate => candidate.result.palletCount);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    candidates.forEach(candidate => {
      expect(candidate.result.placements).toHaveLength(16);
      expectSafe(candidate.result, cargo);
    });
  });

  it.each([
    { maxStackLayers: 1 },
    { maxTopLoadKg: 0 },
    { weightKg: 600 },
  ])('retains declared stacking and load restrictions: %j', limits => {
    const cargo = [box({ length: 1, width: 1, quantity: 2, ...limits })];
    const result = packOnPallets(container, cargo, { ...spec, maxStackLevels: 1 });
    expect(result.placements).toHaveLength(2);
    expect(result.palletCount).toBe(2);
    expectSafe(result, cargo);
  });

  it('keeps enabled wrapping and guards within container height when stacking higher', () => {
    const cargo = [box({ height: 0.5, quantity: 20 })];
    const result = packOnPallets({ ...container, height: 2.18 }, cargo, {
      ...spec, useWrapping: true, useCornerGuards: true,
      wrappingExtraHeightM: 0.02, cornerGuardExtraHeightM: 0.02,
    });
    expect(result.placements).toHaveLength(20);
    expect(result.palletCount).toBe(2);
    for (const load of result.pallets) {
      expect(Math.max(...load.cargoPlacements.map(item => item.z + item.height)) + load.packagingExtraHeightM).toBeLessThanOrEqual(2.18);
    }
    expectSafe(result, cargo);
  });
});
