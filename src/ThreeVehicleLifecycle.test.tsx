import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeComparisonScene, { CameraController, type ThreeComparisonSceneProps } from './ThreeComparisonScene';
import { viewerPlan } from './viewerSceneProtocol';

const state = vi.hoisted(() => ({ runtime: {} as Record<string, unknown>, load: vi.fn(), labels: vi.fn(), create: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ Canvas: () => null, useThree: () => state.runtime, useFrame: vi.fn() }));
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }));
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
  state.load.mockReset().mockResolvedValue({}); state.labels.mockReset().mockImplementation(() => Promise.resolve({ materials: new Map(), release: vi.fn() }));
  state.create.mockReset().mockImplementation(() => ({ dispose: vi.fn() }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('cosmetic vehicle lifecycle', () => {
  it('keeps cargo usable after vehicle failure and retries without remounting the canvas', async () => {
    const props = options(), status = vi.fn(), error = vi.fn();
    state.load.mockRejectedValueOnce(new Error('missing GLB'));
    await act(async () => root.render(<ThreeComparisonScene {...props} onVehicleStatus={status} onError={error} />));
    expect(state.create.mock.calls[0][0].vehicleRig).toBe('none');
    expect(status).toHaveBeenLastCalledWith({ status: 'fallback', message: 'missing GLB' }); expect(error).not.toHaveBeenCalled();
    const first = state.create.mock.results[0].value;
    await act(async () => root.render(<ThreeComparisonScene {...props} vehicleAttempt={1} onVehicleStatus={status} />));
    expect(first.dispose).toHaveBeenCalledOnce(); expect(state.create.mock.calls[1][0]).toBe(props.plan);
    expect(status).toHaveBeenLastCalledWith({ status: 'ready' });
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
});
