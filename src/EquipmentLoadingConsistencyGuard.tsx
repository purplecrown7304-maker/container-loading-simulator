import { useEffect } from 'react';
import { recordDiagnosticTrace } from './runtimeDiagnostics';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';
import { readTransportEquipment } from './transportEquipment';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

type GuardActionDetail = AppActionDetail & { equipmentConsistencyReplay?: boolean };

function differs(a: number | undefined, b: number | undefined, tolerance: number) {
  if (a == null || b == null) return a !== b;
  return Math.abs(a - b) > tolerance;
}

export function stateDiffersFromSelectedEquipment(state: StoredState) {
  const equipment = readTransportEquipment();
  return differs(state.container.length, equipment.length, 0.001)
    || differs(state.container.width, equipment.width, 0.001)
    || differs(state.container.height, equipment.height, 0.001)
    || differs(state.container.maxPayloadKg, equipment.maxPayloadKg, 1)
    || differs(state.container.floorLoadLimitKgPerM2, equipment.floorLoadLimitKgPerM2, 1);
}

export function stateWithSelectedEquipment(state: StoredState): StoredState {
  const equipment = readTransportEquipment();
  return {
    ...state,
    container: {
      ...state.container,
      length: equipment.length,
      width: equipment.width,
      height: equipment.height,
      maxPayloadKg: equipment.maxPayloadKg,
      floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
    },
  };
}

function recordSync(source: 'storage' | 'run-loading') {
  const equipment = readTransportEquipment();
  recordDiagnosticTrace('equipment-engine-auto-sync', {
    source,
    equipmentId: equipment.id,
    geometry: equipment.geometry,
    length: equipment.length,
    width: equipment.width,
    height: equipment.height,
    maxPayloadKg: equipment.maxPayloadKg,
    floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
  });
}

/**
 * 적재공간 선택 UI와 실제 엔진 ContainerSpec이 갈라지는 것을 차단한다.
 * 자동 적재 버튼 직전뿐 아니라 저장 상태가 App으로 전달되는 순간에도 선택 장비를 master로
 * 강제 동기화해, 이전 장비 규격으로 중간 적재 결과가 생성되는 레이스를 막는다.
 */
export default function EquipmentLoadingConsistencyGuard() {
  useEffect(() => {
    let cancelled = false;

    const onStorageUpdated = (event: Event) => {
      const custom = event as CustomEvent<StoredState>;
      const incoming = custom.detail ?? readStoredState();
      if (!incoming || !stateDiffersFromSelectedEquipment(incoming)) return;

      // stale 상태가 App의 STORAGE_UPDATED_EVENT listener에 먼저 도달하지 못하게 막는다.
      event.stopImmediatePropagation();
      const corrected = stateWithSelectedEquipment(incoming);
      writeStoredState(corrected, true);
      recordSync('storage');
    };

    const onRunLoading = (event: Event) => {
      const custom = event as CustomEvent<GuardActionDetail>;
      if (custom.detail?.action !== 'run-loading' || custom.detail?.equipmentConsistencyReplay) return;

      const stored = readStoredState();
      if (!stored || !stateDiffersFromSelectedEquipment(stored)) return;

      event.stopImmediatePropagation();
      const corrected = stateWithSelectedEquipment(stored);
      writeStoredState(corrected, true);
      recordSync('run-loading');

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          window.dispatchEvent(new CustomEvent<GuardActionDetail>(APP_ACTION_EVENT, {
            detail: { action: 'run-loading', equipmentConsistencyReplay: true },
          }));
        });
      });
    };

    window.addEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated, true);
    window.addEventListener(APP_ACTION_EVENT, onRunLoading, true);
    return () => {
      cancelled = true;
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated, true);
      window.removeEventListener(APP_ACTION_EVENT, onRunLoading, true);
    };
  }, []);

  return null;
}
