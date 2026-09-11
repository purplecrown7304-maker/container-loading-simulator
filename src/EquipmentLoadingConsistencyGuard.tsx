import { useEffect } from 'react';
import { readStoredState, writeStoredState } from './storage';
import { readTransportEquipment } from './transportEquipment';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticTrace } from './runtimeDiagnostics';

type GuardActionDetail = AppActionDetail & { equipmentConsistencyReplay?: boolean };

function differs(a: number | undefined, b: number | undefined, tolerance: number) {
  if (a == null || b == null) return a !== b;
  return Math.abs(a - b) > tolerance;
}

/**
 * 적재공간 선택 UI와 실제 엔진 ContainerSpec이 갈라지는 것을 자동 적재 직전에 차단한다.
 * 선택 장비를 master로 사용하고 저장/App state를 먼저 동기화한 뒤 같은 작업을 재실행한다.
 */
export default function EquipmentLoadingConsistencyGuard() {
  useEffect(() => {
    let cancelled = false;

    const onRunLoading = (event: Event) => {
      const custom = event as CustomEvent<GuardActionDetail>;
      if (custom.detail?.action !== 'run-loading' || custom.detail?.equipmentConsistencyReplay) return;

      const stored = readStoredState();
      if (!stored) return;
      const equipment = readTransportEquipment();
      const mismatch =
        differs(stored.container.length, equipment.length, 0.001)
        || differs(stored.container.width, equipment.width, 0.001)
        || differs(stored.container.height, equipment.height, 0.001)
        || differs(stored.container.maxPayloadKg, equipment.maxPayloadKg, 1)
        || differs(stored.container.floorLoadLimitKgPerM2, equipment.floorLoadLimitKgPerM2, 1);
      if (!mismatch) return;

      event.stopImmediatePropagation();
      const container = {
        ...stored.container,
        length: equipment.length,
        width: equipment.width,
        height: equipment.height,
        maxPayloadKg: equipment.maxPayloadKg,
        floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
      };
      writeStoredState({ container, cargo: stored.cargo }, true);
      recordDiagnosticTrace('equipment-engine-auto-sync', {
        equipmentId: equipment.id,
        geometry: equipment.geometry,
        length: equipment.length,
        width: equipment.width,
        height: equipment.height,
        maxPayloadKg: equipment.maxPayloadKg,
        floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
      });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          window.dispatchEvent(new CustomEvent<GuardActionDetail>(APP_ACTION_EVENT, {
            detail: { action: 'run-loading', equipmentConsistencyReplay: true },
          }));
        });
      });
    };

    window.addEventListener(APP_ACTION_EVENT, onRunLoading, true);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_ACTION_EVENT, onRunLoading, true);
    };
  }, []);

  return null;
}
