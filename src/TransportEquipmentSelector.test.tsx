import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TransportEquipmentSelector from './TransportEquipmentSelector';
import { createCustomEquipment, getTransportEquipment, readTransportEquipment, selectTransportEquipment, OPEN_TRANSPORT_SELECTOR_EVENT } from './transportEquipment';
vi.mock('./EditableEquipmentCard', () => ({ default: () => null }));
let root: Root, host: HTMLDivElement;
const original = readTransportEquipment();
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); act(() => selectTransportEquipment(original)); });

it.each([
  ['custom-truck', true], ['custom-truck', false],
  ['custom-heavy-truck', true], ['custom-heavy-truck', false],
] as const)('reopens %s with registered values (explicit template: %s)', async (id, explicitTemplate) => {
  const equipment = { ...getTransportEquipment(id)!, length: 9.5, width: 2.33, height: 2.42, maxPayloadKg: 11000, floorLoadLimitKgPerM2: 900, requiresSpecification: false };
  act(() => selectTransportEquipment(equipment));
  await act(async () => root.render(<TransportEquipmentSelector />));
  act(() => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: explicitTemplate ? { category: 'truck', equipmentId: id } : undefined })));
  const values = [...host.querySelectorAll('.transport-custom-editor input')].map(input => (input as HTMLInputElement).value);
  expect(values).toEqual(['9.5', '2.33', '2.42', '11000', '900']);
  expect(readTransportEquipment()).toMatchObject(equipment);
});

it('keeps the existing custom-container storage contract when applying its editor', async () => {
  const equipment = createCustomEquipment('container', { length: 8, width: 2.35, height: 2.7, maxPayloadKg: 15000, floorLoadLimitKgPerM2: 1500 });
  act(() => selectTransportEquipment(equipment));
  await act(async () => root.render(<><div className="dashboard-left"><div className="dashboard-card">{['길이(m)', '폭(m)', '높이(m)', '최대중량', '바닥 허용하중(kg/m²)'].map(label => <label key={label}>{label}<input defaultValue="1" /></label>)}</div></div><TransportEquipmentSelector /></>));
  act(() => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: 'container', equipmentId: equipment.id } })));
  const apply = [...host.querySelectorAll('button')].find(b => b.textContent === '사용자 규격 적용')!;
  act(() => apply.click());
  expect(readTransportEquipment()).toEqual(equipment);
});

it('keeps the large-truck editor open after invalid ratings so they can be corrected', async () => {
  const previous = getTransportEquipment('40-high-cube')!;
  act(() => selectTransportEquipment(previous));
  const dashboard = [previous.length, previous.width, previous.height, previous.maxPayloadKg, previous.floorLoadLimitKgPerM2];
  await act(async () => root.render(<><div className="dashboard-left"><div className="dashboard-card">{['길이(m)', '폭(m)', '높이(m)', '최대중량', '바닥 허용하중(kg/m²)'].map((label, index) => <label key={label}>{label}<input defaultValue={dashboard[index]} /></label>)}</div></div><TransportEquipmentSelector /></>));
  act(() => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: 'truck', equipmentId: 'custom-heavy-truck' } })));
  const apply = () => [...host.querySelectorAll('button')].find(b => b.textContent === '사용자 규격 적용')!;
  act(() => apply().click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain('0보다 크게');
  expect(host.querySelectorAll('.transport-custom-editor input')).toHaveLength(5);
  expect(readTransportEquipment()).toEqual(previous);
  const inputs = [...host.querySelectorAll<HTMLInputElement>('.transport-custom-editor input')];
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    for (const [index, value] of [[3, '11000'], [4, '1000']] as const) {
      setter.call(inputs[index], value);
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  act(() => apply().click());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(readTransportEquipment()).toMatchObject({ id: 'custom-heavy-truck', maxPayloadKg: 11000, floorLoadLimitKgPerM2: 1000, requiresSpecification: false });
});
