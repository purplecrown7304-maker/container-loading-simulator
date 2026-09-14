import { useEffect } from 'react';
import { readShipmentInstructionSnapshot, type ShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';
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
 * dispatchAppAction이 이미 저장 cargo를 App에 주입한 경우에는 같은 STORAGE_UPDATED_EVENT를
 * 두 번 보내지 않는다. 실제 포장 identity가 누락된 경우에만 보정 후 한 번 재실행한다.
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

      // 가이드 실행 경로는 uiEvents에서 이미 저장 cargo를 App에 주입했다.
      // identity도 정상이라면 여기서 다시 가로채지 않고 그대로 실제 계산으로 보낸다.
      if (custom.detail?.synchronizedStoredState && !identityUpdated) return;

      event.stopImmediatePropagation();
      if (identityUpdated) {
        writeStoredState(confirmed, true);
        recordDiagnosticTrace('confirmed-packaging-identity-restored', {
          shipmentNo: snapshot.shipmentNo,
          cargoTypes: confirmed.cargo.length,
        });
      } else {
        window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: confirmed }));
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
