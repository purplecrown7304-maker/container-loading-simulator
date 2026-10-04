import { describe, expect, it } from 'vitest';
import { PALLET_CATALOG, palletSpecForType, findPalletType } from './palletCatalog';
import { comparePalletEvaluations, recommendPallets, type PalletTypeEvaluation } from './palletRecommendation';
import { defaultPalletSpec } from './palletPacking';
import type { CargoItem } from './types';

const c20 = { length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28000 };

describe('pallet catalog', () => {
  it('has unique ids and physically sane representative specs', () => {
    expect(new Set(PALLET_CATALOG.map(t => t.id)).size).toBe(PALLET_CATALOG.length);
    for (const type of PALLET_CATALOG) {
      expect(type.length).toBeGreaterThan(0.5);
      expect(type.height).toBeGreaterThan(0.1);
      expect(type.maxLoadKg).toBeGreaterThan(0);
      if (type.staticLoadKg !== null) expect(type.staticLoadKg).toBeGreaterThanOrEqual(type.maxLoadKg);
    }
  });

  it('the company default entry matches the engine default pallet', () => {
    const t11 = findPalletType('company-default')!;
    const spec = palletSpecForType(t11);
    expect(spec).toEqual({ ...defaultPalletSpec, material: 'wood', length: t11.length, width: t11.width, height: t11.height, tareWeightKg: t11.tareWeightKg, maxLoadKg: t11.maxLoadKg, maxStaticLoadKg: 0, maxStackLevels: 1 });
    expect(spec.maxLoadKg).toBe(defaultPalletSpec.maxLoadKg);
  });

  it('keeps job-level settings such as stack levels when switching pallet product', () => {
    const spec = palletSpecForType(findPalletType('eur-epal1')!, { ...defaultPalletSpec, maxStackLevels: 1, useWrapping: true });
    expect(spec.maxStackLevels).toBe(1);
    expect(spec.useWrapping).toBe(true);
    expect([spec.length, spec.width]).toEqual([1.2, 0.8]);
  });
});

describe('pallet recommendation', () => {
  const evaluation = (over: Partial<PalletTypeEvaluation>): PalletTypeEvaluation => ({
    typeId: 't11-wood', requestedUnits: 100, loadedUnits: 100, palletCount: 5, maxTiers: 3, palletTareTotalKg: 125, loadedCargoKg: 1000, fits: true, ...over,
  });

  it('ranks loaded units, then pallet count, then pallet tare', () => {
    expect(comparePalletEvaluations(evaluation({ loadedUnits: 100 }), evaluation({ typeId: 't12-wood-epal3', loadedUnits: 90, palletCount: 2 }))).toBeLessThan(0);
    expect(comparePalletEvaluations(evaluation({ palletCount: 4 }), evaluation({ typeId: 't12-wood-epal3', palletCount: 5 }))).toBeLessThan(0);
    expect(comparePalletEvaluations(evaluation({ typeId: 't11-plastic-export', palletTareTotalKg: 55 }), evaluation({ palletTareTotalKg: 125 }))).toBeLessThan(0);
  });

  it('recommends a pallet that loads every carton and is deterministic', () => {
    const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 0.55, width: 0.55, height: 0.3, weightKg: 10, quantity: 120, maxStackLayers: 10 }];
    const types = PALLET_CATALOG.filter(t => ['t11-wood', 'eur-epal1'].includes(t.id));
    const first = recommendPallets(c20, cargo, 'capacity', types);
    const second = recommendPallets(c20, cargo, 'capacity', types);
    expect(second).toEqual(first);
    // 0.55 m cartons tile 2×2 on 1100×1100 but only 2×1 on 1200×800.
    expect(first.recommendedId).toBe('t11-wood');
    const t11 = first.evaluations.find(e => e.typeId === 't11-wood')!;
    expect(t11.loadedUnits).toBe(120);
  });

  it('marks a pallet that does not fit the floor and never recommends it', () => {
    const narrow = { ...c20, width: 1.0 };
    const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 0.4, width: 0.4, height: 0.3, weightKg: 5, quantity: 10 }];
    const result = recommendPallets(narrow, cargo, 'capacity', PALLET_CATALOG.filter(t => ['t11-wood', 'eur-epal1'].includes(t.id)));
    expect(result.evaluations.find(e => e.typeId === 't11-wood')!.fits).toBe(false);
    expect(result.recommendedId).toBe('eur-epal1');
  });
});

describe('catalog follows the owner-provided table (2026-09-29)', () => {
  it.each([
    ['t11-plastic', 1.1, 1.1, 0.15, 25, 1000],
    ['t11-plastic-export', 1.1, 1.1, 0.12, 6, 1000],
    ['t11-wood', 1.1, 1.1, 0.15, 40, 1000],
    ['t12-plastic', 1.2, 1.0, 0.15, 19, 1000],
    ['t12-wood-epal3', 1.2, 1.0, 0.144, 30, 1500],
    ['t12-wood-epal2', 1.2, 1.0, 0.162, 35, 1250],
    ['eur-epal1', 1.2, 0.8, 0.144, 25, 1500],
    ['eur-epal6', 0.8, 0.6, 0.145, 9.5, 500],
    ['gma-48x40', 1.219, 1.016, 0.14, 30, 1200],
  ])('%s', (id, length, width, height, tare, dynamic) => {
    const type = findPalletType(id)!;
    expect([type.length, type.width, type.height, type.tareWeightKg, type.maxLoadKg]).toEqual([length, width, height, tare, dynamic]);
  });
});
