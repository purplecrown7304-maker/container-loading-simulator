import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMERA_STATS_INTERVAL_MS, SceneRuntime, type ThreeComparisonSceneProps, type ThreeComparisonSceneStats } from './ThreeComparisonScene';
import { viewerPlan } from './viewerSceneProtocol';

const state = vi.hoisted(() => ({ runtime: {} as Record<string, unknown>, statistics: null as ((value: unknown) => void) | null, now: 0 }));
// Priority 2 is the statistics subscriber that runs after the output pipeline.
vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useThree: () => state.runtime,
  useFrame: (callback: (value: unknown) => void, priority?: number) => { if (priority === 2) state.statistics = callback; } }));
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }));

type SceneResources = Parameters<typeof SceneRuntime>[0]['resources'];
let root: Root, host: HTMLDivElement, camera: THREE.PerspectiveCamera, visibleCargo = 0;
const plan = (revision = 1) => ({ ...viewerPlan({ length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 1000 },
  { placements: [], remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: 0 }, revision), vehicleRig: 'none' as const });
const resources = () => ({ modelCount: 1, labelFaces: 0, visibleLabelFaces: 0, get visibleCargo() { return visibleCargo; }, displayFlightActive: false, displayFlightCount: 0,
  centerOfGravityVisible: false, centerOfGravityPosition: null, clearanceForSelection: () => null, isCargoVisible: () => false }) as unknown as NonNullable<SceneResources>;
function options(revision = 1, extra: Partial<ThreeComparisonSceneProps> = {}): ThreeComparisonSceneProps {
  return { plan: plan(revision), cut: 100, shell: true, step: 0, labels: true, weight: false, showCg: false, view: 'free', selected: null, onSelect: vi.fn(), ...extra };
}
/** One completed demand frame at the given time, as R3F would deliver it. */
function frame(now: number) {
  state.now = now;
  const info = { render: { calls: 10, triangles: 100 }, memory: { geometries: 1, textures: 1 } };
  act(() => { state.statistics?.({ gl: { info }, camera }); });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  camera = new THREE.PerspectiveCamera(); visibleCargo = 0; state.statistics = null; state.now = 0;
  state.runtime = { camera, size: { width: 900, height: 500 }, invalidate: vi.fn(), gl: { domElement: document.createElement('canvas') } };
  vi.spyOn(performance, 'now').mockImplementation(() => state.now);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('scene statistics delivery', () => {
  it('reports readiness once per plan, including a new plan served by the same resources', () => {
    const shared = resources(), onReady = vi.fn(), onPresented = vi.fn(), frameState = { current: { acceptedFrameStep: null, rejectedFrame: false } };
    const first = options(1, { onReady });
    act(() => root.render(<SceneRuntime resources={shared} options={first} frameState={frameState} onPresented={onPresented} />));
    frame(1000); frame(1016);
    expect(onReady).toHaveBeenCalledOnce(); expect(onPresented).toHaveBeenCalledOnce(); expect(onPresented).toHaveBeenLastCalledWith(shared);
    const second = options(2, { onReady });
    act(() => root.render(<SceneRuntime resources={shared} options={second} frameState={frameState} onPresented={onPresented} />));
    frame(1032);
    expect(onReady).toHaveBeenCalledTimes(2); expect(onReady.mock.calls[1][0].revision).toBe(2);
  });

  it('limits camera-only updates while moving, still delivers the final pose and never delays a scene change', () => {
    const onStats = vi.fn<(stats: ThreeComparisonSceneStats) => void>(), frameState = { current: { acceptedFrameStep: null as number | null, rejectedFrame: false } };
    act(() => root.render(<SceneRuntime resources={resources()} options={options(1, { onStats })} frameState={frameState} />));
    frame(1000);
    expect(onStats).toHaveBeenCalledOnce();
    // Sixty orbit frames in one second used to be sixty React updates.
    for (let index = 1; index <= 60; index++) { camera.position.set(index, 2, 3); frame(1000 + index * 1000 / 60); }
    const moving = onStats.mock.calls.length - 1;
    expect(moving).toBeGreaterThan(0); expect(moving).toBeLessThanOrEqual(Math.ceil(1000 / CAMERA_STATS_INTERVAL_MS));
    act(() => { vi.advanceTimersByTime(CAMERA_STATS_INTERVAL_MS); });
    expect(onStats.mock.calls.at(-1)![0].cameraPose.startsWith('60.00000,2.00000,3.00000')).toBe(true);
    const settled = onStats.mock.calls.length;
    act(() => { vi.advanceTimersByTime(CAMERA_STATS_INTERVAL_MS * 4); });
    expect(onStats).toHaveBeenCalledTimes(settled);
    // A real scene change inside the interval is reported on its own frame.
    camera.position.set(61, 2, 3); frame(2001);
    visibleCargo = 3; camera.position.set(62, 2, 3); frame(2002);
    expect(onStats.mock.calls.at(-1)![0]).toMatchObject({ visibleCargo: 3 });
    expect(onStats.mock.calls.at(-1)![0].cameraPose.startsWith('62.00000')).toBe(true);
    frameState.current = { acceptedFrameStep: 7, rejectedFrame: false }; frame(2003);
    expect(onStats.mock.calls.at(-1)![0].acceptedFrameStep).toBe(7);
  });

  it('drops a queued camera update when the scene unmounts', () => {
    const onStats = vi.fn();
    act(() => root.render(<SceneRuntime resources={resources()} options={options(1, { onStats })} frameState={{ current: { acceptedFrameStep: null, rejectedFrame: false } }} />));
    frame(1000); camera.position.set(5, 5, 5); frame(1010);
    const delivered = onStats.mock.calls.length;
    act(() => root.render(null));
    act(() => { vi.advanceTimersByTime(CAMERA_STATS_INTERVAL_MS * 2); });
    expect(onStats).toHaveBeenCalledTimes(delivered);
  });
});
