import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import GuidedResultTabsEnhancer from './GuidedResultTabsEnhancer';
import { INERTIA_CERTIFICATION_EVENT, clearLatestInertiaCertification, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { publishGuidedLoadingUnit } from './guidedLoadingUnitState';
import { loadContainer, publishLoadingResult } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { clearLoadSimAcceptance, publishLoadSimAcceptance } from './rule-engine/acceptance';

it('shows exact A acceptance independently from optional inertia and rejects stale proofs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const state = window as Window & { __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult }; __containerLoadingLatestCertification?: InertiaCertification };
  clearPhysicsTarget(); clearLoadSimAcceptance(); clearLatestInertiaCertification();
  const container = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
  const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: .5, width: .5, height: .5, weightKg: 10, quantity: 2 }];
  const result = loadContainer(container, cargo, { publish: false });
  const target: PhysicsTarget = { mode: 'boxes', container, cargo, result };
  publishLoadingResult(container, cargo, result); publishGuidedLoadingUnit('boxes');
  const host = document.createElement('div');
  host.innerHTML = '<div id="mount"></div><section class="guided-result-stage"><div class="guided-result-tabs"></div><div class="guided-result-grid"></div></section>';
  document.body.append(host);
  const root = createRoot(host.querySelector('#mount')!);
  const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  try {
    await act(async () => root.render(<GuidedResultTabsEnhancer />)); await flush();
    expect(host.textContent).toContain('검증 대기');
    await act(async () => { expect(publishLoadSimAcceptance(target).status).toBe('accepted'); });
    expect(host.textContent).toContain('정적 검증 통과');
    expect(host.textContent).not.toContain('관성 통과');
    await act(async () => (Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent === '안전 검사')!).click());
    expect(host.textContent).toContain('별도 관성 검사 미실행');
    expect(host.querySelector('.guided-safety-list article:first-child')?.className).toBe('pass');
    await act(async () => {
      const certified = { mode: 'boxes', status: 'passed', targetSignature: 'different-layout', testedScenarios: 3, maxHorizontalShiftM: 0 } as InertiaCertification;
      state.__containerLoadingLatestCertification = certified;
      window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: certified }));
    });
    expect(host.querySelector('.guided-safety-list article:last-child')?.className).toBe('warn');
    await act(async () => {
      const certified = { mode: 'boxes', status: 'passed', targetSignature: createPhysicsTargetSignature(target), testedScenarios: 3, maxHorizontalShiftM: 0 } as InertiaCertification;
      state.__containerLoadingLatestCertification = certified;
      window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: certified }));
    });
    expect(host.querySelector('.guided-safety-list article:last-child')?.className).toBe('pass');
    await act(async () => clearLatestInertiaCertification());
    expect(host.querySelector('.guided-safety-list article:last-child')?.className).toBe('warn');
    expect(host.querySelector('.guided-safety-list article:first-child')?.className).toBe('pass');
    await act(async () => publishPhysicsTarget({ ...target, result: { ...result, placements: result.placements.map((p, index) => index ? p : { ...p, x: p.x + .1 }) } }));
    expect(host.querySelector('.guided-safety-list article:first-child')?.className).toBe('warn');
    expect(state.__containerLoadingLatestResult!.result).toBe(result);
  } finally {
    await act(async () => root.unmount()); host.remove(); delete state.__containerLoadingLatestResult;
    clearLoadSimAcceptance(); clearPhysicsTarget(); clearLatestInertiaCertification(); vi.unstubAllGlobals();
  }
});
