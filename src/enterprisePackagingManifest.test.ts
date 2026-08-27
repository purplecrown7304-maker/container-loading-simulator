import { describe, expect, it } from 'vitest';
import { optimizeEnterprisePackaging, defaultEnterprisePackagingOptions } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { createEnterprisePackagingManifest, enterprisePackagingManifestMatchesState } from './enterprisePackagingManifest';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const product: ProductItem = { id: 'A', name: 'A', length: 0.2, width: 0.1, height: 0.08, weightKg: 0.5, quantity: 20, maxUnitsPerBox: 10 };
const box: BoxCatalogItem = { id: 'B', name: 'B', innerLength: 0.42, innerWidth: 0.22, innerHeight: 0.18, outerLength: 0.43, outerWidth: 0.23, outerHeight: 0.19, tareWeightKg: 0.5, maxGrossWeightKg: 20, maxTopLoadKg: 80 };

describe('enterprise packaging manifest', () => {
  it('matches only the exact container and applied PKG cargo state', () => {
    const plan = optimizeEnterprisePackaging(container, [product], [box], {
      ...defaultEnterprisePackagingOptions,
      packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: false },
      family: { ...defaultEnterprisePackagingOptions.family, enabled: false },
    });
    const manifest = createEnterprisePackagingManifest(plan, container, [product], [box]);

    expect(enterprisePackagingManifestMatchesState(manifest, container, plan.cargo)).toBe(true);
    expect(enterprisePackagingManifestMatchesState(manifest, { ...container, width: container.width + 0.01 }, plan.cargo)).toBe(false);
    expect(enterprisePackagingManifestMatchesState(manifest, container, plan.cargo.map((item, index) => index === 0 ? { ...item, quantity: item.quantity + 1 } : item))).toBe(false);
    expect(enterprisePackagingManifestMatchesState(manifest, container, plan.cargo.map((item, index) => index === 0 ? { ...item, maxTopLoadKg: (item.maxTopLoadKg ?? 0) + 1 } : item))).toBe(false);
  });
});
