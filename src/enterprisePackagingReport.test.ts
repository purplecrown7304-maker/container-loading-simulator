import { describe, expect, it } from 'vitest';
import { optimizeEnterprisePackaging, defaultEnterprisePackagingOptions } from './engine/enterprisePackagingOptimizer';
import type { ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { buildEnterprisePackagingWorkbook } from './enterprisePackagingReport';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };

describe('enterprise packaging report workbook', () => {
  it('exports the operational plan, internal placements and warnings as separate sheets', () => {
    const products: ProductItem[] = [{
      id: 'AUTO', name: '자동규격 제품', length: 0.18, width: 0.12, height: 0.08,
      weightKg: 0.5, quantity: 17, maxUnitsPerBox: 8,
      orientationPolicy: 'base-rotation', allowMixedCarton: true,
    }];
    const plan = optimizeEnterprisePackaging(container, products, [], {
      ...defaultEnterprisePackagingOptions,
      packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: true },
      family: { ...defaultEnterprisePackagingOptions.family, enabled: false },
    });
    const workbook = buildEnterprisePackagingWorkbook({ plan, products, catalog: [], container, scenarioLabel: 'TEST' });

    expect(workbook.SheetNames).toEqual([
      'Summary', 'Assignments', 'CartonFamily', 'MixedCartons', 'MixedPlacements',
      'LoadingCargo', 'Products', 'BoxCatalog', 'Warnings',
    ]);
    expect(workbook.Sheets.Summary).toBeDefined();
    expect(workbook.Sheets.Assignments).toBeDefined();
    expect(workbook.Sheets.Warnings).toBeDefined();

    const warnings = workbook.Sheets.Warnings;
    const values = Object.values(warnings)
      .filter((cell): cell is { v: unknown } => typeof cell === 'object' && cell !== null && 'v' in cell)
      .map((cell) => String(cell.v));
    expect(values.some((value) => value.includes('실제 BCT/ECT'))).toBe(true);
    expect(plan.assignments[0].strengthStatus).toBe('design-target');
    expect(plan.cargo[0].maxStackLayers).toBe(1);
    expect(plan.cargo[0].maxTopLoadKg).toBe(0);
  });
});
