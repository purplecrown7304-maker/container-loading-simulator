// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductToolsCenter from './ProductToolsCenter';
import ProductPackagingPlanner from './ProductPackagingPlanner';
import EnterprisePackagingPlanner from './EnterprisePackagingPlanner';
import CompanyProductLoadingFlow from './CompanyProductLoadingFlow';
import TransportEquipmentSelector, { applyToDashboard } from './TransportEquipmentSelector';
import { PreviewViewControls } from './PreviewViewControls';
import { OPEN_PRODUCT_TOOL_EVENT } from './productToolEvents';
import { getTransportEquipment, OPEN_TRANSPORT_SELECTOR_EVENT, readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { equipmentDisplayText } from './transportEquipmentPresentation';
import { setUiLanguage, uiText, uiMessage, uiLocale, type UiLanguage } from './uiLanguage';
import { uiMessages } from './uiMessages';
vi.mock('./EditableEquipmentCard', () => ({ default: () => null }));
vi.mock('./EquipmentCard3D', () => ({ default: () => null }));
let host: HTMLDivElement; let root: Root;
const originalEquipment = readTransportEquipment();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setUiLanguage('ko');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setUiLanguage('ko'); selectTransportEquipment(originalEquipment); vi.restoreAllMocks(); });
const locales: UiLanguage[] = ['en', 'vi'];

it.each(locales)('removes Korean presentation from product and packaging screens in %s', async locale => {
  setUiLanguage(locale);
  for (const element of [<ProductPackagingPlanner />, <EnterprisePackagingPlanner />, <CompanyProductLoadingFlow />]) {
    await act(async () => root.render(element));
    expect(host.textContent).not.toMatch(/[가-힣]/);
    for (const node of host.querySelectorAll('[title], [aria-label], [placeholder]')) {
      for (const attr of ['title', 'aria-label', 'placeholder']) expect(node.getAttribute(attr) ?? '').not.toMatch(/[가-힣]/);
    }
  }
});
it.each(locales)('localizes product tools and their already-visible validation message in %s', async locale => {
  await act(async () => root.render(<ProductToolsCenter />));
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_PRODUCT_TOOL_EVENT, { detail: 'products' })));
  const save = [...host.querySelectorAll('button')].find(button => button.textContent === '제품 등록')!;
  await act(async () => save.click());
  expect(host.textContent).toContain('제품코드와 제품명을 입력하세요.');
  const before = localStorage.getItem('container-loading-enterprise-packaging-v1');
  await act(async () => setUiLanguage(locale));
  expect(host.textContent).not.toMatch(/[가-힣]/);
  expect(host.textContent).toContain(uiText('제품코드와 제품명을 입력하세요.'));
  expect(localStorage.getItem('container-loading-enterprise-packaging-v1')).toBe(before);
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_PRODUCT_TOOL_EVENT, { detail: 'cartons' })));
  expect(host.textContent).not.toMatch(/[가-힣]/);
});
it.each(locales)('localizes equipment choices without changing specs or custom labels in %s', async locale => {
  setUiLanguage(locale);
  await act(async () => root.render(<TransportEquipmentSelector />));
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: 'truck' } })));
  expect(host.textContent).not.toMatch(/[가-힣]/);
  const preset = getTransportEquipment('kr-1t-box')!;
  expect(equipmentDisplayText(preset, 'name')).not.toMatch(/[가-힣]/);
  const custom = { ...preset, name: '통과 사용자 차량', note: '사용자 메모' };
  expect(equipmentDisplayText(custom, 'name')).toBe(custom.name);
  expect(equipmentDisplayText(custom, 'note')).toBe(custom.note);
  expect(readTransportEquipment()).toEqual(originalEquipment);
});
it.each(['ko', ...locales] as UiLanguage[])('updates stable equipment input selectors independently of language in %s', async locale => {
  setUiLanguage(locale); const equipment = getTransportEquipment('40-high-cube')!;
  const keys = ['length', 'width', 'height', 'maxPayloadKg', 'floorLoadLimitKgPerM2'] as const;
  await act(async () => root.render(<div>{keys.map(key => <label key={key}>Unrelated label<input data-container-field={key} defaultValue="1" /></label>)}</div>));
  expect(applyToDashboard(equipment)).toBe(true);
  keys.forEach(key => expect(Number(host.querySelector<HTMLInputElement>(`[data-container-field="${key}"]`)?.value)).toBe(equipment[key]));
});
it('keeps view buttons functional and translated through repeated hot switches', async () => {
  const change = vi.fn();
  await act(async () => root.render(<PreviewViewControls view="top" onViewChange={change} showLabels={false} onToggleLabels={() => {}} />));
  for (const locale of ['en', 'vi', 'ko'] as UiLanguage[]) {
    await act(async () => setUiLanguage(locale));
    const rear = host.querySelector<HTMLButtonElement>('[data-preview-view="rear"]')!;
    expect(rear.textContent).toContain(uiText('후면'));
    await act(async () => rear.click());
  }
  expect(change.mock.calls).toEqual([['rear'], ['rear'], ['rear']]);
});
it('preserves opaque Korean user values, whitespace and canonical diagnostic state', () => {
  const name = '한국어 제품 <script>{99}</script>';
  expect(uiMessage(`${name} 제품 정보를 저장했습니다.`, 'en')).toBe(`Saved product information for ${name}.`);
  expect(uiMessage(`${name} 제품 정보를 저장했습니다.`, 'vi')).toBe(`Đã lưu thông tin sản phẩm ${name}.`);
  expect(uiMessage('Unknown CODE_X 한국어 진단', 'en')).toBe('Unknown CODE_X 한국어 진단');
  expect(uiText(' 등록된 제품이 없습니다. ', [], 'en')).toBe(` ${uiText('등록된 제품이 없습니다.', [], 'en')} `);
  expect(uiLocale('ko')).toBe('ko-KR'); expect(uiLocale('en')).toBe('en-US'); expect(uiLocale('vi')).toBe('vi-VN');
});
it('all registered translations are Korean-free and preserve every placeholder', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
  for (const [key, translations] of Object.entries(uiMessages)) for (const value of translations) {
    expect(value, key).not.toMatch(/[가-힣]/);
    expect(placeholders(value), key).toEqual(placeholders(key));
  }
});
