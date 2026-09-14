import type { CargoItem, ContainerSpec } from './engine/types';

export const STORAGE_KEY = 'container-loading-simulator-v1';
export const STORAGE_UPDATED_EVENT = 'container-loading-simulator:storage-updated';

export type StoredState = {
  container: ContainerSpec;
  cargo: CargoItem[];
};

type RuntimeStateWindow = Window & {
  __containerLoadingLatestResult?: unknown;
  __containerLoadingPalletSnapshot?: unknown;
  __containerLoadingLatestPhysics?: unknown;
  __containerLoadingStrategyDecision?: unknown;
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

/**
 * 입력 원본(container/cargo)이 실제로 바뀌면 이전 계산 결과는 더 이상 같은 작업의 결과가 아니다.
 * 반대로 같은 상태를 다시 쓰는 동기화 이벤트는 완료된 3D 결과를 지우면 안 된다.
 */
function invalidatePublishedRuntimeState() {
  if (typeof window === 'undefined') return;
  const runtime = window as RuntimeStateWindow;
  runtime.__containerLoadingLatestResult = undefined;
  runtime.__containerLoadingPalletSnapshot = undefined;
  runtime.__containerLoadingLatestPhysics = undefined;
  runtime.__containerLoadingStrategyDecision = undefined;
}

export function writeStoredState(state: StoredState, notify = false): void {
  const normalized: StoredState = { ...state, cargo: normalizeCargo(state.cargo) };
  const nextRaw = JSON.stringify(normalized);
  const previousRaw = localStorage.getItem(STORAGE_KEY);

  // 브리지들이 같은 canonical 입력을 반복해서 저장하는 경우가 있다.
  // 같은 입력을 '변경'으로 취급하면 완료 직후 결과/3D가 pending 상태로 되돌아간다.
  if (previousRaw === nextRaw) return;

  localStorage.setItem(STORAGE_KEY, nextRaw);
  if (notify) {
    invalidatePublishedRuntimeState();
    window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: normalized }));
  }
}
