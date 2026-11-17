import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LoadingViewerProps } from './LoadingViewer';
import type { PhysicsOptimizedLoading } from './engine/physicsOptimizer';
import type { ContainerSpec } from './engine/types';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import App from './App';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import { publishGuidedWorkflowState } from './guidedWorkflowState';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { publishWorkflowPreview } from './workflowPreview';
import { writeLoadingStrategyPreference } from './loadingStrategyPreference';
import { readStoredState, STORAGE_RESET_EVENT, writeStoredState } from './storage';
import { APP_ACTION_EVENT } from './uiEvents';
import { cancelPendingCertification, requestExactCertification } from './autoCertification';
import { readLoadingRuleset, setLoadingRuleset } from './loadingRulesPreference';
import { createCustomEquipment, selectTransportEquipment } from './transportEquipment';
import { OPEN_PACKAGING_CONTENTS_EVENT } from './packagingContentsModel';
import { setUiLanguage } from './uiLanguage';
import { stagingInputSignature } from './stagingInventory';
import { readManualOverride, writeManualOverride } from './engine/manualOverride';

const captured = vi.hoisted(() => ({ mounts: 0, unmounts: 0, props: null as LoadingViewerProps | null,
  runs: [] as Array<{ resolve: (value: PhysicsOptimizedLoading) => void; signal: AbortSignal; container: ContainerSpec }> }));
const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000, floorLoadLimitKgPerM2: 1500 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 4, displayColor: '#eab308' }];
vi.mock('./WorkspaceTools', () => ({ default: () => null }));
vi.mock('./PalletFooterSummary', () => ({ default: () => null }));
vi.mock('./PalletModePanel', () => ({ default: () => null }));
vi.mock('./CgPlanChoice', () => ({ default: () => <section>길이 방향 무게중심 선택 필요 · 전체 적재안 · CG 충족안</section> }));
vi.mock('./memberAuth', async importOriginal => ({ ...await importOriginal<typeof import('./memberAuth')>(), restoreMemberSession: async () => null, readSupabaseMember: () => null }));
vi.mock('./LoadingViewer', () => ({ default: (props: LoadingViewerProps) => {
  captured.props = props;
  useEffect(() => { captured.mounts++; return () => { captured.unmounts++; }; }, []);
  return <canvas data-main-canvas="true" />;
} }));
vi.mock('./autoCertification', () => ({ FINAL_PHYSICS_VALIDATION_ERROR_EVENT: 'test:error',
  requestExactCertification: vi.fn(), requestNextPalletCertification: vi.fn(), cancelPendingCertification: vi.fn() }));
vi.mock('./engine/physicsOptimizer', () => ({ optimizeLoadingWithPhysics: (container: ContainerSpec, _cargo: unknown, _progress: unknown, _strategy: unknown, signal: AbortSignal) =>
  new Promise<PhysicsOptimizedLoading>(resolve => captured.runs.push({ resolve, signal, container })) }));

let root: Root, host: HTMLDivElement;
const optimized = (): PhysicsOptimizedLoading => {
  const placements = [{ cargoId: 'A', x: 1, y: .5, z: 0, length: .5, width: .4, height: .3, weightKg: 10 }];
  return { strategy: 'capacity', score: 95, candidates: [], physics: { score: 95 } as PhysicsOptimizedLoading['physics'], physicsPlacements: placements, result: {
    placements, remaining: [], validationIssues: [], usedVolumeM3: .06, loadedWeightKg: 10,
  } };
};
const run = () => act(async () => { window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } })); });
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  captured.mounts = 0; captured.unmounts = 0; captured.runs = []; captured.props = null;
  vi.clearAllMocks(); localStorage.clear(); setUiLanguage('ko');
  setLoadingRuleset('legacy'); selectTransportEquipment(createCustomEquipment('container', container));
  publishGuidedWorkflowState({ active: true, step: 1 }); publishGuidedLoadingUnit('boxes'); publishWorkflowPreview(null);
  writeLoadingStrategyPreference('capacity'); writeStoredState({ container, cargo });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await import('./BoxLoadingViewer');
  await import('./StagingWorkspace');
  await act(async () => { root.render(<><ReferenceWorkspaceBar /><App /></>); });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); publishWorkflowPreview(null);
  setUiLanguage('ko');
  publishGuidedWorkflowState({ active: false, step: 1 }); vi.unstubAllGlobals();
});

it('localizes the main document title without remounting the canvas or changing loading data', async () => {
  const canvas = host.querySelector('canvas');
  const result = captured.props?.result;
  const stored = readStoredState();
  expect(document.title).toBe('컨테이너 적재 시뮬레이터');
  for (const [language, title] of [
    ['en', 'Container Loading Simulator'],
    ['vi', 'Mô phỏng xếp hàng container'],
    ['ko', '컨테이너 적재 시뮬레이터'],
  ] as const) {
    await act(async () => setUiLanguage(language));
    expect(document.title).toBe(title);
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(captured.props?.result).toBe(result);
    expect(readStoredState()).toEqual(stored);
  }
  expect(captured.mounts).toBe(1);
  expect(captured.unmounts).toBe(0);
});

it('mounts the main canvas on entry and preserves it through every workspace stage and mode', async () => {
  const canvas = host.querySelector('canvas'); expect(canvas).not.toBeNull();
  expect(host.querySelector('.app-shell .loading-rules-selector')).toBeNull(); // Owned once by the global header.
  expect(host.querySelectorAll('.reference-utility .loading-rules-selector')).toHaveLength(1);
  // Strict mode is a header button beside the ruleset selector, not a page-wide bar.
  expect(host.querySelector('.reference-utility .loading-rules-selector + .limit-review-header-slot .limit-review-header-button')?.textContent).toContain('기본 엄격 모드');
  expect(host.querySelector('.limit-review-controls')).toBeNull();
  for (const step of [2, 3, 4, 5, 6, 1] as const) {
    await act(async () => publishGuidedWorkflowState({ active: true, step }));
    expect(host.querySelector('canvas')).toBe(canvas);
  }
  for (const unit of ['pallets', 'boxes'] as const) {
    await act(async () => publishGuidedLoadingUnit(unit));
    expect(host.querySelector('canvas')).toBe(canvas);
  }
  expect(captured.mounts).toBe(1); expect(captured.unmounts).toBe(0);
});

it('keeps unconfirmed product EA outside the vehicle, then preserves an accepted result during navigation', async () => {
  await act(async () => publishWorkflowPreview({ kind: 'products', cargo }));
  expect(captured.props?.result.placements).toHaveLength(0);
  expect(captured.props?.preview).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.result-open-action')?.disabled).toBe(true);
  expect(host.querySelector('.workflow-preview-status')?.textContent).toContain('선택 제품 4 EA · 포장 계획 확정 후 대기장에 표시됩니다');
  expect(requestExactCertification).not.toHaveBeenCalled();
  expect(host.querySelector('.staging-panel-unit-list button')).toBeNull();
  await run(); const value = optimized();
  await act(async () => captured.runs[0].resolve(value));
  const result = captured.props?.result;
  expect(result).toBe(value.result);
  expect(captured.props?.preview).toBe(false);
  expect(host.querySelector<HTMLButtonElement>('.result-open-action')?.disabled).toBe(false);
  for (const step of [6, 2, 3, 5] as const) {
    await act(async () => publishGuidedWorkflowState({ active: true, step }));
    expect(captured.props?.result).toBe(result);
  }
});

it('main packaging canvas selection resolves the exact residual carton without running loading', async () => {
  const carton = { ...cargo[0], id: 'PKG-A-PARTIAL', productId: 'A', boxId: 'BOX', unitsPerPackage: 3, quantity: 1 };
  const stored = readStoredState();
  const selected = vi.fn();
  window.addEventListener(OPEN_PACKAGING_CONTENTS_EVENT, selected);
  try {
    await act(async () => publishWorkflowPreview({ kind: 'packaging', cargo: [carton] }));
    const canvas = host.querySelector('canvas');
    expect(captured.props!.result.placements).toEqual([]);
    const row = host.querySelector<HTMLButtonElement>('.staging-panel-unit-list button');
    expect(row).not.toBeNull(); await act(async () => row!.click());
    const details = [...host.querySelectorAll<HTMLButtonElement>('.staging-panel-selection button')].find(button => button.textContent === '포장 상세 보기');
    expect(details).toBeDefined(); await act(async () => details!.click());
    expect(selected).toHaveBeenCalledOnce();
    expect((selected.mock.calls[0][0] as CustomEvent).detail).toEqual({ cargoId: carton.id });
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(captured.runs).toHaveLength(0);
    expect(requestExactCertification).not.toHaveBeenCalled();
    expect(readStoredState()).toEqual(stored);
  } finally { window.removeEventListener(OPEN_PACKAGING_CONTENTS_EVENT, selected); }
});

it('holds a CG-error full plan for operator choice instead of auto-certifying it', async () => {
  await run();
  const value = optimized();
  value.result.operationalFindings = [{
    code: 'CG_LONGITUDINAL',
    severity: 'error',
    message: '길이 방향 무게중심 초과',
    placementIndexes: [],
    value: .8,
    limit: .4,
  }];
  await act(async () => captured.runs[0].resolve(value));
  expect(requestExactCertification).not.toHaveBeenCalled();
  expect(captured.props?.result).toBe(value.result);
  expect(host.querySelector<HTMLButtonElement>('.result-open-action')?.disabled).toBe(true);
  expect(host.textContent).toContain('길이 방향 무게중심 선택 필요');
  expect(host.textContent).toContain('전체 적재안');
  expect(host.textContent).toContain('CG 충족안');
});

it.each(['strategy', 'loading-unit', 'preview-data', 'review-mode'] as const)('cancels obsolete optimization on %s change and never publishes its late result', async change => {
  await run(); expect(captured.runs).toHaveLength(1);
  const previous = captured.runs[0];
  await act(async () => {
    if (change === 'strategy') writeLoadingStrategyPreference('stability');
    if (change === 'loading-unit') publishGuidedLoadingUnit('pallets');
    if (change === 'review-mode') host.querySelector<HTMLButtonElement>('.limit-review-header-button')!.click();
  });
  await act(async () => {
    if (change === 'review-mode') [...host.querySelectorAll('button')].find(b => b.textContent === '한도 초과 범위 선택')!.click();
    if (change === 'preview-data') publishWorkflowPreview({ kind: 'packaging', cargo: [{ ...cargo[0], quantity: 2 }] });
  });
  expect(previous.signal.aborted).toBe(true);
  await act(async () => previous.resolve(optimized()));
  expect(requestExactCertification).not.toHaveBeenCalled();
  expect(host.querySelector('.workflow-preview-status')).not.toBeNull();
});

it.each([['legacy', 'a-v1'], ['a-v1', 'legacy']] as const)('changing the header rules from %s to %s aborts the pending run and retains the canvas', async (from, to) => {
  await act(async () => {
    publishGuidedWorkflowState({ active: true, step: 5 });
    setLoadingRuleset(from);
  });
  const canvas = host.querySelector('canvas');
  const selector = host.querySelector<HTMLSelectElement>('.reference-utility #loading-rules-choice')!;
  expect(host.querySelectorAll('#loading-rules-choice')).toHaveLength(1);
  expect(selector.value).toBe(from);
  await run();
  expect(captured.runs).toHaveLength(1);
  const previous = captured.runs[0];
  expect(previous.signal.aborted).toBe(false);
  expect(previous.container.rules?.version).toBe(from === 'a-v1' ? from : undefined);
  vi.mocked(cancelPendingCertification).mockClear();
  await act(async () => {
    selector.value = to;
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    // RULESET_EVENT must abort synchronously, before the next React commit.
    expect(previous.signal.aborted).toBe(true);
  });
  expect(readLoadingRuleset()).toBe(to);
  expect(selector.value).toBe(to);
  expect(captured.props?.container.rules?.version).toBe(to === 'a-v1' ? to : undefined);
  expect(cancelPendingCertification).toHaveBeenCalled();
  const preview = captured.props?.result;
  expect(captured.props?.preview).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.result-open-action')?.disabled).toBe(true);

  const published = vi.fn();
  window.addEventListener(LOADING_RESULT_EVENT, published);
  try {
    await act(async () => previous.resolve(optimized()));
    expect(published).not.toHaveBeenCalled();
    expect(requestExactCertification).not.toHaveBeenCalled();
    expect(captured.props?.result).toBe(preview);
    expect(host.querySelector('.workflow-preview-status')).not.toBeNull();
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(captured.mounts).toBe(1); expect(captured.unmounts).toBe(0);

    // The next run must receive the selected mode and may publish only its own result.
    await run();
    expect(captured.runs).toHaveLength(2);
    const current = captured.runs[1];
    expect(current.signal.aborted).toBe(false);
    expect(current.container.rules?.version).toBe(to === 'a-v1' ? to : undefined);
    const completed = optimized();
    await act(async () => current.resolve(completed));
    expect(published).toHaveBeenCalledTimes(1);
    // The suite already run for these exact placements is handed over instead of being re-run.
    expect(requestExactCertification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ container: current.container, result: completed.result }),
      { precomputedPhysics: { container: current.container, placements: completed.physicsPlacements, result: completed.physics } });
    expect(captured.props?.result).toBe(completed.result);
    expect(captured.props?.preview).toBe(false);
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(captured.mounts).toBe(1); expect(captured.unmounts).toBe(0);
  } finally { window.removeEventListener(LOADING_RESULT_EVENT, published); }
});


it('saves review provenance and switching strict invalidates the current review run and unsafe acceptance', async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('.limit-review-header-button')!.click());
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '한도 초과 범위 선택')!.click());
  await act(async () => window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'save-local' } })));
  expect(readStoredState()?.container.limitReview).toEqual({ mode: 'what-if' });
  expect(host.querySelector('.limit-review-result-banner')?.textContent).toContain('출고 승인 불가');
  await run(); const previous = captured.runs[0];
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '엄격 모드로 전환')!.click());
  expect(previous.signal.aborted).toBe(true);
  await act(async () => previous.resolve(optimized()));
  expect(requestExactCertification).not.toHaveBeenCalled();
  expect(host.querySelector('.limit-review-result-banner')).toBeNull();
  expect(host.querySelector('.workflow-preview-status')).not.toBeNull();
  await act(async () => window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'load-local' } })));
  expect(host.querySelector('.limit-review-result-banner')?.textContent).toContain('출고 승인 불가');
});

it.each(['scope', 'strategy'] as const)('leaves a saved staging plan outside the vehicle when its %s differs on reload', async mismatch => {
  const actualContainer = captured.props!.container, savedResult = optimized().result;
  await act(async () => root.unmount()); root = createRoot(host);
  sessionStorage.clear();
  if (mismatch === 'strategy') writeLoadingStrategyPreference('stability');
  const input = { scopeKey: mismatch === 'scope' ? 'operator:someone-else|active' : 'operator:guest|active',
    mode: 'boxes' as const, container: actualContainer, cargo, strategy: 'capacity' as const };
  writeStoredState({ container: actualContainer, cargo, result: savedResult, staging: { version: 1,
    scopeKey: input.scopeKey, inputSignature: stagingInputSignature(input), mode: 'boxes',
    identity: { unitToStableId: {} }, selectedUnitId: null } });
  await act(async () => { root.render(<><ReferenceWorkspaceBar /><App /></>); await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(captured.props?.preview).toBe(true); expect(captured.props?.result.placements).toHaveLength(0);
  expect(requestExactCertification).not.toHaveBeenCalled();
  expect(readStoredState()?.result?.placements).toEqual(savedResult.placements);
  await act(async () => window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'load-local' } })));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); });
  expect(captured.props?.preview).toBe(true); expect(captured.props?.result.placements).toHaveLength(0);
});

it('clears saved and legacy layouts before publishing reset, without restoring them from a pending save', async () => {
  await run(); await act(async () => captured.runs[0].resolve(optimized()));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); });
  const previous = readStoredState()!, actualContainer = captured.props!.container;
  expect(previous.result?.placements).toHaveLength(1);
  writeManualOverride(actualContainer, previous.cargo, previous.result!);
  const observed: unknown[] = [], listener = () => observed.push({ stored: readStoredState(), manual: readManualOverride(actualContainer, previous.cargo) });
  window.addEventListener(STORAGE_RESET_EVENT, listener); const confirm = Object.getOwnPropertyDescriptor(window, 'confirm');
  Object.defineProperty(window, 'confirm', { configurable: true, value: vi.fn(() => true) });
  try {
    await act(async () => window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'reset-all' } })));
    expect(observed).toEqual([{ stored: null, manual: null }]);
    expect(captured.props?.preview).toBe(true); expect(captured.props?.result.placements).toEqual([]);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); });
    expect(readStoredState()).toBeNull(); expect(readManualOverride(actualContainer, previous.cargo)).toBeNull();
  } finally {
    if (confirm) Object.defineProperty(window, 'confirm', confirm); else Reflect.deleteProperty(window, 'confirm');
    window.removeEventListener(STORAGE_RESET_EVENT, listener);
  }
});
