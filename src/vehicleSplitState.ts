import { useEffect, useSyncExternalStore } from 'react';
import { canSplitInto, cargoUnitCount, cargoWeightKg, isSplitVehicleCount, MAX_SPLIT_VEHICLES, splitCargoEvenly } from './engine/vehicleSplit';
import type { CargoItem } from './engine/types';
import { createExternalStore } from './store/externalStore';
import { readShipmentInstructionSnapshot, type ShipmentInstructionSnapshot } from './shipmentInstruction';
import { normalizeCargo, readStoredState, STORAGE_RESET_EVENT, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';

/**
 * A job divided over several vehicles (AGENTS.md 2L).
 *
 * The product plans, verifies and prints one vehicle at a time. A split therefore does not
 * hold several results: it remembers the whole cargo and which vehicle's share is the job's
 * current cargo. Choosing a vehicle writes that share as the stored job input, and everything
 * downstream (plan, 3D, verification, work order, exports) runs for it unchanged.
 *
 * The split is valid only while the stored job cargo is the active vehicle's share. Anything
 * that replaces the job's cargo ends it, so a share can never pass for the whole shipment.
 */
export const VEHICLE_SPLIT_KEY = 'container-loading-vehicle-split-v1';

export type VehicleVerdict = 'passed' | 'failed' | 'review';
/** The last completed verification of one vehicle. A note for the operator, never a current PASS. */
export type VehicleRecord = { status: VehicleVerdict; loaded: number; waiting: number; recordedAt: string };

export type VehicleSplit = {
  version: 1;
  /** The whole job as it stood when it was divided. */
  sourceCargo: CargoItem[];
  vehicleCount: number;
  /** 0-based index of the vehicle whose share is the job's current cargo. */
  active: number;
  records: Array<VehicleRecord | null>;
};

export type VehicleShareSummary = { index: number; units: number; weightKg: number; record: VehicleRecord | null };

/** Shown after a split ended because the open share was changed into some other partial list. */
export const VEHICLE_SPLIT_ENDED_NOTICE = '화물 목록이 바뀌어 차량 나누기를 풀었습니다. 지금 화물은 전체 출하 화물이 아닐 수 있습니다. 전체 화물로 계산하려면 제품 포장을 다시 확정하세요.';
export const VEHICLE_SPLIT_APPLIED_ANNOUNCEMENT = '차량 나누기를 적용했습니다. 표시된 차량의 화물로 ‘최종 적재 진행’을 누르세요.';
export const VEHICLE_SPLIT_RESTORED_ANNOUNCEMENT = '차량 나누기를 풀고 전체 화물로 되돌렸습니다.';
export const VEHICLE_SPLIT_SAME_LOAD_ANNOUNCEMENT = '이 차량은 앞 차량과 화물이 같습니다. 같은 적재안과 검증 결과를 그대로 씁니다.';

type Snapshot = { split: VehicleSplit | null; notice: string | null };
const EMPTY: Snapshot = { split: null, notice: null };
const store = createExternalStore<Snapshot>(EMPTY);
let announcement: string | null = null;
let refreshing = false;

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

const positive = (cargo: readonly CargoItem[]) => cargo.filter(item => item.quantity !== 0);
const unitKey = (cargo: readonly CargoItem[]) => JSON.stringify(positive(cargo).map(item => [item.id, item.quantity]));
const sameUnits = (a: readonly CargoItem[], b: readonly CargoItem[]) => unitKey(a) === unitKey(b);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A list that holds no more than the divided job did, and less of it: likely a share that was edited. */
function looksPartial(cargo: readonly CargoItem[], source: readonly CargoItem[]) {
  const whole = new Map(source.map(item => [item.id, item.quantity]));
  const lines = positive(cargo);
  return lines.length > 0 && lines.every(item => item.quantity <= (whole.get(item.id) ?? 0))
    && cargoUnitCount(lines) < cargoUnitCount(source);
}

function parse(raw: string | null): VehicleSplit | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<VehicleSplit>;
    if (value?.version !== 1 || !Array.isArray(value.sourceCargo) || !isSplitVehicleCount(Number(value.vehicleCount))) return null;
    const vehicleCount = Number(value.vehicleCount);
    const active = Number(value.active);
    if (!Number.isInteger(active) || active < 0 || active >= vehicleCount) return null;
    const sourceCargo = normalizeCargo(value.sourceCargo);
    if (!canSplitInto(sourceCargo, vehicleCount)) return null;
    const records = Array.from({ length: vehicleCount }, (_, index) => {
      const record = Array.isArray(value.records) ? value.records[index] : null;
      return record && (record.status === 'passed' || record.status === 'failed' || record.status === 'review')
        && Number.isFinite(record.loaded) && Number.isFinite(record.waiting) && typeof record.recordedAt === 'string'
        ? { status: record.status, loaded: record.loaded, waiting: record.waiting, recordedAt: record.recordedAt } : null;
    });
    return { version: 1, sourceCargo, vehicleCount, active, records };
  } catch {
    return null;
  }
}

function persist(split: VehicleSplit | null) {
  const target = storage();
  try {
    if (split) target?.setItem(VEHICLE_SPLIT_KEY, JSON.stringify(split));
    else target?.removeItem(VEHICLE_SPLIT_KEY);
  } catch { /* storage unavailable: the split lives for this page only */ }
}

function publish(split: VehicleSplit | null, notice: string | null = store.getSnapshot().notice) {
  const current = store.getSnapshot();
  if (sameJson(current.split, split) && current.notice === notice) return;
  store.setSnapshot({ split, notice });
}

export function vehicleShares(split: VehicleSplit): CargoItem[][] {
  return splitCargoEvenly(split.sourceCargo, split.vehicleCount);
}

/** Field edits made while one vehicle is open (stop number, handling) belong to the whole job. */
function mergeEdits(source: CargoItem[], stored: CargoItem[]): CargoItem[] {
  const edited = new Map(stored.map(item => [item.id, item]));
  return source.map(item => {
    const next = edited.get(item.id);
    return next ? { ...next, quantity: item.quantity } : item;
  });
}

/**
 * Re-reads the split and checks it against the stored job. Returns the split only while the
 * stored cargo is the active vehicle's share.
 */
export function refreshVehicleSplit(): VehicleSplit | null {
  if (refreshing) return store.getSnapshot().split;
  refreshing = true;
  try {
    const split = parse(storage()?.getItem(VEHICLE_SPLIT_KEY) ?? null);
    if (!split) { persist(null); publish(null); return null; }
    const stored = readStoredState();
    const share = vehicleShares(split)[split.active];
    if (!stored || !sameUnits(stored.cargo, share)) {
      // The job's cargo was replaced. Cargo confirmed in the packaging step is a whole shipment
      // and needs no warning; a list that is only part of the divided job does.
      const partial = Boolean(stored && !readShipmentInstructionSnapshot(stored.cargo) && looksPartial(stored.cargo, split.sourceCargo));
      persist(null);
      publish(null, partial ? VEHICLE_SPLIT_ENDED_NOTICE : null);
      return null;
    }
    const merged = mergeEdits(split.sourceCargo, normalizeCargo(stored.cargo));
    if (sameJson(merged, split.sourceCargo)) { publish(split); return split; }
    const next: VehicleSplit = { ...split, sourceCargo: merged };
    if (canSplitInto(merged, split.vehicleCount) && sameUnits(vehicleShares(next)[next.active], share)) {
      persist(next); publish(next);
      return next;
    }
    // The edit changes how the cartons divide (a weight changed): the shares are no longer
    // the ones that were planned. Give the whole cargo back rather than keep stale shares.
    persist(null); publish(null);
    announcement = VEHICLE_SPLIT_RESTORED_ANNOUNCEMENT;
    writeStoredState({ container: stored.container, cargo: merged }, true);
    return null;
  } finally {
    refreshing = false;
  }
}

export function readVehicleSplit(): VehicleSplit | null {
  return refreshVehicleSplit();
}

// Fired when a member's saved data has replaced the app storage (supabasePersistence.ts).
// Named here rather than imported: this store must not pull the persistence client in.
const PERSISTENCE_READY_EVENT = 'container-loading:supabase-persistence-ready';
const REFRESH_EVENTS = [STORAGE_UPDATED_EVENT, STORAGE_RESET_EVENT, PERSISTENCE_READY_EVENT, 'storage'];
const refreshOnEvent = () => { refreshVehicleSplit(); };

let listeners = 0;
function subscribe(listener: () => void) {
  if (listeners === 0 && typeof window !== 'undefined') {
    for (const name of REFRESH_EVENTS) window.addEventListener(name, refreshOnEvent);
  }
  listeners += 1;
  const unsubscribe = store.subscribe(listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    listeners -= 1;
    if (listeners === 0 && typeof window !== 'undefined') {
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, refreshOnEvent);
    }
  };
}

export function subscribeVehicleSplit(listener: () => void) {
  return subscribe(listener);
}

export function getVehicleSplitSnapshot() {
  return store.getSnapshot();
}

/** The number of vehicles the current job can be divided over next, or null when it cannot. */
export function nextVehicleCount(split: VehicleSplit | null, cargo: readonly CargoItem[]): number | null {
  const count = split ? split.vehicleCount + 1 : 2;
  const source = split ? split.sourceCargo : cargo;
  return count <= MAX_SPLIT_VEHICLES && canSplitInto(source, count) ? count : null;
}

/** Divides the stored job over `vehicleCount` vehicles and opens vehicle 1. */
export function startVehicleSplit(vehicleCount: number): boolean {
  const stored = readStoredState();
  if (!stored) return false;
  const current = refreshVehicleSplit();
  const sourceCargo = current ? current.sourceCargo : normalizeCargo(stored.cargo);
  if (!canSplitInto(sourceCargo, vehicleCount)) return false;
  const split: VehicleSplit = { version: 1, sourceCargo, vehicleCount, active: 0, records: Array.from({ length: vehicleCount }, () => null) };
  persist(split);
  publish(split, null);
  announcement = VEHICLE_SPLIT_APPLIED_ANNOUNCEMENT;
  writeStoredState({ container: stored.container, cargo: vehicleShares(split)[0] }, true);
  return true;
}

/** Makes another vehicle's share the job's current cargo. Its plan is computed afresh. */
export function selectSplitVehicle(index: number): boolean {
  const stored = readStoredState();
  const current = refreshVehicleSplit();
  if (!stored || !current || !Number.isInteger(index) || index < 0 || index >= current.vehicleCount) return false;
  if (index === current.active) return true;
  const split: VehicleSplit = { ...current, active: index };
  persist(split);
  publish(split, null);
  announcement = VEHICLE_SPLIT_APPLIED_ANNOUNCEMENT;
  writeStoredState({ container: stored.container, cargo: vehicleShares(split)[index] }, true);
  return true;
}

/** Ends the split and gives the whole cargo back to one vehicle. */
export function endVehicleSplit(): boolean {
  const stored = readStoredState();
  const current = refreshVehicleSplit();
  if (!stored || !current) return false;
  persist(null);
  publish(null, null);
  announcement = VEHICLE_SPLIT_RESTORED_ANNOUNCEMENT;
  writeStoredState({ container: stored.container, cargo: current.sourceCargo }, true);
  return true;
}

/** Notes (or clears) the verification outcome of the vehicle that is open. */
export function recordActiveVehicle(record: VehicleRecord | null) {
  const current = store.getSnapshot().split;
  if (!current) return;
  if (sameJson(current.records[current.active], record)) return;
  const records = current.records.map((item, index) => index === current.active ? record : item);
  const split: VehicleSplit = { ...current, records };
  persist(split);
  publish(split);
}

export function dismissVehicleSplitNotice() {
  publish(store.getSnapshot().split, null);
}

/** The status line for the cargo change an action here just caused; read once. */
export function takeVehicleSplitAnnouncement(): string | null {
  const text = announcement;
  announcement = null;
  return text;
}

export function vehicleShareSummaries(split: VehicleSplit): VehicleShareSummary[] {
  return vehicleShares(split).map((share, index) => ({
    index, units: cargoUnitCount(share), weightKg: cargoWeightKg(share), record: split.records[index] ?? null,
  }));
}

/** The vehicle a result for `cargo` belongs to, when a split is in force and the cargo is its open share. */
export function vehicleSplitContext(cargo: readonly CargoItem[]): { split: VehicleSplit; summaries: VehicleShareSummary[] } | null {
  const split = refreshVehicleSplit();
  if (!split || !sameUnits(cargo, vehicleShares(split)[split.active])) return null;
  return { split, summaries: vehicleShareSummaries(split) };
}

/**
 * The packaging confirmation a divided job stands on. A vehicle's share is deliberately not
 * the confirmed cargo; it is legitimate only while the whole job it was divided from still
 * is. Returns that confirmation when `cargo` is the open share, otherwise null.
 */
export function confirmedShipmentOfSplit(cargo: readonly CargoItem[]): ShipmentInstructionSnapshot | null {
  const context = vehicleSplitContext(cargo);
  return context ? readShipmentInstructionSnapshot(context.split.sourceCargo) : null;
}

export function useVehicleSplitSnapshot(): Snapshot {
  const snapshot = useSyncExternalStore(subscribe, store.getSnapshot, store.getSnapshot);
  // Hydrate after mount: a reload shows the split as soon as the first frame is committed.
  useEffect(() => { refreshVehicleSplit(); }, []);
  return snapshot;
}

/** Test seam: forget the in-memory split without touching storage. */
export function resetVehicleSplitStateForTests() {
  store.setSnapshot(EMPTY);
  announcement = null;
}
