import { useEffect } from 'react';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import {
  AUTOMATIC_LOADING_PROGRESS_EVENT,
  type AutomaticLoadingProgressDetail,
} from './engine/physicsOptimizer';
import {
  LOADING_STRATEGY_DECISION_EVENT,
  LOADING_STRATEGY_SELECTION_EVENT,
  readStrategyDecision,
  readUserLoadingStrategy,
  type UserLoadingStrategy,
} from './engine/loadingStrategy';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget } from './physicsTarget';
import { LOCAL_OPERATOR_EVENT } from './localOperator';
import {
  PRODUCT_SELECTION_EVENT,
  readProductSelection,
} from './productWorkflow';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT } from './enterprisePackagingPlannerStore';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import {
  STORAGE_UPDATED_EVENT,
  readStoredState,
  type StoredState,
} from './storage';
import { TRANSPORT_EQUIPMENT_EVENT } from './transportEquipment';
import { APP_ACTION_EVENT, dispatchAppAction, type AppActionDetail } from './uiEvents';

type RuntimeLoadingDetail = {
  container: { length: number; width: number; height: number; maxPayloadKg: number };
  cargo: Array<{ quantity: number }>;
  result: {
    placements: unknown[];
    remaining: Array<{ quantity: number }>;
    loadedWeightKg: number;
    usedVolumeM3: number;
  };
};

type RuntimeWindow = Window & {
  __containerLoadingLatestResult?: RuntimeLoadingDetail;
  __containerLoadingPalletSnapshot?: unknown;
  __containerLoadingLatestPhysics?: unknown;
  __containerLoadingStrategyDecision?: unknown;
};

type StepId = 1 | 2 | 3 | 4 | 5 | 6;

const PUBLIC_STRATEGY_LABELS: Record<UserLoadingStrategy, string> = {
  auto: '균형 최적화형',
  capacity: '공간 활용 우선형',
  balance: '무게 중심형 적재',
  safety: '안정성 우선형',
  unloading: '작업 편의 우선형',
  grouping: '동일 제품 묶음 적재',
};

const clampStep = (value: number): StepId => Math.max(1, Math.min(6, Math.round(value))) as StepId;

function currentStep(): StepId {
  return clampStep(Number(document.documentElement.dataset.guidedStep || 1));
}

function packagedUnitCount(state = readStoredState()) {
  return state?.cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0) ?? 0;
}

function hasConfirmedPackaging(state = readStoredState()) {
  return Boolean(state?.cargo?.length && readShipmentInstructionSnapshot(state.cargo));
}

function clearRuntimeOutputs() {
  const runtime = window as RuntimeWindow;
  runtime.__containerLoadingLatestResult = undefined;
  runtime.__containerLoadingPalletSnapshot = undefined;
  runtime.__containerLoadingLatestPhysics = undefined;
  runtime.__containerLoadingStrategyDecision = undefined;
  clearLatestInertiaCertification();
  clearPhysicsTarget();
  document.documentElement.dataset.guidedResultFresh = 'false';
}

function setText(element: Element | null, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}

/**
 * 작업 준비 1~6단계를 하나의 의존성 체인으로 묶는다.
 *
 * 적재공간 -> 제품 -> 포장 -> 방식 -> 자동적재 -> 결과 순서에서 앞 단계가 바뀌면
 * 뒤 단계의 결과를 즉시 무효화한다. 각 화면이 서로 다른 storage/event를 사용하더라도
 * 이전 결과를 새 작업처럼 재사용하거나 완료 단계로 건너뛰지 못하게 한다.
 */
export default function GuidedWorkflowConsistencyBridge() {
  useEffect(() => {
    let validThrough: StepId = 2;
    let frame = 0;

    const selectionCount = () => Object.keys(readProductSelection()).length;
    const inferInitialValidity = () => {
      let inferred: StepId = selectionCount() > 0 ? 3 : 2;
      if (hasConfirmedPackaging()) inferred = 5;
      const runtime = window as RuntimeWindow;
      if (runtime.__containerLoadingLatestResult && readStrategyDecision()) inferred = 6;
      return inferred;
    };

    const syncVisibleState = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.documentElement.dataset.guidedValidThrough = String(validThrough);
        const strategy = readUserLoadingStrategy();
        const strategyLabel = PUBLIC_STRATEGY_LABELS[strategy] ?? strategy;
        const units = validThrough >= 4 ? packagedUnitCount() : 0;
        const fresh = document.documentElement.dataset.guidedResultFresh === 'true';
        const runtime = window as RuntimeWindow;
        const latest = runtime.__containerLoadingLatestResult;
        document.documentElement.dataset.guidedStrategy = strategy;
        document.documentElement.dataset.guidedPackageUnits = String(units);

        const buttons = [...document.querySelectorAll<HTMLButtonElement>('.guided-step-list button')];
        buttons.forEach((button, index) => {
          const step = index + 1;
          const blocked = step > validThrough;
          button.dataset.syncBlocked = blocked ? 'true' : 'false';
          if (blocked) button.title = '앞 단계를 다시 확정해야 진행할 수 있습니다.';
          else if (button.title === '앞 단계를 다시 확정해야 진행할 수 있습니다.') button.removeAttribute('title');
        });

        const strategyMeta = buttons[3]?.querySelector('small');
        if (strategyMeta) setText(strategyMeta, validThrough >= 5 ? strategyLabel : '선택 대기');
        const loadingMeta = buttons[4]?.querySelector('small');
        if (loadingMeta) setText(loadingMeta, fresh && validThrough >= 6 ? '계산 완료' : validThrough >= 5 ? '실행 가능' : '포장 확정 필요');

        const summaryRows = [...document.querySelectorAll<HTMLElement>('.guided-job-summary dl>div')];
        for (const row of summaryRows) {
          const label = row.querySelector('dt')?.textContent?.trim();
          const value = row.querySelector('dd');
          if (!value) continue;
          if (label === '포장 적재단위') {
            setText(value, units > 0 ? `${units.toLocaleString()} 개` : '-');
            continue;
          }
          if (!fresh && ['적재', '미적재', '총 중량', '공간 사용률'].includes(label ?? '')) {
            setText(value, label === '총 중량' ? `- / ${(latest?.container.maxPayloadKg ?? readStoredState()?.container.maxPayloadKg ?? 0).toLocaleString()} kg` : '-');
            continue;
          }
          if (!fresh && label === '상태') setText(value, '대기');
        }

        const autoStage = document.querySelector<HTMLElement>('.guided-auto-loading-stage');
        if (autoStage) {
          const description = autoStage.querySelector('.guided-panel-title p');
          setText(description, `선택 방식: ${strategyLabel} · 확정 포장 ${units.toLocaleString()}개를 같은 조건으로 계산합니다.`);
          const emptyTitle = autoStage.querySelector('.guided-empty b');
          const emptyText = autoStage.querySelector('.guided-empty span');
          setText(emptyTitle, `${strategyLabel} · 자동 적재 준비 완료`);
          setText(emptyText, `포장 확정 수량 ${units.toLocaleString()}개 기준으로 실제 배치와 물리 검증을 실행합니다.`);
        }

        const resultStage = document.querySelector<HTMLElement>('.guided-result-stage');
        if (resultStage) {
          const cards = [...resultStage.querySelectorAll<HTMLElement>('.guided-result-grid>div')];
          setText(cards[0]?.querySelector('span') ?? null, '요청 적재단위');
          setText(cards[1]?.querySelector('span') ?? null, '적재 완료 단위');
          setText(cards[2]?.querySelector('span') ?? null, '미적재 단위');
        }
      });
    };

    const setValidity = (next: number) => {
      validThrough = clampStep(next);
      syncVisibleState();
    };

    const forceBackTo = (target: StepId) => {
      if (currentStep() <= target) return;
      window.requestAnimationFrame(() => {
        const button = document.querySelectorAll<HTMLButtonElement>('.guided-step-list button')[target - 1];
        if (button && !button.disabled) button.click();
      });
    };

    const invalidateFromEquipment = () => {
      clearRuntimeOutputs();
      setValidity(2);
      forceBackTo(1);
    };

    const invalidateFromSelection = () => {
      clearRuntimeOutputs();
      setValidity(selectionCount() > 0 ? 3 : 2);
      forceBackTo(2);
    };

    const invalidateFromPackagingChoice = () => {
      clearRuntimeOutputs();
      setValidity(3);
      forceBackTo(3);
    };

    const onStorageUpdated = (event: Event) => {
      const state = (event as CustomEvent<StoredState>).detail ?? readStoredState();
      // '포장 확정'은 아직 3단계인 상태에서 snapshot -> storage 순으로 기록된다.
      // 저장/불러오기 또는 자동 적재 직전 재주입을 포장 확정으로 오인하지 않는다.
      if (currentStep() === 3 && state?.cargo?.length && readShipmentInstructionSnapshot(state.cargo)) {
        clearRuntimeOutputs();
        setValidity(5); // 기본 균형 최적화형도 유효하므로 4단계 확인 후 5단계 진행 가능.
      } else {
        syncVisibleState();
      }
    };

    const onStrategySelection = () => {
      clearRuntimeOutputs();
      setValidity(hasConfirmedPackaging() ? 5 : Math.min(validThrough, 3));
      if (currentStep() >= 6) forceBackTo(4);
    };

    const onAutomaticProgress = (event: Event) => {
      const detail = (event as CustomEvent<AutomaticLoadingProgressDetail>).detail;
      if (!detail) return;
      if (detail.status === 'running') {
        document.documentElement.dataset.guidedResultFresh = 'false';
        setValidity(Math.max(validThrough, 5));
      } else if (detail.status === 'done') {
        document.documentElement.dataset.guidedResultFresh = 'true';
        setValidity(6);
      } else {
        document.documentElement.dataset.guidedResultFresh = 'false';
        setValidity(Math.min(validThrough, 5));
      }
    };

    const onPlannerUpdated = () => {
      if (currentStep() < 3) return;
      clearRuntimeOutputs();
      setValidity(Math.min(validThrough, 3));
      forceBackTo(3);
    };

    const onIdentityChanged = () => {
      clearRuntimeOutputs();
      setValidity(2);
      forceBackTo(1);
    };

    const onAppAction = (event: Event) => {
      const detail = (event as CustomEvent<AppActionDetail>).detail;
      if (detail?.action !== 'reset-all') return;
      clearRuntimeOutputs();
      setValidity(2);
      forceBackTo(1);
    };

    const onDocumentChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.closest('.guided-package-choice')) invalidateFromPackagingChoice();
    };

    const guardNavigation = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const stepButton = target.closest<HTMLButtonElement>('.guided-step-list button');
      if (stepButton) {
        const buttons = [...document.querySelectorAll<HTMLButtonElement>('.guided-step-list button')];
        const requested = buttons.indexOf(stepButton) + 1;
        if (requested > validThrough) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

      const primary = target.closest<HTMLButtonElement>('.guided-primary-cta');
      if (!primary) return;
      const step = currentStep();
      const fresh = document.documentElement.dataset.guidedResultFresh === 'true';
      if (step === 4 && validThrough < 5) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (step === 5 && (!fresh || validThrough < 6)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const running = Boolean(document.querySelector('.operation-progress-backdrop,.calculation-overlay'))
          || document.documentElement.dataset.guidedAutoRunScheduled === 'true';
        if (!running && validThrough >= 5) dispatchAppAction('run-loading');
        return;
      }
      if (step === 6 && validThrough < 6) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const onStepMutation = () => {
      if (currentStep() > validThrough) forceBackTo(validThrough);
      syncVisibleState();
    };

    validThrough = inferInitialValidity();
    document.documentElement.dataset.guidedResultFresh = validThrough >= 6 ? 'true' : 'false';
    syncVisibleState();

    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, invalidateFromEquipment);
    window.addEventListener(PRODUCT_SELECTION_EVENT, invalidateFromSelection);
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategySelection);
    window.addEventListener(LOADING_STRATEGY_DECISION_EVENT, syncVisibleState);
    window.addEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onAutomaticProgress);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, onPlannerUpdated);
    window.addEventListener(LOCAL_OPERATOR_EVENT, onIdentityChanged);
    window.addEventListener(ADMIN_ACCESS_EVENT, onIdentityChanged);
    window.addEventListener(APP_ACTION_EVENT, onAppAction, true);
    document.addEventListener('change', onDocumentChange, true);
    document.addEventListener('click', guardNavigation, true);

    const observer = new MutationObserver(onStepMutation);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-guided-step'] });
    const bodyObserver = new MutationObserver(syncVisibleState);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      bodyObserver.disconnect();
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, invalidateFromEquipment);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, invalidateFromSelection);
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategySelection);
      window.removeEventListener(LOADING_STRATEGY_DECISION_EVENT, syncVisibleState);
      window.removeEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onAutomaticProgress);
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, onPlannerUpdated);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, onIdentityChanged);
      window.removeEventListener(ADMIN_ACCESS_EVENT, onIdentityChanged);
      window.removeEventListener(APP_ACTION_EVENT, onAppAction, true);
      document.removeEventListener('change', onDocumentChange, true);
      document.removeEventListener('click', guardNavigation, true);
      delete document.documentElement.dataset.guidedValidThrough;
      delete document.documentElement.dataset.guidedResultFresh;
      delete document.documentElement.dataset.guidedStrategy;
      delete document.documentElement.dataset.guidedPackageUnits;
    };
  }, []);

  return null;
}
