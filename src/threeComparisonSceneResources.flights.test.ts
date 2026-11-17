import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { viewerPlan } from './viewerSceneProtocol';
import { createMeshyMaterial, MESHY_MODEL_KEYS } from './threeComparisonModels';
import { createComparisonSceneResources, type ComparisonModels, type DisplayFlightTransform } from './threeComparisonSceneResources';
import { poseMatrix, sceneBoxMatrix } from './threeComparisonSceneState';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); });
const shown = { cut: 100, step: 999, shell: true, labels: true, weight: false, showCg: true, selected: null };
function fixture() {
  return viewerPlan({ length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 }, {
    placements: [
      { cargoId: 'A', unitId: 'A-1', x: 1.1, y: .6, z: .15, length: .6, width: .4, height: .5, weightKg: 10 },
      { cargoId: 'A', unitId: 'A-2', x: 1.1, y: .6, z: .65, length: .6, width: .4, height: .5, weightKg: 10 },
      { cargoId: 'B', unitId: 'B-1', x: 3, y: .6, z: 0, length: .4, width: .6, height: .5, weightKg: 10 },
    ], remaining: [], validationIssues: [], usedVolumeM3: .36, loadedWeightKg: 55,
  }, 1, [], { geometry: 'platform', supports: [{ id: 'P-1', x: 1, y: .5, z: 0, length: 1.2, width: 1, height: .15, weightKg: 25 }] });
}
function makeScene(plan = fixture()) {
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture(), material = createMeshyMaterial(texture);
  const models = Object.fromEntries(MESHY_MODEL_KEYS.map(key => [key, { key, parts: [{ geometry, texture, material }],
    bounds: new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5)), triangleCount: 12 }])) as ComparisonModels;
  const label = new THREE.MeshBasicMaterial();
  const scene = createComparisonSceneResources(plan, models, new Map([['A', label], ['B', label]]));
  cleanups.push(() => { scene.dispose(); geometry.dispose(); texture.dispose(); material.dispose(); label.dispose(); });
  scene.updateVisibility(shown);
  return { scene, geometry, texture, material };
}
type Resources = ReturnType<typeof createComparisonSceneResources>;
function cargoMesh(scene: Resources, index: number) {
  let result: THREE.InstancedMesh | undefined;
  scene.root.traverse(object => {
    if (object.userData.kind === 'cargo' && object.userData.batch.indices.includes(index)) result = object as THREE.InstancedMesh;
  });
  return result!;
}
function cargoMatrix(scene: Resources, index: number) {
  const mesh = cargoMesh(scene, index), slot = mesh.userData.batch.visibleIndices.indexOf(index);
  expect(slot).toBeGreaterThanOrEqual(0);
  return instanceMatrix(mesh, slot);
}
function instanceMatrix(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); return matrix;
}
function expectMatrix(actual: THREE.Matrix4, expected: THREE.Matrix4) {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 5));
}
function delta(x: number, yaw = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, 2, -3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
}

describe('display-only vehicle loading flights', () => {
  it('moves only the assigned box through source, midpoint and exact baseline without accumulating or changing data', () => {
    const plan = fixture(), before = JSON.stringify(plan), { scene } = makeScene(plan);
    const initial = [0, 1, 2].map(index => cargoMatrix(scene, index)), cg = scene.centerOfGravityPosition;
    const transform = { cargoIndices: [2], matrix: delta(10) };
    const originalDelta = transform.matrix.clone();
    scene.applyDisplayFlights([transform]);
    expect(scene.displayFlightActive).toBe(true); expect(scene.displayFlightCount).toBe(1);
    expectMatrix(cargoMatrix(scene, 2), new THREE.Matrix4().multiplyMatrices(originalDelta, initial[2]));
    scene.applyDisplayFlights([transform]);
    expectMatrix(cargoMatrix(scene, 2), new THREE.Matrix4().multiplyMatrices(originalDelta, initial[2]));
    transform.matrix.copy(delta(5)); scene.applyDisplayFlights([transform]);
    expectMatrix(cargoMatrix(scene, 2), new THREE.Matrix4().multiplyMatrices(transform.matrix, initial[2]));
    for (const index of [0, 1]) expectMatrix(cargoMatrix(scene, index), initial[index]);
    expect(scene.centerOfGravityPosition).toEqual(cg); expect(JSON.stringify(plan)).toBe(before);
    scene.applyDisplayFlights([{ cargoIndices: [0], matrix: delta(3) }, { cargoIndices: [2], matrix: delta(7) }]);
    expect(scene.displayFlightCount).toBe(2); expect(scene.visibleCargo).toBe(3); expect(scene.modelCount).toBe(4);
    scene.applyDisplayFlights([]);
    expect(scene.displayFlightActive).toBe(false); expect(scene.displayFlightCount).toBe(0);
    for (const index of [0, 1, 2]) expect(cargoMatrix(scene, index).elements).toEqual(initial[index].elements);
  });

  it('moves a whole pallet, every packaging child, internal cartons, printed labels and selection with one rigid transform', () => {
    const plan = fixture();
    plan.decorations = [
      { x: 1, y: .5, z: .15, length: 1.2, width: 1, height: 1, color: '#bcdce5', supportIndex: 0, wire: true, wrapping: true },
      { x: 1, y: .5, z: .15, length: .035, width: .035, height: 1, color: '#fff', supportIndex: 0, modelKey: 'corner-guard' },
      { x: 1.3, y: .5, z: .15, length: .025, width: 1, height: 1, color: '#222', supportIndex: 0 },
    ];
    const before = JSON.stringify(plan), { scene } = makeScene(plan);
    scene.updateVisibility({ ...shown, selected: 0, selectedSupport: 0 });
    const support = scene.root.getObjectByName('Support_0')!;
    const initialSupport = support.matrix.clone(), originalCargo = [0, 1, 2].map(index => cargoMatrix(scene, index));
    const packaging: Array<{ object: THREE.Object3D; matrix: THREE.Matrix4 }> = [];
    support.traverse(object => { if (object !== support) packaging.push({ object, matrix: object.matrixWorld.clone() }); });
    const labels = scene.root.getObjectByName('Printed carton labels A') as THREE.InstancedMesh;
    const originalLabels = Array.from({ length: 8 }, (_, index) => instanceMatrix(labels, index));
    const matrix = delta(8, .7), originalMatrix = matrix.clone();
    scene.applyDisplayFlights([{ cargoIndices: [0, 1], supportIndex: 0, matrix }]);
    expectMatrix(support.matrix, new THREE.Matrix4().multiplyMatrices(matrix, initialSupport));
    for (const { object, matrix: original } of packaging) expectMatrix(object.matrixWorld, new THREE.Matrix4().multiplyMatrices(matrix, original));
    for (const index of [0, 1]) expectMatrix(cargoMatrix(scene, index), new THREE.Matrix4().multiplyMatrices(matrix, originalCargo[index]));
    expectMatrix(cargoMatrix(scene, 2), originalCargo[2]);
    originalLabels.forEach((original, index) => expectMatrix(instanceMatrix(labels, index), new THREE.Matrix4().multiplyMatrices(matrix, original)));
    expectMatrix(scene.root.getObjectByName('Cargo selection')!.matrix, new THREE.Matrix4().multiplyMatrices(matrix, sceneBoxMatrix(plan.placements[0], plan.container)));
    expect(scene.root.getObjectByName('Support selection')!.position.toArray()).toEqual(support.position.toArray());
    expect(scene.visibleCargo).toBe(3); expect(scene.visibleLabelFaces).toBe(12);
    expect(scene.displayFlightCount).toBe(1); expect(matrix.elements).toEqual(originalMatrix.elements); expect(JSON.stringify(plan)).toBe(before);
    scene.applyDisplayFlights([]); expectMatrix(support.matrix, initialSupport);
    packaging.forEach(({ object, matrix: original }) => expectMatrix(object.matrixWorld, original));
  });

  it('rejects invalid and duplicate assignments atomically without moving another cargo or leaking an old transform', () => {
    const { scene } = makeScene(), original = [0, 1, 2].map(index => cargoMatrix(scene, index));
    const invalid: DisplayFlightTransform[][] = [
      [{ cargoIndices: [-1], matrix: delta(9) }], [{ cargoIndices: [3], matrix: delta(9) }], [{ cargoIndices: [1.5], matrix: delta(9) }],
      [{ cargoIndices: [0, 0], matrix: delta(9) }], [{ cargoIndices: [0], matrix: delta(9) }, { cargoIndices: [0], matrix: delta(4) }],
      [{ cargoIndices: [0], supportIndex: 8, matrix: delta(9) }],
      [{ cargoIndices: [0], supportIndex: 0, matrix: delta(9) }, { cargoIndices: [1], supportIndex: 0, matrix: delta(4) }],
      [{ cargoIndices: [0], matrix: new THREE.Matrix4().makeScale(2, 1, 1) }],
      [{ cargoIndices: [0], matrix: new THREE.Matrix4().makeTranslation(NaN, 0, 0) }],
    ];
    for (const transforms of invalid) {
      scene.applyDisplayFlights([{ cargoIndices: [2], matrix: delta(3) }]);
      scene.applyDisplayFlights(transforms);
      expect(scene.displayFlightActive).toBe(false); expect(scene.displayFlightCount).toBe(0);
      for (const index of [0, 1, 2]) expect(cargoMatrix(scene, index).elements).toEqual(original[index].elements);
    }
  });

  it('uses this plan’s reordered indices and does not retain assignments in replacement resources', () => {
    const plan = fixture(), reordered = { ...plan, revision: 2, placements: [plan.placements[2], plan.placements[0], plan.placements[1]] };
    const first = makeScene(plan).scene, next = makeScene(reordered).scene;
    first.applyDisplayFlights([{ cargoIndices: [2], matrix: delta(7) }]);
    const original = [0, 1, 2].map(index => cargoMatrix(next, index));
    const index = reordered.placements.findIndex(box => box.unitId === 'B-1');
    expect(index).toBe(0); next.applyDisplayFlights([{ cargoIndices: [index], matrix: delta(4) }]);
    expectMatrix(cargoMatrix(next, 0), new THREE.Matrix4().multiplyMatrices(delta(4), original[0]));
    for (const unchanged of [1, 2]) expect(cargoMatrix(next, unchanged).elements).toEqual(original[unchanged].elements);
    next.applyDisplayFlights([]); expect(cargoMatrix(next, 0).elements).toEqual(original[0].elements);
  });

  it('clears display motion for authoritative physics and refuses stale display updates until the frame is released', () => {
    const plan = fixture(), { scene } = makeScene(plan), before = JSON.stringify(plan);
    const frame: InertiaAnimationFrame = { step: 1, phase: 'force',
      cargo: new Float32Array(plan.placements.flatMap((_, index) => [index + 4, 5, 6, 0, 0, 0, 1])),
      supports: new Float32Array([3, 2, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2]) };
    scene.applyDisplayFlights([{ cargoIndices: [0, 1], supportIndex: 0, matrix: delta(12, .8) }]);
    scene.applyFrame(frame); scene.applyDisplayFlights([{ cargoIndices: [0], matrix: delta(20) }]);
    expect(scene.displayFlightActive).toBe(false); expect(scene.displayFlightCount).toBe(0);
    plan.placements.forEach((box, index) => expectMatrix(cargoMatrix(scene, index), poseMatrix(frame.cargo, index, new THREE.Vector3(box.length, box.height, box.width))));
    expect(scene.root.getObjectByName('Support_0')!.position.toArray()).toEqual([3, 2, 1]);
    expect(scene.root.getObjectByName('Support_0')!.scale.toArray()).toEqual([1, 1, 1]);
    scene.applyDisplayFlights([]); expect(cargoMatrix(scene, 0).elements[12]).toBe(4);
    scene.applyFrame(); scene.applyDisplayFlights([]);
    for (const index of [0, 1, 2]) expectMatrix(cargoMatrix(scene, index), sceneBoxMatrix(plan.placements[index], plan.container));
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('refreshes bounds, labels and the cached cut/order state while reusing every instance buffer and model resource', () => {
    const { scene, geometry, texture, material } = makeScene(), mesh = cargoMesh(scene, 0);
    scene.updateVisibility({ ...shown, step: 1, selected: 0 });
    const buffer = mesh.instanceMatrix, array = buffer.array, shape = mesh.geometry, radius = mesh.boundingSphere!.radius;
    const sources = [geometry, texture, material].map(resource => vi.spyOn(resource, 'dispose'));
    scene.applyDisplayFlights([{ cargoIndices: [0], matrix: delta(40) }]);
    const center = new THREE.Vector3().setFromMatrixPosition(cargoMatrix(scene, 0));
    expect(mesh.boundingSphere!.containsPoint(center)).toBe(true); expect(mesh.boundingSphere!.radius).toBeCloseTo(radius);
    const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(mesh);
    expect(hits.length).toBeGreaterThan(0); expect(mesh.userData.batch.visibleIndices[hits[0].instanceId!]).toBe(0);
    expect(scene.visibleCargo).toBe(1); expect(scene.visibleLabelFaces).toBe(4);
    for (let index = 0; index < 20; index++) scene.applyDisplayFlights([{ cargoIndices: [0], matrix: delta(index) }]);
    expect(mesh.instanceMatrix).toBe(buffer); expect(mesh.instanceMatrix.array).toBe(array); expect(mesh.geometry).toBe(shape);
    scene.updateVisibility({ ...shown, labels: false, weight: true });
    scene.applyDisplayFlights([{ cargoIndices: [0], matrix: delta(2) }]);
    expect(scene.visibleCargo).toBe(0); expect(scene.visibleLabelFaces).toBe(0);
    scene.applyDisplayFlights([]); scene.dispose(); scene.dispose();
    sources.forEach(dispose => expect(dispose).not.toHaveBeenCalled());
    expect(scene.displayFlightActive).toBe(false); expect(scene.displayFlightCount).toBe(0);
  });
  it('reuses cached membership in flight frames without filtering cargo data or creating array iterators', () => {
    const plan = fixture(), originalZ = plan.placements[0].z;
    let heightReads = 0;
    Object.defineProperty(plan.placements[0], 'z', { configurable: true, get: () => { heightReads++; return originalZ; } });
    const { scene } = makeScene(plan), mesh = cargoMesh(scene, 0);
    const cached = mesh.userData.batch.visibleIndices;
    const cargoIndices = [0], transforms = [{ cargoIndices, matrix: delta(2) }];
    const noIterator = () => { throw new Error('flight frame allocated an iterator'); };
    Object.defineProperty(cargoIndices, Symbol.iterator, { value: noIterator });
    Object.defineProperty(transforms, Symbol.iterator, { value: noIterator });
    Object.defineProperty(cached, Symbol.iterator, { value: noIterator });
    heightReads = 0;
    for (let frame = 0; frame < 30; frame++) {
      transforms[0].matrix.copy(delta(frame / 10)); scene.applyDisplayFlights(transforms);
    }
    expect(heightReads).toBe(0); expect(mesh.userData.batch.visibleIndices).toBe(cached);
    expect(scene.visibleCargo).toBe(3); expect(scene.visibleLabelFaces).toBe(12);
    scene.updateVisibility({ ...shown, cut: 1 });
    expect(heightReads).toBeGreaterThan(0); expect(scene.visibleCargo).toBe(1); expect(scene.visibleLabelFaces).toBe(4);
    heightReads = 0; scene.applyDisplayFlights([]);
    expect(heightReads).toBe(0); expect(scene.visibleCargo).toBe(1); expect(mesh.userData.batch.visibleIndices).toBe(cached);
  });
});
