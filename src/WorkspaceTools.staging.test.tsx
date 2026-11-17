import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WorkspaceTools from './WorkspaceTools';
import { OPEN_WORKSPACE_EVENT } from './uiEvents';
import { writeStoredState } from './storage';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { emptyStagingPalletSnapshot } from './StagingWorkspace';
import { stagingPalletSceneData } from './stagingPalletBridge';
import { defaultPalletSpec, packOnPallets } from './engine/palletOptimization';
import { stagingInputSignature } from './stagingInventory';

let root: Root, host: HTMLDivElement;
const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 10000 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 10, quantity: 4, allowRotation: true }];
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); publishGuidedLoadingUnit('boxes');
  delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult; vi.unstubAllGlobals(); });

it.each(['boxes', 'mixed'] as const)('keeps %s staging membership and canonical pallet snapshot in a named saved plan', async mode => {
  publishGuidedLoadingUnit(mode);
  const snapshot = emptyStagingPalletSnapshot(defaultPalletSpec, mode === 'mixed' ? 'mixed' : 'pallets');
  Object.assign(snapshot.result, packOnPallets(container, cargo, defaultPalletSpec));
  const result = stagingPalletSceneData(container, cargo, snapshot).result;
  const metadata = { version: 1 as const, scopeKey: 'operator:guest|active', mode,
    inputSignature: stagingInputSignature({ scopeKey: 'operator:guest|active', mode, container, cargo,
      palletSpec: mode === 'mixed' ? defaultPalletSpec : undefined }),
    identity: { unitToStableId: { exact: 'stable' } }, selectedUnitId: 'stable',
    ...(mode === 'mixed' ? { palletSnapshot: snapshot, palletTypeId: 'company-default', yardPallets: snapshot.result.pallets } : {}) };
  writeStoredState({ container, cargo, result, staging: metadata });
  // Pallet mode must prefer its real stored snapshot over the legacy empty box publication.
  const latest = { container, cargo, result: mode === 'boxes' ? result : { ...result, placements: [], loadedWeightKg: 0 } };
  (window as Window & { __containerLoadingLatestResult?: typeof latest }).__containerLoadingLatestResult = latest;
  await act(async () => root.render(<WorkspaceTools />));
  await act(async () => window.dispatchEvent(new CustomEvent(OPEN_WORKSPACE_EVENT, { detail: { tab: 'data' } })));
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === '현재 계획 저장');
  expect(button).toBeDefined(); await act(async () => button!.click());
  const saved = JSON.parse(localStorage.getItem('container-loading-workspace-boxes-v1')!)[0];
  expect(saved.state.staging).toEqual(metadata); expect(saved.state.result.placements).toHaveLength(4);
  if (mode === 'mixed') expect(saved.state.staging.palletSnapshot.result.pallets).toHaveLength(1);
});
