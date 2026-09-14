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
 * 입력 원본(container/cargo)이 바뀌면 이전 계산 결과는 더 이상 같은 작업의 결과가 아니다.
 * 전역 캐시를 먼저 비워서 가이드 작업, 우측 요약, 결과 화면이 이전 결과를 새 입력처럼
 * 재사용하지 못하게 한다. 실제 App 결과는 다음 자동 적재가 완료되면서 다시 게시된다.
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  if (notify) {
    invalidatePublishedRuntimeState();
    window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: normalized }));
  }
}
