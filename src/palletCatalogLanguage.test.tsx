// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GuidedPalletTypePicker from './GuidedPalletTypePicker';
import { PALLET_CATALOG, findPalletType } from './engine/palletCatalog';
import { palletDestinationFit } from './engine/palletDestination';
import type { ContainerSpec } from './engine/types';
import { palletDestinationDisplayFit, palletDisplayText, palletMaterialDisplayLabel } from './palletCatalogPresentation';
import { palletRecommendationSignature } from './palletRecommendationInput';
import { choosePalletType, finishPalletRecommendation, PALLET_TYPE_SELECTION_KEY, readPalletTypeSelection, startPalletRecommendation } from './palletTypeSelection';
import type { StoredState } from './storage';
import { setUiLanguage, uiText, type UiLanguage } from './uiLanguage';
import { uiMessagesPalletCatalog } from './uiMessagesPalletCatalog';

const locales: UiLanguage[] = ['ko', 'en', 'vi'];
const container: ContainerSpec = { length: 12, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const input: StoredState = {
  container: { ...container, palletDestination: { transport: 'export', region: 'europe', requiredSize: '1200x1000' } },
  cargo: [{ id: 'test-carton', name: 'Test carton', length: .2, width: .2, height: .2, weightKg: 2, quantity: 8, maxStackLayers: 3, maxTopLoadKg: 100 }],
};
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setUiLanguage('ko');
  choosePalletType('t12-wood-epal3');
  const signature = palletRecommendationSignature(input, 'capacity')!;
  startPalletRecommendation(signature);
  finishPalletRecommendation(signature, 't12-wood-epal3');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); setUiLanguage('ko'); vi.unstubAllGlobals();
});

it.each(locales)('localizes every unchanged built-in pallet field in %s without mutating the catalog', locale => {
  const before = JSON.stringify(PALLET_CATALOG);
  for (const pallet of PALLET_CATALOG) {
    for (const field of ['name', 'standard', 'note'] as const) {
      const result = palletDisplayText(pallet, field, locale);
      if (locale === 'ko') expect(result).toBe(pallet[field]);
      else {
        expect(result).not.toMatch(/[가-힣]/);
        if (/[가-힣]/.test(pallet[field])) expect(result).not.toBe(pallet[field]);
      }
    }
    expect(palletMaterialDisplayLabel(pallet.material, locale)).toBe(uiText(pallet.material === 'wood' ? '목재' : '플라스틱', [], locale));
  }
  expect(JSON.stringify(PALLET_CATALOG)).toBe(before);
});

it.each(locales)('preserves custom pallet fields and unknown IDs verbatim in %s', locale => {
  const preset = findPalletType('company-default')!;
  const custom = { ...preset, name: '통과', standard: '목재', note: findPalletType('t11-wood')!.note };
  const unknown = { ...preset, id: 'user-created-pallet' };
  const before = JSON.stringify([custom, unknown]);
  for (const pallet of [custom, unknown]) for (const field of ['name', 'standard', 'note'] as const) {
    expect(palletDisplayText(pallet, field, locale)).toBe(pallet[field]);
  }
  expect(JSON.stringify([custom, unknown])).toBe(before);
});

it.each(locales)('translates all destination warnings while preserving engine verdicts and inputs in %s', locale => {
  const wood = findPalletType('t11-wood')!;
  const plastic = findPalletType('t11-plastic')!;
  const scenarios = [
    { container, pallet: wood, status: 'fit', label: '별도 지정 없음' },
    { container: { ...container, palletDestination: { transport: 'domestic', region: 'asia', requiredSize: '1100x1100' } }, pallet: wood, status: 'fit', label: '지정 규격 일치' },
    { container: input.container, pallet: wood, status: 'incompatible', label: '수령처 지정 규격 불일치' },
    { container: { ...container, palletDestination: { transport: 'export', region: 'europe', requiredSize: '' } }, pallet: wood, status: 'check', label: '목재 처리·표시 / 수령처 확인' },
    { container: { ...container, palletDestination: { transport: 'export', region: 'asia', requiredSize: '' } }, pallet: plastic, status: 'check', label: '도착 지역·수령처 확인' },
  ] as const;
  const before = JSON.stringify(scenarios);
  for (const scenario of scenarios) {
    const canonical = palletDestinationFit(scenario.container, scenario.pallet);
    const display = palletDestinationDisplayFit(scenario.container, scenario.pallet, locale);
    expect(canonical).toEqual({ status: scenario.status, label: scenario.label });
    expect(display).toEqual({ status: canonical.status, label: uiText(canonical.label, [], locale) });
    if (locale !== 'ko') expect(display.label).not.toMatch(/[가-힣]/);
    expect(display).not.toBe(canonical);
  }
  expect(JSON.stringify(scenarios)).toBe(before);
});

it('hot-switches pallet names, recommendations, warnings and accessibility labels without changing selections or calculation inputs', async () => {
  const beforeInput = JSON.stringify(input);
  const beforeSelection = JSON.stringify(readPalletTypeSelection());
  const beforeStored = localStorage.getItem(PALLET_TYPE_SELECTION_KEY);
  const beforeSignature = palletRecommendationSignature(input, 'capacity');
  await act(async () => root.render(<GuidedPalletTypePicker input={input} strategy="capacity" active={false} />));
  for (const locale of ['en', 'vi', 'ko', 'vi', 'en'] as UiLanguage[]) {
    await act(async () => setUiLanguage(locale));
    for (const pallet of PALLET_CATALOG) expect(host.textContent).toContain(palletDisplayText(pallet, 'name', locale));
    const recommendation = findPalletType('t12-wood-epal3')!;
    expect(host.querySelector('[role="status"]')?.textContent).toBe(uiText('추천: {0}', [palletDisplayText(recommendation, 'name', locale)], locale));
    const radios = [...host.querySelectorAll<HTMLButtonElement>('td.name button')];
    expect(radios).toHaveLength(PALLET_CATALOG.length);
    for (const radio of radios) {
      const pallet = PALLET_CATALOG.find(type => palletDisplayText(type, 'name', locale) === radio.querySelector('b')?.textContent)!;
      const fit = palletDestinationFit(input.container, pallet);
      expect(radio.disabled).toBe(fit.status === 'incompatible');
      expect(radio.closest('tr')?.textContent).toContain(uiText(fit.label, [], locale));
      expect(radio.getAttribute('aria-checked')).toBe(String(pallet.id === 't12-wood-epal3'));
    }
    if (locale !== 'ko') {
      expect(host.textContent).not.toMatch(/[가-힣]/);
      for (const node of host.querySelectorAll('[aria-label]')) expect(node.getAttribute('aria-label')).not.toMatch(/[가-힣]/);
    }
    expect(JSON.stringify(input)).toBe(beforeInput);
    expect(JSON.stringify(readPalletTypeSelection())).toBe(beforeSelection);
    expect(localStorage.getItem(PALLET_TYPE_SELECTION_KEY)).toBe(beforeStored);
    expect(palletRecommendationSignature(input, 'capacity')).toBe(beforeSignature);
  }
});

it('registers every pallet catalog translation in the shared UI dictionary', () => {
  for (const [key, [english, vietnamese]] of Object.entries(uiMessagesPalletCatalog)) {
    expect(uiText(key, [], 'en')).toBe(english);
    expect(uiText(key, [], 'vi')).toBe(vietnamese);
  }
});
