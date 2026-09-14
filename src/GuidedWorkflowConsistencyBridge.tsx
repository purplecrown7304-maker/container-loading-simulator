import { useEffect } from 'react';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import {
  AUTOMATIC_LOADING_PROGRESS_EVENT,
  type AutomaticLoadingProgressDetail,
} from './engine/physicsOptimizer';
import {
  LOADING_STRATEGY_DECISION_EVENT,
  LOADING_STRATEGY_SELECTION_EVENT,
  readUserLoadingStrategy,
  type UserLoadingStrategy,
} from './engine/loadingStrategy';
import type { CargoItem, ContainerSpec } from './engine/types';
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
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

type RuntimeLoadingDetail = {
  container: ContainerSpec;
  cargo: CargoItem[];
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

const SHIPMENT_SNAPSHOT_KEY = 'container-loading-shipment-instruction-v1';
const PUBLIC_STRATEGY_LABELS: Record<UserLoadingStrategy, string> = {
  auto: '균형 최적화형',
  capacity: '공간 활용 우선형',
  balance: '무게 중심형 적재',
  safety: '안정성 우선형',
  unloading: '작업 편의 우선형',
  grouping: '동일 제품 묶음 적재',
};

const clampStep = (value: number): StepId => Math.max(1, Math.min(6, Math.round(value))) as StepId;
const near = (a: number, b: number, tolerance = 0.001) => Math.abs(a - b) <= tolerance;

function currentStep(): StepId {
  return clampStep(Number(document.documentElement.dataset.guidedStep || 1));
}

function selectionCount() {
  return Object.keys(readProductSelection()).length;
}

function packagedUnitCount(state = readStoredState()) {
  return state?.cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0) ?? 0;
}

function hasConfirmedPackaging(state = readStoredState()) {
  return Boolean(state?.cargo?.length && readShipmentInstructionSnapshot(state.cargo));
}

function cargoSignature(cargo: CargoItem[]) {
  return [...cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [
      item.id,
      item.quantity,
      item.length.toFixed(5),
      item.width.toFixed(5),
      item.height.toFixed(5),
      item.weightKg.toFixed(5),
    ].join(':'))
    .join('|');
}

function latestResultMatchesCurrentInput() {
  const stored = readStoredState();
  const latest = (window as RuntimeWindow).__containerLoadingLatestResult;
  if (!stored?.cargo?.length || !latest?.cargo?.length) return false;
  const sameContainer = near(stored.container.length, latest.container.length)
    && near(stored.container.width, latest.container.width)
    && near(stored.container.height, latest.container.height)
    && near(stored.container.maxPayloadKg, latest.container.maxPayloadKg, 1);
  return sameContainer && cargoSignature(stored.cargo) === cargoSignature(latest.cargo);
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

function clearConfirmedPackagingSnapshot() {
  try { window.localStorage.removeItem(SHIPMENT_SNAPSHOT_KEY); } catch { /* storage unavailable */ }
}

function setText(element: Element | null, text: string) {
  if (element && element.textContent !== text) element.textContent = text;
}

/**
 * Guided workflow single source of truth.
 *
 * 1 적재공간 -> 2 제품 -> 3 포장 -> 4 방식 -> 5 자동적재 -> 6 결과
 * 앞 단계가 바뀌면 그 뒤 단계의 확정값과 결과를 즉시 폐기한다. 화면 표시, 버튼 잠금,
 * 실제 자동 적재 입력이 같은 validity/resultFresh 상태를 보게 해서 이전 계산이 섞이지 않게 한다.
 */
export default function GuidedWorkflowConsistencyBridge() {
  useEffect(() => {
    let validThrough: StepId = 2;
    let frame = 0;
    let lastBlockedAction = '';

    const inferInitialValidity = () => {
      if (hasConfirmedPackaging()) return 5 as StepId;
      return (selectionCount() > 0 ? 3 : 2) as StepId;
    };

    const syncVisibleState = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        document.documentElement.dataset.guidedValidThrough = String(validThrough);
        const strategy = readUserLoadingStrategy();
        const strategyLabel = PUBLIC_STRATEGY_LABELS[strategy] ?? strategy;
        const fresh = document.documentElement.dataset.guidedResultFresh === 'true' && validThrough >= 6;
        const units = validThrough >= 4 ? packagedUnitCount() : 0;
        document.documentElement.dataset.guidedStrategy = strategy;
        document.documentElement.dataset.guidedPackageUnits = String(units);

        const buttons = [...document.querySelectorAll<HTMLButtonElement>('.guided-step-list button')];
        buttons.forEach((button, index) => {
          const stage = index + 1;
          const blocked = stage > validThrough;
          button.dataset.syncBlocked = blocked ? 'true' : 'false';
          if (blocked) button.title = '앞 단계를 다시 확정해야 진행할 수 있습니다.';
          else if (button.title === '앞 단계를 다시 확정해야 진행할 수 있습니다.') button.removeAttribute('title');
        });

        setText(buttons[2]?.querySelector('small') ?? null, validThrough >= 4 ? '포장 확정' : selectionCount() > 0 ? '포장 필요' : '대기');
        setText(buttons[3]?.querySelector('small') ?? null, validThrough >= 5 ? strategyLabel : validThrough >= 4 ? '선택 대기' : '포장 확정 필요');
        setText(buttons[4]?.querySelector('small') ?? null, fresh ? '계산 완료' : validThrough >= 5 ? '실행 가능' : '포장 확정 필요');
        setText(buttons[5]?.querySelector('small') ?? null, fresh ? '확인 가능' : '대기');

        if (!fresh && buttons[5]) {
          buttons[5].classList.remove('complete');
          setText(buttons[5].querySelector('.guided-step-dot'), '6');
        }

        // InspectionStatusPanel은 미검증 작업도 "경고 발급 가능"이라고 표시할 수 있다.
        // 가이드 흐름에서는 그것을 "결과 완료"로 해석하면 안 되므로 현재 결과가 stale이면 대기로 강제한다.
        const rows = [...document.querySelectorAll<HTMLElement>('.inspection-status-table tbody tr')];
        const workOrderRow = rows.find(row => (row.textContent ?? '').includes('작업지시서'));
        if (!fresh && workOrderRow) {
          setText(workOrderRow.querySelector('td:last-child strong'), '대기');
          const note = workOrderRow.querySelector('td:nth-child(2) small');
          if (note) setText(note, '현재 포장·적재 방식으로 자동 적재를 완료한 뒤 갱신됩니다.');
        }

        const summaryRows = [...document.querySelectorAll<HTMLElement>('.guided-job-summary dl>div')];
        for (const row of summaryRows) {
          const label = row.querySelector('dt')?.textContent?.trim();
          const value = row.querySelector('dd');
          if (!value) continue;
          if (label === '포장 적재단위') {
            setText(value, units > 0 ? `${units.toLocaleString()} 개` : '-');
            continue;
          }
          if (!fresh && ['적재', '미적재', '공간 사용률'].includes(label ?? '')) setText(value, '-');
          if (!fresh && label === '총 중량') setText(value, `- / ${(readStoredState()?.container.maxPayloadKg ?? 0).toLocaleString()} kg`);
          if (!fresh && label === '상태') setText(value, '대기');
        }

        const autoStage = document.querySelector<HTMLElement>('.guided-auto-loading-stage');
        if (autoStage) {
          setText(autoStage.querySelector('.guided-panel-title p'), `선택 방식: ${strategyLabel} · 확정 포장 ${units.toLocaleString()}개를 같은 조건으로 계산합니다.`);
          setText(autoStage.querySelector('.guided-empty b'), `${strategyLabel} · 자동 적재 준비 완료`);
          setText(autoStage.querySelector('.guided-empty span'), `포장 확정 수량 ${units.toLocaleString()}개 기준으로 실제 배치와 물리 검증을 실행합니다.`);
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

    const invalidatePackagingAndResults = (returnTo: StepId) => {
      clearConfirmedPackagingSnapshot();
      clearRuntimeOutputs();
      setValidity(selectionCount() > 0 ? 3 : 2);
      forceBackTo(returnTo);
    };

    const invalidateFromEquipment = () => invalidatePackagingAndResults(1);
    const invalidateFromSelection = () => invalidatePackagingAndResults(2);
    const invalidateFromPackagingChoice = () => invalidatePackagingAndResults(3);

    const onStorageUpdated = (event: Event) => {
      const state = (event as CustomEvent<StoredState>).detail ?? readStoredState();
      if (currentStep() === 3 && state?.cargo?.length && readShipmentInstructionSnapshot(state.cargo)) {
        clearRuntimeOutputs();
        setValidity(5);
        return;
      }
      syncVisibleState();
    };

    const onStrategySelection = () => {
      clearRuntimeOutputs();
      setValidity(hasConfirmedPackaging() ? 5 : (selectionCount() > 0 ? 3 : 2));
      if (currentStep() >= 6) forceBackTo(4);
    };

    const onAutomaticProgress = (event: Event) => {
      const detail = (event as CustomEvent<AutomaticLoadingProgressDetail>).detail;
      if (!detail) return;
      if (detail.status === 'running') {
        document.documentElement.dataset.guidedResultFresh = 'false';
        setValidity(hasConfirmedPackaging() ? 5 : (selectionCount() > 0 ? 3 : 2));
        return;
      }
      if (detail.status === 'done') {
        const fresh = hasConfirmedPackaging() && latestResultMatchesCurrentInput();
        document.documentElement.dataset.guidedResultFresh = fresh ? 'true' : 'false';
        setValidity(fresh ? 6 : hasConfirmedPackaging() ? 5 : selectionCount() > 0 ? 3 : 2);
        return;
      }
      document.documentElement.dataset.guidedResultFresh = 'false';
      setValidity(hasConfirmedPackaging() ? 5 : (selectionCount() > 0 ? 3 : 2));
    };

    const onPlannerUpdated = () => {
      if (currentStep() < 3) return;
      invalidatePackagingAndResults(3);
    };

    const onIdentityChanged = () => {
      clearConfirmedPackagingSnapshot();
      clearRuntimeOutputs();
      setValidity(selectionCount() > 0 ? 3 : 2);
      forceBackTo(1);
    };

    const blockAction = (event: Event, message: string) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (lastBlockedAction === message) return;
      lastBlockedAction = message;
      window.setTimeout(() => { lastBlockedAction = ''; }, 600);
      window.alert(message);
    };

    const onAppAction = (event: Event) => {
      const detail = (event as CustomEvent<AppActionDetail>).detail;
      if (!detail) return;
      if (detail.action === 'reset-all') {
        clearConfirmedPackagingSnapshot();
        clearRuntimeOutputs();
        setValidity(2);
        forceBackTo(1);
        return;
      }
      if (document.documentElement.dataset.guidedWorkflow !== 'true') return;
      if (detail.action === 'run-loading') {
        if (currentStep() !== 5 || validThrough < 5 || !hasConfirmedPackaging()) {
          blockAction(event, '제품 포장을 확정하고 적재 방식을 선택한 뒤 자동 적재를 실행하세요.');
        }
        return;
      }
      if ((detail.action === 'show-results' || detail.action === 'print-report')
        && (validThrough < 6 || document.documentElement.dataset.guidedResultFresh !== 'true')) {
        blockAction(event, '현재 작업의 자동 적재가 완료되지 않았습니다. 새 결과를 계산한 뒤 확인하세요.');
      }
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
      if (!stepButton) return;
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('.guided-step-list button')];
      const requested = buttons.indexOf(stepButton) + 1;
      if (requested <= validThrough) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onStepMutation = () => {
      if (currentStep() > validThrough) forceBackTo(validThrough);
      syncVisibleState();
    };

    validThrough = inferInitialValidity();
    document.documentElement.dataset.guidedResultFresh = 'false';
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
