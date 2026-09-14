import { useEffect } from 'react';
import { readUserLoadingStrategy } from './engine/loadingStrategy';
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
 * STEP 5 계산 입력은 STEP 3에서 확정한 shipmentInstruction cargo 하나만 사용한다.
 * 실행 순간의 적재 단위와 적재 전략을 root dataset에 snapshot으로 고정해 진행창/결과 표시가
 * 이후 UI 상태와 섞이지 않게 한다. 상자/파렛트 탭도 실제 React mode가 바뀐 뒤 replay한다.
 */
export default function GuidedLoadingExecutionBridge() {
  useEffect(() => {
    let cancelled = false;
    let replayPending = false;

    const dispatchCanonicalReplay = (detail: CanonicalRunDetail, mode: 'boxes' | 'pallets') => {
      try {
        if (mode === 'boxes') {
          window.dispatchEvent(new CustomEvent<CanonicalRunDetail>(APP_ACTION_EVENT, { detail }));
          return;
        }

        // App의 기존 guidedRun 분기가 박스 모드로 고정되어 있어 파렛트만 호환 우회를 사용한다.
        // mode 탭 state는 아래 settle 확인을 통과한 뒤이므로 step 0에서 일반 파렛트 실행 경로로 보낸다.
        const root = document.documentElement;
        const previousStep = root.dataset.guidedStep;
        root.dataset.guidedStep = '0';
        try {
          window.dispatchEvent(new CustomEvent<CanonicalRunDetail>(APP_ACTION_EVENT, { detail }));
        } finally {
          if (previousStep) root.dataset.guidedStep = previousStep;
          else delete root.dataset.guidedStep;
        }
      } finally {
        replayPending = false;
      }
    };

    const replayAfterModeSettles = (detail: CanonicalRunDetail, mode: 'boxes' | 'pallets', attempt = 0) => {
      if (cancelled) { replayPending = false; return; }
      clickMode(mode);
      window.requestAnimationFrame(() => {
        if (cancelled) { replayPending = false; return; }
        if (activeMode() !== mode) {
          if (attempt < 5) {
            replayAfterModeSettles(detail, mode, attempt + 1);
            return;
          }
          replayPending = false;
          rejectRun(`${mode === 'pallets' ? '파렛트' : '상자'} 적재 모드 전환이 완료되지 않아 자동 적재를 중단했습니다.`);
          return;
        }
        window.requestAnimationFrame(() => {
          if (cancelled) { replayPending = false; return; }
          dispatchCanonicalReplay(detail, mode);
        });
      });
    };

    const onRun = (event: Event) => {
      const custom = event as CustomEvent<CanonicalRunDetail>;
      if (custom.detail?.action !== 'run-loading') return;

      // canonical replay는 뒤쪽 integrity/equipment guard와 App까지 한 번만 통과시킨다.
      if (custom.detail.guidedCanonicalReplay) return;
      if (document.documentElement.dataset.guidedWorkflow !== 'true' || document.documentElement.dataset.guidedStep !== '5') return;

      if (replayPending) {
        event.stopImmediatePropagation();
        return;
      }

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
      replayPending = true;
      const root = document.documentElement;
      const mode = readGuidedLoadingUnit();
      const strategy = readUserLoadingStrategy();
      root.dataset.guidedRunUnit = mode;
      root.dataset.guidedRunStrategy = strategy;
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
