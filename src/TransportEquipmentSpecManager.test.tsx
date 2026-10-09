import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import TransportEquipmentSpecManager, { openTransportEquipmentSpecManager } from './TransportEquipmentSpecManager';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { removeTransportEquipmentSpecOverride, setTransportEquipmentSpecOverride, readTransportEquipmentSpecOverrides } from './transportEquipmentSpecOverrides';
let root: Root, host: HTMLDivElement;
const original = readTransportEquipment();
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); removeTransportEquipmentSpecOverride('tautliner'); removeTransportEquipmentSpecOverride('custom-heavy-truck'); act(() => selectTransportEquipment(original)); });
function button(text: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === text)!; }
async function open() { await act(async () => root.render(<TransportEquipmentSpecManager />)); act(() => openTransportEquipmentSpecManager()); }

it('edits a saved European trailer under the same id and category', async () => {
  const equipment = getTransportEquipment('tautliner')!;
  act(() => selectTransportEquipment(equipment)); await open();
  act(() => button('규격 저장').click());
  expect(readTransportEquipment()).toMatchObject({ id: 'tautliner', category: 'truck', length: 13.62, maxPayloadKg: 32800 });
  expect(readTransportEquipmentSpecOverrides()['tautliner']).toMatchObject({ length: 13.62, maxPayloadKg: 32800 });
  expect(readTransportEquipmentSpecOverrides()['20-standard']).toBeUndefined();
});

it('restores a large reference template without applying zero ratings or losing current actual data', async () => {
  const base = getTransportEquipment('custom-heavy-truck')!, equipment = { ...base, maxPayloadKg: 11000, floorLoadLimitKgPerM2: 900, requiresSpecification: false };
  setTransportEquipmentSpecOverride(base.id, equipment);
  act(() => selectTransportEquipment(equipment)); await open();
  act(() => button('기본 규격 복원').click());
  expect(readTransportEquipment()).toMatchObject({ id: base.id, maxPayloadKg: 11000, floorLoadLimitKgPerM2: 900 });
  expect(readTransportEquipmentSpecOverrides()[base.id]).toBeUndefined();
  expect(host.textContent).toContain('현재 계획의 실차 규격은 유지됩니다');
});
