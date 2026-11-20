import { withSecuredPhysicsFixture } from './testFixtures/physicsVerification';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import GuidedResultTabsEnhancer from './GuidedResultTabsEnhancer';
import { INERTIA_CERTIFICATION_EVENT, clearLatestInertiaCertification, buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { readStoredState, writeStoredState } from './storage';
import { endVehicleSplit, readVehicleSplit, resetVehicleSplitStateForTests } from './vehicleSplitState';

it('updates retained results when certification arrives later and removes a cleared PASS', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const state = window as Window & { __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult }; __containerLoadingLatestCertification?: InertiaCertification };
  const result: LoadingResult = { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] };
  state.__containerLoadingLatestResult = { container: { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000 }, cargo: [], result };
  publishGuidedLoadingUnit('boxes'); clearLatestInertiaCertification();
  const host = document.createElement('div');
  host.innerHTML = '<div id="mount"></div><section class="guided-result-stage"><div class="guided-result-tabs"></div><div class="guided-result-grid"></div></section>';
  document.body.append(host);
  const root = createRoot(host.querySelector('#mount')!);
  const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  try {
    await act(async () => root.render(<GuidedResultTabsEnhancer />)); await flush();
    expect(host.textContent).not.toContain('관성 통과');
    await act(async () => {
      const target = { mode: 'boxes' as const, ...state.__containerLoadingLatestResult! };
      const certified: InertiaCertification = { mode: 'boxes', status: 'passed', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 0), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .001, maxTiltDeg: .1, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .001, maxTiltDeg: .1 }])) };
      withSecuredPhysicsFixture(target, certified);
      state.__containerLoadingLatestCertification = certified;
      window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: certified }));
    });
    expect(host.textContent).toContain('관성 통과');
    await act(async () => (Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent === '안전 검사')!).click());
    expect(host.querySelector('.guided-safety-list article:last-child')?.className).toBe('pass');
    await act(async () => clearLatestInertiaCertification());
    expect(host.querySelector('.guided-safety-list article:last-child')?.className).toBe('warn');
    expect(state.__containerLoadingLatestResult.result).toBe(result);
  } finally {
    await act(async () => root.unmount()); host.remove(); delete state.__containerLoadingLatestResult; clearLatestInertiaCertification(); vi.unstubAllGlobals();
  }
});

it('offers the vehicle split where the waiting cargo is listed, and for direct boxes only', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); resetVehicleSplitStateForTests();
  const state = window as Window & { __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult } };
  const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000 };
  const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: .3, width: .3, height: .3, weightKg: 1, quantity: 5, allowRotation: true }];
  const result: LoadingResult = { placements: Array.from({ length: 3 }, (_, index) => ({ cargoId: 'A', x: index * .3, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 })), remaining: [{ cargoId: 'A', quantity: 2, reason: '바닥 자리가 부족함' }], loadedWeightKg: 3, usedVolumeM3: .081, validationIssues: [] };
  writeStoredState({ container, cargo });
  state.__containerLoadingLatestResult = { container, cargo, result };
  publishGuidedLoadingUnit('boxes'); clearLatestInertiaCertification();
  const host = document.createElement('div');
  host.innerHTML = '<div id="mount"></div><section class="guided-result-stage"><div class="guided-result-tabs"></div><div class="guided-result-grid"></div></section>';
  document.body.append(host);
  const root = createRoot(host.querySelector('#mount')!);
  const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const openUnloaded = () => act(async () => (Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent === '미적재')!).click());
  try {
    await act(async () => root.render(<GuidedResultTabsEnhancer />)); await flush();
    expect(host.querySelector('.vehicle-split-panel')).toBeNull();
    await openUnloaded();
    const panel = host.querySelector<HTMLElement>('.guided-result-tab-panel .vehicle-split-panel')!;
    expect(panel.getAttribute('data-vehicle-split')).toBe('offer');
    expect(panel.textContent).toContain('미적재 2 EA');
    expect(host.querySelector('.guided-unloaded-list')?.textContent).toContain('2 EA');

    await act(async () => panel.querySelector<HTMLButtonElement>('[data-vehicle-split-action="start"]')!.click());
    expect(readStoredState()!.cargo.map(item => item.quantity)).toEqual([3]);
    expect(readVehicleSplit()).toMatchObject({ vehicleCount: 2, active: 0 });

    // Pallet results list their waiting cargo without the offer: the rule is for direct boxes.
    await act(async () => { endVehicleSplit(); publishGuidedLoadingUnit('pallets'); });
    await flush();
    expect(host.querySelector('.vehicle-split-panel')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove(); delete state.__containerLoadingLatestResult; publishGuidedLoadingUnit(null); localStorage.clear(); resetVehicleSplitStateForTests(); vi.unstubAllGlobals();
  }
});
