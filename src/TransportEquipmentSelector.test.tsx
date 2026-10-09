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

it.each(['custom-truck', 'custom-heavy-truck'])('reopens %s with its registered values, not catalog template defaults', async id => {
  const equipment = { ...getTransportEquipment(id)!, length: 9.5, width: 2.33, height: 2.42, maxPayloadKg: 11000, floorLoadLimitKgPerM2: 900, requiresSpecification: false };
  act(() => selectTransportEquipment(equipment));
  await act(async () => root.render(<TransportEquipmentSelector />));
  act(() => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: 'truck', equipmentId: id } })));
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
