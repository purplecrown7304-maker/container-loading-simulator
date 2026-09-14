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

function activeMode(): 'boxes' | 'pallets' {
  const active = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(item => item.classList.contains('active'));
  return (active?.textContent ?? '').includes('팔레트') ? 'pallets' : 'boxes';
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
 * 상자/파렛트 선택은 React mode 탭까지 실제로 반영된 것을 확인한 뒤 replay한다.
 * 숨겨진 탭의 state 반영보다 replay가 먼저 실행되면 사용자가 파렛트를 골라도 박스로
 * 계산되는 경쟁 조건이 생길 수 있으므로 최대 몇 프레임 동안 선택 상태를 확인한다.
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

    const replayAfterModeSettles = (detail: CanonicalRunDetail, mode: 'boxes' | 'pallets', attempt = 0) => {
      if (cancelled) return;
      clickMode(mode);
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        if (activeMode() !== mode) {
          if (attempt < 5) {
            replayAfterModeSettles(detail, mode, attempt + 1);
            return;
          }
          rejectRun(`${mode === 'pallets' ? '파렛트' : '상자'} 적재 모드 전환이 완료되지 않아 자동 적재를 중단했습니다.`);
          return;
        }
        window.requestAnimationFrame(() => {
          if (cancelled) return;
          dispatchCanonicalReplay(detail, mode);
        });
      });
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

      replayAfterModeSettles({
        ...custom.detail,
        action: 'run-loading',
        guidedCanonicalReplay: true,
        synchronizedStoredState: true,
      }, mode);
    };

    window.addEventListener(APP_ACTION_EVENT, onRun, true);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_ACTION_EVENT, onRun, true);
    };
  }, []);

  return null;
}
