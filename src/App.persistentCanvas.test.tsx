import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LoadingViewerProps } from './LoadingViewer';
import type { PhysicsOptimizedLoading } from './engine/physicsOptimizer';
import App from './App';
import { publishGuidedWorkflowState } from './guidedWorkflowState';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { publishWorkflowPreview } from './workflowPreview';
import { writeLoadingStrategyPreference } from './loadingStrategyPreference';
import { writeStoredState } from './storage';
import { APP_ACTION_EVENT } from './uiEvents';
import { requestExactCertification } from './autoCertification';

const captured = vi.hoisted(() => ({ mounts: 0, unmounts: 0, props: null as LoadingViewerProps | null,
  runs: [] as Array<{ resolve: (value: PhysicsOptimizedLoading) => void; signal: AbortSignal }> }));
const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000, floorLoadLimitKgPerM2: 1500 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 4, displayColor: '#eab308' }];
vi.mock('./WorkspaceTools', () => ({ default: () => null }));
vi.mock('./PalletFooterSummary', () => ({ default: () => null }));
vi.mock('./PalletModePanel', () => ({ default: () => null }));
vi.mock('./transportEquipment', () => ({ useTransportEquipment: () => ({ id: 'test', ...container }) }));
vi.mock('./LoadingViewer', () => ({ default: (props: LoadingViewerProps) => {
  captured.props = props;
  useEffect(() => { captured.mounts++; return () => { captured.unmounts++; }; }, []);
  return <canvas data-main-canvas="true" />;
} }));
vi.mock('./autoCertification', () => ({ FINAL_PHYSICS_VALIDATION_ERROR_EVENT: 'test:error',
  requestExactCertification: vi.fn(), requestNextPalletCertification: vi.fn(), cancelPendingCertification: vi.fn() }));
vi.mock('./engine/physicsOptimizer', () => ({ optimizeLoadingWithPhysics: (_container: unknown, _cargo: unknown, _progress: unknown, _strategy: unknown, signal: AbortSignal) =>
  new Promise<PhysicsOptimizedLoading>(resolve => captured.runs.push({ resolve, signal })) }));

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
  publishGuidedWorkflowState({ active: true, step: 1 }); publishGuidedLoadingUnit('boxes'); publishWorkflowPreview(null);
  writeLoadingStrategyPreference('capacity'); writeStoredState({ container, cargo });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await import('./BoxLoadingViewer');
  await act(async () => { root.render(<App />); });
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); publishWorkflowPreview(null);
  publishGuidedWorkflowState({ active: false, step: 1 }); vi.unstubAllGlobals();
});

it('mounts the main canvas on entry and preserves it through every workspace stage and mode', async () => {
  const canvas = host.querySelector('canvas'); expect(canvas).not.toBeNull();
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

it.each(['strategy', 'loading-unit', 'preview-data'] as const)('cancels obsolete optimization on %s change and never publishes its late result', async change => {
  await run(); expect(captured.runs).toHaveLength(1);
  const previous = captured.runs[0];
  await act(async () => {
    if (change === 'strategy') writeLoadingStrategyPreference('stability');
    if (change === 'loading-unit') publishGuidedLoadingUnit('pallets');
    if (change === 'preview-data') publishWorkflowPreview({ kind: 'packaging', cargo: [{ ...cargo[0], quantity: 2 }] });
  });
  expect(previous.signal.aborted).toBe(true);
  await act(async () => previous.resolve(optimized()));
  expect(requestExactCertification).not.toHaveBeenCalled();
  expect(host.querySelector('.workflow-preview-status')).not.toBeNull();
});
