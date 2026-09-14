import { useEffect } from 'react';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { LOADING_STRATEGY_SELECTION_EVENT } from './engine/loadingStrategy';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { GUIDED_LOADING_UNIT_EVENT } from './guidedLoadingUnit';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';

type CompletedDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type RuntimeWindow = Window & { __containerLoadingLatestResult?: CompletedDetail };

function effectiveInputSignature(container: ContainerSpec, cargo: CargoItem[]) {
  const containerKey = [
    container.length,
    container.width,
    container.height,
    container.maxPayloadKg,
    container.floorLoadLimitKgPerM2 ?? '',
    container.floorLoadWarningMultiplier ?? '',
  ].join(':');
  const cargoKey = [...cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [
      item.id,
      item.quantity,
      item.length,
      item.width,
      item.height,
      item.weightKg,
      item.maxStackLayers ?? '',
      item.maxTopLoadKg ?? '',
      item.allowRotation === false ? 0 : 1,
    ].join(':'))
    .join('|');
  return `${containerKey}::${cargoKey}`;
}

/**
 * 과거 이 컴포넌트는 STEP 5 진입 시 자동으로 run-loading을 한 번 더 예약했다.
 * 수동 '자동 적재 실행'과 겹치며 첫 결과를 몇 초 뒤 pending으로 되돌릴 수 있어 자동 실행은 제거했다.
 *
 * 현재 역할은 완료된 STEP 5 결과 보호다. 계산 완료 뒤 동일한 입력을 재동기화하는
 * STORAGE_UPDATED_EVENT가 늦게 도착하면 App이 result를 pending으로 덮어쓰므로,
 * 실제 입력이 동일한 이벤트만 capture 단계에서 차단하고 최신 완료 결과를 복원한다.
 */
export default function LoadingStrategyAutoRunBridge() {
  useEffect(() => {
    let completed: CompletedDetail | null = null;
    let completedSignature = '';

    const clearCompleted = () => {
      completed = null;
      completedSignature = '';
    };

    const onResult = (event: Event) => {
      if (document.documentElement.dataset.guidedStep !== '5') return;
      const detail = (event as CustomEvent<CompletedDetail>).detail;
      if (!detail?.result) return;
      completed = detail;
      completedSignature = effectiveInputSignature(detail.container, detail.cargo);
    };

    const onStorageCapture = (event: Event) => {
      if (!completed || document.documentElement.dataset.guidedStep !== '5') return;
      const state = (event as CustomEvent<StoredState>).detail;
      if (!state) return;
      const nextSignature = effectiveInputSignature(state.container, state.cargo);
      if (nextSignature !== completedSignature) {
        clearCompleted();
        return;
      }

      // 같은 작업 입력을 다시 알리는 늦은 동기화 이벤트는 완료된 React/3D 결과를
      // 무효화할 이유가 없다. App의 STORAGE_UPDATED_EVENT 핸들러까지 도달시키지 않는다.
      event.stopImmediatePropagation();
      (window as RuntimeWindow).__containerLoadingLatestResult = completed;
    };

    const onStepOrSelectionChange = () => {
      if (document.documentElement.dataset.guidedStep !== '5') clearCompleted();
      else clearCompleted();
    };

    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorageCapture, true);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStepOrSelectionChange);
    window.addEventListener(GUIDED_LOADING_UNIT_EVENT, onStepOrSelectionChange);

    const observer = new MutationObserver(() => {
      if (document.documentElement.dataset.guidedStep !== '5') clearCompleted();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step'] });

    return () => {
      observer.disconnect();
      window.removeEventListener(LOADING_RESULT_EVENT, onResult);
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorageCapture, true);
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStepOrSelectionChange);
      window.removeEventListener(GUIDED_LOADING_UNIT_EVENT, onStepOrSelectionChange);
    };
  }, []);

  return null;
}
