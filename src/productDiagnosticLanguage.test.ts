import { afterEach, expect, it } from 'vitest';
import { optimizeProductPackaging, defaultProductPackagingOptions, type ProductItem } from './engine/productPackagingOptimizer';
import { approveGeneratedCartonFamily } from './engine/cartonStrengthApproval';
import { setUiLanguage, uiMessage } from './uiLanguage';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CargoStackRestrictionNotice from './CargoStackRestrictionNotice';

const product: ProductItem = { id: '한국어 제품 코드', name: '제품명이 비어 있습니다.', length: .2, width: .1, height: .1, weightKg: 1, quantity: 10 };
const container = { length: 6, width: 2, height: 2, maxPayloadKg: 5000 };
afterEach(() => setUiLanguage('ko'));

for (const locale of ['en', 'vi'] as const) {
  it(`${locale} displays stack restriction explanations while preserving product and carton names`, () => {
    setUiLanguage(locale);
    const cargo = [{ ...product, maxStackLayers: 1, maxTopLoadKg: 0, strengthUnverified: true, boxName: '사용자 박스 이름' }];
    const before = JSON.stringify(cargo);
    const html = renderToStaticMarkup(createElement(CargoStackRestrictionNotice, { cargo }));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const copy = doc.body.textContent ?? '';
    expect(copy).toContain(product.name);
    expect(copy).toContain('사용자 박스 이름');
    expect(copy.replaceAll(product.name, '').replaceAll('사용자 박스 이름', '')).not.toMatch(/[가-힣]/);
    expect(JSON.stringify(cargo)).toBe(before);
  });

  it(`${locale} localizes generated product validation without changing product identifiers or rules`, () => {
    const invalid: Partial<ProductItem>[] = [{ name: '' }, { quantity: 0 }, { maxUnitsPerBox: 0 }, { cushioningM: -1 }, { productGapM: -1 }, { maxInternalLayers: 0 }];
    setUiLanguage(locale);
    for (const change of invalid) {
      const input = { ...product, ...change };
      const before = JSON.stringify(input);
      const result = optimizeProductPackaging(container, [input], [], { ...defaultProductPackagingOptions, allowCustomBoxDesign: false });
      expect(result.assignments).toEqual([]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].productId).toBe(product.id);
      expect(result.rejected[0].reason).toMatch(/[가-힣]/);
      expect(uiMessage(result.rejected[0].reason)).not.toMatch(/[가-힣]/);
      expect(JSON.stringify(input)).toBe(before);
    }
    const unavailable = optimizeProductPackaging(container, [product], [], { ...defaultProductPackagingOptions, allowCustomBoxDesign: false });
    expect(uiMessage(unavailable.rejected[0].reason)).not.toMatch(/[가-힣]/);
    expect(product.name).toBe('제품명이 비어 있습니다.');
  });

  it(`${locale} keeps rejected carton approval rejected while localizing the explanation`, () => {
    setUiLanguage(locale);
    const emptyGroup = { key: 'EMPTY', assignments: [], productIds: [], innerLength: .2, innerWidth: .2, innerHeight: .2, outerLength: .21, outerWidth: .21, outerHeight: .21, provisionalRequiredTopLoadKg: 0 };
    const result = approveGeneratedCartonFamily(emptyGroup, [product], { catalogId: '검증 코드', verifiedTareWeightKg: 1, verifiedMaxGrossWeightKg: 10, verifiedMaxTopLoadKg: 40 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('승인할 자동설계 규격이 없습니다.');
      expect(uiMessage(result.reason)).not.toMatch(/[가-힣]/);
    }
    const text = '검증 최대 총중량이 이 규격을 공유하는 제품 중 가장 무거운 Full 박스 22.80kg보다 작습니다.';
    expect(uiMessage(text)).toContain('22.80');
    expect(uiMessage(text)).not.toMatch(/[가-힣]/);
    expect(uiMessage('CUSTOM 오류 원문 · 한국어 제품 코드')).toBe('CUSTOM 오류 원문 · 한국어 제품 코드');
  });
}
