import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import InspectionStatusPanel from './InspectionStatusPanel';
import { loadContainer, publishLoadingResult } from './engine/loadingEngine';
import { clearPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { clearLoadSimAcceptance, publishLoadSimAcceptance } from './rule-engine/acceptance';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { FINAL_LOADING_WORKFLOW_ERROR_EVENT } from './finalWorkflowEvents';

it('makes work output ready after A static validation without claiming dynamic certification', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  clearPhysicsTarget(); clearLoadSimAcceptance(); clearLatestInertiaCertification();
  const container = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
  const cargo = [{ id: 'A', name: 'A', length: .5, width: .5, height: .5, weightKg: 10, quantity: 2 }];
  const target: PhysicsTarget = { mode: 'boxes', container, cargo, result: loadContainer(container, cargo, { publish: false }) };
  const host = document.createElement('div'); host.innerHTML = '<div id="mount"></div><div class="dashboard-right"></div>'; document.body.append(host);
  const root = createRoot(host.querySelector('#mount')!);
  try {
    await act(async () => root.render(<InspectionStatusPanel />));
    await act(async () => { publishLoadingResult(container, cargo, target.result); expect(publishLoadSimAcceptance(target).status).toBe('accepted'); });
    expect(host.textContent).toContain('정적 검증 완료');
    expect(host.textContent).toContain('발급 가능');
    expect(host.textContent).toContain('Rapier 물리 검사 (선택)');
    expect(host.textContent).toContain('동적 안전을 인증한 상태가 아닙니다');
    expect(host.querySelectorAll('tbody tr')[3].textContent).toContain('미실행');
    expect(host.querySelectorAll('tbody tr')[4].textContent).toContain('미실행');
    await act(async () => clearLoadSimAcceptance());
    expect(host.querySelectorAll('tbody tr')[2].textContent).not.toContain('발급 가능');
    const rejected = { ...target, result: { ...target.result, placements: target.result.placements.map((p, index) => index ? p : { ...p, x: -1 }) } };
    await act(async () => { expect(publishLoadSimAcceptance(rejected).status).toBe('rejected'); });
    expect(host.textContent).toContain('정적 검증 실패');
    expect(host.querySelectorAll('tbody tr')[2].textContent).not.toContain('발급 가능');
    await act(async () => window.dispatchEvent(new CustomEvent(FINAL_LOADING_WORKFLOW_ERROR_EVENT, { detail: { error: 'A worker failed' } })));
    expect(host.querySelectorAll('tbody tr')[0].textContent).toContain('A worker failed');
    expect(host.querySelectorAll('tbody tr')[3].textContent).not.toContain('A worker failed');
  } finally {
    await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearLoadSimAcceptance(); clearLatestInertiaCertification(); vi.unstubAllGlobals();
  }
});
