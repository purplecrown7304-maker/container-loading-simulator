import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import TransportEquipmentSelector, { applyToDashboard } from './TransportEquipmentSelector';
import TransportEquipmentSafetyGuard from './TransportEquipmentSafetyGuard';
import EnterpriseTransportEquipmentAdapter from './EnterpriseTransportEquipmentAdapter';
import type { LoadingViewerProps } from './LoadingViewer';
import type { ContainerSpec } from './engine/types';
import { CONTAINERS } from './load-sim/presets';
import { DEFAULT_TRANSPORT_EQUIPMENT, OPEN_TRANSPORT_SELECTOR_EVENT, createCustomEquipment, getTransportEquipment,
  readTransportEquipment, selectTransportEquipment, type TransportEquipment } from './transportEquipment';
import { containerWithEquipment } from './transportEquipmentContainer';
import { stateWithSelectedEquipment } from './EquipmentLoadingConsistencyGuard';
import { writeStoredState } from './storage';
import { publishGuidedWorkflowState } from './guidedWorkflowState';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { publishWorkflowPreview } from './workflowPreview';
import { clearLoadSimAcceptance } from './rule-engine/acceptance';
import { clearPhysicsTarget } from './physicsTarget';

const captured = vi.hoisted(() => ({ props: null as LoadingViewerProps | null }));
vi.mock('./WorkspaceTools', () => ({ default: () => null }));
vi.mock('./PalletFooterSummary', () => ({ default: () => null }));
vi.mock('./PalletModePanel', () => ({ default: () => null }));
vi.mock('./EquipmentCard3D', () => ({ default: () => null }));
vi.mock('./EditableEquipmentCard', () => ({ default: ({ item, onSelect }: { item: TransportEquipment; onSelect: (item: TransportEquipment) => void }) =>
  <button data-equipment-id={item.id} onClick={() => onSelect(item)}>{item.name}</button> }));
vi.mock('./LoadingViewer', () => ({ default: (props: LoadingViewerProps) => { captured.props = props; return <canvas />; } }));
vi.mock('./autoCertification', () => ({ cancelPendingCertification: vi.fn() }));
vi.mock('./physicsTarget', async importOriginal => ({ ...await importOriginal<typeof import('./physicsTarget')>(), clearPhysicsTarget: vi.fn() }));
vi.mock('./rule-engine/acceptance', async importOriginal => ({ ...await importOriginal<typeof import('./rule-engine/acceptance')>(), clearLoadSimAcceptance: vi.fn() }));

let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); captured.props = null; vi.clearAllMocks();
  selectTransportEquipment(DEFAULT_TRANSPORT_EQUIPMENT);
  publishGuidedWorkflowState({ active: true, step: 1 }); publishGuidedLoadingUnit('boxes'); publishWorkflowPreview(null);
  host = document.createElement('div'); document.body.append(host);
  await import('./BoxLoadingViewer');
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host.remove(); publishWorkflowPreview(null);
  publishGuidedWorkflowState({ active: false, step: 1 }); vi.unstubAllGlobals();
});
const container = () => captured.props!.container;
const mount = async () => {
  root = createRoot(host);
  await act(async () => root!.render(<><App /><TransportEquipmentSelector /><EnterpriseTransportEquipmentAdapter /></>));
};
const choose = async (id: string) => {
  await act(async () => window.dispatchEvent(new Event(OPEN_TRANSPORT_SELECTOR_EVENT)));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>(`[data-equipment-id="${id}"]`)!.click());
};

it('applies named geometry with the expanded A form and no legacy area field', () => {
  host.innerHTML = `<aside class="dashboard-left"><section class="dashboard-card">
    <label>A 바닥 선하중(kg/m)<input value="3000"></label>
    <label>장비 자중(kg)<input value="3900"></label>
    <label>도어 폭(m)<input value="2.34"></label>
    <label>높이(m)<input value="2.698"></label>
    <label>최대중량<input value="26500"></label>
    <label>길이(m)<input value="12.032"></label>
    <label>도어 높이(m)<input value="2.585"></label>
    <label>폭(m)<input value="2.352"></label>
  </section></aside>`;
  expect(applyToDashboard(getTransportEquipment('20-standard')!)).toBe(true);
  expect([...host.querySelectorAll('input')].map(input => input.value)).toEqual(['3000', '3900', '2.34', '2.395', '28130', '5.9', '2.585', '2.352']);
});

it('does not partially edit a legacy form when a required field is absent', () => {
  host.innerHTML = '<aside class="dashboard-left"><section class="dashboard-card"><label>길이(m)<input value="12"></label></section></aside>';
  expect(applyToDashboard(getTransportEquipment('20-standard')!)).toBe(false);
  expect(host.querySelector('input')!.value).toBe('12');
});

it('keeps the cold A default exact and does not run the retired 40HC migration', async () => {
  await mount();
  await act(async () => new Promise(resolve => setTimeout(resolve, 120)));
  const source = CONTAINERS['40HC'];
  expect(container()).toMatchObject({ length: source.inner.l / 1000, width: source.inner.w / 1000, height: source.inner.h / 1000,
    maxPayloadKg: source.maxPayload, tareKg: source.tare, floorLineLoadKgPerM: source.floorLineLoad,
    doorWidth: source.door!.w / 1000, doorHeight: source.door!.h / 1000 });
  expect(readTransportEquipment().sourceLabel).toContain('A 제공 대표 기본값');
});

it.each(['20-standard', '40-high-cube', 'tautliner'])(
  'selects %s atomically, dismisses the overlay, and clears stale physics/proof', async id => {
    const defaultEquipment = DEFAULT_TRANSPORT_EQUIPMENT;
    const previous = containerWithEquipment({} as ContainerSpec, defaultEquipment);
    previous.axles = { frontX: 1, rearX: 5, emptyFront: 1000, emptyRear: 1200, maxFront: 5000, maxRear: 6000, rearAxleCount: 1, maxGross: 10000 };
    previous.heightLimitM = 2.1;
    writeStoredState({ container: previous, cargo: [] });
    await mount();
    vi.mocked(clearLoadSimAcceptance).mockClear(); vi.mocked(clearPhysicsTarget).mockClear();
    if (id === 'tautliner') {
      await act(async () => window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: 'truck' } })));
      await act(async () => host.querySelector<HTMLButtonElement>(`[data-equipment-id="${id}"]`)!.click());
    } else await choose(id);
    const selected = getTransportEquipment(id)!;
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(readTransportEquipment()).toEqual(selected);
    expect(container()).toEqual(containerWithEquipment(previous, selected));
    expect(container().tareKg).toBeUndefined(); expect(container().floorLineLoadKgPerM).toBeUndefined();
    expect(container().axles).toBeUndefined(); expect(container().heightLimitM).toBeUndefined();
    expect(container().doorWidth).toBe(selected.doorWidth); expect(container().doorHeight).toBe(selected.doorHeight);
    expect(clearLoadSimAcceptance).toHaveBeenCalled(); expect(clearPhysicsTarget).toHaveBeenCalled();
  },
);

it('hydrates equipment populated after import before App mount without emitting or changing snapshot identity', async () => {
  const actual = { ...getTransportEquipment('tautliner')!, tareKg: 5412, floorLineLoadKgPerM: 2750 };
  const saved = { ...containerWithEquipment({} as ContainerSpec, actual), doorWidth: 2.31, doorHeight: 2.41 };
  writeStoredState({ container: saved, cargo: [] });
  // Simulate asynchronous persistence hydration after transportEquipment.ts was imported.
  localStorage.setItem('container-loading:transport-equipment-v1', JSON.stringify(actual));
  const onEquipment = vi.fn();
  window.addEventListener('container-loading:transport-equipment-updated', onEquipment);
  try {
    const snapshot = readTransportEquipment();
    expect(snapshot).toEqual(actual);
    expect(readTransportEquipment()).toBe(snapshot);
    expect(onEquipment).not.toHaveBeenCalled();
    await mount();
    expect(readTransportEquipment()).toBe(snapshot);
    expect(container()).toEqual(saved);
    expect(onEquipment).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('container-loading:transport-equipment-updated', onEquipment);
  }
});

it('restores exact stored source when an older save has no selected-equipment key', async () => {
  const saved: ContainerSpec = { length: 9.7312, width: 2.4172, height: 2.6371, maxPayloadKg: 13242,
    transportKind: 'truck', tareKg: 2511, floorLineLoadKgPerM: 5432, doorWidth: 2.11, doorHeight: 2.21,
    heightLimitM: 2.32, access: ['left'],
    axles: { frontX: -1, rearX: 4, emptyFront: 400, emptyRear: 500, maxFront: 2000, maxRear: 3000, rearAxleCount: 1, maxGross: 4500 } };
  writeStoredState({ container: saved, cargo: [] });
  localStorage.removeItem('container-loading:transport-equipment-v1');
  const onEquipment = vi.fn();
  window.addEventListener('container-loading:transport-equipment-updated', onEquipment);
  root = createRoot(host);
  // Match main.tsx sibling order: guard captures the source before App mounts.
  await act(async () => root!.render(<><TransportEquipmentSafetyGuard /><TransportEquipmentSelector /><App /><EnterpriseTransportEquipmentAdapter /></>));
  expect(onEquipment).not.toHaveBeenCalled();
  window.removeEventListener('container-loading:transport-equipment-updated', onEquipment);
  await act(async () => selectTransportEquipment({ ...readTransportEquipment() }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 120)));
  expect(container()).toEqual(saved);
  expect(readTransportEquipment()).toMatchObject({ id: 'custom-truck', category: 'truck', length: saved.length,
    width: saved.width, height: saved.height, maxPayloadKg: saved.maxPayloadKg, tareKg: saved.tareKg,
    floorLineLoadKgPerM: saved.floorLineLoadKgPerM, doorWidth: saved.doorWidth, doorHeight: saved.doorHeight, axles: saved.axles });
});

it('preserves same-equipment actual fields during observer refresh and storage correction', async () => {
  const selected = getTransportEquipment('20-standard')!;
  selectTransportEquipment(selected);
  const entered: ContainerSpec = { ...containerWithEquipment({} as ContainerSpec, selected), tareKg: 2345,
    floorLineLoadKgPerM: 4321, doorWidth: 2.19, doorHeight: 2.13, heightLimitM: 2.2,
    axles: { frontX: 1, rearX: 4, emptyFront: 400, emptyRear: 500, maxFront: 2000, maxRear: 3000, rearAxleCount: 1, maxGross: 4500 } };
  writeStoredState({ container: entered, cargo: [] });
  await mount();
  expect(container()).toEqual(entered);
  vi.mocked(clearLoadSimAcceptance).mockClear();
  await act(async () => selectTransportEquipment({ ...selected }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
  expect(container()).toEqual(entered);
  expect(clearLoadSimAcceptance).not.toHaveBeenCalled();
  expect(stateWithSelectedEquipment({ container: { ...entered, floorLoadLimitKgPerM2: 1 }, cargo: [] }).container).toEqual(entered);
});

it('preserves persisted custom equipment exactly without nearest-preset recovery', async () => {
  const custom = createCustomEquipment('truck', { length: 9.7132, width: 2.4417, height: 2.5521, maxPayloadKg: 14500, floorLoadLimitKgPerM2: 1650 });
  selectTransportEquipment(custom);
  root = createRoot(host);
  await act(async () => root!.render(<TransportEquipmentSafetyGuard />));
  await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
  expect(readTransportEquipment()).toEqual(custom);
});

describe('equipment source mapping', () => {
  it('replaces a stale stored source without retaining its physics inputs or converting area load', () => {
    const selected = getTransportEquipment('tautliner')!; selectTransportEquipment(selected);
    const stale = { ...containerWithEquipment({} as ContainerSpec, DEFAULT_TRANSPORT_EQUIPMENT), heightLimitM: 2 };
    const corrected = stateWithSelectedEquipment({ container: stale, cargo: [] });
    expect(corrected.container).toEqual(containerWithEquipment(stale, selected));
    expect(corrected.container.floorLoadLimitKgPerM2).toBe(1700);
    expect(corrected.container.floorLineLoadKgPerM).toBeUndefined();
  });
});
