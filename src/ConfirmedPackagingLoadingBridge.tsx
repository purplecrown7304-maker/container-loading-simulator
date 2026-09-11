import { useEffect } from 'react';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

type ReplayActionDetail = AppActionDetail & { confirmedPackagingReplay?: boolean };

/**
 * 제품 포장에서 확정한 cargo가 App state에 반영되기 전에 자동 적재가 실행되면
 * 직전 화물 목록으로 계산되는 레이스를 막는다.
 * 출하 스냅샷의 cargo signature와 현재 저장 cargo가 일치하는 경우에만 개입한다.
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

      // 포장 확정 당시 저장된 cargo를 다시 한 번 App에 주입한 뒤 렌더가 끝난 다음 적재를 실행한다.
      window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: stored }));
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
