import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeComparisonScene, { CameraController, planContentKey, type ThreeComparisonSceneProps } from './ThreeComparisonScene';
import { RETIRED_SCENE_LINGER_MS } from './sceneRetirement';
import { viewerPlan } from './viewerSceneProtocol';
import { buildStagingYardLayout } from './stagingYardLayout';
import { stagingSceneCameraPose } from './threeComparisonSceneState';

const state = vi.hoisted(() => ({ runtime: {} as Record<string, unknown>, controls: {} as Record<string, unknown>, frame: null as (() => void) | null,
  orbit: {} as { target: import('three').Vector3; update: ReturnType<typeof vi.fn>; enableDamping: boolean }, now: 0,
  media: { matches: false, listeners: new Set<() => void>() }, load: vi.fn(), labels: vi.fn(), create: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useThree: () => state.runtime, useFrame: (callback: () => void) => { state.frame = callback; } }));
vi.mock('@react-three/drei', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return { OrbitControls: react.forwardRef((props: Record<string, unknown>, ref) => { state.controls = props; react.useImperativeHandle(ref, () => state.orbit); return null; }) };
});
vi.mock('./threeVehicleModels', () => ({ loadVehicleModel: state.load }));
vi.mock('./threeComparisonModels', () => ({ loadMeshyModel: vi.fn() }));
vi.mock('./threeComparisonLabels', () => ({ acquireComparisonLabels: state.labels }));
vi.mock('./threeComparisonSceneResources', () => ({ requiredComparisonModelKeys: () => [], createComparisonSceneResources: state.create }));
let root: Root, host: HTMLDivElement;
function plan(revision = 1) { return { ...viewerPlan({ length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 1000 }, { placements: [], remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: 0 }, revision), vehicleRig: 'articulated' as const }; }
function options(revision = 1): ThreeComparisonSceneProps { return { plan: plan(revision), cut: 100, shell: true, step: 0, labels: true, weight: false, showCg: false, view: 'free', selected: null, onSelect: vi.fn() }; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.runtime = { camera: new THREE.PerspectiveCamera(), size: { width: 900, height: 500 }, invalidate: vi.fn() };
  state.orbit = { target: new THREE.Vector3(), update: vi.fn(), enableDamping: false }; state.frame = null; state.now = 0; state.media.matches = false; state.media.listeners.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => state.now);
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ get matches() { return state.media.matches; },
    addEventListener: (_: string, listener: () => void) => state.media.listeners.add(listener), removeEventListener: (_: string, listener: () => void) => state.media.listeners.delete(listener),
  } as unknown as MediaQueryList));
  state.load.mockReset().mockResolvedValue({}); state.labels.mockReset().mockImplementation(() => Promise.resolve({ materials: new Map(), release: vi.fn() }));
  state.create.mockReset().mockImplementation(() => ({ dispose: vi.fn() }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const frameAt = (now: number) => act(() => { state.now = now; state.frame?.(); });

describe('cosmetic vehicle lifecycle', () => {
  it('keeps cargo usable after vehicle failure and retries without remounting the canvas', async () => {
    const props = options(), status = vi.fn(), error = vi.fn();
    state.load.mockRejectedValueOnce(new Error('missing GLB'));
    await act(async () => root.render(<ThreeComparisonScene {...props} onVehicleStatus={status} onError={error} />));
    expect(state.create.mock.calls[0][0].vehicleRig).toBe('none');
    expect(status).toHaveBeenLastCalledWith({ status: 'fallback', message: 'missing GLB' }); expect(error).not.toHaveBeenCalled();
    const first = state.create.mock.results[0].value;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await act(async () => root.render(<ThreeComparisonScene {...props} vehicleAttempt={1} onVehicleStatus={status} />));
      expect(state.create.mock.calls[1][0]).toBe(props.plan); expect(status).toHaveBeenLastCalledWith({ status: 'ready' });
      // The replaced scene keeps its shader programs alive until the new one has drawn.
      expect(first.dispose).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(RETIRED_SCENE_LINGER_MS); });
      expect(first.dispose).toHaveBeenCalledOnce();
      act(() => root.render(null));
      expect(first.dispose).toHaveBeenCalledOnce(); expect(state.create.mock.results[1].value.dispose).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it('keeps one scene for a re-published plan with identical content and rebuilds when the content changes', async () => {
    const props = options(), status = vi.fn();
    await act(async () => root.render(<ThreeComparisonScene {...props} onVehicleStatus={status} />));
    expect(state.create).toHaveBeenCalledOnce(); const first = state.create.mock.results[0].value;
    const republished = options(2);
    expect(republished.plan).not.toBe(props.plan); expect(planContentKey(republished.plan)).toBe(planContentKey(props.plan));
    await act(async () => root.render(<ThreeComparisonScene {...republished} onVehicleStatus={status} />));
    expect(state.create).toHaveBeenCalledOnce(); expect(first.dispose).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith({ status: 'ready' });
    const changed = { ...options(3), plan: { ...plan(3), container: { ...plan(3).container, length: 12 } } };
    expect(planContentKey(changed.plan)).not.toBe(planContentKey(props.plan));
    await act(async () => root.render(<ThreeComparisonScene {...changed} onVehicleStatus={status} />));
    expect(state.create).toHaveBeenCalledTimes(2); expect(state.create.mock.calls[1][0]).toBe(changed.plan);
    // Unmounting releases the live scene and the lingering replaced one exactly once.
    act(() => root.render(null));
    expect(first.dispose).toHaveBeenCalledOnce(); expect(state.create.mock.results[1].value.dispose).toHaveBeenCalledOnce();
  });
  it('rebuilds a vehicle fallback on the next plan instead of keeping the scene without its vehicle', async () => {
    state.load.mockRejectedValueOnce(new Error('missing GLB'));
    const status = vi.fn();
    await act(async () => root.render(<ThreeComparisonScene {...options()} onVehicleStatus={status} />));
    expect(status).toHaveBeenLastCalledWith({ status: 'fallback', message: 'missing GLB' });
    await act(async () => root.render(<ThreeComparisonScene {...options(2)} onVehicleStatus={status} />));
    expect(state.create).toHaveBeenCalledTimes(2); expect(status).toHaveBeenLastCalledWith({ status: 'ready' });
  });
  it('releases acquired labels after cancelled late loads and never publishes obsolete resources', async () => {
    let resolve: (value: unknown) => void = () => {};
    const pending = new Promise(r => { resolve = r; }), release = vi.fn();
    state.load.mockReturnValue(pending); state.labels.mockResolvedValue({ materials: new Map(), release });
    const status = vi.fn();
    await act(async () => root.render(<ThreeComparisonScene {...options()} onVehicleStatus={status} />));
    act(() => root.render(null)); await act(async () => { resolve({}); await pending; });
    expect(release).toHaveBeenCalledOnce(); expect(state.create).not.toHaveBeenCalled(); expect(status).toHaveBeenCalledTimes(1);
  });
  it('retains camera orbit on same-container cargo/navigation/resize, but fits a new equipment or requested view', () => {
    const camera = state.runtime.camera as THREE.PerspectiveCamera;
    act(() => root.render(<CameraController plan={plan()} view="free" autoRotate={false} />));
    camera.position.set(4, 5, 6); camera.quaternion.set(0, 0, .3, .9).normalize();
    const pose = [...camera.position.toArray(), ...camera.quaternion.toArray()];
    state.runtime.size = { width: 700, height: 450 };
    act(() => root.render(<CameraController plan={plan(2)} view="free" autoRotate={false} />));
    expect([...camera.position.toArray(), ...camera.quaternion.toArray()]).toEqual(pose);
    act(() => root.render(<CameraController plan={plan(2)} view="top" autoRotate={false} />));
    expect(camera.position.toArray()).not.toEqual([4, 5, 6]);
  });
  it('keeps orbit through staging inventory/selection/drag refreshes, locks drag controls and only refits explicit requests', () => {
    const current = plan(), camera = state.runtime.camera as THREE.PerspectiveCamera;
    const layout = buildStagingYardLayout([{ id: 'waiting', kind: 'box', length: .6, width: .4, height: .5 }], { container: current.container, vehicleRig: current.vehicleRig });
    const staging = { layout, visibleZoneIds: [layout.zones[0].id], viewRequest: 0, dragging: false };
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={staging} />));
    camera.position.set(4, 5, 6); camera.quaternion.set(0, 0, .3, .9).normalize();
    const orbit = [...camera.position.toArray(), ...camera.quaternion.toArray()];
    act(() => root.render(<CameraController plan={plan(2)} view="all" autoRotate={false} staging={{ ...staging, layout: { ...layout }, dragging: true }} />));
    expect([...camera.position.toArray(), ...camera.quaternion.toArray()]).toEqual(orbit);
    expect(state.controls.enabled).toBe(false);
    act(() => root.render(<CameraController plan={plan(2)} view="all" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} />));
    expect(camera.position.toArray()).toEqual([4, 5, 6]); expect(camera.userData.viewerTransitionActive).toBe(true); expect(state.controls.enabled).toBe(true);
    frameAt(187.5); expect(camera.position.toArray()).not.toEqual([4, 5, 6]);
    frameAt(375); expect(camera.userData.viewerTransitionActive).toBe(false);
    expect(camera.userData.viewerViewRequest).toBe('all:0:staging:1');
    camera.position.set(3, 4, 5);
    act(() => root.render(<CameraController plan={plan(3)} view="top" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} viewRequest={1} />));
    expect(camera.userData.viewerTransitionActive).toBe(true); frameAt(750); expect(camera.position.toArray()).not.toEqual([3, 4, 5]);
  });
  it('cancels a transition immediately on orbit/wheel/touch start, preserves that pose and idles until another explicit request', () => {
    const current = plan(), before = JSON.stringify(current), camera = state.runtime.camera as THREE.PerspectiveCamera;
    const layout = buildStagingYardLayout([], { container: current.container, vehicleRig: current.vehicleRig });
    const staging = { layout, visibleZoneIds: [], viewRequest: 0, dragging: false };
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={staging} />));
    act(() => root.render(<CameraController plan={current} view="vehicle" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} />));
    expect(state.orbit.enableDamping).toBe(false); frameAt(150);
    const intermediate = [...camera.position.toArray(), ...state.orbit.target.toArray()];
    act(() => (state.controls.onStart as () => void)());
    expect(camera.userData.viewerTransitionActive).toBe(false); expect(state.orbit.enableDamping).toBe(true);
    const invalidate = state.runtime.invalidate as ReturnType<typeof vi.fn>; invalidate.mockClear(); frameAt(1000);
    expect([...camera.position.toArray(), ...state.orbit.target.toArray()]).toEqual(intermediate); expect(invalidate).not.toHaveBeenCalled();
    act(() => root.render(<CameraController plan={plan(2)} view="vehicle" autoRotate={false} staging={{ ...staging, layout: { ...layout }, viewRequest: 1 }} />));
    expect([...camera.position.toArray(), ...state.orbit.target.toArray()]).toEqual(intermediate); expect(JSON.stringify(current)).toBe(before);
  });
  it('fits reduced motion, physical changes and diagnostic paths instantly and cleans an unfinished transition on unmount', () => {
    state.media.matches = true;
    const current = plan(), camera = state.runtime.camera as THREE.PerspectiveCamera, layout = buildStagingYardLayout([], { container: current.container, vehicleRig: current.vehicleRig });
    const staging = { layout, visibleZoneIds: [], viewRequest: 0, dragging: false };
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={staging} />));
    const initial = camera.position.clone();
    act(() => root.render(<CameraController plan={current} view="vehicle" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} />));
    expect(camera.position.equals(initial)).toBe(false); expect(camera.userData.viewerTransitionActive).toBe(false); expect(state.controls.enableDamping).toBe(false);
    // A fresh mount reads the changed preference; diagnostic mode remains instant.
    act(() => root.render(null)); state.media.matches = false;
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={staging} instant />));
    act(() => root.render(<CameraController plan={current} view="top" autoRotate={false} staging={{ ...staging, viewRequest: 2 }} instant />));
    expect(camera.userData.viewerTransitionActive).toBe(false);
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={{ ...staging, viewRequest: 3 }} />));
    expect(camera.userData.viewerTransitionActive).toBe(true);
    const changed = { ...current, container: { ...current.container, length: 8 } };
    act(() => root.render(<CameraController plan={changed} view="all" autoRotate={false} staging={{ ...staging, viewRequest: 4 }} />));
    expect(camera.userData.viewerTransitionActive).toBe(false);
    act(() => root.render(<CameraController plan={changed} view="yard" autoRotate={false} staging={{ ...staging, viewRequest: 5 }} />));
    expect(camera.userData.viewerTransitionActive).toBe(true);
    act(() => root.render(null)); expect(camera.userData.viewerTransitionActive).toBe(false); expect(state.media.listeners.size).toBe(0);
  });
  it('cancels an active transition for cargo dragging, restores input afterwards, and snaps a reduced-motion preference change to the exact endpoint', () => {
    const current = plan(), camera = state.runtime.camera as THREE.PerspectiveCamera;
    const layout = buildStagingYardLayout([], { container: current.container, vehicleRig: current.vehicleRig });
    const staging = { layout, visibleZoneIds: [], viewRequest: 0, dragging: false };
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={staging} />));
    const firstRequest = camera.userData.viewerViewRequest;
    act(() => root.render(<CameraController plan={current} view="vehicle" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} />));
    expect(camera.userData.viewerViewRequest).not.toBe(firstRequest); frameAt(100);
    const intermediate = camera.position.toArray();
    act(() => root.render(<CameraController plan={current} view="vehicle" autoRotate={false} staging={{ ...staging, viewRequest: 1, dragging: true }} />));
    expect(state.controls.enabled).toBe(false); expect(camera.userData.viewerTransitionActive).toBe(false); frameAt(500);
    expect(camera.position.toArray()).toEqual(intermediate);
    act(() => root.render(<CameraController plan={current} view="vehicle" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} />));
    expect(state.controls.enabled).toBe(true); expect(state.orbit.enableDamping).toBe(true);
    act(() => root.render(<CameraController plan={current} view="yard" autoRotate={false} staging={{ ...staging, viewRequest: 2 }} />));
    expect(camera.userData.viewerTransitionActive).toBe(true); frameAt(600);
    act(() => { state.media.matches = true; state.media.listeners.forEach(listener => listener()); });
    const destination = stagingSceneCameraPose(current, 'yard', 900 / 500, layout, []);
    expect(camera.position.toArray()).toEqual(destination.position.toArray()); expect(state.orbit.target.toArray()).toEqual(destination.target.toArray());
    expect(camera.userData.viewerTransitionActive).toBe(false); expect(state.orbit.enableDamping).toBe(false);
    const invalidate = state.runtime.invalidate as ReturnType<typeof vi.fn>; invalidate.mockClear(); frameAt(2000); expect(invalidate).not.toHaveBeenCalled();
  });
});
