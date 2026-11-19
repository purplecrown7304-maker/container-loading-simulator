import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeComparisonScene, { CameraController, planContentKey, ThreeVehicleSwap, type ThreeComparisonSceneProps } from './ThreeComparisonScene';
import { RETIRED_SCENE_LINGER_MS } from './sceneRetirement';
import { VEHICLE_SWAP_PROFILE } from './vehicleSwapMotion';
import { viewerPlan } from './viewerSceneProtocol';
import { buildStagingYardLayout } from './stagingYardLayout';
import { sceneCameraPose, stagingSceneCameraPose } from './threeComparisonSceneState';

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
    // A requested view moves there instead of jumping, also without a staging yard.
    act(() => root.render(<CameraController plan={plan(2)} view="top" autoRotate={false} />));
    expect(camera.position.toArray()).toEqual([4, 5, 6]); expect(camera.userData.viewerTransitionActive).toBe(true);
    frameAt(187.5); expect(camera.position.toArray()).not.toEqual([4, 5, 6]); expect(camera.userData.viewerTransitionActive).toBe(true);
    frameAt(375); expect(camera.userData.viewerTransitionActive).toBe(false);
    const top = sceneCameraPose(plan(2), 'top', 700 / 450);
    expect(camera.position.toArray()).toEqual(top.position.toArray()); expect(state.orbit.target.toArray()).toEqual(top.target.toArray());
    // Orbit damping stays a staging-only behaviour.
    expect(state.orbit.enableDamping).toBe(false);
    // New equipment in a plain viewer is still fitted at once.
    const longer = { ...plan(3), container: { ...plan(3).container, length: 12 } };
    act(() => root.render(<CameraController plan={longer} view="top" autoRotate={false} />));
    expect(camera.userData.viewerTransitionActive).toBe(false);
    expect(camera.position.toArray()).toEqual(sceneCameraPose(longer, 'top', 700 / 450).position.toArray());
  });
  it('fits a requested view at once in a plain viewer under reduced motion, diagnostics and auto-rotation, and lets the user take over mid-way', () => {
    const current = plan(), camera = state.runtime.camera as THREE.PerspectiveCamera, aspect = 900 / 500;
    act(() => root.render(<CameraController plan={current} view="free" autoRotate={false} instant />));
    act(() => root.render(<CameraController plan={current} view="top" autoRotate={false} instant />));
    expect(camera.userData.viewerTransitionActive).toBe(false); expect(camera.position.toArray()).toEqual(sceneCameraPose(current, 'top', aspect).position.toArray());
    act(() => root.render(<CameraController plan={current} view="side" autoRotate />));
    expect(camera.userData.viewerTransitionActive).toBe(false); expect(camera.position.toArray()).toEqual(sceneCameraPose(current, 'side', aspect).position.toArray());
    // Taking over the orbit mid-way keeps the pose the user grabbed.
    act(() => root.render(<CameraController plan={current} view="door" autoRotate={false} />));
    expect(camera.userData.viewerTransitionActive).toBe(true); frameAt(150);
    const grabbed = camera.position.toArray();
    act(() => (state.controls.onStart as () => void)());
    expect(camera.userData.viewerTransitionActive).toBe(false); frameAt(1000); expect(camera.position.toArray()).toEqual(grabbed);
    act(() => root.render(null)); state.media.matches = true;
    act(() => root.render(<CameraController plan={current} view="free" autoRotate={false} />));
    act(() => root.render(<CameraController plan={current} view="top" autoRotate={false} />));
    expect(camera.userData.viewerTransitionActive).toBe(false); expect(camera.position.toArray()).toEqual(sceneCameraPose(current, 'top', aspect).position.toArray());
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
  it('follows replaced equipment at the replacement pace only while that replacement is shown as a move', () => {
    const current = plan(), camera = state.runtime.camera as THREE.PerspectiveCamera;
    const layout = buildStagingYardLayout([], { container: current.container, vehicleRig: current.vehicleRig });
    const staging = { layout, visibleZoneIds: [], viewRequest: 0, dragging: false };
    act(() => root.render(<CameraController plan={current} view="all" autoRotate={false} staging={staging} physicalTransition />));
    const before = camera.position.toArray();
    const longer = { ...current, container: { ...current.container, length: 12 } };
    const longerLayout = buildStagingYardLayout([], { container: longer.container, vehicleRig: longer.vehicleRig });
    act(() => root.render(<CameraController plan={longer} view="all" autoRotate={false} staging={{ ...staging, layout: longerLayout }} physicalTransition />));
    expect(camera.userData.viewerTransitionActive).toBe(true); expect(camera.position.toArray()).toEqual(before);
    // Still under way after the ordinary view transition would have ended.
    frameAt(450); expect(camera.userData.viewerTransitionActive).toBe(true); expect(camera.position.toArray()).not.toEqual(before);
    frameAt(VEHICLE_SWAP_PROFILE.cameraMs); expect(camera.userData.viewerTransitionActive).toBe(false);
    const destination = stagingSceneCameraPose(longer, 'all', 900 / 500, longerLayout, []);
    expect(camera.position.toArray()).toEqual(destination.position.toArray()); expect(state.orbit.target.toArray()).toEqual(destination.target.toArray());
    // An explicit view request afterwards keeps the ordinary pace.
    act(() => root.render(<CameraController plan={longer} view="yard" autoRotate={false} staging={{ ...staging, layout: longerLayout, viewRequest: 1 }} physicalTransition />));
    frameAt(VEHICLE_SWAP_PROFILE.cameraMs + 375); expect(camera.userData.viewerTransitionActive).toBe(false);
    // With the move switched off, new equipment is fitted at once as before.
    act(() => root.render(<CameraController plan={current} view="yard" autoRotate={false} staging={{ ...staging, viewRequest: 1 }} />));
    expect(camera.userData.viewerTransitionActive).toBe(false);
    expect(camera.position.toArray()).toEqual(stagingSceneCameraPose(current, 'yard', 900 / 500, layout, []).position.toArray());
  });
});

type SwapProps = Parameters<typeof ThreeVehicleSwap>[0];
const SCENE_GROUPS = ['Equipment', 'Cargo', 'Supports', 'Securing', 'Weight cells', 'Center of gravity'];
function sceneRoot() {
  const root = new THREE.Group();
  for (const name of SCENE_GROUPS) { const group = new THREE.Group(); group.name = name; root.add(group); }
  return { root } as unknown as NonNullable<SwapProps['arriving']>;
}
const shown = (scene: { root: THREE.Group }) => SCENE_GROUPS.filter(name => scene.root.getObjectByName(name)!.visible);

describe('display-only equipment replacement', () => {
  const { leaveMs, arriveMs } = VEHICLE_SWAP_PROFILE;
  it('drives the old equipment off without its cargo, then brings the new one in on the cleared lane', () => {
    const departing = sceneRoot(), arriving = sceneRoot(), shade = { current: 1 }, onDeparted = vi.fn(), onDone = vi.fn();
    const invalidate = state.runtime.invalidate as ReturnType<typeof vi.fn>;
    const swap = { id: 1, departing, from: 0, startedAt: 0, travel: 30, identity: 'next' } as SwapProps['swap'];
    act(() => root.render(<ThreeVehicleSwap swap={swap} arriving={arriving} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    expect(shown(departing)).toEqual(['Equipment']);
    expect(arriving.root.visible).toBe(false); expect(arriving.root.position.x).toBe(-30); expect(shown(arriving)).toEqual(SCENE_GROUPS);
    frameAt(leaveMs / 2);
    expect(departing.root.position.x).toBeCloseTo(-3.75); expect(arriving.root.visible).toBe(false);
    expect(shade.current).toBeCloseTo(1 - 3.75 / (30 * VEHICLE_SWAP_PROFILE.shadeReach)); expect(onDeparted).not.toHaveBeenCalled();
    frameAt(leaveMs);
    expect(departing.root.position.x).toBe(-30); expect(onDeparted).toHaveBeenCalledExactlyOnceWith(1); expect(shade.current).toBe(0);
    // The owner drops the departed scene; its root is handed back exactly as it was.
    act(() => root.render(<ThreeVehicleSwap swap={{ ...swap, departing: null }} arriving={arriving} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    expect(departing.root.position.x).toBe(0); expect(shown(departing)).toEqual(SCENE_GROUPS);
    expect(arriving.root.visible).toBe(true); expect(arriving.root.position.x).toBe(-30);
    frameAt(leaveMs + arriveMs / 2);
    expect(arriving.root.position.x).toBeCloseTo(-3.75); expect(onDone).not.toHaveBeenCalled();
    frameAt(leaveMs + arriveMs);
    expect(arriving.root.position.x).toBe(0); expect(arriving.root.visible).toBe(true); expect(shade.current).toBe(1);
    expect(onDone).toHaveBeenCalledExactlyOnceWith(1); expect(onDeparted).toHaveBeenCalledOnce();
    // Nothing keeps the demand loop awake once both have settled.
    invalidate.mockClear(); frameAt(leaveMs + arriveMs + 5000);
    expect(invalidate).not.toHaveBeenCalled(); expect(onDone).toHaveBeenCalledOnce(); expect(arriving.root.position.x).toBe(0);
  });
  it('waits at an empty dock for late models and starts the arrival from when they are ready', () => {
    const departing = sceneRoot(), arriving = sceneRoot(), shade = { current: 1 }, onDeparted = vi.fn(), onDone = vi.fn();
    const invalidate = state.runtime.invalidate as ReturnType<typeof vi.fn>;
    const swap = { id: 4, departing, from: 0, startedAt: 0, travel: 30, identity: 'next' } as SwapProps['swap'];
    act(() => root.render(<ThreeVehicleSwap swap={swap} arriving={null} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    frameAt(leaveMs); expect(onDeparted).toHaveBeenCalledExactlyOnceWith(4);
    act(() => root.render(<ThreeVehicleSwap swap={{ ...swap, departing: null }} arriving={null} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    invalidate.mockClear(); frameAt(leaveMs + 600);
    expect(invalidate).not.toHaveBeenCalled(); expect(shade.current).toBe(0); expect(onDone).not.toHaveBeenCalled();
    const ready = leaveMs + 900; state.now = ready;
    act(() => root.render(<ThreeVehicleSwap swap={{ ...swap, departing: null }} arriving={arriving} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    expect(arriving.root.visible).toBe(true); expect(arriving.root.position.x).toBe(-30);
    // A scene that replaces the arriving one mid-way continues the same arrival.
    frameAt(ready + arriveMs / 2); expect(arriving.root.position.x).toBeCloseTo(-3.75);
    const republished = sceneRoot();
    act(() => root.render(<ThreeVehicleSwap swap={{ ...swap, departing: null }} arriving={republished} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    expect(arriving.root.position.x).toBe(0); expect(republished.root.position.x).toBeCloseTo(-3.75); expect(republished.root.visible).toBe(true);
    frameAt(ready + arriveMs); expect(republished.root.position.x).toBe(0); expect(onDone).toHaveBeenCalledExactlyOnceWith(4);
  });
  it('sends equipment that was still arriving away from where it stands, not from the dock', () => {
    const first = sceneRoot(), second = sceneRoot(), shade = { current: 1 }, onDeparted = vi.fn(), onDone = vi.fn();
    // The first replacement has nothing left to leave; its equipment is half-way in.
    const arrival = { id: 2, departing: null, from: 0, startedAt: 0, travel: 30, identity: 'first' } as SwapProps['swap'];
    act(() => root.render(<ThreeVehicleSwap swap={arrival} arriving={first} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    frameAt(arriveMs / 2); expect(first.root.position.x).toBeCloseTo(-3.75);
    // It is replaced in turn before it has parked.
    const from = first.root.position.x;
    const next = { id: 3, departing: first, from, startedAt: arriveMs / 2, travel: 30, identity: 'second' } as SwapProps['swap'];
    act(() => root.render(<ThreeVehicleSwap swap={next} arriving={second} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    expect(first.root.position.x).toBeCloseTo(-3.75); expect(first.root.visible).toBe(true);
    expect(second.root.visible).toBe(false); expect(onDone).not.toHaveBeenCalled();
    frameAt(arriveMs / 2 + leaveMs / 2); expect(first.root.position.x).toBeCloseTo(-3.75 - 26.25 * .125);
    frameAt(arriveMs / 2 + leaveMs); expect(first.root.position.x).toBe(-30); expect(onDeparted).toHaveBeenCalledExactlyOnceWith(3);
    expect(second.root.visible).toBe(true);
    frameAt(arriveMs / 2 + leaveMs + arriveMs); expect(second.root.position.x).toBe(0); expect(onDone).toHaveBeenCalledExactlyOnceWith(3);
  });
  it('hands every root and the dock shade back when the replacement is abandoned mid-way', () => {
    const departing = sceneRoot(), arriving = sceneRoot(), shade = { current: 1 }, onDeparted = vi.fn(), onDone = vi.fn();
    departing.root.getObjectByName('Securing')!.visible = false;
    const swap = { id: 7, departing, from: 0, startedAt: 0, travel: 30, identity: 'next' } as SwapProps['swap'];
    act(() => root.render(<ThreeVehicleSwap swap={swap} arriving={arriving} shade={shade} onDeparted={onDeparted} onDone={onDone} />));
    frameAt(leaveMs * .8); expect(departing.root.position.x).toBeLessThan(-10); expect(shade.current).toBe(0);
    act(() => root.render(null));
    expect(departing.root.position.x).toBe(0); expect(arriving.root.position.x).toBe(0); expect(arriving.root.visible).toBe(true); expect(shade.current).toBe(1);
    // A group that was already hidden for its own reason stays hidden.
    expect(shown(departing)).toEqual(SCENE_GROUPS.filter(name => name !== 'Securing'));
    expect(onDeparted).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
  });
});
