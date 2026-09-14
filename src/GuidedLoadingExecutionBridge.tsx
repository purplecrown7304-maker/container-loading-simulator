import { useEffect } from 'react';
import type { CargoItem } from './engine/types';
import { readGuidedLoadingUnit } from './guidedLoadingUnit';
import { readConfirmedPackagingCargo, readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, writeStoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

type CanonicalRunDetail = AppActionDetail & { guidedCanonicalReplay?: boolean };
const GUIDED_RUN_REJECTED_EVENT = 'container-loading:guided-run-rejected';

function runtimeCargo(cargo: CargoItem[], containerHeight: number) {
  return cargo.map(item => {
    if (!item.boxId?.startsWith('AUTO-')) return { ...item };
    const geometricLayers = Math.max(1, Math.floor((containerHeight + 1e-9) / Math.max(item.height, 1e-9)));
    return {
      ...item,
      maxStackLayers: Math.max(1, Math.min(3, geometricLayers)),
      maxTopLoadKg: undefined,
    };
  });
}

function clickMode(mode: 'boxes' | 'pallets') {
  const label = mode === 'boxes' ? '박스' : '팔레트';
  const button = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(item => (item.textContent ?? '').trim() === label);
  if (button && !button.classList.contains('active')) button.click();
}

function rejectRun(message: string) {
  window.dispatchEvent(new CustomEvent(GUIDED_RUN_REJECTED_EVENT, { detail: { message } }));
  window.alert(message);
}

/**
 * STEP 5의 계산 입력은 STEP 3에서 확정한 shipmentInstruction cargo 하나만 사용한다.
 * 박스 적재는 guidedStep=5를 유지한 채 replay하여 App이 local React state가 아니라
 * readStoredState()의 canonical 입력을 직접 읽도록 한다.
 *
 * 팔레트는 App의 기존 팔레트 실행 경로가 아직 guidedRun 분기와 통합되지 않았으므로
 * 기존 우회 동작을 임시 유지한다. 팔레트 전용 통합은 별도 회귀 테스트 후 정리한다.
 */
export default function GuidedLoadingExecutionBridge() {
  useEffect(() => {
    let cancelled = false;

    const dispatchCanonicalReplay = (detail: CanonicalRunDetail, mode: 'boxes' | 'pallets') => {
      if (mode === 'boxes') {
        window.dispatchEvent(new CustomEvent<CanonicalRunDetail>(APP_ACTION_EVENT, { detail }));
        return;
      }

      const root = document.documentElement;
      const previousStep = root.dataset.guidedStep;
      root.dataset.guidedStep = '0';
      try {
        window.dispatchEvent(new CustomEvent<CanonicalRunDetail>(APP_ACTION_EVENT, { detail }));
      } finally {
        if (previousStep) root.dataset.guidedStep = previousStep;
        else delete root.dataset.guidedStep;
      }
    };

    const onRun = (event: Event) => {
      const custom = event as CustomEvent<CanonicalRunDetail>;
      if (custom.detail?.action !== 'run-loading') return;

      // canonical replay는 더 이상 여기서 재가로채지 않는다.
      // 뒤쪽 integrity/equipment guard와 App까지 동일 이벤트를 그대로 통과시킨다.
      if (custom.detail.guidedCanonicalReplay) return;

      if (document.documentElement.dataset.guidedWorkflow !== 'true' || document.documentElement.dataset.guidedStep !== '5') return;

      const confirmed = readConfirmedPackagingCargo();
      const shipment = readShipmentInstructionSnapshot(confirmed);
      const stored = readStoredState();
      if (!confirmed.length || !shipment || !stored) {
        event.stopImmediatePropagation();
        rejectRun('제품 포장 확정 데이터가 없습니다. 제품 포장 단계에서 다시 확정하세요.');
        return;
      }

      const expected = shipment.lines.reduce((sum, line) => sum + Math.max(0, line.boxesNeeded), 0);
      const actual = confirmed.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
      if (expected !== actual) {
        event.stopImmediatePropagation();
        rejectRun(`제품 포장 ${expected} BOX와 자동 적재 입력 ${actual} BOX가 다릅니다. 자동 적재를 중단했습니다.`);
        return;
      }

      event.stopImmediatePropagation();
      const mode = readGuidedLoadingUnit();
      const exactCargo = runtimeCargo(confirmed, stored.container.height);
      writeStoredState({ container: stored.container, cargo: exactCargo }, true);
      clickMode(mode);

      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (cancelled) return;
        dispatchCanonicalReplay({
          ...custom.detail,
          action: 'run-loading',
          guidedCanonicalReplay: true,
          synchronizedStoredState: true,
        }, mode);
      }));
    };

    window.addEventListener(APP_ACTION_EVENT, onRun, true);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_ACTION_EVENT, onRun, true);
    };
  }, []);

  return null;
}
