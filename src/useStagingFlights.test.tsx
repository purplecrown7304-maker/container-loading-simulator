import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStagingFlights, type StagingFlightOrigin } from './useStagingFlights';
import type { StagingCounts, StagingInventory, StagingUnit } from './stagingInventory';
import { buildStagingYardLayout } from './stagingYardLayout';
import { STORAGE_KEY } from './storage';
import { INERTIA_CERTIFICATION_EVENT } from './inertiaCertification';

const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
function unit(id: string, placed = false): StagingUnit {
  return { id, kind: 'box', name: id, cargoId: 'SKU', cargoIds: ['SKU'],
    length: .5, width: .4, height: .3, weightKg: 10, boxCount: 1, unloadPriorities: [],
    location: placed ? 'vehicle' : 'yard', verdict: placed ? 'placed' : 'pending', reasons: [],
    boxUnits: [{ id: 'engine:' + id, stableId: 'stable:' + id, cargoId: 'SKU' }],
    ...(placed ? { placement: { cargoId: 'SKU', unitId: 'engine:' + id, x: id === 'a' ? 1 : 2,
      y: .5, z: 0, length: .5, width: .4, height: .3, weightKg: 10 } } : {}) };
}
function inventory(units: StagingUnit[], inputSignature = 'same-input'): StagingInventory {
  const counts = (rows: StagingUnit[]): StagingCounts => ({ pallets: 0, looseBoxes: rows.length,
    boxes: rows.length, weightKg: rows.reduce((sum, row) => sum + row.weightKg, 0) });
  const yardUnits = units.filter(row => row.location === 'yard'), vehicleUnits = units.filter(row => row.location === 'vehicle');
  return { inputSignature, units, yardUnits, vehicleUnits, otherVehicleUnits: [],
    summary: { total: counts(units), yard: counts(yardUnits), vehicle: counts(vehicleUnits),
      otherVehicles: counts([]), unloaded: counts([]) }, excluded: [], issues: [], packagingStatus: 'not-required',
    referenceResult: false, identity: { unitToStableId: {} } };
}
function origin(rows: StagingUnit[], planKey = '', signature = 'same-input'): StagingFlightOrigin {
  return { inventory: inventory(rows, signature),
    layout: buildStagingYardLayout(rows.filter(row => row.location === 'yard'), { container, vehicleRig: 'none' }), planKey };
}
type Options = Parameters<typeof useStagingFlights>[0];
let options: Options, latest: ReturnType<typeof useStagingFlights>, root: Root, host: HTMLDivElement;
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let mediaDescriptor: PropertyDescriptor | undefined;
const mediaListeners = new Set<() => void>();
function Probe() { latest = useStagingFlights(options); return null; }
async function render(change: Partial<Options> = {}) {
  options = { ...options, ...change };
  await act(async () => root.render(<Probe />));
}
async function accept(source: StagingFlightOrigin, destination: StagingFlightOrigin) {
  await act(async () => latest.queueLoad(source));
  await render({ ...destination, isPreview: false });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); mediaListeners.clear();
  mediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  media = { matches: false, addEventListener: vi.fn((_type: string, listener: () => void) => mediaListeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => mediaListeners.delete(listener)) };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => media) });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  options = { ...origin([unit('a'), unit('b')]), epoch: 'job-a', container, vehicleRig: 'none',
    calculating: false, confirmed: true, isPreview: true };
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); localStorage.clear(); mediaListeners.clear();
  if (mediaDescriptor) Object.defineProperty(window, 'matchMedia', mediaDescriptor);
  else Reflect.deleteProperty(window, 'matchMedia');
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('display-only staging flight lifecycle', () => {
  it('queues only an accepted changed plan and preserves all input counts, placements and identities', async () => {
    const source = origin([unit('a'), unit('b')]), destination = origin([unit('a', true), unit('b')], 'accepted-a');
    const before = JSON.stringify({ source, destination });
    await render(source); await act(async () => latest.queueLoad(source));
    expect(latest.sequence).toBeNull(); await render({ ...source }); expect(latest.sequence).toBeNull();
    await render({ ...destination, isPreview: false });
    expect(latest.sequence?.flights.map(flight => flight.unitId)).toEqual(['a']);
    expect(latest.sequence?.planKey).toBe('accepted-a'); expect(latest.sequence?.inputSignature).toBe('same-input');
    expect(destination.inventory.summary.total.boxes).toBe(2); expect(destination.inventory.summary.vehicle.boxes).toBe(1);
    expect(destination.inventory.summary.yard.boxes).toBe(1); expect(JSON.stringify({ source, destination })).toBe(before);
    const sequence = latest.sequence; await render({ ...destination }); expect(latest.sequence).toBe(sequence);
  });

  it('captures the pre-worker yard on calculation rise and animates only newly accepted members on fall', async () => {
    const source = origin([unit('a', true), unit('b'), unit('c')], 'accepted-a');
    await render({ ...source, isPreview: false });
    const changedDuringCalculation = { ...source.layout,
      slots: source.layout.slots.map(slot => ({ ...slot, center: [slot.center[0] + 100, slot.center[1], slot.center[2]] as [number, number, number] })) };
    await render({ calculating: true, layout: changedDuringCalculation }); expect(latest.sequence).toBeNull();
    const next = origin([unit('a', true), unit('b', true), unit('c')], 'accepted-ab');
    await render({ ...next, calculating: false, isPreview: false });
    expect(latest.sequence?.flights.map(flight => flight.unitId)).toEqual(['b']);
    expect(latest.sequence?.flights[0].from.position).toEqual(source.layout.slots.find(slot => slot.unitId === 'b')!.center);
    expect(next.inventory.summary.total.boxes).toBe(3); expect(next.inventory.summary.vehicle.boxes).toBe(2);
  });

  it('does not autoplay a mounted, restored or unrelated refreshed plan without a loading request', async () => {
    const loaded = origin([unit('a', true), unit('b')], 'restored-a');
    await render({ ...loaded, isPreview: false }); expect(latest.sequence).toBeNull();
    await render({ ...origin([unit('a', true), unit('b', true)], 'restored-ab'), isPreview: false });
    expect(latest.sequence).toBeNull();
    await render({ ...loaded, isPreview: false }); expect(latest.sequence).toBeNull();
  });

  it('cancels or skips display work without changing accepted data, writing storage or publishing certification', async () => {
    const source = origin([unit('a'), unit('b')]), accepted = origin([unit('a', true), unit('b')], 'accepted-a');
    const stored = JSON.stringify({ savedPlan: 'untouched' }); localStorage.setItem(STORAGE_KEY, stored);
    const certification = vi.fn(), acceptedData = JSON.stringify(accepted);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, certification);
    const storageWrite = vi.spyOn(localStorage, 'setItem');
    try {
      await render(source); await accept(source, accepted);
      expect(latest.sequence).not.toBeNull(); await act(async () => latest.cancel()); expect(latest.sequence).toBeNull();
      await render({ ...source, isPreview: true }); await accept(source, { ...accepted, planKey: 'accepted-again' });
      const id = latest.sequence!.id; await act(async () => latest.complete(id)); expect(latest.sequence).toBeNull();
      expect(JSON.stringify(accepted)).toBe(acceptedData); expect(storageWrite).not.toHaveBeenCalled();
      expect(certification).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    } finally { window.removeEventListener(INERTIA_CERTIFICATION_EVENT, certification); }
  });

  it('clears work on a changed job/input and never replays an aborted calculation when data arrives later', async () => {
    const source = origin([unit('a'), unit('b')]), accepted = origin([unit('a', true), unit('b')], 'accepted-a');
    await render(source); await accept(source, accepted); expect(latest.sequence).not.toBeNull();
    await render({ epoch: 'job-b', ...origin([unit('a'), unit('b')], '', 'new-input'), isPreview: true });
    expect(latest.sequence).toBeNull();
    await render({ ...source, epoch: 'job-a', isPreview: true }); expect(latest.sequence).toBeNull();
    await render({ calculating: true }); await render({ calculating: false, isPreview: true });
    await render({ ...accepted, isPreview: false }); expect(latest.sequence).toBeNull();
  });

  it('clears an active flight when another calculation begins and ignores a failed or unconfirmed result', async () => {
    const source = origin([unit('a'), unit('b')]), accepted = origin([unit('a', true), unit('b')], 'accepted-a');
    await render(source); await accept(source, accepted); expect(latest.sequence).not.toBeNull();
    await render({ calculating: true }); expect(latest.sequence).toBeNull();
    await render({ calculating: false, confirmed: false, ...origin([unit('a', true), unit('b', true)], 'not-confirmed') });
    expect(latest.sequence).toBeNull();
    await render({ confirmed: true }); expect(latest.sequence).toBeNull();
  });

  it('snaps with motion disabled or reduced motion, cancels live work and does not replay when reenabled', async () => {
    const source = origin([unit('a'), unit('b')]), accepted = origin([unit('a', true), unit('b')], 'accepted-a');
    await render(source); await act(async () => latest.setEnabled(false)); await accept(source, accepted);
    expect(latest.enabled).toBe(false); expect(latest.sequence).toBeNull();
    await act(async () => latest.setEnabled(true)); expect(latest.sequence).toBeNull();
    await render({ ...source, isPreview: true }); await accept(source, accepted); expect(latest.sequence).not.toBeNull();
    await act(async () => { media.matches = true; mediaListeners.forEach(listener => listener()); });
    expect(latest.reducedMotion).toBe(true); expect(latest.sequence).toBeNull();
    await render({ ...source, isPreview: true }); await accept(source, accepted); expect(latest.sequence).toBeNull();
    await act(async () => { media.matches = false; mediaListeners.forEach(listener => listener()); });
    expect(latest.sequence).toBeNull(); expect(latest.reducedMotion).toBe(false);
  });

  it('ignores a stale completed sequence id after a newer accepted load', async () => {
    const source = origin([unit('a'), unit('b')]), accepted = origin([unit('a', true), unit('b')], 'accepted-a');
    await render(source); await accept(source, accepted); const firstId = latest.sequence!.id;
    const second = origin([unit('a', true), unit('b', true)], 'accepted-ab'); await accept(accepted, second);
    const current = latest.sequence!; expect(current.id).toBeGreaterThan(firstId);
    expect(current.flights.map(flight => flight.unitId)).toEqual(['b']);
    await act(async () => latest.complete(firstId)); expect(latest.sequence).toBe(current);
    await act(async () => latest.complete(current.id)); expect(latest.sequence).toBeNull();
  });
  it('starts with reduced motion without queuing, clears a cancelled pending request and releases preference listeners', async () => {
    const source = origin([unit('a'), unit('b')]), accepted = origin([unit('a', true), unit('b')], 'accepted-a');
    media.matches = true; await render(source); expect(latest.reducedMotion).toBe(true);
    await accept(source, accepted); expect(latest.sequence).toBeNull();
    await act(async () => { media.matches = false; mediaListeners.forEach(listener => listener()); });
    await render({ ...source, isPreview: true });
    await act(async () => latest.queueLoad(source)); await act(async () => latest.cancel());
    await render({ ...accepted, isPreview: false }); expect(latest.sequence).toBeNull();
    expect(mediaListeners.size).toBe(1); await act(async () => root.render(null)); expect(mediaListeners.size).toBe(0);
  });
});
