// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditableEquipmentCard from './EditableEquipmentCard';
import { equipmentDisplayText } from './transportEquipmentPresentation';
import { getTransportEquipment } from './transportEquipment';
import { setUiLanguage, type UiLanguage } from './uiLanguage';
vi.mock('./TruckCard3D', () => ({ default: () => null }));
vi.mock('./EquipmentCard3D', () => ({ default: () => null }));
vi.mock('./equipmentImageOverrides', () => ({
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT: 'test:equipment-images', readEquipmentImageOverrides: () => ({}),
  refreshEquipmentImageOverrides: async () => ({}), prepareEquipmentImage: vi.fn(),
  setEquipmentImageOverride: vi.fn(), removeEquipmentImageOverride: vi.fn(),
}));
let root: Root; let host: HTMLDivElement;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setUiLanguage('ko'); });
it.each(['en', 'vi'] as UiLanguage[])('renders real equipment cards in %s with canonical selection preserved', async locale => {
  const item = getTransportEquipment('kr-1t-box')!; const before = JSON.stringify(item); const select = vi.fn();
  await act(async () => root.render(<EditableEquipmentCard item={item} active={false} onSelect={select} />));
  await act(async () => setUiLanguage(locale));
  expect(host.textContent).not.toMatch(/[가-힣]/);
  const button = host.querySelector<HTMLButtonElement>('[data-equipment-id="kr-1t-box"]')!;
  await act(async () => button.click());
  expect(select).toHaveBeenCalledWith(item); expect(JSON.stringify(item)).toBe(before);
  await act(async () => setUiLanguage('ko'));
  expect(host.textContent).toContain('1톤 내장탑차');
});
it.each(['en', 'vi'] as UiLanguage[])('preserves custom equipment names but localizes controlled provenance suffixes in %s', async locale => {
  setUiLanguage(locale); const base = getTransportEquipment('kr-1t-box')!;
  const custom = { ...base, name: '사용자 차량 이름', sourceLabel: '사용자 메모 <원본>' };
  await act(async () => root.render(<EditableEquipmentCard item={custom} active onSelect={() => {}} />));
  expect(host.textContent).toContain(custom.name);
  expect(equipmentDisplayText(custom, 'sourceLabel')).toBe(custom.sourceLabel);
  const edited = { ...base, sourceLabel: `${base.sourceLabel} · 사용자 수정 규격` };
  expect(equipmentDisplayText(edited, 'sourceLabel')).not.toMatch(/[가-힣]/);
  expect(edited.sourceLabel).toContain('사용자 수정 규격');
});
