import { useEffect } from 'react';
import type { CargoItem } from './engine/types';
import { readGuidedLoadingUnit } from './guidedLoadingUnit';
import { readConfirmedPackagingCargo, readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, writeStoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

type CanonicalRunDetail = AppActionDetail & { guidedCanonicalReplay?: boolean };

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

/**
 * STEP 5의 계산 입력은 STEP 3에서 확정한 cargo snapshot 하나만 사용한다.
 * 개인 박스 목록, 이전 적재 결과, App의 오래된 cargo state를 합치지 않는다.
 */
export default function GuidedLoadingExecutionBridge() {
  useEffect(() => {
    let cancelled = false;

    const onRun = (event: Event) => {
      const custom = event as CustomEvent<CanonicalRunDetail>;
      if (custom.detail?.action !== 'run-loading' || custom.detail.guidedCanonicalReplay) return;
      if (document.documentElement.dataset.guidedWorkflow !== 'true' || document.documentElement.dataset.guidedStep !== '5') return;

      const confirmed = readConfirmedPackagingCargo();
      const shipment = readShipmentInstructionSnapshot(confirmed);
      const stored = readStoredState();
      if (!confirmed.length || !shipment || !stored) {
        event.stopImmediatePropagation();
        window.alert('제품 포장 확정 데이터가 없습니다. 제품 포장 단계에서 다시 확정하세요.');
        return;
      }

      const expected = shipment.lines.reduce((sum, line) => sum + Math.max(0, line.boxesNeeded), 0);
      const actual = confirmed.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
      if (expected !== actual) {
        event.stopImmediatePropagation();
        window.alert(`제품 포장 ${expected} BOX와 자동 적재 입력 ${actual} BOX가 다릅니다. 자동 적재를 중단했습니다.`);
        return;
      }

      event.stopImmediatePropagation();
      const mode = readGuidedLoadingUnit();
      const exactCargo = runtimeCargo(confirmed, stored.container.height);
      writeStoredState({ container: stored.container, cargo: exactCargo }, true);
      clickMode(mode);

      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (cancelled) return;
        const root = document.documentElement;
        const previousStep = root.dataset.guidedStep;
        // App의 레거시 guidedRun 분기는 박스 모드로 강제하므로 이번 한 번의 실행만 일반 실행 경로로 보낸다.
        // React state는 위 writeStoredState/clickMode로 이미 확정 입력과 사용자가 고른 적재 단위에 맞춰져 있다.
        root.dataset.guidedStep = '0';
        window.dispatchEvent(new CustomEvent<CanonicalRunDetail>(APP_ACTION_EVENT, {
          detail: { ...custom.detail, action: 'run-loading', guidedCanonicalReplay: true, synchronizedStoredState: true },
        }));
        if (previousStep) root.dataset.guidedStep = previousStep;
        else delete root.dataset.guidedStep;
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
