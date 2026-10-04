import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PalletModePanel from './PalletModePanel';
import { NO_LOAD_RESULT_EVENT } from './autoCertification';
import { pendingLoadingResult } from './engine/loadingEngine';
import { setNextPalletCenteredResultOverride, consumeNextPalletCenteredResultOverride } from './engine/palletCentering';
import { INERTIA_CERTIFICATION_EVENT, createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { packOnPallets } from './engine/palletOptimization';
import { readPhysicsTarget, clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { clearPalletSnapshot, readPalletSnapshot, publishPalletSnapshot } from './palletSnapshotStore';
import { clearLoadSimAcceptance, isLoadSimAcceptedTarget, readLoadSimAcceptance } from './rule-engine/acceptance';

vi.mock('./engine/palletCentering', async importOriginal => ({ ...await importOriginal<object>(), centerPalletCargo: (value: unknown) => value }));
vi.mock('./engine/palletOptimization', async importOriginal => {
  const actual = await importOriginal<typeof import('./engine/palletOptimization')>();
  return { ...actual, packOnPallets: vi.fn(() => ({ pallets: [], placements: [], remaining: [{ cargoId: 'A', quantity: 1, reason: 'test' }], palletCount: 0,
    loadedCargoWeightKg: 0, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 0,
    consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 0,
    optimization: { selectedStackTarget: 0, candidateCount: 1, floorPositions: 0, redistributedForLowUtilization: false, consolidationPasses: 0 } })) };
});
vi.mock('./LoadingViewer', () => ({ default: () => <canvas /> }));

const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .4, height: .3, weightKg: 10, quantity: 1 }];
let root: Root, host: HTMLDivElement;
const onSceneChange = vi.fn(), onRunningChange = vi.fn(), onNoLoad = vi.fn();
const render = (runToken: number, inputKey: string, mode: 'pallets' | 'mixed' = 'pallets', sourceCargo = cargo) => act(async () => root.render(<PalletModePanel container={container} cargo={sourceCargo} runToken={runToken}
  mode={mode} inputKey={inputKey} onSceneChange={onSceneChange} onRunningChange={onRunningChange} />));
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.clearAllMocks();
  delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult;
  clearPhysicsTarget(); clearPalletSnapshot(); clearLoadSimAcceptance();
  window.addEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  window.removeEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
  delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult;
  clearLoadSimAcceptance(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it.each(['pallets', 'mixed'] as const)('completes an all-unloaded A %s run with reasons and no loading approval', async mode => {
  const actual = await vi.importActual<typeof import('./engine/palletOptimization')>('./engine/palletOptimization');
  if (mode === 'pallets') vi.mocked(packOnPallets).mockImplementationOnce(actual.packOnPallets);
  const oversized = [{ ...cargo[0], length: 15, width: 3, height: 3 }];
  await render(0, 'OVERSIZE', mode, oversized);
  expect(onNoLoad).not.toHaveBeenCalled();
  await render(1, 'OVERSIZE', mode, oversized);
  await act(async () => vi.runOnlyPendingTimers());
  await act(async () => vi.runOnlyPendingTimers());

  expect(onNoLoad).toHaveBeenCalledOnce();
  const target = (onNoLoad.mock.calls[0][0] as CustomEvent<PhysicsTarget>).detail;
  expect(target).toBe(readPhysicsTarget());
  expect(target.result.ruleEngine).toBe('load-sim');
  expect(target.result.placements).toEqual([]);
  expect(target.result.remaining).toEqual([{ cargoId: 'A', quantity: 1, reason: expect.any(String) }]);
  expect(target.result.remaining).toBe(readPalletSnapshot()?.result.remaining);
  expect(target.result.remaining[0].reason.length).toBeGreaterThan(0);
  expect(readLoadSimAcceptance()?.status).toBe('rejected');
  expect(readLoadSimAcceptance()?.validationIssues).toContainEqual(expect.objectContaining({ message: '적재된 화물이 없습니다.' }));
  expect(isLoadSimAcceptedTarget(target)).toBe(false);
  expect(readLatestInertiaCertification()).toBeUndefined();
  expect(onRunningChange).toHaveBeenLastCalledWith(false);
});

it('does not announce no-load completion for a target rejected as an obsolete input', async () => {
  await render(0, 'A'); await render(1, 'A');
  await act(async () => vi.runOnlyPendingTimers());
  pendingLoadingResult(container, [{ ...cargo[0], quantity: 2 }]);
  await act(async () => vi.runOnlyPendingTimers());
  expect(readPhysicsTarget()).toBeUndefined();
  expect(onNoLoad).not.toHaveBeenCalled();
});

it.each([false, true])('does not announce no-load completion without waiting cargo (empty request=%s)', async emptyRequest => {
  const actual = await vi.importActual<typeof import('./engine/palletOptimization')>('./engine/palletOptimization');
  vi.mocked(packOnPallets).mockImplementationOnce(actual.packOnPallets);
  const requestedCargo = emptyRequest ? [] : cargo;
  await render(0, 'A', 'pallets', requestedCargo); await render(1, 'A', 'pallets', requestedCargo);
  await act(async () => vi.runOnlyPendingTimers());
  await act(async () => vi.runOnlyPendingTimers());
  expect(readPhysicsTarget()?.result.placements.length).toBe(emptyRequest ? 0 : 1);
  expect(readPhysicsTarget()?.result.remaining).toEqual([]);
  expect(onNoLoad).not.toHaveBeenCalled();
});

it('does not calculate on mode entry, and supplies a scene without mounting another main canvas after explicit run', async () => {
  await render(0, 'A');
  expect(packOnPallets).not.toHaveBeenCalled(); expect(readPhysicsTarget()).toBeUndefined();
  await render(1, 'A');
  await act(async () => vi.runOnlyPendingTimers());
  await act(async () => vi.runOnlyPendingTimers());
  expect(packOnPallets).toHaveBeenCalledTimes(1);
  expect(onSceneChange.mock.calls.at(-1)?.[0]?.inputKey).toBe('A');
  expect(readPalletSnapshot()).toBeDefined(); expect(readPhysicsTarget()?.mode).toBe('pallets');
  expect(host.querySelector('canvas')).toBeNull(); expect(onRunningChange).toHaveBeenLastCalledWith(false);
});

it('input edits after packing starts cancel deferred publication and do not trigger an unrequested replacement run', async () => {
  await render(0, 'A'); await render(1, 'A');
  await act(async () => vi.runOnlyPendingTimers());
  expect(packOnPallets).toHaveBeenCalledTimes(1);
  await render(1, 'B');
  await act(async () => vi.runOnlyPendingTimers());
  expect(readPalletSnapshot()).toBeUndefined(); expect(readPhysicsTarget()).toBeUndefined();
  expect(onNoLoad).not.toHaveBeenCalled();
  expect(onSceneChange.mock.calls.every(([scene]) => scene === null)).toBe(true);
  expect(packOnPallets).toHaveBeenCalledTimes(1);
  await render(2, 'B');
  await act(async () => vi.runOnlyPendingTimers()); await act(async () => vi.runOnlyPendingTimers());
  expect(onSceneChange.mock.calls.at(-1)?.[0]?.inputKey).toBe('B');
});


it('records a reset request counter so pallet to mixed to pallet runs are never skipped', async () => {
  await render(0, 'A'); await render(1, 'A');
  await act(async () => vi.runOnlyPendingTimers()); await act(async () => vi.runOnlyPendingTimers());
  await render(0, 'B', 'mixed'); await render(1, 'B', 'mixed');
  await act(async () => vi.runOnlyPendingTimers()); await act(async () => vi.runOnlyPendingTimers());
  expect(onSceneChange.mock.calls.at(-1)?.[0]?.inputKey).toBe('B');
  await render(0, 'C'); await render(1, 'C');
  await act(async () => vi.runOnlyPendingTimers()); await act(async () => vi.runOnlyPendingTimers());
  expect(onSceneChange.mock.calls.at(-1)?.[0]?.inputKey).toBe('C');
  expect(onRunningChange).toHaveBeenLastCalledWith(false);
});

it('keeps an explicitly applied certified pallet candidate available synchronously for reports', async () => {
  await render(0, 'A'); await render(1, 'A');
  await act(async () => vi.runOnlyPendingTimers()); await act(async () => vi.runOnlyPendingTimers());
  const snapshot = readPalletSnapshot()!, target = readPhysicsTarget()!;
  const certified = { mode: 'pallets', status: 'passed', targetSignature: createPhysicsTargetSignature(target) } as InertiaCertification;
  await act(async () => {
    publishPalletSnapshot(snapshot); publishPhysicsTarget(target);
    (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification = certified;
    window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: certified }));
    setNextPalletCenteredResultOverride(snapshot.result);
    window.dispatchEvent(new CustomEvent('container-loading:pallet-spec-from-results', { detail: snapshot.spec }));
    // The report caller runs in this same stack, before React effects flush.
    expect(readPalletSnapshot()?.result).toBe(snapshot.result);
    expect(readPhysicsTarget()).toBe(target);
    expect(readLatestInertiaCertification()).toBe(certified);
  });
  await act(async () => vi.runOnlyPendingTimers());
  expect(packOnPallets).toHaveBeenCalledTimes(1);
  expect(readPalletSnapshot()?.result).toBe(snapshot.result);
  expect(readPhysicsTarget()).toBe(target);
  expect(readLatestInertiaCertification()).toBe(certified);
  expect(consumeNextPalletCenteredResultOverride()).toBeNull();
});
