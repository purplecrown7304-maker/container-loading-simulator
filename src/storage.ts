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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = stableValue((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

function stateFingerprint(state: StoredState) {
  return JSON.stringify(stableValue({ ...state, cargo: normalizeCargo(state.cargo ?? []) }));
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
  const previous = readStoredState();

  // 객체의 key 순서가 달라도 실제 container/cargo 값이 같으면 같은 입력이다.
  // 같은 입력을 다시 저장하며 결과 캐시를 지우는 것이 자동 적재 완료 후 3D가 사라지는
  // 대표적인 경쟁 조건이므로, 의미상 동일한 쓰기는 완전히 무시한다.
  if (previous && stateFingerprint(previous) === stateFingerprint(normalized)) return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  if (notify) {
    invalidatePublishedRuntimeState();
    window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: normalized }));
  }
}
