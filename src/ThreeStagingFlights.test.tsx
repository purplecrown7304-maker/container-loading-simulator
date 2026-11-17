import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Group, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeStagingFlights, { type ThreeStagingFlightsProps } from './ThreeStagingFlights';
import { viewerPlan } from './viewerSceneProtocol';
import { sceneBoxMatrix, type ThreeComparisonPlan } from './threeComparisonSceneState';
import type { StagingUnit } from './stagingInventory';
import type { StagingFlightSequence } from './stagingFlights';
import type { DisplayFlightTransform } from './threeComparisonSceneResources';

const state = vi.hoisted(() => ({ elapsed: 0, frame: null as ((state: unknown, dt: number) => void) | null, priority: -1,
  scene: null as unknown as Scene, camera: null as unknown as PerspectiveCamera,
  invalidate: vi.fn(), renders: 0, media: { matches: false, listeners: new Set<() => void>() } }));
vi.mock('@react-three/fiber', () => ({
  useThree: () => { state.renders++; return { invalidate: state.invalidate, scene: state.scene, camera: state.camera }; },
  useFrame: (callback: (state: unknown, dt: number) => void, priority: number) => { state.frame = callback; state.priority = priority; },
}));
const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
const placement = (id: string, x: number) => ({ cargoId: id, unitId: `engine-${id}`, x, y: .5, z: 0, length: .5, width: .4, height: .3, weightKg: 1 });
function plan(): ThreeComparisonPlan {
  return viewerPlan(container, { placements: [placement('A', 1), placement('B', 2)], remaining: [], loadedWeightKg: 2, usedVolumeM3: .12, validationIssues: [] }, 1);
}
function units(current: ThreeComparisonPlan): StagingUnit[] {
  return current.placements.map((box, index) => ({ id: `unit-${box.cargoId}`, kind: 'box', name: box.cargoId, cargoId: box.cargoId,
    cargoIds: [box.cargoId], length: box.length, width: box.width, height: box.height, weightKg: box.weightKg,
    boxCount: 1, unloadPriorities: [], location: 'vehicle', verdict: 'placed', reasons: [], placement: box, sourcePlacementIndex: index,
    boxUnits: [{ id: box.unitId!, cargoId: box.cargoId, stableId: `unit-${box.cargoId}` }] }));
}
function sequence(current: ThreeComparisonPlan, id = 1, member = 0): StagingFlightSequence {
  const box = current.placements[member];
  return { id, inputSignature: 'synthetic-input', planKey: 'accepted-plan', flights: [{ unitId: `unit-${box.cargoId}`,
    from: { position: [8, -1, 0], rotationY: 0 },
    to: { position: [box.x + box.length / 2 - container.length / 2, box.z, box.y + box.width / 2 - container.width / 2], rotationY: 0 },
    durationMs: 1000, delayMs: 0 }] };
}
function resources(current: ThreeComparisonPlan) {
  const baseline = current.placements.map(box => sceneBoxMatrix(box, current.container));
  const cargo = baseline.map(matrix => matrix.clone());
  const calls: Array<Array<{ cargoIndices: number[]; supportIndex?: number | null; matrix: Matrix4 }>> = [];
  const applyDisplayFlights = vi.fn((transforms: readonly DisplayFlightTransform[]) => {
    cargo.forEach((matrix, index) => matrix.copy(baseline[index]));
    for (const transform of transforms) for (const index of transform.cargoIndices) cargo[index].premultiply(transform.matrix);
    calls.push(transforms.map(transform => ({ cargoIndices: [...transform.cargoIndices], supportIndex: transform.supportIndex, matrix: transform.matrix.clone() })));
  });
  return { props: { root: new Group(), applyDisplayFlights } as unknown as ThreeStagingFlightsProps['resources'], baseline, cargo, calls, applyDisplayFlights };
}
let root: Root, host: HTMLDivElement, mounted: boolean;
let props: ThreeStagingFlightsProps;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); state.elapsed = 0; state.frame = null; state.renders = 0;
  state.scene = new Scene(); state.camera = new PerspectiveCamera();
  state.media.matches = false; state.media.listeners.clear(); state.invalidate.mockClear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return state.media.matches; },
    addEventListener: (_type: string, listener: () => void) => state.media.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => state.media.listeners.delete(listener) })));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); mounted = true;
  const current = plan(); props = { resources: resources(current).props, plan: current, units: units(current), sequence: sequence(current), onComplete: vi.fn() };
});
afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function render(value = props, strict = false) {
  props = value; await act(async () => root.render(strict ? <StrictMode><ThreeStagingFlights {...value} /></StrictMode> : <ThreeStagingFlights {...value} />));
}
function frame(elapsed: number) {
  while (state.elapsed < elapsed) {
    const step = Math.min(50, elapsed - state.elapsed); state.elapsed += step;
    act(() => state.frame!({}, step / 1000));
  }
}
const position = (matrix: Matrix4) => new Vector3().setFromMatrixPosition(matrix).toArray();

describe('accepted staging flight consumer', () => {
  it('applies the first pose before a frame, moves existing instances and restores exact baseline once', async () => {
    const scene = resources(props.plan); const before = JSON.stringify({ plan: props.plan, units: props.units, sequence: props.sequence });
    await render({ ...props, resources: scene.props });
    expect(state.priority).toBe(0); expect(scene.calls).toHaveLength(1);
    expect(position(scene.cargo[0])).toEqual([8, -.85, 0]);
    expect(scene.calls[0][0].cargoIndices).toEqual([0]); expect(scene.cargo[1]).toEqual(scene.baseline[1]);
    const initial = scene.cargo[0].clone(), renders = state.renders;
    frame(500); expect(scene.cargo[0]).not.toEqual(initial); expect(scene.cargo[0]).not.toEqual(scene.baseline[0]);
    expect(position(scene.cargo[0])[1]).toBeGreaterThan(-.85); expect(state.renders).toBe(renders);
    frame(1000); expect(scene.calls.at(-1)).toEqual([]); expect(scene.cargo).toEqual(scene.baseline);
    expect(props.onComplete).toHaveBeenCalledExactlyOnceWith(1);
    const invalidations = state.invalidate.mock.calls.length; frame(1500); expect(state.invalidate).toHaveBeenCalledTimes(invalidations);
    expect(JSON.stringify({ plan: props.plan, units: props.units, sequence: props.sequence })).toBe(before);
  });

  it('keeps delayed units at the source and reuses its descriptor matrices during active frames', async () => {
    const scene = resources(props.plan), delayed = { ...props.sequence!, flights: [props.sequence!.flights[0],
      { ...sequence(props.plan, 1, 1).flights[0], delayMs: 200 }] };
    await render({ ...props, resources: scene.props, sequence: delayed }); const first = scene.cargo[1].clone();
    frame(100); expect(scene.cargo[1]).toEqual(first);
    frame(700); expect(scene.cargo[1]).not.toEqual(first);
    expect(scene.applyDisplayFlights.mock.calls[0][0][1].matrix).toBe(scene.applyDisplayFlights.mock.calls[2][0][1].matrix);
    frame(1200); expect(scene.cargo).toEqual(scene.baseline); expect(props.onComplete).toHaveBeenCalledTimes(1);
  });

  it.each(['suspended', 'reduced-motion', 'empty', 'missing-unit', 'stale-destination'])('settles %s immediately without starting a visual run', async kind => {
    const scene = resources(props.plan);
    if (kind === 'reduced-motion') state.media.matches = true;
    await render({ ...props, resources: scene.props, suspended: kind === 'suspended',
      units: kind === 'missing-unit' ? [] : props.units,
      sequence: kind === 'empty' ? { ...props.sequence!, flights: [] } : kind === 'stale-destination'
        ? { ...props.sequence!, flights: [{ ...props.sequence!.flights[0], to: { position: [0, 0, 0], rotationY: 0 } }] } : props.sequence });
    expect(scene.calls).toEqual([[]]); expect(scene.cargo).toEqual(scene.baseline);
    expect(props.onComplete).toHaveBeenCalledExactlyOnceWith(1); const calls = scene.calls.length;
    frame(500); expect(scene.calls).toHaveLength(calls);
  });

  it('settles a running sequence on suspension or a reduced-motion change and removes the listener', async () => {
    const scene = resources(props.plan); await render({ ...props, resources: scene.props }); frame(300);
    await render({ ...props, suspended: true }); expect(scene.cargo).toEqual(scene.baseline); expect(props.onComplete).toHaveBeenCalledTimes(1);
    await render({ ...props, suspended: false, sequence: sequence(props.plan, 2) });
    state.media.matches = true; await act(async () => { state.media.listeners.forEach(listener => listener()); });
    expect(scene.cargo).toEqual(scene.baseline); expect(props.onComplete).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount()); mounted = false; expect(state.media.listeners.size).toBe(0);
    expect(props.onComplete).toHaveBeenCalledTimes(2);
  });

  it('does not finish during StrictMode replay but restores and completes once on actual unmount', async () => {
    const scene = resources(props.plan); await render({ ...props, resources: scene.props }, true);
    expect(props.onComplete).not.toHaveBeenCalled(); expect(scene.calls.at(-1)).not.toEqual([]);
    frame(400); expect(scene.cargo).not.toEqual(scene.baseline);
    await act(async () => root.unmount()); mounted = false;
    expect(scene.cargo).toEqual(scene.baseline); expect(props.onComplete).toHaveBeenCalledExactlyOnceWith(1);
    expect(state.media.listeners.size).toBe(0);
  });

  it('restores only the retired resource, rebinds reordered plan IDs and keeps the current timeline', async () => {
    const originalUnits = props.units, first = resources(props.plan); await render({ ...props, resources: first.props }); frame(300);
    const reordered = { ...props.plan, revision: 2, placements: [...props.plan.placements].reverse() }, second = resources(reordered);
    await render({ ...props, plan: reordered, resources: second.props, units: originalUnits });
    expect(first.cargo).toEqual(first.baseline); expect(first.calls.at(-1)).toEqual([]);
    expect(second.calls.at(-1)![0].cargoIndices).toEqual([1]); expect(second.cargo[0]).toEqual(second.baseline[0]);
    expect(position(second.cargo[1])[0]).not.toBe(8); expect(props.onComplete).not.toHaveBeenCalled();
    frame(1000); expect(second.cargo).toEqual(second.baseline); expect(props.onComplete).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('uses only the supplied frame delta and submits the descriptor array once per active frame', async () => {
    const scene = resources(props.plan); await render({ ...props, resources: scene.props });
    const initial = scene.cargo[0].clone(), renders = state.renders;
    const clock = vi.spyOn(performance, 'now').mockReturnValue(9e9);
    const before = scene.calls.length;
    act(() => state.frame!({}, .025));
    expect(scene.calls).toHaveLength(before + 1);
    expect(scene.cargo[0]).not.toEqual(initial);
    expect(scene.cargo[0]).not.toEqual(scene.baseline[0]);
    expect(state.renders).toBe(renders);
    expect(clock).not.toHaveBeenCalled();
  });

  it('leaves the actual scene root/camera intact and restores baseline before a cancelled sequence completes', async () => {
    const scene = resources(props.plan), visualRoot = scene.props.root;
    visualRoot.position.set(0, 0, 0); visualRoot.visible = true;
    const rootMatrix = visualRoot.matrix.clone(), cameraPosition = state.camera.position.clone();
    const onComplete = vi.fn(() => {
      expect(scene.cargo).toEqual(scene.baseline);
      expect(visualRoot.visible).toBe(true);
      expect(visualRoot.matrix).toEqual(rootMatrix);
    });
    await render({ ...props, resources: scene.props, onComplete }); frame(300);
    expect(scene.cargo).not.toEqual(scene.baseline);
    expect(visualRoot.position.toArray()).toEqual([0, 0, 0]);
    expect(visualRoot.visible).toBe(true);
    expect(state.camera.position.equals(cameraPosition)).toBe(true);
    expect(state.scene.children).toHaveLength(0);
    await render({ ...props, sequence: null });
    expect(scene.cargo).toEqual(scene.baseline);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(1);
    frame(1500); expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('binds a complete pallet by member identities and actual support geometry rather than support array order', async () => {
    const current = props.plan, cargoPlacements = current.placements.map(box => ({ ...box, x: 1, z: .15 }));
    const pallet = { palletIndex: 8, x: .9, y: .4, z: 0, length: 1.1, width: 1.1, height: .15,
      cargoPlacements, stackLevel: 1, stackColumn: 8, cargoWeightKg: 2, packagingWeightKg: 0, packagingExtraHeightM: 0,
      cornerGuardsUsed: false, wrappingUsed: true, totalWeightKg: 27, centerOfGravity: { x: 1.4, y: .8, z: .3 } };
    const support = { id: 'PALLET-8', x: pallet.x, y: pallet.y, z: 0, length: 1.1, width: 1.1, height: .15, weightKg: 25 };
    const actual = { ...current, placements: cargoPlacements, supports: [{ ...support, id: 'other', x: 4 }, support] };
    const unit: StagingUnit = { ...props.units[0], id: 'whole-pallet', kind: 'pallet', pallet, length: 1.1, width: 1.1, height: .45,
      boxUnits: props.units.flatMap(item => item.boxUnits), sourcePlacementIndexes: [1, 0], sourcePalletIndex: 8 };
    const flight = { ...sequence(actual).flights[0], unitId: unit.id, to: { position: [pallet.x + .55 - 3, 0, pallet.y + .55 - 1.2] as [number, number, number], rotationY: 0 } };
    const scene = resources(actual); await render({ ...props, plan: actual, resources: scene.props, units: [unit], sequence: { ...props.sequence!, flights: [flight] } });
    expect(scene.calls[0][0]).toMatchObject({ cargoIndices: [0, 1], supportIndex: 1 });
    frame(1000); expect(props.onComplete).toHaveBeenCalledExactlyOnceWith(1); expect(scene.cargo).toEqual(scene.baseline);
  });
});
