import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { stagingMetadata, type SavedStagingWorkspace } from './stagingPersistence';

export const STORAGE_KEY = 'container-loading-simulator-v1';
export const STORAGE_UPDATED_EVENT = 'container-loading-simulator:storage-updated';
export const STORAGE_RESET_EVENT = 'container-loading-simulator:storage-reset';

export type StoredState = {
  container: ContainerSpec;
  cargo: CargoItem[];
  /** Optional final layout. Readers must revalidate it before use. Older input-only saves remain valid. */
  result?: LoadingResult;
  /** Optional provenance + pallet plan. Old input-only saves remain valid. */
  staging?: SavedStagingWorkspace;
};

export function normalizeCargo(cargo: CargoItem[]): CargoItem[] {
  return cargo.map((item) => ({ ...item, allowRotation: item.allowRotation !== false }));
}

export function readStoredState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    return { ...parsed, cargo: normalizeCargo(parsed.cargo ?? []), staging: stagingMetadata(parsed.staging) ?? undefined };
  } catch {
    return null;
  }
}

export function writeStoredState(state: StoredState, notify = false): void {
  const normalized: StoredState = { ...state, cargo: normalizeCargo(state.cargo), staging: stagingMetadata(state.staging) ?? undefined };
  // Legacy tools still write input-only state. Retain matching adapter metadata;
  // changed inputs never inherit another plan's saved yard membership.
  if (state.staging === undefined) {
    const previous = readStoredState();
    if (previous?.staging && JSON.stringify([previous.container, previous.cargo]) === JSON.stringify([normalized.container, normalized.cargo])) {
      normalized.staging = previous.staging;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  if (notify) window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: normalized }));
}
