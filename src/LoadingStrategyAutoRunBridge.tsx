import { useEffect } from 'react';
import {
  LOADING_STRATEGY_SELECTION_EVENT,
} from './engine/loadingStrategy';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT } from './enterprisePackagingPlannerStore';
import { PRODUCT_SELECTION_EVENT } from './productWorkflow';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, STORAGE_UPDATED_EVENT } from './storage';
import { TRANSPORT_EQUIPMENT_EVENT } from './transportEquipment';
import { dispatchAppAction } from './uiEvents';

function confirmedInputReady() {
  const validThrough = Number(document.documentElement.dataset.guidedValidThrough || 0);
  if (validThrough < 5) return false;
  const stored = readStoredState();
  return Boolean(stored?.cargo?.length && readShipmentInstructionSnapshot(stored.cargo));
}

/**
 * Step 4에서 선택한 방식과 Step 3에서 확정한 포장 cargo를 Step 5 자동 적재에 묶는다.
 * 앞 단계 입력이 바뀌면 pending 상태로 돌리고, 확정 포장 signature가 맞을 때만 계산한다.
 * 따라서 예전 포장/예전 적재방식의 3D 결과가 그대로 남은 채 새 작업처럼 보이지 않는다.
 */
export default function LoadingStrategyAutoRunBridge() {
  useEffect(() => {
    let pendingRun = true;
    let lastStep = document.documentElement.dataset.guidedStep ?? '';
    let runTimer = 0;

    const runConfirmedInput = () => {
      if (!pendingRun || !confirmedInputReady()) return;
      pendingRun = false;
      window.clearTimeout(runTimer);
      document.documentElement.dataset.guidedAutoRunScheduled = 'true';
      runTimer = window.setTimeout(() => {
        if (!confirmedInputReady() || document.documentElement.dataset.guidedStep !== '5') {
          pendingRun = true;
          delete document.documentElement.dataset.guidedAutoRunScheduled;
          return;
        }
        dispatchAppAction('run-loading');
        window.setTimeout(() => delete document.documentElement.dataset.guidedAutoRunScheduled, 250);
      }, 20);
    };

    const scheduleIfNeeded = () => {
      const currentStep = document.documentElement.dataset.guidedStep ?? '';
      const enteredAutomaticLoading = currentStep === '5' && lastStep !== '5';
      lastStep = currentStep;
      if (enteredAutomaticLoading) runConfirmedInput();
    };

    const markDirty = () => {
      // Step 5에서 dispatchAppAction이 수행하는 STORAGE_UPDATED_EVENT는 새 입력이 아니라
      // 같은 확정 cargo를 App state에 재주입하는 과정이므로 다시 pending으로 만들지 않는다.
      if (document.documentElement.dataset.guidedStep === '5') return;
      pendingRun = true;
    };

    const onStrategySelection = () => {
      pendingRun = true;
      if (document.documentElement.dataset.guidedStep === '5') runConfirmedInput();
    };

    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategySelection);
    window.addEventListener(PRODUCT_SELECTION_EVENT, markDirty);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, markDirty);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, markDirty);
    window.addEventListener(STORAGE_UPDATED_EVENT, markDirty);

    const observer = new MutationObserver(scheduleIfNeeded);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step', 'data-guided-valid-through'] });

    return () => {
      window.clearTimeout(runTimer);
      observer.disconnect();
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategySelection);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, markDirty);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, markDirty);
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, markDirty);
      window.removeEventListener(STORAGE_UPDATED_EVENT, markDirty);
      delete document.documentElement.dataset.guidedAutoRunScheduled;
    };
  }, []);

  return null;
}
