import { useEffect } from 'react';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticTrace } from './runtimeDiagnostics';

type IntegrityActionDetail = AppActionDetail & { guidedCanonicalReplay?: boolean };

/**
 * 제품 포장 흐름인데 저장 cargo와 포장 확정 signature가 다르면 자동 적재를 중단한다.
 * 단, GuidedLoadingExecutionBridge가 포장 snapshot을 그대로 복원한 뒤 AUTO 박스의 런타임 적층값만
 * 보정해서 재실행하는 canonical replay는 이미 원본 수량/종류 검증을 통과했으므로 허용한다.
 */
export default function PackagingDataIntegrityGuard() {
  useEffect(() => {
    let lastMismatch = '';

    const onRunLoading = (event: Event) => {
      const custom = event as CustomEvent<IntegrityActionDetail>;
      if (custom.detail?.action !== 'run-loading') return;
      if (custom.detail.guidedCanonicalReplay) return;

      const stored = readStoredState();
      if (!stored?.cargo?.length) return;

      const productFlow = stored.cargo.some(item => item.productId || item.id.startsWith('PKG-') || item.id.startsWith('DIRECT-'));
      if (!productFlow) return;

      const rawSnapshot = readShipmentInstructionSnapshot();
      if (!rawSnapshot) return;
      const matchingSnapshot = readShipmentInstructionSnapshot(stored.cargo);
      if (matchingSnapshot) return;

      event.stopImmediatePropagation();
      const mismatchKey = `${rawSnapshot.shipmentNo}:${stored.cargo.map(item => `${item.id}:${item.quantity}`).join('|')}`;
      recordDiagnosticTrace('packaging-loading-signature-mismatch', {
        shipmentNo: rawSnapshot.shipmentNo,
        expectedCargoSignature: rawSnapshot.cargoSignature,
        cargoTypes: stored.cargo.length,
      });
      if (lastMismatch !== mismatchKey) {
        lastMismatch = mismatchKey;
        window.alert('제품 포장에서 확정한 박스와 현재 자동 적재 입력이 일치하지 않습니다. 제품 포장 단계에서 포장을 다시 확정한 뒤 자동 적재를 실행하세요.');
      }
    };

    window.addEventListener(APP_ACTION_EVENT, onRunLoading, true);
    return () => window.removeEventListener(APP_ACTION_EVENT, onRunLoading, true);
  }, []);

  return null;
}
