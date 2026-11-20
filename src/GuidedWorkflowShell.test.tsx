import { withSecuredPhysicsFixture } from './testFixtures/physicsVerification';
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GuidedWorkflowShell from './GuidedWorkflowShell';
import { readStoredState, writeStoredState } from './storage';
import { writeProductSelection } from './productWorkflow';
import { publishWorkflowPreview, readWorkflowPreview } from './workflowPreview';
import { publishGuidedLoadingUnit, readGuidedLoadingUnit } from './guidedLoadingUnitState';
import type { ContainerSpec, LoadingResult } from './engine/types';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';
import { publishVerificationCancelled } from './workflowVerificationState';
import { LOADING_STRATEGY_PREFERENCE_KEY, readLoadingStrategyPreference, writeLoadingStrategyPreference } from './loadingStrategyPreference';
import { adoptRemoteOperator } from './localOperator';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import { MEMBER_SESSION_KEY } from './memberAuth';
import { readVehicleSplit, resetVehicleSplitStateForTests } from './vehicleSplitState';

// Keep the actual shell, stage components, product/packaging stores and modal lifecycle.
// No renderer or packing/physics worker is needed to exercise DOM/confirmation ownership.
vi.mock('./autoCertification', () => ({
  FINAL_PHYSICS_VALIDATION_ERROR_EVENT: 'test:physics-error',
  NO_LOAD_RESULT_EVENT: 'test:no-load',
  FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT: 'test:physics-progress',
}));
vi.mock('./TransportEquipmentSelector', () => ({ applyToDashboard: vi.fn(() => true) }));
vi.mock('./EditableEquipmentCard', () => ({ default: ({ item, onSelect }: { item: { id: string; name: string }; onSelect: (item: unknown) => void }) => <button type="button" onClick={() => onSelect(item)}>{item.name}</button> }));
vi.mock('./palletSnapshotStore', () => ({ usePalletSnapshot: () => undefined }));

let root: Root;
let host: HTMLDivElement;
let commits = 0;
const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const latest = window as Window & { __containerLoadingLatestResult?: { container: ContainerSpec; cargo: NonNullable<ReturnType<typeof readStoredState>>['cargo']; result: LoadingResult } };
const modal = () => document.querySelector<HTMLElement>('.workspace-modal')!;
const backdrop = () => document.querySelector<HTMLElement>('.workspace-modal-backdrop')!;
const step = (number: number) => document.querySelector<HTMLButtonElement>(`[data-workspace-step="${number}"]`)!;
const action = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.guided-primary-cta')).find(button => !button.closest('[hidden]'))!;
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function open(number: number) { await click(step(number)); }
async function close() { await click(modal().querySelector<HTMLButtonElement>('.workspace-modal-close')!); }
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); sessionStorage.clear(); delete latest.__containerLoadingLatestResult; clearLatestInertiaCertification(); clearPhysicsTarget();
  resetVehicleSplitStateForTests();
  publishGuidedLoadingUnit(null); publishWorkflowPreview(null); commits = 0;
  localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({ container,
    products: [{ id: 'RETAIN-1', name: 'Retained direct product', length: .2, width: .15, height: .1, weightKg: 1, quantity: 3, requiresBoxPackaging: false }], boxes: [], settings: { allowCustom: false },
  }));
  writeStoredState({ container, cargo: [] });
  host = document.createElement('div'); host.id = 'root';
  host.innerHTML = '<div class="dashboard-left"></div><div class="dashboard-center"><canvas data-test-main-canvas="true"></canvas></div><div class="dashboard-right"></div><div id="shell-mount"></div>';
  document.body.append(host); root = createRoot(host.querySelector('#shell-mount')!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); document.body.replaceChildren(); delete latest.__containerLoadingLatestResult;
  publishWorkflowPreview(null); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(<Profiler id="shell" onRender={() => { commits++; }}><GuidedWorkflowShell /></Profiler>));
  await settle();
  expect(document.querySelectorAll('.guided-step-list button')).toHaveLength(6);
}
async function prepareStrategy() {
  await act(async () => { writeProductSelection({ 'RETAIN-1': 3 }); });
  await open(3);
  expect(action().disabled).toBe(false);
  await click(action());
  expect(modal().getAttribute('aria-label')).toBe('적재 방식 선택 설정');
  // Owner decision 2026-11-20: no space-efficiency goal. The one goal left is in force
  // as soon as the packaging is confirmed; nobody has to click it.
  const goals = Array.from(modal().querySelectorAll<HTMLButtonElement>('[role="radiogroup"][aria-label="최적화 목표"] [role="radio"]'));
  expect(goals.map(goal => [goal.querySelector('strong')!.textContent, goal.getAttribute('aria-checked')])).toEqual([['안정성 우선', 'true']]);
  expect(modal().textContent).not.toContain('공간효율');
  expect(readLoadingStrategyPreference()).toBe('stability');
  expect(action().disabled).toBe(false);
}

function publishCertification(overrides: Partial<InertiaCertification> = {}) {
  const detail = latest.__containerLoadingLatestResult!;
  const target: PhysicsTarget = { mode: 'boxes', ...detail };
  publishPhysicsTarget(target);
  const certification: InertiaCertification = {
    status: 'passed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: new Date(0).toISOString(),
    securing: buildSecuringUsage(target, 1), testedScenarios: 3, passedScenarios: 3, failedScenarios: [],
    maxHorizontalShiftM: .005, maxTiltDeg: .5, payloadWithinLimit: true,
    results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])),
    ...overrides,
  };
  withSecuredPhysicsFixture(target, certification);
  (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification = certification;
  window.dispatchEvent(new CustomEvent('container-loading:inertia-certification-result', { detail: certification }));
}

it('settles with all retained stages, leaves the main canvas untouched and survives repeated modal navigation', async () => {
  const canvas = document.querySelector('canvas');
  await mount();
  expect(backdrop().hidden).toBe(true);
  expect(modal().querySelectorAll('.guided-stage-panel')).toHaveLength(6);
  const query = modal().querySelector<HTMLInputElement>('input[aria-label="제품 검색"]')!;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const number of [1, 2, 3, 4]) {
      step(number).focus();
      await open(number);
      expect(backdrop().hidden).toBe(false);
      expect(document.querySelectorAll('.workspace-modal')).toHaveLength(1);
      expect(modal().querySelectorAll('.workspace-modal-content > div:not([hidden])')).toHaveLength(1);
      await close();
      expect(backdrop().hidden).toBe(true);
      expect(document.activeElement).toBe(step(number));
      expect(modal().querySelector('input[aria-label="제품 검색"]')).toBe(query);
      expect(document.querySelector('canvas')).toBe(canvas);
    }
  }
  const settled = commits;
  await settle(); await settle();
  expect(commits).toBe(settled);
  expect(modal().querySelector('canvas,iframe')).toBeNull();
});

it('retains packaging confirmation and strategy across modal reopens, but resets both on changed packaging inputs', async () => {
  await mount();
  await prepareStrategy();
  expect(readStoredState()!.cargo[0].quantity).toBe(3);
  expect(readWorkflowPreview()!.kind).toBe('packaging');
  await close();
  for (const number of [1, 2, 3, 4]) { await open(number); await close(); }
  await open(4);
  expect(action().disabled).toBe(false);
  expect(action().textContent).toContain('다음 단계');
  expect(modal().querySelector('.guided-strategy-status')!.textContent).toBe('선택 완료');
  await click(action());
  expect(backdrop().hidden).toBe(true);
  expect(action().textContent).toContain('최종 적재 진행');
  expect(action().disabled).toBe(false);

  await act(async () => { writeProductSelection({ 'RETAIN-1': 4 }); });
  await open(4);
  expect(action().disabled).toBe(true);
  expect(action().textContent).toContain('다음 단계');
  expect(modal().querySelector('.step04-block-reason')!.textContent).toContain('제품 포장을 확정');
  await open(3);
  expect(modal().querySelector('.guided-packaging-list')!.textContent).toContain('4 EA');
  await click(action());
  expect(readStoredState()!.cargo[0].quantity).toBe(4);
  // The new shipment starts with the one goal there is: nothing more to choose in STEP 04.
  expect(readLoadingStrategyPreference()).toBe('stability');
  expect(action().disabled).toBe(false);
});

it('preserves a reloaded strategy through initial shell and packaging hydration', async () => {
  // A goal other than the default, as an older job may still hold it.
  writeLoadingStrategyPreference('unloading');
  await mount();
  expect(readLoadingStrategyPreference()).toBe('unloading');
  await act(async () => { writeProductSelection({ 'RETAIN-1': 3 }); }); await settle();
  expect(readLoadingStrategyPreference()).toBe('unloading');
  await open(3); await click(action());
  expect(readLoadingStrategyPreference()).toBe('stability'); // A newly confirmed package starts with the one goal offered.
});

it('reads a stored space-efficiency goal as stability and never stores it again', async () => {
  localStorage.setItem(LOADING_STRATEGY_PREFERENCE_KEY, 'capacity');
  expect(readLoadingStrategyPreference()).toBe('stability');
  await mount();
  expect(step(4).textContent).toContain('무게중심·안정성 우선형');
  expect(document.body.textContent).not.toContain('공간효율');
  await act(async () => writeLoadingStrategyPreference('capacity'));
  expect(localStorage.getItem(LOADING_STRATEGY_PREFERENCE_KEY)).toBe('stability');
});

it('preserves mode and strategy on same-member hydration or name change, and resets for a different account', async () => {
  adoptRemoteOperator({ id: 'stable-member', name: 'Original name' });
  publishGuidedLoadingUnit('mixed'); writeLoadingStrategyPreference('stability');
  await mount();
  await act(async () => adoptRemoteOperator({ id: 'stable-member', name: 'Restored profile name' })); await settle();
  expect(readGuidedLoadingUnit()).toBe('mixed'); expect(readLoadingStrategyPreference()).toBe('stability');
  await act(async () => adoptRemoteOperator({ id: 'different-member', name: 'New account' })); await settle();
  expect(readGuidedLoadingUnit()).toBeNull(); expect(readLoadingStrategyPreference()).toBeNull();
  expect(step(1).getAttribute('aria-current')).toBe('step');
});

it('recognizes a restored member before the header hydrates its local operator profile', async () => {
  sessionStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify({ token: 'synthetic', userId: 'cloud-member',
    displayName: 'Cloud member', email: 'cloud@example.test', expiresAt: new Date(Date.now() + 3600000).toISOString() }));
  publishGuidedLoadingUnit('mixed'); writeLoadingStrategyPreference('stability'); await mount();
  await act(async () => adoptRemoteOperator({ id: 'cloud-member', name: 'Hydrated profile' })); await settle();
  expect(readGuidedLoadingUnit()).toBe('mixed'); expect(readLoadingStrategyPreference()).toBe('stability');
});

it('resets once for an administrator boundary and preserves choices on repeated same-admin access events', async () => {
  await mount();
  await act(async () => {
    publishGuidedLoadingUnit('mixed'); writeLoadingStrategyPreference('stability');
    sessionStorage.setItem('container-loading-admin-session-v1', JSON.stringify({ role: 'admin', userId: 'admin',
      loggedInAt: new Date().toISOString(), sessionToken: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3600000).toISOString() }));
    window.dispatchEvent(new Event(ADMIN_ACCESS_EVENT));
  });
  expect(readGuidedLoadingUnit()).toBeNull(); expect(readLoadingStrategyPreference()).toBeNull();
  await act(async () => { publishGuidedLoadingUnit('pallets'); writeLoadingStrategyPreference('stability'); window.dispatchEvent(new Event(ADMIN_ACCESS_EVENT)); });
  expect(readGuidedLoadingUnit()).toBe('pallets'); expect(readLoadingStrategyPreference()).toBe('stability');
  await act(async () => { sessionStorage.removeItem('container-loading-admin-session-v1'); window.dispatchEvent(new Event(ADMIN_ACCESS_EVENT)); });
  expect(readGuidedLoadingUnit()).toBeNull(); expect(readLoadingStrategyPreference()).toBeNull();
});

it('keeps completed results and canvas available through result-modal close/reopen without republishing a plan', async () => {
  await mount(); await prepareStrategy(); await click(action());
  const stored = readStoredState()!;
  const result: LoadingResult = { placements: Array.from({ length: 3 }, (_, index) => ({ cargoId: stored.cargo[0].id, x: index * .2, y: 0, z: 0, length: .2, width: .15, height: .1, weightKg: 1, rotated: false })), remaining: [], validationIssues: [], loadedWeightKg: 3, usedVolumeM3: .009 };
  latest.__containerLoadingLatestResult = { ...stored, result };
  await act(async () => {
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail: latest.__containerLoadingLatestResult }));
    publishCertification();
  });
  const canvas = document.querySelector('canvas');
  expect(action().textContent).toContain('결과 확인');
  await click(action());
  expect(modal().getAttribute('aria-label')).toBe('결과 확인 설정');
  for (let cycle = 0; cycle < 3; cycle++) {
    expect(modal().querySelector('.guided-result-grid .good b')!.textContent).toBe('3 EA');
    await close();
    expect(step(6).disabled).toBe(false);
    await open(6);
    expect(document.querySelector('canvas')).toBe(canvas);
    expect(latest.__containerLoadingLatestResult!.result).toBe(result);
  }
  expect(action().disabled).toBe(false);
  expect(action().textContent).toContain('작업지시서');
});


it('keeps STEP 06 locked when inertia certification completes with failed status', async () => {
  await mount(); await prepareStrategy(); await click(action());
  const stored = readStoredState()!;
  const result: LoadingResult = {
    placements: [{ cargoId: stored.cargo[0].id, x: 0, y: 0, z: 0, length: .2, width: .15, height: .1, weightKg: 1, rotated: false }],
    remaining: [], validationIssues: [], loadedWeightKg: 1, usedVolumeM3: .003,
  };
  latest.__containerLoadingLatestResult = { ...stored, result };
  await act(async () => {
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail: latest.__containerLoadingLatestResult }));
    publishCertification({ status: 'failed', testedScenarios: 0, passedScenarios: 0, payloadWithinLimit: false, results: {} });
  });
  expect(step(6).disabled).toBe(true);
  expect(document.querySelector('.guided-status-row')?.textContent).toContain('검증 실패');
  expect(document.querySelector('.guided-job-summary [role=alert]')?.textContent).toContain('보강재 추가중량');
  expect(action().textContent).toContain('최종 적재 진행');
  expect(action().textContent).not.toContain('결과 확인');
});


it('distinguishes unrun, running, failed and cancelled; retry clears the reason and input changes invalidate it', async () => {
  await mount(); await prepareStrategy(); await click(action());
  const state = () => document.querySelector('.guided-status-row')?.getAttribute('data-verification-status');
  expect(state()).toBe('unrun');
  await act(async () => { window.dispatchEvent(new CustomEvent('test:physics-progress')); });
  expect(state()).toBe('running');
  await act(async () => { window.dispatchEvent(new CustomEvent('test:physics-error', { detail: { error: '운영 규칙 검증 실패 2건' } })); });
  expect(state()).toBe('failed');
  expect(document.querySelector('.guided-job-summary [role=alert]')?.textContent).toContain('운영 규칙 검증 실패 2건');
  expect(step(6).disabled).toBe(true);
  await act(async () => { window.dispatchEvent(new CustomEvent('test:physics-progress')); });
  expect(state()).toBe('running');
  expect(document.querySelector('.guided-job-summary [role=alert]')).toBeNull();
  await act(async () => { publishVerificationCancelled(); });
  expect(state()).toBe('cancelled');
  expect(document.querySelector('.guided-job-summary [role=status]')?.textContent).toContain('취소');
  await act(async () => window.dispatchEvent(new CustomEvent(WORKFLOW_INPUT_INVALIDATED_EVENT)));
  expect(state()).toBe('unrun');
  expect(step(6).disabled).toBe(true);
});

it('does not unlock STEP 06 for an unverified modal-open event or a stale PASS', async () => {
  await mount(); await prepareStrategy(); await click(action());
  await act(async () => window.dispatchEvent(new CustomEvent('container-loading-open-results-modal')));
  expect(step(6).disabled).toBe(true);
  const stored = readStoredState()!;
  latest.__containerLoadingLatestResult = { ...stored, result: { placements: [], remaining: [], validationIssues: [], loadedWeightKg: 0, usedVolumeM3: 0 } };
  await act(async () => publishCertification({ targetSignature: 'obsolete' }));
  expect(step(6).disabled).toBe(true);
  expect(document.querySelector('.guided-status-row')?.getAttribute('data-verification-status')).toBe('unrun');
});

// Vehicle split (AGENTS.md 2L). The app's own reaction to a new job cargo (a pending plan and
// an invalidated verification) is played by `appAdoptsStoredCargo`, since App is not mounted here.
const splitPanel = () => document.querySelector<HTMLElement>('.vehicle-split-panel');
const splitAction = (name: string) => splitPanel()!.querySelector<HTMLButtonElement>(`[data-vehicle-split-action="${name}"]`);
const vehicleTab = (number: number) => splitPanel()!.querySelector<HTMLButtonElement>(`[data-vehicle-index="${number}"]`)!;
const storedUnits = () => readStoredState()!.cargo.reduce((sum, item) => sum + item.quantity, 0);
async function prepareJob(quantity: number) {
  await act(async () => { writeProductSelection({ 'RETAIN-1': quantity }); });
  await open(3);
  await click(action());
  await click(action());
  expect(storedUnits()).toBe(quantity);
}
async function publishPlan(placed: number, waiting: number, certification?: Partial<InertiaCertification>) {
  const stored = readStoredState()!;
  const result: LoadingResult = {
    placements: Array.from({ length: placed }, (_, index) => ({ cargoId: stored.cargo[0].id, x: index * .2, y: 0, z: 0, length: .2, width: .15, height: .1, weightKg: 1, rotated: false })),
    remaining: waiting ? [{ cargoId: stored.cargo[0].id, quantity: waiting, reason: '바닥 자리가 부족함', reasonCode: 'NO_FEASIBLE_EMS' }] : [],
    validationIssues: [], loadedWeightKg: placed, usedVolumeM3: placed * .003,
  };
  latest.__containerLoadingLatestResult = { ...stored, result };
  await act(async () => {
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail: latest.__containerLoadingLatestResult }));
    publishCertification(certification);
  });
}
async function appAdoptsStoredCargo() {
  const stored = readStoredState()!;
  latest.__containerLoadingLatestResult = { ...stored, result: { placements: [], remaining: [], validationIssues: [], loadedWeightKg: 0, usedVolumeM3: 0 } };
  await act(async () => {
    clearPhysicsTarget(); clearLatestInertiaCertification();
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail: latest.__containerLoadingLatestResult }));
    window.dispatchEvent(new CustomEvent(WORKFLOW_INPUT_INVALIDATED_EVENT));
  });
}

it('offers to divide cargo one vehicle cannot carry, and plans, notes and restores each vehicle', async () => {
  await mount(); await prepareJob(5);
  expect(splitPanel()).toBeNull();

  await publishPlan(3, 2);
  expect(splitPanel()!.getAttribute('data-vehicle-split')).toBe('offer');
  expect(splitPanel()!.textContent).toContain('한 대에 다 싣지 못했습니다');
  expect(splitPanel()!.textContent).toContain('미적재 2 EA');
  expect(splitAction('start')!.textContent).toBe('차량 2대로 나누기');

  await click(splitAction('start')!);
  await appAdoptsStoredCargo();
  expect(storedUnits()).toBe(3);
  expect(splitPanel()!.getAttribute('data-vehicle-split')).toBe('active');
  expect(splitPanel()!.getAttribute('data-vehicle-active')).toBe('1');
  expect(vehicleTab(1).textContent).toContain('3 EA');
  expect(vehicleTab(2).textContent).toContain('2 EA');
  expect(vehicleTab(2).textContent).toContain('계산 전');
  expect(vehicleTab(1).getAttribute('data-vehicle-status')).toBe('unrun');
  expect(step(6).disabled).toBe(true);

  // Vehicle 1 is planned and verified by itself; nothing more is offered once it fits and passes.
  await publishPlan(3, 0);
  expect(vehicleTab(1).getAttribute('data-vehicle-status')).toBe('passed');
  expect(readVehicleSplit()!.records[0]).toMatchObject({ status: 'passed', loaded: 3, waiting: 0 });
  expect(splitAction('more')).toBeNull();
  expect(step(6).disabled).toBe(false);

  // Vehicle 2 starts unverified; what vehicle 1 achieved stays as a note only.
  await click(vehicleTab(2));
  await appAdoptsStoredCargo();
  expect(storedUnits()).toBe(2);
  expect(splitPanel()!.getAttribute('data-vehicle-active')).toBe('2');
  expect(vehicleTab(1).textContent).toContain('검증 통과 기록');
  expect(vehicleTab(2).getAttribute('data-vehicle-status')).toBe('unrun');
  expect(readVehicleSplit()!.records).toMatchObject([{ status: 'passed' }, null]);
  expect(step(6).disabled).toBe(true);

  // A vehicle that still leaves cargo waiting can be divided once more.
  await publishPlan(1, 1);
  expect(splitAction('more')!.textContent).toBe('차량 3대로 다시 나누기');

  await click(splitAction('end')!);
  await appAdoptsStoredCargo();
  expect(storedUnits()).toBe(5);
  expect(readVehicleSplit()).toBeNull();
  expect(splitPanel()).toBeNull();
});

it('offers a split for a load that fits but fails verification, and none where nothing could be loaded', async () => {
  await mount(); await prepareJob(4);
  await publishPlan(4, 0, { status: 'failed', testedScenarios: 0, passedScenarios: 0, payloadWithinLimit: false, results: {} });
  expect(document.querySelector('.guided-status-row')?.getAttribute('data-verification-status')).toBe('failed');
  expect(splitPanel()!.textContent).toContain('이 적재는 운송 검증을 통과하지 못했습니다');
  expect(splitAction('start')).not.toBeNull();

  // Cargo of which not one carton could be loaded gains nothing from a second vehicle.
  await publishPlan(0, 4);
  expect(splitPanel()).toBeNull();
  // A load that fits and passes needs no second vehicle either.
  await publishPlan(4, 0);
  expect(splitPanel()).toBeNull();
});

it('gives the whole cargo back when a divided job leaves direct-box loading', async () => {
  await mount(); await prepareJob(5);
  await publishPlan(3, 2);
  await click(splitAction('start')!);
  await appAdoptsStoredCargo();
  expect(storedUnits()).toBe(3);
  await act(async () => { publishGuidedLoadingUnit('pallets'); });
  await settle();
  expect(readVehicleSplit()).toBeNull();
  expect(storedUnits()).toBe(5);
  expect(splitPanel()).toBeNull();
});
