import type { CargoItem, ContainerSpec } from './engine/types';

export const STORAGE_KEY = 'container-loading-simulator-v1';
export const STORAGE_UPDATED_EVENT = 'container-loading-simulator:storage-updated';

export type StoredState = {
  container: ContainerSpec;
  cargo: CargoItem[];
};

export function normalizeCargo(cargo: CargoItem[]): CargoItem[] {
  return cargo.map((item) => ({ ...item, allowRotation: item.allowRotation !== false }));
}

export function readStoredState(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    return { ...parsed, cargo: normalizeCargo(parsed.cargo ?? []) };
  } catch {
    return null;
  }
}

export function writeStoredState(state: StoredState, notify = false): void {
  const normalized: StoredState = { ...state, cargo: normalizeCargo(state.cargo) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  if (notify) window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: normalized }));
}
