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
import { readStoredState, writeStoredState } from './storage';
import { APP_ACTION_EVENT } from './uiEvents';
import { cancelPendingCertification, requestExactCertification } from './autoCertification';
import { readLoadingRuleset, setLoadingRuleset } from './loadingRulesPreference';
import { createCustomEquipment, selectTransportEquipment } from './transportEquipment';

const captured = vi.hoisted(() => ({ mounts: 0, unmounts: 0, props: null as LoadingViewerProps | null,
  runs: [] as Array<{ resolve: (value: PhysicsOptimizedLoading) => void; signal: AbortSignal; container: ContainerSpec }> }));
const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000, floorLoadLimitKgPerM2: 1500 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 4, displayColor: '#eab308' }];
vi.mock('./WorkspaceTools', () => ({ default: () => null }));
vi.mock('./PalletFooterSummary', () => ({ default: () => null }));
vi.mock('./PalletModePanel', () => ({ default: () => null }));
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
const optimized = (): PhysicsOptimizedLoading => ({ strategy: 'capacity', score: 95, candidates: [], physics: { score: 95 } as PhysicsOptimizedLoading['physics'], result: {
  placements: [{ cargoId: 'A', x: 1, y: .5, z: 0, length: .5, width: .4, height: .3, weightKg: 10 }],
  remaining: [], validationIssues: [], usedVolumeM3: .06, loadedWeightKg: 10,
} });
const run = () => act(async () => { window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } })); });
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  captured.mounts = 0; captured.unmounts = 0; captured.runs = []; captured.props = null;
  vi.clearAllMocks(); localStorage.clear();
  setLoadingRuleset('legacy'); selectTransportEquipment(createCustomEquipment('container', container));
  publishGuidedWorkflowState({ active: true, step: 1 }); publishGuidedLoadingUnit('boxes'); publishWorkflowPreview(null);
  writeLoadingStrategyPreference('capacity'); writeStoredState({ container, cargo });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await import('./BoxLoadingViewer');
  await act(async () => { root.render(<><ReferenceWorkspaceBar /><App /></>); });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); publishWorkflowPreview(null);
  publishGuidedWorkflowState({ active: false, step: 1 }); vi.unstubAllGlobals();
});

it('mounts the main canvas on entry and preserves it through every workspace stage and mode', async () => {
  const canvas = host.querySelector('canvas'); expect(canvas).not.toBeNull();
  expect(host.querySelector('.app-shell .loading-rules-selector')).toBeNull(); // Owned once by the global header.
  expect(host.querySelectorAll('.reference-utility .loading-rules-selector')).toHaveLength(1);
  expect(host.querySelector('.limit-review-controls')).not.toBeNull();
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

it('shows immediate preview without publishing it as calculated cargo, then preserves a result during navigation', async () => {
  await act(async () => publishWorkflowPreview({ kind: 'products', cargo }));
  expect(captured.props?.result.placements).toHaveLength(4);
  expect(captured.props?.preview).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.result-open-action')?.disabled).toBe(true);
  expect(host.querySelector('.workflow-preview-status')?.textContent).toContain('최종 적재·안전 검증 전');
  expect(requestExactCertification).not.toHaveBeenCalled();
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
    expect(requestExactCertification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ container: current.container, result: completed.result }));
    expect(captured.props?.result).toBe(completed.result);
    expect(captured.props?.preview).toBe(false);
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(captured.mounts).toBe(1); expect(captured.unmounts).toBe(0);
  } finally { window.removeEventListener(LOADING_RESULT_EVENT, published); }
});


it('saves review provenance and switching strict invalidates the current review run and unsafe acceptance', async () => {
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
