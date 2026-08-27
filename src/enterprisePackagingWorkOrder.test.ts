import { describe, expect, it } from 'vitest';
import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging } from './engine/enterprisePackagingOptimizer';
import type { ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { buildEnterprisePackagingWorkOrderHtml } from './enterprisePackagingWorkOrder';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };

function generatedPlan(products: ProductItem[]) {
  return optimizeEnterprisePackaging(container, products, [], {
    ...defaultEnterprisePackagingOptions,
    packaging: {
      ...defaultEnterprisePackagingOptions.packaging,
      allowCustomBoxDesign: true,
      maxGeneratedGrossWeightKg: 22,
      generatedBoxTareKg: 0.6,
      generatedDimensionStepM: 0.005,
    },
    family: {
      ...defaultEnterprisePackagingOptions.family,
      enabled: false,
    },
    allowMixedResidualCartons: false,
  });
}

describe('enterprise packaging work order', () => {
  it('escapes user-provided names and always warns about unverified generated strength', () => {
    const product: ProductItem = {
      id: 'SAFE-1',
      name: '<script>alert("x")</script>',
      length: 0.18,
      width: 0.12,
      height: 0.08,
      weightKg: 0.5,
      quantity: 31,
      maxUnitsPerBox: 8,
      orientationPolicy: 'upright',
      cushioningM: 0.005,
      maxInternalLayers: 2,
      fragile: true,
      allowMixedCarton: false,
    };
    const plan = generatedPlan([product]);
    expect(plan.assignments[0].strengthStatus).toBe('design-target');

    const html = buildEnterprisePackagingWorkOrderHtml(plan, container, [product], []);
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('강도 미검증 자동규격');
    expect(html).toContain('1단 / 상부허용 0kg');
    expect(html).toContain('세워서만');
    expect(html).toContain('완충 5mm');
    expect(html).toContain('파손주의');
    expect(html).toContain('혼합금지');
  });

  it('reports actual dedicated partial quantity and partial weight separately from full cartons', () => {
    const product: ProductItem = {
      id: 'PART', name: '부분박스', length: 0.18, width: 0.12, height: 0.08,
      weightKg: 1, quantity: 5, maxUnitsPerBox: 4, allowMixedCarton: false,
    };
    const plan = generatedPlan([product]);
    const partial = plan.dedicatedPartialCartons.find((item) => item.productId === 'PART');
    expect(partial).toBeDefined();

    const html = buildEnterprisePackagingWorkOrderHtml(plan, container, [product], []);
    expect(html).toContain(`${partial?.quantity}EA / ${partial?.grossWeightKg.toFixed(2)}kg`);
    expect(html).toContain('전용 잔량');
  });
});
