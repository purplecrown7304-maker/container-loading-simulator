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

      const confirmed = applyConfirmedPackagingIdentity(stored, snapshot);
      const identityUpdated = confirmed !== stored;

      if (custom.detail?.synchronizedStoredState && !identityUpdated) return;

      event.stopImmediatePropagation();
      writeStoredState(confirmed, true);
      if (identityUpdated) {
        recordDiagnosticTrace('confirmed-packaging-identity-restored', {
          shipmentNo: snapshot.shipmentNo,
          cargoTypes: confirmed.cargo.length,
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
