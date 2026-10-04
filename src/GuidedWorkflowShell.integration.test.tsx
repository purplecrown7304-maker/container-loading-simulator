import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import GuidedWorkflowShell from './GuidedWorkflowShell';
import GuidedLoadingUnitEnhancer from './GuidedLoadingUnitEnhancer';
import ConfirmedPackagingLoadingBridge from './ConfirmedPackagingLoadingBridge';
import EquipmentLoadingConsistencyGuard from './EquipmentLoadingConsistencyGuard';
import TransportEquipmentSelector, { applyToDashboard } from './TransportEquipmentSelector';
import FinalWorkflowRecoveryBridge from './FinalWorkflowRecoveryBridge';
import InspectionStatusPanel from './InspectionStatusPanel';
import { readStoredState, writeStoredState } from './storage';
import { writeProductSelection } from './productWorkflow';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { publishGuidedWorkflowState } from './guidedWorkflowState';
import { publishWorkflowPreview } from './workflowPreview';
import { clearLoadSimAcceptance, isLoadSimAcceptedTarget } from './rule-engine/acceptance';
import { clearPhysicsTarget, readPhysicsTarget } from './physicsTarget';
import { loadContainer } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { writeEnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import { readTransportEquipment } from './transportEquipment';

// Keep App, the shell, every stage, packaging stores and the loading bridges real.
// Only rendering, remote equipment images and asynchronous worker transport are isolated.
const captured = vi.hoisted(() => ({ runs: [] as Array<{
  container: ContainerSpec; cargo: CargoItem[]; signal: AbortSignal;
  resolve: (value: LoadingResult) => void;
}> }));
vi.mock('./LoadingViewer', () => ({ default: () => <canvas /> }));
vi.mock('./EquipmentCard3D', () => ({ default: () => null }));
vi.mock('./equipmentImageOverrides', async importOriginal => ({ ...await importOriginal<typeof import('./equipmentImageOverrides')>(), refreshEquipmentImageOverrides: vi.fn() }));
vi.mock('./WorkspaceTools', () => ({ default: () => null }));
vi.mock('./engine/asyncLoading', () => ({ loadContainerAsync: (container: ContainerSpec, cargo: CargoItem[], _strategy: unknown, signal: AbortSignal) =>
  new Promise<LoadingResult>(resolve => captured.runs.push({ container, cargo, signal, resolve })) }));

let root: Root;
let host: HTMLDivElement;
const action = () => [...document.querySelectorAll<HTMLButtonElement>('.guided-primary-cta')].find(button => !button.closest('[hidden]'))!;
const modal = () => document.querySelector<HTMLElement>('.workspace-modal')!;
const step = (number: number) => document.querySelector<HTMLButtonElement>(`[data-workspace-step="${number}"]`)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const settle = async () => { await act(async () => new Promise(resolve => setTimeout(resolve, 40))); };
const radio = (label: string) => [...modal().querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.textContent!.includes(label))!;
const fill = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear(); captured.runs = [];
  delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult;
  clearLoadSimAcceptance(); clearPhysicsTarget();
  publishGuidedWorkflowState({ active: false, step: 1 }); publishGuidedLoadingUnit(null); publishWorkflowPreview(null);
  localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
    container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
    products: [{ id: 'FLOW-1', name: 'Flow product', length: .2, width: .15, height: .1, weightKg: 1, quantity: 3, requiresBoxPackaging: false }],
    boxes: [], settings: { allowCustom: false },
  }));
  host = document.createElement('div'); host.id = 'root'; document.body.append(host); root = createRoot(host);
  await import('./BoxLoadingViewer'); await import('./PalletModePanel');
  await act(async () => root.render(<StrictMode>
    <TransportEquipmentSelector /><EquipmentLoadingConsistencyGuard /><ConfirmedPackagingLoadingBridge />
    <FinalWorkflowRecoveryBridge /><App /><InspectionStatusPanel /><GuidedWorkflowShell /><GuidedLoadingUnitEnhancer />
  </StrictMode>));
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); document.body.replaceChildren();
  clearLoadSimAcceptance(); clearPhysicsTarget(); publishWorkflowPreview(null);
  publishGuidedWorkflowState({ active: false, step: 1 });
  delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult;
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

async function confirmPackaging() {
  await act(async () => writeProductSelection({ 'FLOW-1': 3 }));
  await click(step(3)); await settle();
  expect(action().disabled).toBe(false);
  await click(action()); await settle();
  expect(modal().getAttribute('aria-label')).toBe('적재 방식 선택 설정');
}
async function prepareLoading() {
  await confirmPackaging(); await click(radio('1번 파일 적재 방식')); await settle();
  expect(action().textContent).toContain('선택 완료'); expect(action().disabled).toBe(false);
  await click(action());
}

it('keeps confirmed packaging through the real App loading-unit transition', async () => {
  await act(async () => writeEnterprisePackagingPlannerState({
    container: readStoredState()?.container ?? { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
    products: [{ id: 'FLOW-1', name: 'Boxed product', length: .5, width: .5, height: .3, weightKg: 20, quantity: 3 }],
    boxes: [{ id: 'FLOW-BOX', name: 'Registered carton', innerLength: .51, innerWidth: .51, innerHeight: .31,
      outerLength: .55, outerWidth: .55, outerHeight: .35, tareWeightKg: .2, maxGrossWeightKg: 30, maxTopLoadKg: 500, maxStackLayers: 1 }],
    settings: { allowCustom: false },
  }));
  await confirmPackaging();
  const confirmed = readStoredState()!.cargo;
  expect(confirmed[0].boxId).toBe('FLOW-BOX');
  await click(radio('파렛트 적재')); await settle();
  await click(radio('1번 파일 적재 방식')); await settle();
  expect(action().textContent).toContain('선택 완료');
  expect(action().disabled).toBe(false);
  expect(readStoredState()!.cargo).toEqual(confirmed);
});

it('keeps confirmed packaging and strategy after an unload-order edit and modal reopen', async () => {
  await confirmPackaging(); await click(radio('1번 파일 적재 방식')); await settle();
  await fill(modal().querySelector<HTMLInputElement>('[aria-label$="하역 순서"]')!, '3');
  await settle();
  await click(modal().querySelector<HTMLButtonElement>('.workspace-modal-close')!);
  await click(step(4));
  expect(modal().querySelector<HTMLInputElement>('[aria-label$="하역 순서"]')!.value).toBe('3');
  expect(radio('1번 파일 적재 방식').getAttribute('aria-checked')).toBe('true');
  expect(action().textContent).toContain('선택 완료'); expect(action().disabled).toBe(false);
  await click(action()); await click(action()); await settle(); await settle();
  expect(captured.runs).toHaveLength(1);
  expect(captured.runs[0].cargo.every(item => item.unloadPriority === 3)).toBe(true);
});

it('keeps the running CTA locked while App clears old acceptance and waits for its packing worker', async () => {
  await prepareLoading(); await click(action()); await settle(); await settle();
  expect(captured.runs).toHaveLength(1);
  expect(captured.runs[0].signal.aborted).toBe(false);
  expect(action().textContent).toContain('검사 중'); expect(action().disabled).toBe(true);
  await act(async () => clearLoadSimAcceptance());
  expect(action().textContent).toContain('검사 중'); expect(action().disabled).toBe(true);
  expect(document.querySelector('.inspection-overall')!.textContent).toBe('계산 중');
  await click(action()); await settle();
  expect(captured.runs).toHaveLength(1);
  const run = captured.runs[0];
  await act(async () => run.resolve(loadContainer(run.container, run.cargo, { publish: false })));
  expect(isLoadSimAcceptedTarget(readPhysicsTarget())).toBe(true);
  expect(action().textContent).toContain('결과 확인'); expect(action().disabled).toBe(false);
});

it('cancels through the visible guided footer, ignores its late result and permits a fresh run', async () => {
  await prepareLoading(); await click(action()); await settle(); await settle();
  const cancelled = captured.runs[0];
  const cancel = [...document.querySelectorAll<HTMLButtonElement>('.guided-bottom-bar button')]
    .find(button => button.textContent === 'A 계산 취소' && !button.closest('[hidden]'))!;
  expect(cancel).toBeDefined(); expect(cancel.disabled).toBe(false);
  expect(cancel.closest('.quick-card')).toBeNull();
  await click(cancel);
  expect(cancelled.signal.aborted).toBe(true);
  expect(action().textContent).toContain('최종 적재 진행'); expect(action().disabled).toBe(false);
  expect(document.querySelector('.inspection-overall')!.textContent).toBe('대기');
  await click(action()); await settle(); await settle();
  expect(captured.runs).toHaveLength(2);
  await act(async () => cancelled.resolve(loadContainer(cancelled.container, cancelled.cargo, { publish: false })));
  expect(action().textContent).toContain('검사 중'); expect(step(6).disabled).toBe(true);
  expect(isLoadSimAcceptedTarget(readPhysicsTarget())).toBe(false);
  const current = captured.runs[1];
  await act(async () => current.resolve(loadContainer(current.container, current.cargo, { publish: false })));
  expect(action().textContent).toContain('결과 확인'); expect(action().disabled).toBe(false);
});

it.each(['reload', 'equipment apply'] as const)('ends running when an unchanged %s cancels the controller', async change => {
  await prepareLoading(); await click(action()); await settle(); await settle();
  const cancelled = captured.runs[0];
  if (change === 'reload') await click([...host.querySelectorAll<HTMLButtonElement>('.top-actions button')].find(button => button.textContent === '불러오기')!);
  else await act(async () => { expect(applyToDashboard(readTransportEquipment())).toBe(true); });
  await settle();
  expect(cancelled.signal.aborted).toBe(true);
  expect(action().textContent).toContain('최종 적재 진행'); expect(action().disabled).toBe(false);
  expect(document.querySelector('.inspection-overall')!.textContent).toBe('대기');
  await act(async () => cancelled.resolve(loadContainer(cancelled.container, cancelled.cargo, { publish: false })));
  expect(step(6).disabled).toBe(true);
  expect(isLoadSimAcceptedTarget(readPhysicsTarget())).toBe(false);
});

it('invalidates an active loading run on physical metadata edits without unconfirming unchanged packages', async () => {
  await prepareLoading(); await click(action()); await settle(); await settle();
  const previous = captured.runs[0], saved = readStoredState()!;
  await act(async () => writeStoredState({ ...saved, container: { ...saved.container, doorWidth: 1.7 } }, true));
  await settle();
  expect(previous.signal.aborted).toBe(true);
  expect(action().textContent).toContain('최종 적재 진행'); expect(action().disabled).toBe(false);
  expect(document.querySelector('.inspection-overall')!.textContent).toBe('대기');
  await act(async () => previous.resolve(loadContainer(previous.container, previous.cargo, { publish: false })));
  expect(step(6).disabled).toBe(true);
  expect(isLoadSimAcceptedTarget(readPhysicsTarget())).toBe(false);
});

it('requires a new packaging confirmation after a product quantity changes during loading', async () => {
  await prepareLoading(); await click(action()); await settle(); await settle();
  const previous = captured.runs[0];
  await act(async () => writeProductSelection({ 'FLOW-1': 4 })); await settle();
  expect(previous.signal.aborted).toBe(true);
  await click(step(4));
  expect(action().textContent).toContain('제품 포장을 먼저 확정'); expect(action().disabled).toBe(true);
  await act(async () => previous.resolve(loadContainer(previous.container, previous.cargo, { publish: false })));
  expect(step(6).disabled).toBe(true);
});

it('requires packaging reconfirmation after a real equipment geometry change', async () => {
  await prepareLoading();
  await click(step(1));
  await click(modal().querySelector<HTMLButtonElement>('[data-equipment-id="20-standard"]')!);
  await settle();
  await click(step(4));
  expect(action().textContent).toContain('제품 포장을 먼저 확정'); expect(action().disabled).toBe(true);
  expect(captured.runs).toHaveLength(0);
});

it('ends running on a rejected A result without unlocking accepted output', async () => {
  await prepareLoading(); await click(action()); await settle(); await settle();
  const run = captured.runs[0];
  const result = loadContainer(run.container, run.cargo, { publish: false });
  result.placements[0] = { ...result.placements[0], x: -1 };
  await act(async () => run.resolve(result));
  expect(action().textContent).toContain('최종 적재 진행'); expect(action().disabled).toBe(false);
  expect(step(6).disabled).toBe(true);
  expect(document.querySelector('.inspection-overall')!.textContent).toBe('정적 검증 실패');
  expect(isLoadSimAcceptedTarget(readPhysicsTarget())).toBe(false);
});

it('finishes an impossible shipment with reasons only and no loading approval or report', async () => {
  const product = { id: 'FLOW-1', name: 'Oversized product', length: 20, width: 20, height: 20,
    weightKg: 1, quantity: 3, requiresBoxPackaging: false };
  await act(async () => writeEnterprisePackagingPlannerState({
    container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
    products: [product],
    boxes: [], settings: { allowCustom: false },
  }));
  await prepareLoading(); await click(action()); await settle(); await settle();
  const run = captured.runs[0];
  const result = loadContainer(run.container, run.cargo, { publish: false });
  expect(result.placements).toHaveLength(0);
  expect(result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
  await act(async () => run.resolve(result));
  expect(action().textContent).toContain('결과 확인'); expect(action().disabled).toBe(false);
  expect(isLoadSimAcceptedTarget(readPhysicsTarget())).toBe(false);
  await click(action());
  expect(action().textContent).toContain('미적재 사유 확인'); expect(action().disabled).toBe(true);
  expect(modal().querySelector('.guided-unloaded-list')!.textContent).toContain(result.remaining[0].reason);
});
