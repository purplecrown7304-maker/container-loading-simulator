import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PalletModePanel from './PalletModePanel';
import { setNextPalletCenteredResultOverride, consumeNextPalletCenteredResultOverride } from './engine/palletCentering';
import { INERTIA_CERTIFICATION_EVENT, createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { packOnPallets } from './engine/palletOptimization';
import { readPhysicsTarget, clearPhysicsTarget, publishPhysicsTarget } from './physicsTarget';
import { clearPalletSnapshot, readPalletSnapshot, publishPalletSnapshot } from './palletSnapshotStore';

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
const onSceneChange = vi.fn(), onRunningChange = vi.fn();
const render = (runToken: number, inputKey: string, mode: 'pallets' | 'mixed' = 'pallets') => act(async () => root.render(<PalletModePanel container={container} cargo={cargo} runToken={runToken}
  mode={mode} inputKey={inputKey} onSceneChange={onSceneChange} onRunningChange={onRunningChange} />));
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.clearAllMocks();
  clearPhysicsTarget(); clearPalletSnapshot();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
