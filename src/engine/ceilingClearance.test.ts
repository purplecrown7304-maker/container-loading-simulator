import { describe, expect, it } from 'vitest';
import { DEFAULT_CEILING_CLEARANCE_M, ceilingClearance, isInsideContainer, planningContainer, usableHeight, validatePlacements } from './constraints';
import { loadContainer } from './loadingEngine';
import { operationalErrors, validateOperationalLoading } from './operationalValidator';
import { packOnPallets } from './palletOptimization';
import { packMixedMode } from './mixedModePacking';
import { defaultPalletSpec } from './palletPacking';
import { withRecommendedCeilingClearance } from '../containerDefaults';
import type { CargoItem, ContainerSpec, Placement } from './types';

// 1.0 m boxes in a 2.0 m space: two tiers fit exactly without clearance, one tier with 5 cm.
const base: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 20000 };
const cube: CargoItem = { id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 50, quantity: 16, maxStackLayers: 4, maxTopLoadKg: 500, allowRotation: true };
const top = (placements: Placement[]) => Math.max(0, ...placements.map(p => p.z + p.height));
const put = (z: number, height = 1): Placement => ({ cargoId: 'A', x: 0, y: 0, z, length: 1, width: 1, height, weightKg: 50 });

describe('LOADING_RULES R-5 ceiling clearance', () => {
  it('recommends 5 cm and treats an unset field as no clearance in the engine', () => {
    expect(DEFAULT_CEILING_CLEARANCE_M).toBe(0.05);
    expect(ceilingClearance(base)).toBe(0);
    expect(usableHeight(base)).toBe(2);
    expect(planningContainer(base)).toBe(base);
    expect(usableHeight({ ...base, ceilingClearanceM: 0.05 })).toBeCloseTo(1.95, 9);
  });

  it('ignores invalid values and never applies to A-rules, which keep their own margins', () => {
    for (const value of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, 2, 5]) expect(ceilingClearance({ ...base, ceilingClearanceM: value }), String(value)).toBe(0);
    const a: ContainerSpec = { ...base, ceilingClearanceM: 0.05, rules: { version: 'a-v1', equipmentId: 'x', kind: 'container', access: ['rear'], source: 'test' } };
    expect(ceilingClearance(a)).toBe(0);
  });

  it('folds the clearance into the planning height exactly once', () => {
    const planning = planningContainer({ ...base, ceilingClearanceM: 0.05 });
    expect(planning.height).toBeCloseTo(1.95, 9);
    expect(ceilingClearance(planning)).toBe(0);
    expect(planningContainer(planning)).toBe(planning);
  });

  it('rejects cargo that enters the clearance in every bounds check', () => {
    const spec = { ...base, ceilingClearanceM: 0.05 };
    expect(isInsideContainer(spec, put(0.95))).toBe(true);   // top exactly at 1.95 m
    expect(isInsideContainer(spec, put(1))).toBe(false);     // top at 2.00 m
    expect(isInsideContainer(base, put(1))).toBe(true);
    expect(validatePlacements(spec, [put(0), put(1)]).map(issue => issue.type)).toEqual(['OUT_OF_BOUNDS']);
    expect(operationalErrors(validateOperationalLoading(spec, [cube], [put(0), put(1)])).map(f => f.code)).toContain('OUT_OF_BOUNDS');
    expect(operationalErrors(validateOperationalLoading(base, [cube], [put(0), put(1)])).map(f => f.code)).not.toContain('OUT_OF_BOUNDS');
  });

  it('plans direct boxes below the clearance and reports the rest as waiting', () => {
    const free = loadContainer(base, [cube], { publish: false });
    const kept = loadContainer({ ...base, ceilingClearanceM: 0.05 }, [cube], { publish: false });
    expect(free.placements).toHaveLength(16);
    expect(top(free.placements)).toBeCloseTo(2, 6);
    expect(kept.placements).toHaveLength(8);
    expect(top(kept.placements)).toBeLessThanOrEqual(1.95 + 1e-9);
    expect(kept.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(8);
    expect(kept.validationIssues).toEqual([]);
    expect(operationalErrors(kept.operationalFindings ?? []).filter(f => f.code === 'OUT_OF_BOUNDS')).toEqual([]);
  });

  it('gives the same plan for clearance 0 as for an unset field, and is deterministic with a value', () => {
    const unset = loadContainer(base, [cube], { publish: false });
    const zero = loadContainer({ ...base, ceilingClearanceM: 0 }, [cube], { publish: false });
    expect(zero.placements).toEqual(unset.placements);
    const spec = { ...base, ceilingClearanceM: 0.05 };
    expect(loadContainer(spec, [cube], { publish: false }).placements).toEqual(loadContainer(spec, [cube], { publish: false }).placements);
  });

  it('keeps pallets, their cargo and packaging below the clearance', () => {
    const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
    const cargo: CargoItem[] = [{ id: 'B', name: 'B', length: 0.55, width: 0.55, height: 0.425, weightKg: 12, quantity: 400, maxStackLayers: 6, maxTopLoadKg: 200 }];
    // Pallet 0.15 m + 6 tiers × 0.425 m = 2.70 m: exactly the ceiling without clearance.
    const free = packOnPallets(container, cargo, { ...defaultPalletSpec, maxStackLevels: 1 }, 'capacity');
    const kept = packOnPallets({ ...container, ceilingClearanceM: 0.05 }, cargo, { ...defaultPalletSpec, maxStackLevels: 1 }, 'capacity');
    expect(top(free.placements)).toBeCloseTo(2.7, 6);
    expect(top(kept.placements)).toBeLessThanOrEqual(2.65 + 1e-9);
    // One tier fewer per pallet: the same cartons need more pallets or stay waiting, never the clearance.
    const waiting = (rows: Array<{ quantity: number }>) => rows.reduce((sum, row) => sum + row.quantity, 0);
    expect(kept.placements.length + waiting(kept.remaining)).toBe(free.placements.length + waiting(free.remaining));
    expect(kept.palletCount > free.palletCount || kept.placements.length < free.placements.length).toBe(true);
    const mixed = packMixedMode({ ...container, ceilingClearanceM: 0.05 }, cargo, { ...defaultPalletSpec, maxStackLevels: 1 }, 'capacity');
    expect(top(mixed.placements)).toBeLessThanOrEqual(2.65 + 1e-9);
    expect(validatePlacements({ ...container, ceilingClearanceM: 0.05 }, mixed.placements)).toEqual([]);
  });

  it('is added by the app only when a spec does not already state a value', () => {
    expect(withRecommendedCeilingClearance(base).ceilingClearanceM).toBe(0.05);
    const zero = { ...base, ceilingClearanceM: 0 };
    expect(withRecommendedCeilingClearance(zero)).toBe(zero);
    const custom = { ...base, ceilingClearanceM: 0.1 };
    expect(withRecommendedCeilingClearance(custom)).toBe(custom);
  });
});
