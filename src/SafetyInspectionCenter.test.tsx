import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import SafetyInspectionCenter, { openSafetyInspectionCenter } from './SafetyInspectionCenter';
import CertificationInvalidationBridge from './CertificationInvalidationBridge';
import { publishPhysicsTarget, clearPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { readTransportEquipment, selectTransportEquipment } from './transportEquipment';

const fixture: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: 1, validationIssues: [] } };
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (e: { data: object }) => void;
  onerror?: () => void;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { TestWorker.instances.push(this); }
  result() { this.onmessage?.({ data: { progress: 100, result: { summary: 'TEST RESULT', details: [], caution: 'test', attention: false } } }); }
}
let root: Root, host: HTMLDivElement;
const button = (text: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === text)!;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('Worker', TestWorker); TestWorker.instances = [];
  clearPhysicsTarget(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<><CertificationInvalidationBridge /><SafetyInspectionCenter /></>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); vi.unstubAllGlobals(); });
const open = () => act(async () => openSafetyInspectionCenter());
const start = async () => { await act(async () => publishPhysicsTarget(fixture)); await open(); await act(async () => button('관성 테스트 실행').click()); return TestWorker.instances.at(-1)!; };
describe('manual inspection lifecycle', () => {
  it('does not revive stale window results after clear or accept an empty target', async () => {
    Object.assign(window, { __containerLoadingLatestResult: fixture }); await open();
    expect(button('관성 테스트 실행').disabled).toBe(true);
    await act(async () => publishPhysicsTarget({ ...fixture, result: { ...fixture.result, placements: [] } }));
    expect(button('관성 테스트 실행').disabled).toBe(true);
  });
  it('locks duplicate execution and discards late results after cancellation', async () => {
    const w = await start(); await act(async () => button('관성 테스트 실행').click());
    expect(TestWorker.instances).toHaveLength(1);
    await act(async () => button('실행 취소').click()); await act(async () => w.result());
    expect(w.terminate).toHaveBeenCalled(); expect(document.body.textContent).not.toContain('TEST RESULT');
    expect(document.body.textContent).toContain('취소됨');
  });
  it('keeps a valid run when adapters re-announce identical equipment', async () => {
    const w = await start();
    await act(async () => selectTransportEquipment({ ...readTransportEquipment() }));
    expect(w.terminate).not.toHaveBeenCalled();
    await act(async () => w.result()); expect(document.body.textContent).toContain('TEST RESULT');
  });
  it.each(['input', 'replacement', 'equipment'])('invalidates in-flight and completed results on %s', async mode => {
    const w = await start();
    await act(async () => {
      if (mode === 'input') { const input = document.createElement('input'); host.append(input); input.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (mode === 'equipment') selectTransportEquipment({ ...readTransportEquipment(), maxPayloadKg: readTransportEquipment().maxPayloadKg + 1 });
      else publishPhysicsTarget({ ...fixture, result: { ...fixture.result } });
      w.result();
    });
    expect(w.terminate).toHaveBeenCalled(); expect(document.body.textContent).not.toContain('TEST RESULT');
    if (mode !== 'replacement') { await open(); expect(button('관성 테스트 실행').disabled).toBe(true); }
  });
  it.each(['닫기', 'Escape', 'popstate'])('terminates on %s and reopens without results', async mode => {
    const w = await start();
    await act(async () => {
      if (mode === '닫기') button(mode).click();
      else if (mode === 'Escape') document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: mode, bubbles: true }));
      else window.dispatchEvent(new PopStateEvent('popstate'));
      w.result();
    });
    expect(document.querySelector('[role=dialog]')).toBeNull(); expect(w.terminate).toHaveBeenCalled();
    await open(); expect(document.body.textContent).not.toContain('TEST RESULT');
  });
  it('shows completion, error and retry without modifying the target', async () => {
    const before = JSON.stringify(fixture); const w = await start(); await act(async () => w.result());
    expect(document.body.textContent).toContain('TEST RESULT');
    await act(async () => button('관성 테스트 다시 실행').click());
    await act(async () => TestWorker.instances.at(-1)!.onerror?.());
    expect(document.body.textContent).toContain('실행 실패');
    expect(button('관성 테스트 실행').disabled).toBe(false); expect(JSON.stringify(fixture)).toBe(before);
  });
});
