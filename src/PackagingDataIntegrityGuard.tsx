import { useEffect } from 'react';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticTrace } from './runtimeDiagnostics';

type IntegrityActionDetail = AppActionDetail & { guidedCanonicalReplay?: boolean };

/**
 * 제품 포장 흐름에서는 최초 실행뿐 아니라 canonical replay도 동일한 shipmentInstruction
 * signature를 통과해야 한다. replay라고 검증을 건너뛰면 writeStoredState 이후 App에 전달되는
 * 실제 입력이 바뀌어도 감지할 방법이 없으므로 반드시 다시 확인한다.
 */
export default function PackagingDataIntegrityGuard() {
  useEffect(() => {
    let lastMismatch = '';

    const onRunLoading = (event: Event) => {
      const custom = event as CustomEvent<IntegrityActionDetail>;
      if (custom.detail?.action !== 'run-loading') return;

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
        canonicalReplay: custom.detail.guidedCanonicalReplay === true,
      });
      if (lastMismatch !== mismatchKey) {
        lastMismatch = mismatchKey;
        window.setTimeout(() => { lastMismatch = ''; }, 800);
        window.alert('제품 포장에서 확정한 박스와 현재 자동 적재 입력이 일치하지 않습니다. 제품 포장 단계에서 포장을 다시 확정한 뒤 자동 적재를 실행하세요.');
      }
    };

    window.addEventListener(APP_ACTION_EVENT, onRunLoading, true);
    return () => window.removeEventListener(APP_ACTION_EVENT, onRunLoading, true);
  }, []);

  return null;
}
