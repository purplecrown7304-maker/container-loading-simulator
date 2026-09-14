import { useEffect } from 'react';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import { LOCAL_OPERATOR_EVENT } from './localOperator';
import { PRODUCT_SELECTION_EVENT } from './productWorkflow';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';
import { TRANSPORT_EQUIPMENT_EVENT, readTransportEquipment } from './transportEquipment';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticTrace } from './runtimeDiagnostics';

type ReplayActionDetail = AppActionDetail & {
  confirmedPackagingReplay?: boolean;
  equipmentConsistencyReplay?: boolean;
};

type ConfirmedPackagingState = {
  shipmentNo: string;
  capturedAt: string;
  container: StoredState['container'];
  cargo: StoredState['cargo'];
};

const CONFIRMED_PACKAGING_KEY = 'container-loading:guided-confirmed-packaging-state:v1';
const EPS = 0.001;

function sameNumber(a: number | undefined, b: number | undefined, tolerance = EPS) {
  if (a == null || b == null) return a === b;
  return Math.abs(a - b) <= tolerance;
}

function sameContainer(a: StoredState['container'], b: StoredState['container']) {
  return sameNumber(a.length, b.length)
    && sameNumber(a.width, b.width)
    && sameNumber(a.height, b.height)
    && sameNumber(a.maxPayloadKg, b.maxPayloadKg, 1)
    && sameNumber(a.floorLoadLimitKgPerM2, b.floorLoadLimitKgPerM2, 1);
}

function cloneState(state: ConfirmedPackagingState): ConfirmedPackagingState {
  return {
    ...state,
    container: { ...state.container },
    cargo: state.cargo.map(item => ({ ...item })),
  };
}

function readConfirmedPackaging(): ConfirmedPackagingState | null {
  try {
    const raw = window.localStorage.getItem(CONFIRMED_PACKAGING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConfirmedPackagingState;
    if (!parsed?.shipmentNo || !parsed.container || !Array.isArray(parsed.cargo) || !parsed.cargo.length) return null;
    return cloneState(parsed);
  } catch {
    return null;
  }
}

function writeConfirmedPackaging(state: StoredState) {
  const snapshot = readShipmentInstructionSnapshot(state.cargo);
  if (!snapshot) return false;
  const next: ConfirmedPackagingState = {
    shipmentNo: snapshot.shipmentNo,
    capturedAt: new Date().toISOString(),
    container: { ...state.container },
    cargo: state.cargo.map(item => ({ ...item })),
  };
  try {
    window.localStorage.setItem(CONFIRMED_PACKAGING_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function clearConfirmedPackaging() {
  try { window.localStorage.removeItem(CONFIRMED_PACKAGING_KEY); } catch { /* storage unavailable */ }
}

function totalUnits(cargo: StoredState['cargo']) {
  return cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
}

function cargoSummary(cargo: StoredState['cargo']) {
  return cargo.map(item => `${item.id}:${item.quantity}`).join('|');
}

function applyGeneratedCartonRuntimeStack(state: StoredState): StoredState {
  let changed = false;
  const cargo = state.cargo.map(item => {
    if (!item.boxId?.startsWith('AUTO-')) return item;
    const geometricLayers = Math.max(1, Math.floor((state.container.height + 1e-9) / Math.max(item.height, 1e-9)));
    const provisionalLayers = Math.max(1, Math.min(3, geometricLayers));
    if (item.maxStackLayers === provisionalLayers && item.maxTopLoadKg === undefined) return item;
    changed = true;
    return {
      ...item,
      maxStackLayers: provisionalLayers,
      maxTopLoadKg: undefined,
    };
  });
  return changed ? { ...state, cargo } : state;
}

/**
 * 제품 포장 단계에서 확정된 cargo 자체를 자동 적재의 단일 원본으로 고정한다.
 * App의 일반 화물 목록이나 이전 적재 결과가 남아 있어도 자동 적재 직전에 확정 cargo를
 * 다시 주입하고 React가 해당 입력을 반영한 뒤에만 실제 계산을 재개한다.
 */
export default function ConfirmedPackagingLoadingBridge() {
  useEffect(() => {
    let cancelled = false;
    let replayTimer = 0;
    let lastAlert = '';

    const captureConfirmedPackaging = (event: Event) => {
      if (document.documentElement.dataset.guidedStep !== '3') return;
      const state = (event as CustomEvent<StoredState>).detail ?? readStoredState();
      if (!state?.cargo?.length) return;
      if (!writeConfirmedPackaging(state)) return;
      const snapshot = readShipmentInstructionSnapshot(state.cargo);
      recordDiagnosticTrace('guided-packaging-canonical-captured', {
        shipmentNo: snapshot?.shipmentNo,
        cargoTypes: state.cargo.length,
        totalUnits: totalUnits(state.cargo),
        cargo: cargoSummary(state.cargo),
      });
    };

    const invalidateBeforePackaging = () => {
      const step = Number(document.documentElement.dataset.guidedStep || 1);
      if (step <= 3) clearConfirmedPackaging();
    };

    const alertOnce = (message: string) => {
      if (lastAlert === message) return;
      lastAlert = message;
      window.setTimeout(() => { lastAlert = ''; }, 800);
      window.alert(message);
    };

    const onRunLoading = (event: Event) => {
      const custom = event as CustomEvent<ReplayActionDetail>;
      if (custom.detail?.action !== 'run-loading' || custom.detail?.confirmedPackagingReplay) return;
      if (document.documentElement.dataset.guidedStep !== '5') return;

      let confirmed = readConfirmedPackaging();
      if (!confirmed) {
        const stored = readStoredState();
        if (stored?.cargo?.length && readShipmentInstructionSnapshot(stored.cargo)) {
          writeConfirmedPackaging(stored);
          confirmed = readConfirmedPackaging();
        }
      }

      if (!confirmed) {
        event.stopImmediatePropagation();
        alertOnce('제품 포장에서 확정한 박스 데이터가 없습니다. 제품 포장 단계에서 포장을 확정한 뒤 자동 적재를 실행하세요.');
        return;
      }

      const snapshot = readShipmentInstructionSnapshot(confirmed.cargo);
      if (!snapshot || snapshot.shipmentNo !== confirmed.shipmentNo) {
        event.stopImmediatePropagation();
        clearConfirmedPackaging();
        alertOnce('제품 포장 데이터가 변경되었습니다. 제품 포장을 다시 확정한 뒤 자동 적재를 실행하세요.');
        return;
      }

      const equipment = readTransportEquipment();
      const equipmentContainer = {
        ...confirmed.container,
        length: equipment.length,
        width: equipment.width,
        height: equipment.height,
        maxPayloadKg: equipment.maxPayloadKg,
        floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
      };
      if (!sameContainer(confirmed.container, equipmentContainer)) {
        event.stopImmediatePropagation();
        clearConfirmedPackaging();
        alertOnce('적재공간이 제품 포장 이후 변경되었습니다. 현재 적재공간 기준으로 제품 포장을 다시 확정하세요.');
        return;
      }

      event.stopImmediatePropagation();
      window.clearTimeout(replayTimer);

      const canonical = applyGeneratedCartonRuntimeStack({
        container: { ...confirmed.container },
        cargo: confirmed.cargo.map(item => ({ ...item })),
      });

      recordDiagnosticTrace('guided-auto-loading-canonical-replay', {
        shipmentNo: confirmed.shipmentNo,
        cargoTypes: canonical.cargo.length,
        totalUnits: totalUnits(canonical.cargo),
        cargo: cargoSummary(canonical.cargo),
      });

      writeStoredState(canonical, true);
      replayTimer = window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (cancelled) return;
            const current = readStoredState();
            if (!current || !readShipmentInstructionSnapshot(current.cargo)) {
              alertOnce('자동 적재 직전 포장 데이터 동기화에 실패했습니다. 제품 포장을 다시 확정하세요.');
              return;
            }
            window.dispatchEvent(new CustomEvent<ReplayActionDetail>(APP_ACTION_EVENT, {
              detail: {
                ...custom.detail,
                action: 'run-loading',
                synchronizedStoredState: true,
                confirmedPackagingReplay: true,
              },
            }));
          });
        });
      }, 120);
    };

    window.addEventListener(STORAGE_UPDATED_EVENT, captureConfirmedPackaging);
    window.addEventListener(PRODUCT_SELECTION_EVENT, invalidateBeforePackaging);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, invalidateBeforePackaging);
    window.addEventListener(LOCAL_OPERATOR_EVENT, clearConfirmedPackaging);
    window.addEventListener(ADMIN_ACCESS_EVENT, clearConfirmedPackaging);
    window.addEventListener(APP_ACTION_EVENT, onRunLoading, true);

    return () => {
      cancelled = true;
      window.clearTimeout(replayTimer);
      window.removeEventListener(STORAGE_UPDATED_EVENT, captureConfirmedPackaging);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, invalidateBeforePackaging);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, invalidateBeforePackaging);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, clearConfirmedPackaging);
      window.removeEventListener(ADMIN_ACCESS_EVENT, clearConfirmedPackaging);
      window.removeEventListener(APP_ACTION_EVENT, onRunLoading, true);
    };
  }, []);

  return null;
}
