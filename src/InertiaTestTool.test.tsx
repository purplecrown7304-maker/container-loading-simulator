import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import InertiaTestTool from './InertiaTestTool';
import CertificationInvalidationBridge from './CertificationInvalidationBridge';
import { runInertiaAnimation, type InertiaAnimationResult, type InertiaRunOptions } from './engine/inertiaSimulation';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { openInertiaImprovementReport } from './inertiaReport';
import { publishPhysicsTarget, clearPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { readSecuringMaterialSettings, writeSecuringMaterialSettings } from './securingMaterialSettings';
import { clearInertiaCanvasPlayback, readInertiaCanvasPlayback, registerInertiaCanvasHost, useInertiaCanvasPlayback } from './inertiaCanvasStore';

vi.mock('./engine/inertiaSimulation', () => ({ runInertiaAnimation: vi.fn() }));
vi.mock('./inertiaReport', () => ({ openInertiaImprovementReport: vi.fn(() => true) }));
function FrameProbe() { const playback = useInertiaCanvasPlayback(); return playback?.frame ? <div data-testid="animation-frame">frame {playback.frame.step}</div> : null; }
const fixture: PhysicsTarget = {
  mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: 1, validationIssues: [] },
};
const animation: InertiaAnimationResult = {
  scenario: 'acceleration', fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0,
  maxHorizontalShiftM: 0.0123, maxTiltDeg: 2,
  frames: Array.from({ length: 6 }, (_, i) => ({ cargo: new Float32Array([i, 0, 0, 0, 0, 0, 1]), supports: new Float32Array(), phase: 'force', step: i * 2 })),
};
type PendingRun = { options: InertiaRunOptions; resolve: (value: InertiaAnimationResult) => void; reject: (reason: Error) => void; progress?: (n: number) => void };
let pending: PendingRun[];
let root: Root, host: HTMLDivElement;
let canvasHost: HTMLDivElement, unregisterHost: () => void;
let frameCallbacks: Map<number, FrameRequestCallback>;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find(b => b.textContent === label)!;
const tab = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role=tab]')).find(b => b.textContent?.startsWith(label))!;
const frame = () => document.querySelector('[data-testid=animation-frame]');
const open = () => act(async () => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)));
const start = async () => { await act(async () => publishPhysicsTarget(fixture)); await open(); return pending.at(-1)!; };
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); pending = []; frameCallbacks = new Map(); let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = ++nextFrame; frameCallbacks.set(id, cb); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frameCallbacks.delete(id));
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.mocked(runInertiaAnimation).mockReset().mockImplementation((_c, _p, _s, _supports, progress, _securing, options = {}) => new Promise((resolve, reject) => pending.push({ resolve, reject, options, progress })));
  vi.mocked(openInertiaImprovementReport).mockClear();
  clearPhysicsTarget(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  canvasHost = document.createElement('div'); document.body.append(canvasHost);
  unregisterHost = registerInertiaCanvasHost({ element: canvasHost, ...fixture });
  await act(async () => root.render(<><CertificationInvalidationBridge /><InertiaTestTool /><FrameProbe /></>));
});
afterEach(async () => { await act(async () => root.unmount()); unregisterHost(); clearInertiaCanvasPlayback(); canvasHost.remove(); host.remove(); clearPhysicsTarget(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('inertia animation lifecycle', () => {
  it('does not revive a stale legacy result or run empty targets', async () => {
    Object.assign(window, { __containerLoadingLatestResult: fixture }); await open();
    expect(button('현재 상황 다시 계산').disabled).toBe(true); expect(pending).toHaveLength(0);
    await act(async () => publishPhysicsTarget({ ...fixture, result: { ...fixture.result, placements: [] } }));
    expect(button('현재 상황 다시 계산').disabled).toBe(true); expect(pending).toHaveLength(0);
  });
  it.each(['collision', 'NaN'])('validates %s before invoking the engine', async kind => {
    const placement = { ...fixture.result.placements[0], x: kind === 'NaN' ? NaN : 3 };
    const invalid = { ...fixture, result: { ...fixture.result, placements: [placement] } };
    await act(async () => { unregisterHost(); unregisterHost = registerInertiaCanvasHost({ element: canvasHost, ...invalid }); publishPhysicsTarget(invalid); }); await open();
    expect(pending).toHaveLength(0); expect(document.querySelector('[role=status]')).not.toBeNull();
  });
  it('ignores duplicate opening/same-scenario actions and synchronously cancels late results', async () => {
    const first = await start();
    await act(async () => { window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)); tab('출발 가속').click(); });
    expect(pending).toHaveLength(1);
    await act(async () => { button('관성 계산 취소').click(); expect(first.options.shouldCancel?.()).toBe(true); first.resolve(animation); });
    expect(frame()).toBeNull(); expect(document.body.textContent).toContain('계산을 취소했습니다');
    await act(async () => { const retry = button('현재 상황 다시 계산'); retry.click(); retry.click(); });
    expect(pending).toHaveLength(2); expect(pending[1].options.captureFrames).toBe(true);
  });
  it('cancels a superseded scenario and only publishes its replacement', async () => {
    const first = await start();
    await act(async () => { tab('급정거').click(); first.resolve(animation); });
    expect(first.options.shouldCancel?.()).toBe(true); expect(pending).toHaveLength(2); expect(frame()).toBeNull();
    expect(vi.mocked(runInertiaAnimation).mock.calls[1][2]).toBe('braking');
    await act(async () => pending[1].resolve({ ...animation, scenario: 'braking' }));
    expect(frame()).not.toBeNull(); expect(tab('급정거').textContent).toContain('계산 완료'); expect(tab('출발 가속').textContent).not.toContain('계산 완료');
  });
  it.each(['input', 'replacement', 'equipment', 'materials', 'result'])('discards frames and late completion on %s', async mode => {
    const task = await start();
    await act(async () => {
      if (mode === 'input') { const input = document.createElement('input'); host.append(input); input.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (mode === 'equipment') selectTransportEquipment({ ...readTransportEquipment(), maxPayloadKg: readTransportEquipment().maxPayloadKg + 1 });
      else if (mode === 'materials') writeSecuringMaterialSettings({ ...readSecuringMaterialSettings(), loadBarKgPerEa: readSecuringMaterialSettings().loadBarKgPerEa + 1 });
      else if (mode === 'result') window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail: { ...fixture, result: { ...fixture.result } } }));
      else publishPhysicsTarget({ ...fixture, result: { ...fixture.result } });
      expect(task.options.shouldCancel?.()).toBe(true); task.resolve(animation);
    });
    expect(frame()).toBeNull(); expect(document.body.textContent).toContain('이전 애니메이션을 폐기');
    expect(pending).toHaveLength(1);
    if (mode !== 'replacement') expect(button('현재 상황 다시 계산').disabled).toBe(true);
  });
  it('retains the run on identical settings announcements', async () => {
    const task = await start();
    await act(async () => { selectTransportEquipment({ ...readTransportEquipment() }); writeSecuringMaterialSettings({ ...readSecuringMaterialSettings() }); });
    expect(task.options.shouldCancel?.()).toBe(false);
    await act(async () => task.resolve(animation)); expect(frame()).not.toBeNull();
  });
  it.each(['close', 'Escape', 'popstate'])('cancels on %s and restores focus without late frames', async action => {
    const opener = document.createElement('button'); host.append(opener); opener.focus(); const task = await start();
    await act(async () => {
      if (action === 'close') button('닫기').click();
      else if (action === 'Escape') document.querySelector('[role=region]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else window.dispatchEvent(new PopStateEvent('popstate'));
      expect(task.options.shouldCancel?.()).toBe(true); task.resolve(animation);
    });
    expect(document.querySelector('[role=region]')).toBeNull(); expect(document.activeElement).toBe(opener); expect(readInertiaCanvasPlayback()).toBeNull();
    await open(); expect(frame()).toBeNull(); expect(pending).toHaveLength(2);
  });
  it('keeps real frames for playback, controls speed and sends only summaries to the existing report', async () => {
    const task = await start(); await act(async () => { task.progress?.(0.42); });
    expect(document.body.textContent).toContain('42%');
    await act(async () => task.resolve(animation)); expect(frame()?.textContent).toBe('frame 0');
    expect(frameCallbacks.size).toBe(0);
    await act(async () => button('재생').click());
    await act(async () => { const cb = Array.from(frameCallbacks.values()).at(-1)!; frameCallbacks.clear(); cb(100); });
    expect(frame()?.textContent).toBe('frame 6');
    await act(async () => { button('일시정지').click(); button('2배').click(); });
    expect(frameCallbacks.size).toBe(0); expect(button('2배').getAttribute('aria-pressed')).toBe('true');
    const timeline = document.querySelector<HTMLInputElement>('.inertia-timeline')!;
    expect(timeline.dataset.viewOnly).toBe('true');
    await act(async () => timeline.dispatchEvent(new Event('input', { bubbles: true })));
    expect(readPhysicsTarget()).toBe(fixture);
    await act(async () => button('계산 결과·개선 보고서').click());
    const reportResults = vi.mocked(openInertiaImprovementReport).mock.calls[0][1];
    expect(reportResults.acceleration?.frames).toEqual([]); expect(animation.frames).toHaveLength(6);
    expect(document.body.textContent).toContain('실제 운송 안전 인증이 아닙니다');
    await act(async () => clearPhysicsTarget()); expect(frame()).toBeNull();
  });
  it('provides retry after an engine failure and invalidates on unmount', async () => {
    const task = await start(); await act(async () => task.reject(new Error('failed')));
    expect(document.body.textContent).toContain('계산에 실패');
    await act(async () => button('현재 상황 다시 계산').click());
    expect(pending).toHaveLength(2);
    await act(async () => root.render(null)); expect(pending[1].options.shouldCancel?.()).toBe(true);
  });
  it('uses a no-canvas fallback dialog when the main viewer is unavailable', async () => {
    await act(async () => unregisterHost()); await start();
    expect(pending).toHaveLength(0); expect(document.querySelector('.inertia-canvas-host')).toBeNull();
    expect(document.body.textContent).toContain('자동 적재 단계의 3D 화면에서 실행하세요');
    const dialog = document.querySelector<HTMLElement>('[role=dialog]')!;
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(tab('급회전'));
    await act(async () => tab('급회전').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button('닫기'));
    await act(async () => document.querySelector('.inertia-modal-backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('restores the canvas and rejects late results when its host unmounts', async () => {
    const task = await start();
    expect(readInertiaCanvasPlayback()?.target).toBe(fixture);
    await act(async () => { unregisterHost(); task.resolve(animation); });
    expect(task.options.shouldCancel?.()).toBe(true); expect(frame()).toBeNull(); expect(readInertiaCanvasPlayback()).toBeNull();
  });
});
