import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GuidedWorkflowShell from './GuidedWorkflowShell';
import { readStoredState, writeStoredState } from './storage';
import { writeProductSelection } from './productWorkflow';
import { publishWorkflowPreview, readWorkflowPreview } from './workflowPreview';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import type { ContainerSpec, LoadingResult } from './engine/types';

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
  localStorage.clear(); sessionStorage.clear(); delete latest.__containerLoadingLatestResult;
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
  const capacity = Array.from(modal().querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(button => button.textContent!.includes('공간효율'))!;
  await click(capacity);
  expect(capacity.getAttribute('aria-checked')).toBe('true');
  expect(action().disabled).toBe(false);
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
  expect(action().textContent).toContain('선택 완료');
  await click(action());
  expect(backdrop().hidden).toBe(true);
  expect(action().textContent).toContain('최종 적재 진행');
  expect(action().disabled).toBe(false);

  await act(async () => { writeProductSelection({ 'RETAIN-1': 4 }); });
  await open(4);
  expect(action().disabled).toBe(true);
  expect(action().textContent).toContain('제품 포장을 먼저 확정');
  await open(3);
  expect(modal().querySelector('.guided-packaging-list')!.textContent).toContain('4 EA');
  await click(action());
  expect(readStoredState()!.cargo[0].quantity).toBe(4);
  expect(action().disabled).toBe(true); // The new shipment needs a deliberate strategy choice.
});

it('keeps completed results and canvas available through result-modal close/reopen without republishing a plan', async () => {
  await mount(); await prepareStrategy(); await click(action());
  const stored = readStoredState()!;
  const result: LoadingResult = { placements: Array.from({ length: 3 }, (_, index) => ({ cargoId: stored.cargo[0].id, x: index * .2, y: 0, z: 0, length: .2, width: .15, height: .1, weightKg: 1, rotated: false })), remaining: [], validationIssues: [], loadedWeightKg: 3, usedVolumeM3: .009 };
  latest.__containerLoadingLatestResult = { ...stored, result };
  await act(async () => {
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail: latest.__containerLoadingLatestResult }));
    window.dispatchEvent(new CustomEvent('container-loading:inertia-certification-result', { detail: { mode: 'boxes', status: 'passed' } }));
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
    window.dispatchEvent(new CustomEvent('container-loading:inertia-certification-result', { detail: { mode: 'boxes', status: 'failed' } }));
  });
  expect(step(6).disabled).toBe(true);
  expect(action().textContent).toContain('최종 적재 진행');
  expect(action().textContent).not.toContain('결과 확인');
});
