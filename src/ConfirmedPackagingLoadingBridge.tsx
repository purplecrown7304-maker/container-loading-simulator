import { useEffect } from 'react';
import { readShipmentInstructionSnapshot, type ShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, writeStoredState, type StoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticTrace } from './runtimeDiagnostics';

type ReplayActionDetail = AppActionDetail & {
  confirmedPackagingReplay?: boolean;
  equipmentConsistencyReplay?: boolean;
};

function applyConfirmedPackagingIdentity(state: StoredState, snapshot: ShipmentInstructionSnapshot): StoredState {
  const lineByCargo = new Map(snapshot.lines.map(line => [line.cargoId, line]));
  let changed = false;
  const cargo = state.cargo.map(item => {
    const baseCargoId = item.id.endsWith('-PARTIAL') ? item.id.slice(0, -'-PARTIAL'.length) : item.id;
    const line = lineByCargo.get(item.id) ?? lineByCargo.get(baseCargoId);
    if (!line) return item;

    const boxId = line.packagingMode === 'box' ? line.boxId : undefined;
    const boxName = line.packagingMode === 'box' ? line.boxName : undefined;
    const next = {
      ...item,
      productId: item.productId ?? line.productId,
      productName: item.productName ?? line.productName,
      boxId,
      boxName,
    };
    if (
      next.productId !== item.productId
      || next.productName !== item.productName
      || next.boxId !== item.boxId
      || next.boxName !== item.boxName
    ) changed = true;
    return next;
  });
  return changed ? { ...state, cargo } : state;
}

/**
 * 자동설계(AUTO-*) 박스는 과거 코드에서 무조건 1단/상부하중 0kg로 내려가면서
 * 바닥에 들어가는 수량만 적재되는 문제가 있었다. 제품 포장 시뮬레이터의 운영 기준인
 * 최대 3단 범위 안에서 컨테이너 높이가 허용하는 만큼 실제 자동 적재에도 적용한다.
 * 보유/등록 박스는 기존 제조 강도(maxStackLayers/maxTopLoadKg)를 그대로 존중한다.
 */
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
      // AUTO 박스는 제조강도 실측값이 없으므로 0kg로 적층을 봉쇄하지 않는다.
      // 실제 운영에서는 3단 이하의 설계 목표값으로 취급하고 제조 강도 확인이 별도로 필요하다.
      maxTopLoadKg: undefined,
    };
  });
  return changed ? { ...state, cargo } : state;
}

/**
 * 제품 포장에서 확정한 cargo가 App state에 반영되기 전에 자동 적재가 실행되는 레이스를 막는다.
 * dispatchAppAction이 이미 저장 cargo를 App에 주입한 경우에는 같은 동기화를 반복하지 않는다.
 * 직접 APP_ACTION_EVENT가 들어온 경로에서는 canonical writeStoredState를 통해 result/physics 캐시까지
 * 같이 무효화하고 확정 cargo를 한 번만 재주입한다.
 */
export default function ConfirmedPackagingLoadingBridge() {
  useEffect(() => {
    let cancelled = false;

    const onRunLoading = (event: Event) => {
      const custom = event as CustomEvent<ReplayActionDetail>;
      if (custom.detail?.action !== 'run-loading' || custom.detail?.confirmedPackagingReplay) return;

      const stored = readStoredState();
      if (!stored?.cargo?.length) return;
      const snapshot = readShipmentInstructionSnapshot(stored.cargo);
      if (!snapshot) return;

      const identified = applyConfirmedPackagingIdentity(stored, snapshot);
      const confirmed = applyGeneratedCartonRuntimeStack(identified);
      const stateUpdated = confirmed !== stored;

      if (custom.detail?.synchronizedStoredState && !stateUpdated) return;

      event.stopImmediatePropagation();
      writeStoredState(confirmed, true);
      if (identified !== stored) {
        recordDiagnosticTrace('confirmed-packaging-identity-restored', {
          shipmentNo: snapshot.shipmentNo,
          cargoTypes: confirmed.cargo.length,
        });
      }
      if (confirmed !== identified) {
        recordDiagnosticTrace('generated-carton-runtime-stack-normalized', {
          shipmentNo: snapshot.shipmentNo,
          cargoTypes: confirmed.cargo.filter(item => item.boxId?.startsWith('AUTO-')).length,
          maxOperationalLayers: 3,
        });
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
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
    };

    window.addEventListener(APP_ACTION_EVENT, onRunLoading, true);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_ACTION_EVENT, onRunLoading, true);
    };
  }, []);

  return null;
}
