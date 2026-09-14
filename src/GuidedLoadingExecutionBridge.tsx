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
    let dispatchingCanonical = false;

    const dispatchOutsideLegacyGuidedBranch = (detail: CanonicalRunDetail) => {
      const root = document.documentElement;
      const previousStep = root.dataset.guidedStep;
      root.dataset.guidedStep = '0';
      dispatchingCanonical = true;
      try {
        window.dispatchEvent(new CustomEvent<CanonicalRunDetail>(APP_ACTION_EVENT, { detail }));
      } finally {
        dispatchingCanonical = false;
        if (previousStep) root.dataset.guidedStep = previousStep;
        else delete root.dataset.guidedStep;
      }
    };

    const onRun = (event: Event) => {
      const custom = event as CustomEvent<CanonicalRunDetail>;
      if (custom.detail?.action !== 'run-loading') return;

      // 장비 일치 가드가 canonical 실행을 비동기로 한 번 더 재생한 경우에도
      // App의 레거시 guidedRun(박스 강제)로 들어가지 않게 다시 한 번 우회한다.
      if (custom.detail.guidedCanonicalReplay) {
        if (dispatchingCanonical) return;
        if (document.documentElement.dataset.guidedWorkflow !== 'true' || document.documentElement.dataset.guidedStep !== '5') return;
        event.stopImmediatePropagation();
        dispatchOutsideLegacyGuidedBranch(custom.detail);
        return;
      }

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
        dispatchOutsideLegacyGuidedBranch({
          ...custom.detail,
          action: 'run-loading',
          guidedCanonicalReplay: true,
          synchronizedStoredState: true,
        });
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
