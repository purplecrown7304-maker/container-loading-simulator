import { describe, expect, it } from 'vitest';
import { packMixedUnitsIntoCarton, residualUnitsForProducts } from './mixedCartonPacker';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';

const box: BoxCatalogItem = {
  id: 'MIX', name: '혼합박스',
  innerLength: 0.4, innerWidth: 0.3, innerHeight: 0.2,
  outerLength: 0.41, outerWidth: 0.31, outerHeight: 0.21,
  tareWeightKg: 0.5, maxGrossWeightKg: 10,
};

describe('mixed residual carton packer', () => {
  it('packs residual units deterministically without collisions', () => {
    const products: ProductItem[] = [
      { id: 'A', name: 'A', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.4, quantity: 5, maxUnitsPerBox: 4, orientationPolicy: 'base-rotation', allowMixedCarton: true },
      { id: 'B', name: 'B', length: 0.12, width: 0.08, height: 0.1, weightKg: 0.3, quantity: 7, maxUnitsPerBox: 6, orientationPolicy: 'base-rotation', allowMixedCarton: true },
    ];
    const residual = residualUnitsForProducts(products, new Map([['A', 4], ['B', 6]])).mixable;
    const first = packMixedUnitsIntoCarton(box, residual);
    const second = packMixedUnitsIntoCarton(box, [...residual].reverse());

    expect(first.placements).toHaveLength(2);
    expect(first.unplacedUnitKeys).toHaveLength(0);
    expect(first.contents).toEqual([
      { productId: 'A', productName: 'A', quantity: 1 },
      { productId: 'B', productName: 'B', quantity: 1 },
    ]);
    expect(first.placements).toEqual(second.placements);
    expect(first.heuristic).toBe(second.heuristic);
    expect(first.grossWeightKg).toBeCloseTo(1.2, 8);
  });

  it('keeps fragile and explicitly non-mixable residuals out of mixed cartons', () => {
    const products: ProductItem[] = [
      { id: 'F', name: 'fragile', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.2, quantity: 3, maxUnitsPerBox: 2, fragile: true, allowMixedCarton: true },
      { id: 'N', name: 'no-mix', length: 0.1, width: 0.1, height: 0.1, weightKg: 0.2, quantity: 3, maxUnitsPerBox: 2, allowMixedCarton: false },
    ];
    const residual = residualUnitsForProducts(products, new Map([['F', 2], ['N', 2]]));
    expect(residual.mixable).toHaveLength(0);
    expect(residual.dedicated.map((unit) => unit.productId).sort()).toEqual(['F', 'N']);
  });

  it('honors carton gross-weight limits', () => {
    const heavyUnits = Array.from({ length: 5 }, (_, index) => ({
      key: `H#${index}`,
      productId: 'H', productName: 'Heavy',
      length: 0.1, width: 0.1, height: 0.1,
      weightKg: 3,
      orientationPolicy: 'upright' as const,
      cushioningM: 0,
    }));
    const packed = packMixedUnitsIntoCarton(box, heavyUnits);
    expect(packed.grossWeightKg).toBeLessThanOrEqual(box.maxGrossWeightKg);
    expect(packed.placements.length).toBe(3);
    expect(packed.unplacedUnitKeys.length).toBe(2);
  });

  it('keeps units outside the search cap explicitly unplaced', () => {
    const units = Array.from({ length: 6 }, (_, index) => ({
      key: `C#${index + 1}`,
      productId: 'C', productName: 'Cap test',
      length: 0.05, width: 0.05, height: 0.05,
      weightKg: 0.1,
      orientationPolicy: 'upright' as const,
      cushioningM: 0,
    }));
    const packed = packMixedUnitsIntoCarton(box, units, 3);
    expect(packed.placements).toHaveLength(3);
    expect(packed.unplacedUnitKeys.sort()).toEqual(['C#4', 'C#5', 'C#6']);
  });

  it('never emits out-of-bounds or colliding placements', () => {
    const units = [
      { key: 'A#1', productId: 'A', productName: 'A', length: 0.18, width: 0.11, height: 0.08, weightKg: 0.4, orientationPolicy: 'base-rotation' as const, cushioningM: 0.002 },
      { key: 'B#1', productId: 'B', productName: 'B', length: 0.13, width: 0.09, height: 0.1, weightKg: 0.3, orientationPolicy: 'any' as const, cushioningM: 0.001 },
      { key: 'C#1', productId: 'C', productName: 'C', length: 0.1, width: 0.1, height: 0.09, weightKg: 0.2, orientationPolicy: 'upright' as const, cushioningM: 0 },
    ];
    const packed = packMixedUnitsIntoCarton(box, units);
    for (const item of packed.placements) {
      expect(item.x).toBeGreaterThanOrEqual(-1e-9);
      expect(item.y).toBeGreaterThanOrEqual(-1e-9);
      expect(item.z).toBeGreaterThanOrEqual(-1e-9);
      expect(item.x + item.length).toBeLessThanOrEqual(box.innerLength + 1e-9);
      expect(item.y + item.width).toBeLessThanOrEqual(box.innerWidth + 1e-9);
      expect(item.z + item.height).toBeLessThanOrEqual(box.innerHeight + 1e-9);
    }
    for (let i = 0; i < packed.placements.length; i += 1) {
      for (let j = i + 1; j < packed.placements.length; j += 1) {
        const a = packed.placements[i];
        const b = packed.placements[j];
        const overlap = a.x < b.x + b.length - 1e-9 && a.x + a.length > b.x + 1e-9
          && a.y < b.y + b.width - 1e-9 && a.y + a.width > b.y + 1e-9
          && a.z < b.z + b.height - 1e-9 && a.z + a.height > b.z + 1e-9;
        expect(overlap).toBe(false);
      }
    }
  });
});
