// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import { assessWeightBalance } from './engine/weightBalance';
import { buildWorkSequence } from './engine/workSequence';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { GROUP_SELECTION_EVENT } from './groupDragEvents';
import { selectPlacement } from './selectionEvents';
import { setUiLanguage, uiText, UI_LANGUAGE_KEY } from './uiLanguage';
import { uiMessagesWorkflow } from './uiMessagesWorkflow';
import { uiWorkflowText, workflowWorkInstruction } from './workflowPresentation';
import WorkSequencePanel from './WorkSequencePanel';
import CgPlanChoice from './CgPlanChoice';
import * as cgPlans from './engine/cgCompliantPlan';
import ManualPlacementEditor from './ManualPlacementEditor';
import GroupDragController from './GroupDragController';
import WeightDistributionPanel from './WeightDistributionPanel';
import VoidFillSummary from './VoidFillSummary';
import PalletWeightDistributionLauncher from './PalletWeightDistributionLauncher';

let root: Root;
let host: HTMLDivElement;
const container: ContainerSpec = { length: 4, width: 2, height: 2.5, maxPayloadKg: 2000 };
const cargo: CargoItem[] = [{ id: '중앙-01', name: '같은 품목', length: .5, width: .5, height: .5, quantity: 2, weightKg: 10, maxStackLayers: 4, maxTopLoadKg: 100, allowRotation: true }];
const result: LoadingResult = {
  placements: [0, .5].map(z => ({ cargoId: cargo[0].id, x: 0, y: 0, z, length: .5, width: .5, height: .5, weightKg: 10, rotated: false })),
  remaining: [], validationIssues: [], usedVolumeM3: .25, loadedWeightKg: 20,
};
const detail = { container, cargo, result };
const currentWindow = () => window as Window & { __containerLoadingLatestResult?: typeof detail };
const snapshotStorage = (storage: Storage) => Object.fromEntries(Array.from({ length: storage.length }, (_, i) => storage.key(i)!).filter(key => key !== UI_LANGUAGE_KEY).map(key => [key, storage.getItem(key)]));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); setUiLanguage('ko');
  currentWindow().__containerLoadingLatestResult = detail;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren(); delete currentWindow().__containerLoadingLatestResult;
  setUiLanguage('ko'); vi.restoreAllMocks();
});

it('has complete bilingual entries with unchanged placeholders and no Korean fallback copy', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, values] of Object.entries(uiMessagesWorkflow)) {
    for (const [index, value] of values.entries()) {
      expect(value.trim(), key).not.toBe('');
      expect(value, key).not.toMatch(/[가-힣]/);
      expect(placeholders(value), key).toEqual(placeholders(key));
      expect(uiText(key, [], index === 0 ? 'en' : 'vi'), key).not.toBe(key);
    }
  }
});

it('translates stored progress and safety failures while preserving identifiers, values and Korean mode', () => {
  const source = '중앙-01: 이동 후 다른 화물과 충돌합니다.';
  expect(uiWorkflowText(source, 'ko')).toBe(source);
  expect(uiWorkflowText(source, 'en')).toBe('중앙-01: collides with other cargo after moving.');
  expect(uiWorkflowText(source, 'vi')).toBe('중앙-01: va chạm với hàng khác sau khi di chuyển.');
  expect(uiWorkflowText('후보 2/8 · 적재율 우선 · 물리검증 37%', 'en')).toBe('Candidate 2/8 · Capacity first · Physics check 37%');
  expect(uiWorkflowText('팔레트 재배치 3/6 · 안쪽 밀착 2열 · 정방향 고정 · 높이 90% · 2단 제한', 'en')).toBe(`Pallet rearrangement 3/6 · 2 columns flush with inner end · ${uiText('정방향 고정', [], 'en')} · Height 90% · Limit 2 levels`);
  expect(uiWorkflowText('검토용 계산 완료 · 19EA · 원 기준의 초과·실패 경고를 유지합니다. 출고 승인 불가', 'vi')).toContain('Không được phê duyệt xuất hàng');
  expect(uiWorkflowText('알 수 없는 진단 UNKNOWN_CODE', 'en')).toBe('알 수 없는 진단 UNKNOWN_CODE');
  expect(uiWorkflowText('중앙-01: 수량은 0 이상의 정수여야 함 외 2건', 'en')).toBe('중앙-01: Quantity must be a nonnegative integer and 2 more');
});

it('formats work instructions from typed fields and never translates user cargo labels or engine data', () => {
  const steps = buildWorkSequence(container, cargo, result, 'LOAD');
  const before = JSON.stringify(steps);
  expect(workflowWorkInstruction(steps[0], 'ko')).toBe(steps[0].instruction);
  expect(workflowWorkInstruction(steps[0], 'en')).toContain('중앙-01');
  expect(workflowWorkInstruction(steps[0], 'en')).toContain('Step 1');
  expect(workflowWorkInstruction(steps[0], 'vi')).toContain('Bước 1');
  expect(JSON.stringify(steps)).toBe(before);
});

it('switches work sequence language live without resetting completed work or publishing new loading results', async () => {
  const viewer = document.createElement('div'); viewer.className = 'viewer-card'; document.body.append(viewer);
  await act(async () => root.render(<WorkSequencePanel />));
  await act(async () => (viewer.querySelector('.work-current > button') as HTMLButtonElement).click());
  const stored = snapshotStorage(sessionStorage);
  const source = JSON.stringify(detail);
  const loading = vi.fn(); window.addEventListener(LOADING_RESULT_EVENT, loading);
  try {
    await act(async () => setUiLanguage('en'));
    expect(viewer.textContent).toContain('Actual loading order');
    expect(viewer.textContent).toContain('Step 1');
    expect(viewer.textContent).toContain('같은 품목');
    expect(viewer.querySelector('.work-current > button')?.className).toBe('checked');
    await act(async () => setUiLanguage('vi'));
    expect(viewer.textContent).toContain('Thứ tự xếp hàng thực tế');
    expect(viewer.textContent).toContain('Đã hoàn thành');
    await act(async () => setUiLanguage('ko'));
    expect(viewer.textContent).toContain('실제 적재 순서');
    expect(snapshotStorage(sessionStorage)).toEqual(stored);
    expect(JSON.stringify(detail)).toBe(source);
    expect(loading).not.toHaveBeenCalled();
  } finally { window.removeEventListener(LOADING_RESULT_EVENT, loading); }
});

it('keeps unsafe manual moves blocked across locales and selects groups by stable mode attributes', async () => {
  const viewer = document.createElement('div'); viewer.className = 'viewer-card'; document.body.append(viewer);
  await act(async () => root.render(<><ManualPlacementEditor /><GroupDragController /></>));
  await act(async () => selectPlacement(0));
  const source = JSON.stringify(detail);
  localStorage.setItem('safety-certificate-sentinel', 'FAILED:CG_LIMIT');
  const stored = snapshotStorage(localStorage);
  const loading = vi.fn(); const selections: unknown[] = [];
  const onSelection = (event: Event) => selections.push((event as CustomEvent).detail);
  window.addEventListener(LOADING_RESULT_EVENT, loading); window.addEventListener(GROUP_SELECTION_EVENT, onSelection);
  try {
    for (const language of ['en', 'vi', 'ko'] as const) {
      await act(async () => setUiLanguage(language));
      expect((viewer.querySelector('.manual-apply') as HTMLButtonElement).disabled).toBe(true);
      const reason = viewer.querySelector('.manual-lock')?.textContent ?? '';
      if (language !== 'ko') expect(reason).not.toMatch(/[가-힣]/);
    }
    expect(loading).not.toHaveBeenCalled();
    expect(selections).toHaveLength(0);
    expect(snapshotStorage(localStorage)).toEqual(stored);
    await act(async () => setUiLanguage('vi'));
    await act(async () => (viewer.querySelector('[data-group-mode="cargo"]') as HTMLButtonElement).click());
    expect(selections.at(-1)).toMatchObject({ mode: 'cargo', indices: [0, 1], anchorIndex: 0 });
    expect(JSON.stringify(detail)).toBe(source);
  } finally {
    window.removeEventListener(LOADING_RESULT_EVENT, loading); window.removeEventListener(GROUP_SELECTION_EVENT, onSelection);
  }
});

it('translates weight-distribution diagnostics without altering warning status or numeric analysis', async () => {
  const analysis = analyzeWeightDistribution(container, result, 20, 8);
  const before = JSON.stringify(analysis);
  await act(async () => root.render(<WeightDistributionPanel analysis={analysis} />));
  const state = host.querySelector('.weight-distribution-state')?.className;
  for (const language of ['en', 'vi'] as const) {
    await act(async () => setUiLanguage(language));
    expect(host.textContent).not.toMatch(/[가-힣]/);
    expect(host.querySelector('.weight-distribution-state')?.className).toBe(state);
    expect(JSON.stringify(analysis)).toBe(before);
  }
});

it('keeps unresolved securing material visibly unconfirmed in English and Vietnamese', async () => {
  const plan: LoadingResult = { ...result, voidFillPlan: { sideGapM: .5, rearGapM: 1, volumeM3: .25, weightKg: 2.5, unresolvedCount: 1,
    fills: [{ id: 'VOID-01', kind: 'side-gap', material: 'unresolved', quantity: 2, weightKg: 2.5, fixedSupportEligible: false, gapM: .5, voidVolumeM3: .25, x: 0, y: 0, z: 0, length: 1, width: .5, height: .5 }] } };
  const before = JSON.stringify(plan);
  await act(async () => root.render(<VoidFillSummary result={plan} />));
  for (const language of ['en', 'vi'] as const) {
    await act(async () => setUiLanguage(language));
    expect(host.textContent).toContain('VOID_FILL_REQUIRED');
    expect(host.textContent).not.toMatch(/[가-힣]/);
    expect(host.querySelector('article')?.className).toBe('unresolved');
    expect(host.textContent).toContain('2.50');
  }
  expect(JSON.stringify(plan)).toBe(before);
});

it('opens the pallet weight view with translated button text using a stable toggle selector', async () => {
  const viewer = document.createElement('div'); viewer.className = 'pallet-viewer';
  viewer.innerHTML = '<div class="preview-view-controls"></div><div class="pallet-weight-dock"><button data-weight-toggle>Phân bố trọng lượng 3D</button></div>';
  document.body.append(viewer);
  const toggle = vi.fn(); viewer.querySelector('[data-weight-toggle]')!.addEventListener('click', toggle);
  await act(async () => { setUiLanguage('vi'); root.render(<PalletWeightDistributionLauncher />); });
  await act(async () => (viewer.querySelector('.pallet-weight-inline-launcher') as HTMLButtonElement).click());
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(viewer.querySelector('.pallet-weight-inline-launcher')?.textContent).toContain('Phân bố trọng lượng 3D');
});


it('keeps the CG error and explicit choice pending while changing presentation language', async () => {
  const full: LoadingResult = { ...result, operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error', message: '길이 CG 오류', placementIndexes: [0, 1], value: 1, limit: .2 }] };
  const alternative: LoadingResult = { ...result, placements: [result.placements[0]], remaining: [{ cargoId: cargo[0].id, quantity: 1, reasonCode: 'CG_LIMIT', reason: '길이 방향 무게중심 허용범위를 지키기 위해 제외' }] };
  const calculate = vi.spyOn(cgPlans, 'cgCompliantAlternativeForResult').mockReturnValue({ result: alternative, removed: [{ cargoId: cargo[0].id, quantity: 1, reasonCode: 'CG_LIMIT', reason: '길이 방향 무게중심 허용범위를 지키기 위해 제외' }] });
  const choose = vi.fn(); const source = JSON.stringify(full);
  await act(async () => root.render(<CgPlanChoice container={container} cargo={cargo} fullResult={full} onChoose={choose} />));
  for (const language of ['en', 'vi', 'ko'] as const) {
    await act(async () => setUiLanguage(language));
    expect(host.querySelector('.bad')).not.toBeNull();
    expect(host.textContent).toContain('CG_LIMIT');
    expect(host.textContent).toContain(cargo[0].id);
    expect(host.querySelector('article.selected')).toBeNull();
  }
  expect(choose).not.toHaveBeenCalled(); expect(calculate).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(full)).toBe(source);
});

it('forwards pallet view changes using stable view values rather than translated captions', async () => {
  const viewer = document.createElement('div'); viewer.className = 'pallet-viewer';
  viewer.innerHTML = '<div class="preview-view-controls"><div class="preview-view-buttons"><button data-preview-view="rear">Phía sau</button></div></div><div class="pallet-weight-dock open"><div class="pallet-weight-view-buttons"><button data-preview-view="rear">Rear</button></div></div>';
  document.body.append(viewer);
  const rear = vi.fn(); viewer.querySelector('.pallet-weight-view-buttons button')!.addEventListener('click', rear);
  await act(async () => { setUiLanguage('vi'); root.render(<PalletWeightDistributionLauncher />); });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
  await act(async () => (viewer.querySelector('.preview-view-buttons button') as HTMLButtonElement).click());
  expect(rear).toHaveBeenCalledTimes(1);
});


it('does not reinterpret unknown canonical messages as short translated unit templates', () => {
  const unknown = ['Unknown CODE_X 한국어 진단', 'Unknown CODE_X 검토 점', 'Unknown CODE_X 알림건', 'Unknown CODE_X 선택1개', 'Unknown CODE_X 외 2건'];
  for (const locale of ['ko', 'en', 'vi'] as const) {
    for (const message of unknown) expect(uiWorkflowText(message, locale)).toBe(message);
  }
  expect(uiWorkflowText('12건', 'en')).toBe(uiText('{0}건', [12], 'en'));
  expect(uiWorkflowText('1,200 점', 'en')).toBe(uiText('{0} 점', ['1,200'], 'en'));
  expect(uiText('{0}건', ['사용자 텍스트'], 'en')).toBe(uiText('{0}건', [], 'en').replace('{0}', '사용자 텍스트'));
});


it('translates empty, positive, warning and shape weight-assessment messages without changing the assessment', () => {
  const plans = [
    { ...result, placements: [], loadedWeightKg: 0 },
    result,
    { ...result, placements: result.placements.map(p => ({ ...p, x: 1.75, y: .75, z: p.z + 1.25 })) },
    { ...result, placements: [result.placements[0], { ...result.placements[1], x: 3.5, y: 1.5, z: 0 }] },
  ];
  for (const plan of plans) {
    const assessment = assessWeightBalance(container, plan);
    const before = JSON.stringify(assessment);
    for (const message of assessment.messages) {
      expect(uiWorkflowText(message, 'ko')).toBe(message);
      for (const locale of ['en', 'vi'] as const) expect(uiWorkflowText(message, locale), message).not.toMatch(/[가-힣]/);
    }
    expect(JSON.stringify(assessment)).toBe(before);
  }
  expect(uiWorkflowText('같은 품목이 여러 구역으로 분산된 종류가 3개입니다. 안전성은 물리 검증에서 별도 판정합니다.', 'en')).toContain('Safety is determined separately');
});
