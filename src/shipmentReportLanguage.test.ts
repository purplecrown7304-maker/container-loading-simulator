// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging } from './engine/enterprisePackagingOptimizer';
import type { CargoItem, Placement } from './engine/types';
import { buildEnterprisePackagingWorkOrderHtml } from './enterprisePackagingWorkOrder';
import { reportCargoCatalog } from './reportCargo';
import { buildShipmentInstructionSection, readShipmentInstructionSnapshot, writeShipmentInstructionSnapshot } from './shipmentInstruction';
import { setUiLanguage, uiText, type UiLanguage } from './uiLanguage';
import { uiMessagesShipmentReports } from './uiMessagesShipmentReports';
import { buildWorkOrderCargoSummary } from './workOrderCargoSummary';

const storageKey = 'container-loading-shipment-instruction-v1';
const container = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const product: CompanyProductItem = {
  id: '제품', name: '확인 <script>alert("x")</script>',
  length: 0.18, width: 0.12, height: 0.08, weightKg: 0.5, quantity: 5,
  maxUnitsPerBox: 4, orientationPolicy: 'upright', cushioningM: 0.005,
  maxInternalLayers: 2, fragile: true, allowMixedCarton: false,
};
const plan = optimizeEnterprisePackaging(container, [product], [], {
  ...defaultEnterprisePackagingOptions,
  packaging: { ...defaultEnterprisePackagingOptions.packaging, allowCustomBoxDesign: true },
  family: { ...defaultEnterprisePackagingOptions.family, enabled: false },
  allowMixedResidualCartons: false,
});
const placement = (item: CargoItem): Placement => ({ cargoId: item.id, x: 0, y: 0, z: 0, length: item.length, width: item.width, height: item.height, weightKg: item.weightKg });

beforeEach(() => { localStorage.removeItem(storageKey); setUiLanguage('ko'); });
afterEach(() => { localStorage.removeItem(storageKey); setUiLanguage('ko'); });

it('integrates every shipment report translation and preserves placeholder contracts', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, translations] of Object.entries(uiMessagesShipmentReports)) {
    translations.forEach((translation, index) => {
      expect(translation.trim()).not.toBe('');
      expect(placeholders(translation)).toEqual(placeholders(key));
      // Shared labels may use the canonical wording from another UI catalog.
      const rendered = uiText(key, [], index === 0 ? 'en' : 'vi');
      expect(rendered).not.toBe(key);
      expect(rendered.trim()).not.toBe('');
      expect(placeholders(rendered)).toEqual(placeholders(key));
    });
  }
});

describe.each<UiLanguage>(['ko', 'en', 'vi'])('shipment report language %s', language => {
  it('renders shipment counts and remainder labels without translating or rewriting saved product data', () => {
    setUiLanguage(language);
    writeShipmentInstructionSnapshot([product], plan.assignments, plan.cargo);
    const saved = localStorage.getItem(storageKey);
    const snapshot = readShipmentInstructionSnapshot(plan.cargo)!;
    const partial = plan.cargo.find(item => item.id.endsWith('-PARTIAL'))!;
    expect(partial).toBeDefined();
    const html = buildShipmentInstructionSection(plan.cargo, { placements: [placement(partial)], remaining: [] });
    expect(html).toContain(uiText('출하 지시 · 수량 대조'));
    expect(html).toContain(uiText('적재 환산 {0} EA', [snapshot.lines[0].partialUnits!]));
    expect(html).toContain(uiText('미적재 {0}', [snapshot.lines[0].boxesNeeded - 1]));
    expect(html).toContain(uiText('제품 간격 {0} mm · 벽 완충 {1} mm', [1, 5]));
    expect(html).toContain('>제품</b>');
    expect(html).toContain('확인 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(localStorage.getItem(storageKey)).toBe(saved);
  });

  it('renders fallback, direct-loading and readiness states while keeping canonical snapshot values', () => {
    setUiLanguage(language);
    const direct: CompanyProductItem = { ...product, requiresBoxPackaging: false, quantity: 2 };
    const cargo: CargoItem[] = [{ ...direct, id: `DIRECT-${direct.id}` }];
    const result = { placements: [placement(cargo[0]), placement(cargo[0])], remaining: [] };
    const fallback = buildShipmentInstructionSection(cargo, result);
    expect(fallback).toContain(uiText('일반 화물 기준'));
    expect(fallback).toContain(uiText('미적재 {0}', [0]));
    writeShipmentInstructionSnapshot([direct], [], cargo);
    expect(readShipmentInstructionSnapshot(cargo)?.lines[0].boxName).toBe('박스 없이 직접 적재');
    const html = buildShipmentInstructionSection(cargo, result);
    expect(html).toContain(uiText('직접 적재'));
    expect(html).toContain(uiText('출하 준비'));
  });

  it('renders packing safety warnings and handling rules without changing the plan or escaping', () => {
    setUiLanguage(language);
    const before = JSON.stringify(plan);
    const html = buildEnterprisePackagingWorkOrderHtml(plan, container, [product], []);
    expect(html).toContain(uiText('기업 포장 작업지시서'));
    expect(html).toContain(uiText('강도 미검증 자동규격 {0}종', [1]));
    expect(html).toContain(uiText('강도 확인 필요로 표시된 규격은 제조 강도 승인 전 실제 적층 작업에 사용하지 마세요. 시스템 적용값은 1단 / 상부허용 0kg입니다.'));
    expect(html).toContain(uiText('세워서만'));
    expect(html).toContain(uiText('제품 간격 {0}mm', [1]));
    expect(html).toContain(uiText('파손주의'));
    expect(html).toContain(uiText('혼합금지'));
    expect(html).toContain('>제품</b>');
    expect(html).toContain('확인 &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    const partial = plan.dedicatedPartialCartons[0];
    expect(html).toContain(`${partial.quantity}EA / ${partial.grossWeightKg.toFixed(2)}kg`);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('localizes mixed-carton layout labels without translating carton or product identifiers', () => {
    setUiLanguage(language);
    const assignment = plan.assignments[0];
    const mixedPlan = { ...plan, mixedCartons: [{
      ...assignment, id: '제품"<', boxName: '확인', fillRate: 0.5,
      contents: [{ productId: product.id, productName: product.name, quantity: 1 }],
      placements: [{ unitKey: '확인"<', productId: product.id, x: 0, y: 0, z: 0,
        length: product.length, width: product.width, height: product.height, rotated: false }],
    }] };
    const before = JSON.stringify(mixedPlan);
    const html = buildEnterprisePackagingWorkOrderHtml(mixedPlan, container, [product], []);
    const region = document.createElement('div'); region.innerHTML = html;
    const mixedCard = region.querySelector('.mixed-card')!;
    expect(mixedCard.querySelector('h3')?.textContent).toBe(`제품"< · ${assignment.boxId}`);
    expect(mixedCard.querySelector('p b')?.textContent).toBe(uiText('내용:'));
    expect(mixedCard.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe(uiText('{0} 내부 배치표', ['제품"<']));
    expect([...mixedCard.querySelectorAll('th')].map(cell => cell.textContent)).toContain(uiText('개별 번호'));
    expect(mixedCard.querySelector('td')?.textContent).toBe('제품');
    expect(mixedCard.querySelectorAll('td')[1].textContent).toBe('확인"<');
    expect(JSON.stringify(mixedPlan)).toBe(before);
  });

  it('localizes cargo summary labels, accessibility text and displayed numbers only', () => {
    setUiLanguage(language);
    const item: CargoItem = { id: '제품"<', name: '직접 적재', quantity: 1234, length: 1.5, width: 1.2, height: 1.1, weightKg: 4 };
    const cargo = [item, { ...item, id: `${item.id}-PARTIAL` }];
    const counts = new Map(cargo.map(entry => [entry.id, 1234]));
    const before = JSON.stringify(cargo);
    const html = buildWorkOrderCargoSummary(cargo, counts, reportCargoCatalog(cargo));
    const region = document.createElement('div'); region.innerHTML = html;
    expect(region.querySelector('h3')?.textContent).toBe(uiText('투입 적재단위'));
    expect(region.querySelector('svg')?.getAttribute('aria-label')).toBe(uiText('{0} 적재단위 이미지', [item.id]));
    expect(region.querySelectorAll('.cargo-intake-info b')[1].textContent).toBe(`${item.id} · ${uiText('잔량')}`);
    const locale = ({ ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' } as const)[language];
    expect(html).toContain(`${(1234).toLocaleString(locale)} EA`);
    expect(html).toContain('제품&quot;&lt;');
    expect(buildWorkOrderCargoSummary([item], counts)).toContain('<span>직접 적재</span>');
    expect(JSON.stringify(cargo)).toBe(before);
  });
});
