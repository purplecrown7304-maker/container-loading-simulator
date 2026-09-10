import { describe, expect, it } from 'vitest';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import { getProductBoxCompatibility } from './productBoxCompatibility';
import type { BoxCatalogItem } from './engine/productPackagingOptimizer';

const product: CompanyProductItem = {
  id: 'PRD-1',
  name: '제품 1',
  length: 0.4,
  width: 0.3,
  height: 0.2,
  weightKg: 5,
  quantity: 10,
  cushioningM: 0.005,
  orientationPolicy: 'base-rotation',
  allowRotation: true,
};

const fittingBox: BoxCatalogItem = {
  id: 'BOX-FIT',
  name: '적합 박스',
  innerLength: 0.5,
  innerWidth: 0.4,
  innerHeight: 0.3,
  outerLength: 0.51,
  outerWidth: 0.41,
  outerHeight: 0.31,
  tareWeightKg: 0.5,
  maxGrossWeightKg: 20,
};

const smallBox: BoxCatalogItem = {
  ...fittingBox,
  id: 'BOX-SMALL',
  name: '작은 박스',
  innerLength: 0.35,
  innerWidth: 0.25,
  innerHeight: 0.19,
  outerLength: 0.36,
  outerWidth: 0.26,
  outerHeight: 0.2,
};

describe('company product packaging mode', () => {
  it('treats legacy products as requiring box packaging', () => {
    expect(requiresBoxPackaging(product)).toBe(true);
  });

  it('allows explicit direct loading without a box', () => {
    expect(requiresBoxPackaging({ ...product, requiresBoxPackaging: false })).toBe(false);
  });
});

describe('registered box compatibility', () => {
  it('marks a product fit when at least one registered box can contain it', () => {
    const result = getProductBoxCompatibility(product, [smallBox, fittingBox]);
    expect(result.status).toBe('fit');
    expect(result.compatibleBoxCount).toBe(1);
    expect(result.exampleBox?.id).toBe('BOX-FIT');
  });

  it('marks a product unfit when no registered box can contain it', () => {
    const result = getProductBoxCompatibility(product, [smallBox]);
    expect(result.status).toBe('unfit');
    expect(result.compatibleBoxCount).toBe(0);
  });

  it('distinguishes an empty registered-box catalog from an unfit catalog', () => {
    expect(getProductBoxCompatibility(product, []).status).toBe('no-box');
  });
});
