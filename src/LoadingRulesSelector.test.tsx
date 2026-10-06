import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import { aEquipmentDefault, readLoadingRuleset, RULESET_EVENT, setLoadingRuleset } from './loadingRulesPreference';
import { createCustomEquipment, getTransportEquipment, readTransportEquipment, selectTransportEquipment, TRANSPORT_EQUIPMENT_EVENT } from './transportEquipment';
import { setTransportEquipmentSpecOverride } from './transportEquipmentSpecOverrides';

vi.mock('./memberAuth', async importOriginal => ({ ...await importOriginal<typeof import('./memberAuth')>(), restoreMemberSession: async () => null, readSupabaseMember: () => null }));

let root: Root, host: HTMLDivElement;
const base = getTransportEquipment('40-high-cube')!;
const render = () => act(async () => root.render(<ReferenceWorkspaceBar />));
const choose = (value: string) => act(async () => {
  const input = host.querySelector<HTMLSelectElement>('#loading-rules-choice')!;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear(); setLoadingRuleset('legacy'); selectTransportEquipment(base);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('owns one labeled rules selector immediately after the background control, with its warning description', async () => {
  const equipment = readTransportEquipment();
  const changed = vi.fn(); window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, changed);
  try {
    await render();
    const background = host.querySelector('.header-scene-controls .viewer-background-selector')!;
    const input = host.querySelector<HTMLSelectElement>('#loading-rules-choice')!;
    expect(host.querySelectorAll('#loading-rules-choice')).toHaveLength(1);
    expect(background.nextElementSibling?.contains(input)).toBe(true);
    expect(input.labels?.[0].textContent).toBe('적재 규칙');
    expect([...input.options].map(option => [option.value, option.text])).toEqual([['legacy', '기존 규칙'], ['a-v1', 'A 규칙']]);
    expect(host.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain('이전 적재·점검 결과가 초기화');
    expect(input.disabled).toBe(false);
    await render();
    expect(readTransportEquipment()).toBe(equipment);
    expect(changed).not.toHaveBeenCalled();
  } finally { window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, changed); }
});

it('preserves existing default-catalog switching and does nothing when selecting the current rules again', async () => {
  await render();
  const rulesChanged = vi.fn(); window.addEventListener(RULESET_EVENT, rulesChanged);
  const equipmentChanged = vi.fn(); window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, equipmentChanged);
  try {
    await choose('a-v1');
    expect(readLoadingRuleset()).toBe('a-v1');
    expect(readTransportEquipment()).toEqual(aEquipmentDefault(base));
    expect(host.querySelector('#loading-rules-description')?.textContent).toContain('운송 안전 인증이 아닙니다');
    expect(rulesChanged).toHaveBeenCalledTimes(1); expect(equipmentChanged).toHaveBeenCalledTimes(1);
    await choose('a-v1');
    expect(rulesChanged).toHaveBeenCalledTimes(1); expect(equipmentChanged).toHaveBeenCalledTimes(1);
    await choose('legacy');
    expect(readLoadingRuleset()).toBe('legacy'); expect(readTransportEquipment()).toEqual(base);
    expect(rulesChanged).toHaveBeenCalledTimes(2); expect(equipmentChanged).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener(RULESET_EVENT, rulesChanged); window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, equipmentChanged);
  }
});

it.each(['custom', 'modified', 'override'] as const)('keeps %s equipment intact when switching rules from the header', async kind => {
  if (kind === 'custom') selectTransportEquipment(createCustomEquipment('container', { ...base, length: 8, maxPayloadKg: 15000 }));
  if (kind === 'modified') selectTransportEquipment({ ...base, length: 8, maxPayloadKg: 15000 });
  if (kind === 'override') setTransportEquipmentSpecOverride(base.id, base);
  const equipment = readTransportEquipment();
  await render();
  for (const value of ['a-v1', 'legacy', 'a-v1']) {
    await choose(value);
    expect(readLoadingRuleset()).toBe(value); expect(readTransportEquipment()).toBe(equipment);
  }
  await act(async () => root.render(null));
  await render();
  expect(host.querySelector<HTMLSelectElement>('#loading-rules-choice')?.value).toBe('a-v1');
  expect(readTransportEquipment()).toBe(equipment);
});
