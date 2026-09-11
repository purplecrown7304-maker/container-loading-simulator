import { useEffect } from 'react';
import { readShipmentInstructionSnapshot, type ShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticTrace } from './runtimeDiagnostics';

type ReplayActionDetail = AppActionDetail & { confirmedPackagingReplay?: boolean };

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
 * 제품 포장에서 확정한 cargo가 App state에 반영되기 전에 자동 적재가 실행되면
 * 직전 화물 목록으로 계산되는 레이스를 막는다.
 * 출하 스냅샷의 cargo signature와 현재 저장 cargo가 일치하는 경우에만 개입하며,
 * 확정 박스 코드/박스명도 같은 화물 객체에 보존한다.
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

      // App의 기존 run-loading listener가 이전 cargo state로 먼저 실행되는 것을 차단한다.
      event.stopImmediatePropagation();

      const confirmed = applyConfirmedPackagingIdentity(stored, snapshot);
      const identityUpdated = confirmed !== stored;
      if (identityUpdated) {
        writeStoredState(confirmed, true);
        recordDiagnosticTrace('confirmed-packaging-identity-restored', {
          shipmentNo: snapshot.shipmentNo,
          cargoTypes: confirmed.cargo.length,
        });
      } else {
        // 포장 확정 당시 저장된 cargo를 다시 한 번 App에 주입한다.
        window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: confirmed }));
      }

      // React state 반영이 끝난 뒤 동일 확정 화물로 자동 적재를 재실행한다.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          window.dispatchEvent(new CustomEvent<ReplayActionDetail>(APP_ACTION_EVENT, {
            detail: { action: 'run-loading', confirmedPackagingReplay: true },
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
