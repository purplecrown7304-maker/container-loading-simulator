import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CargoItem, ContainerSpec } from './engine/types';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';
import {
  VEHICLE_SPLIT_ENDED_NOTICE,
  VEHICLE_SPLIT_KEY,
  endVehicleSplit,
  getVehicleSplitSnapshot,
  nextVehicleCount,
  readVehicleSplit,
  recordActiveVehicle,
  resetVehicleSplitStateForTests,
  selectSplitVehicle,
  startVehicleSplit,
  takeVehicleSplitAnnouncement,
  vehicleShareSummaries,
  vehicleSplitContext,
} from './vehicleSplitState';

const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
const line = (id: string, quantity: number, weightKg: number, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: .4, width: .3, height: .25, weightKg, quantity, allowRotation: true, ...overrides,
});
const cargo = [line('HEAVY', 5, 20), line('LIGHT', 8, 2), line('PART', 1, 9)];
const units = (list: CargoItem[] | undefined) => Object.fromEntries((list ?? []).map(item => [item.id, item.quantity]));

beforeEach(() => {
  localStorage.clear();
  resetVehicleSplitStateForTests();
  writeStoredState({ container, cargo });
});

describe('a job divided over several vehicles', () => {
  it('makes vehicle 1’s share the job cargo and tells the app once', () => {
    const updated = vi.fn();
    window.addEventListener(STORAGE_UPDATED_EVENT, updated);
    expect(startVehicleSplit(2)).toBe(true);
    window.removeEventListener(STORAGE_UPDATED_EVENT, updated);

    expect(updated).toHaveBeenCalledTimes(1);
    expect(units(readStoredState()?.cargo)).toEqual({ HEAVY: 3, LIGHT: 4 });
    const split = readVehicleSplit();
    expect(split).toMatchObject({ vehicleCount: 2, active: 0, records: [null, null] });
    expect(units(split?.sourceCargo)).toEqual({ HEAVY: 5, LIGHT: 8, PART: 1 });
    expect(vehicleShareSummaries(split!)).toEqual([
      { index: 0, units: 7, weightKg: 68, record: null },
      { index: 1, units: 7, weightKg: 57, record: null },
    ]);
    expect(takeVehicleSplitAnnouncement()).toContain('차량 나누기를 적용했습니다');
    expect(takeVehicleSplitAnnouncement()).toBeNull();
  });

  it('opens another vehicle, keeps what was noted for the first, and gives everything back at the end', () => {
    startVehicleSplit(2);
    recordActiveVehicle({ status: 'passed', loaded: 7, waiting: 0, recordedAt: '2026-11-20T06:00:00.000Z' });
    expect(selectSplitVehicle(1)).toBe(true);
    expect(units(readStoredState()?.cargo)).toEqual({ HEAVY: 2, LIGHT: 4, PART: 1 });
    expect(readVehicleSplit()).toMatchObject({ active: 1, records: [{ status: 'passed', loaded: 7, waiting: 0 }, null] });
    expect(selectSplitVehicle(2)).toBe(false);

    expect(endVehicleSplit()).toBe(true);
    expect(readStoredState()?.cargo).toEqual(cargo);
    expect(readVehicleSplit()).toBeNull();
    expect(localStorage.getItem(VEHICLE_SPLIT_KEY)).toBeNull();
    expect(takeVehicleSplitAnnouncement()).toContain('전체 화물로 되돌렸습니다');
  });

  it('divides the whole job again when one more vehicle is asked for', () => {
    startVehicleSplit(2);
    selectSplitVehicle(1);
    expect(nextVehicleCount(readVehicleSplit(), [])).toBe(3);
    expect(startVehicleSplit(3)).toBe(true);
    const split = readVehicleSplit()!;
    expect(split).toMatchObject({ vehicleCount: 3, active: 0, records: [null, null, null] });
    expect(vehicleShareSummaries(split).reduce((sum, item) => sum + item.units, 0)).toBe(14);
    // Whole shares weigh 24 kg. HEAVY's two odd cartons go to vehicles 1 and 2, PART to the
    // lighter vehicle 3, LIGHT's two to vehicle 3 and then vehicle 1.
    expect(vehicleShareSummaries(split).map(item => item.units)).toEqual([5, 4, 5]);
    expect(units(readStoredState()?.cargo)).toEqual({ HEAVY: 2, LIGHT: 3 });
  });

  it('is not offered when a vehicle would be left empty', () => {
    writeStoredState({ container, cargo: [line('ONLY', 1, 5)] });
    expect(nextVehicleCount(null, readStoredState()!.cargo)).toBeNull();
    expect(startVehicleSplit(2)).toBe(false);
    expect(readVehicleSplit()).toBeNull();
    expect(readStoredState()?.cargo).toEqual([line('ONLY', 1, 5)]);
  });

  it('ends without a warning when a whole new cargo list replaces the share', () => {
    startVehicleSplit(2);
    writeStoredState({ container, cargo: [line('HEAVY', 9, 20), line('OTHER', 3, 1)] }, true);
    expect(readVehicleSplit()).toBeNull();
    expect(getVehicleSplitSnapshot().notice).toBeNull();
    expect(units(readStoredState()?.cargo)).toEqual({ HEAVY: 9, OTHER: 3 });
  });

  it('warns when the open share is changed into another partial list', () => {
    startVehicleSplit(2);
    writeStoredState({ container, cargo: [line('HEAVY', 3, 20)] }, true);
    expect(readVehicleSplit()).toBeNull();
    expect(getVehicleSplitSnapshot().notice).toBe(VEHICLE_SPLIT_ENDED_NOTICE);
  });

  it('carries an edit made in one vehicle over to the whole job', () => {
    startVehicleSplit(2);
    const share = readStoredState()!.cargo;
    writeStoredState({ container, cargo: share.map(item => item.id === 'LIGHT' ? { ...item, unloadPriority: 2 } : item) }, true);
    const split = readVehicleSplit();
    expect(split?.sourceCargo.find(item => item.id === 'LIGHT')).toMatchObject({ quantity: 8, unloadPriority: 2 });
    selectSplitVehicle(1);
    expect(readStoredState()?.cargo.find(item => item.id === 'LIGHT')).toMatchObject({ quantity: 4, unloadPriority: 2 });
  });

  it('gives the whole cargo back when an edit changes how the cartons divide', () => {
    startVehicleSplit(2);
    takeVehicleSplitAnnouncement();
    // PART (9 kg) went to vehicle 2. At 30 kg it is handed out first and belongs in vehicle 1.
    selectSplitVehicle(1);
    takeVehicleSplitAnnouncement();
    const share = readStoredState()!.cargo;
    writeStoredState({ container, cargo: share.map(item => item.id === 'PART' ? { ...item, weightKg: 30 } : item) }, true);
    expect(readVehicleSplit()).toBeNull();
    expect(units(readStoredState()?.cargo)).toEqual({ HEAVY: 5, LIGHT: 8, PART: 1 });
    expect(readStoredState()?.cargo.find(item => item.id === 'PART')?.weightKg).toBe(30);
    expect(takeVehicleSplitAnnouncement()).toContain('전체 화물로 되돌렸습니다');
  });

  it('names the vehicle of a result only for the share that is open', () => {
    startVehicleSplit(2);
    const share = readStoredState()!.cargo;
    expect(vehicleSplitContext(share)?.split.active).toBe(0);
    expect(vehicleSplitContext([...share, line('EMPTY', 0, 1)])?.split.active).toBe(0);
    expect(vehicleSplitContext(cargo)).toBeNull();
  });

  it('ignores a stored split that does not describe a valid division', () => {
    localStorage.setItem(VEHICLE_SPLIT_KEY, JSON.stringify({ version: 1, sourceCargo: cargo, vehicleCount: 9, active: 0, records: [] }));
    expect(readVehicleSplit()).toBeNull();
    localStorage.setItem(VEHICLE_SPLIT_KEY, '{not json');
    expect(readVehicleSplit()).toBeNull();
    // A valid record whose share is not the stored cargo is not a split of this job either.
    localStorage.setItem(VEHICLE_SPLIT_KEY, JSON.stringify({ version: 1, sourceCargo: cargo, vehicleCount: 2, active: 1, records: [] }));
    expect(readVehicleSplit()).toBeNull();
    expect(localStorage.getItem(VEHICLE_SPLIT_KEY)).toBeNull();
  });
});
