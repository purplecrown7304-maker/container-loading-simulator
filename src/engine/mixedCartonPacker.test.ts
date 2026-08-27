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
});
