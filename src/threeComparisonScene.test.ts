import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { unityPlan } from './unityProtocol';
import { acceptSceneFrame, poseMatrix, sceneBoxMatrix, sceneCameraPose, sceneCenter, visibleCargoIndexes } from './threeComparisonSceneState';
import { createComparisonSceneResources, requiredComparisonModelKeys, type ComparisonModels } from './threeComparisonSceneResources';
import { createMeshyMaterial, MESHY_MODEL_KEYS } from './threeComparisonModels';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';

function fixture(revision = 1) {
  const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
  const placements = [
    { cargoId: 'A', x: 1.1, y: .6, z: .15, length: .6, width: .4, height: .5, weightKg: 10 },
    { cargoId: 'A', x: 1.1, y: .6, z: .65, length: .6, width: .4, height: .5, weightKg: 10 },
    { cargoId: 'B', x: 2, y: .6, z: .15, length: .4, width: .6, height: .5, weightKg: 10 },
  ];
  return unityPlan(container, { placements, remaining: [], validationIssues: [], usedVolumeM3: .36, loadedWeightKg: 55 }, revision, [], {
    supports: [{ id: 'p', x: 1, y: .5, z: 0, length: 1.2, width: 1, height: .15, weightKg: 25 }], geometry: 'platform',
  });
}
function frameFor(plan: ReturnType<typeof fixture>, step = 2): InertiaAnimationFrame {
  return {
    cargo: new Float32Array(plan.placements.flatMap((box, index) => [...sceneCenter(box, plan.container).map(value => value + index * .1), 0, 0, Math.SQRT1_2, Math.SQRT1_2])),
    supports: new Float32Array([1, 2, 3, 0, Math.SQRT1_2, 0, Math.SQRT1_2]), phase: 'force', step,
  };
}
function resourcesFor(plan = fixture()) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), texture = new THREE.Texture(), material = createMeshyMaterial(texture);
  const models = Object.fromEntries(MESHY_MODEL_KEYS.map(key => [key, { key, parts: [{ geometry, texture, material }], bounds: new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5)), triangleCount: 12 }])) as ComparisonModels;
  const label = new THREE.MeshBasicMaterial();
  return { scene: createComparisonSceneResources(plan, models, new Map([['A', label], ['B', label]])), geometry, texture, material, label };
}
const shown = { cut: 100, step: 999, shell: true, labels: true, weight: false, showCg: true, selected: null };

 describe('Unity/Three visual protocol parity', () => {
  it('maps engine axes without changing dimensions or data, with Unity’s exact .99 inset', () => {
    const plan = fixture(), before = JSON.stringify(plan), box = plan.placements[0];
    const expected = [-1.6, .4, -.4];
    sceneCenter(box, plan.container).forEach((value, index) => expect(value).toBeCloseTo(expected[index]));
    const matrix = sceneBoxMatrix(box, plan.container, .99), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    scale.toArray().forEach((value, index) => expect(value).toBeCloseTo([.594, .495, .396][index]));
    expect(JSON.stringify(plan)).toBe(before);
  });

  it('rejects partial, non-finite, zero-quaternion, explicitly stale and reused stale frames atomically', () => {
    const plan = fixture(), valid = frameFor(plan), bindings = new WeakMap<InertiaAnimationFrame, number>();
    expect(acceptSceneFrame(plan, valid, bindings, 1)).toBe(true);
    expect(acceptSceneFrame(fixture(2), valid, bindings)).toBe(false);
    expect(acceptSceneFrame(plan, frameFor(plan), bindings, 0)).toBe(false);
    expect(acceptSceneFrame(plan, { ...valid, supports: new Float32Array() }, bindings)).toBe(false);
    const nonfinite = frameFor(plan); nonfinite.cargo[1] = NaN;
    expect(acceptSceneFrame(plan, nonfinite, bindings)).toBe(false);
    const zeroQ = frameFor(plan); zeroQ.supports.fill(0, 3);
    expect(acceptSceneFrame(plan, zeroQ, bindings)).toBe(false);
  });

  it('keeps Rapier positions and quaternion handedness unchanged, normalizing only magnitude', () => {
    const poses = new Float32Array([4, 5, 6, 0, Math.SQRT2, 0, Math.SQRT2]);
    const matrix = poseMatrix(poses, 0, new THREE.Vector3(2, 3, 4));
    const transformed = new THREE.Vector3(1, 0, 0).applyMatrix4(matrix);
    expect(transformed.x).toBeCloseTo(4); expect(transformed.y).toBeCloseTo(5); expect(transformed.z).toBeCloseTo(4);
    expect(Array.from(poses)).toEqual([4, 5, 6, 0, Math.fround(Math.SQRT2), 0, Math.fround(Math.SQRT2)]);
  });

  it('matches cut and order visibility and hides all cargo during weight view', () => {
    const plan = fixture();
    expect(visibleCargoIndexes(plan, 20, 3, false)).toEqual([0, 2]);
    expect(visibleCargoIndexes(plan, 100, 1, false)).toEqual([0]);
    expect(visibleCargoIndexes(plan, 100, 0, false)).toEqual([]);
    expect(visibleCargoIndexes(plan, 100, 3, true)).toEqual([]);
  });

  it('fits every equipment corner within both frustum axes in narrow and wide viewports', () => {
    const plan = fixture(); plan.vehicle = true;
    for (const view of ['free', 'top', 'door', 'side']) for (const aspect of [.5, 2.4]) {
      const pose = sceneCameraPose(plan, view, aspect), camera = new THREE.PerspectiveCamera(40, aspect, .02, 500);
      camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
      const { length, height, width } = plan.container;
      for (const x of [-length / 2 - width * 1.22, length / 2]) for (const y of [0, height]) for (const z of [-width / 2, width / 2]) {
        const screen = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(screen.x)).toBeLessThan(1); expect(Math.abs(screen.y)).toBeLessThan(1);
      }
    }
  });
});

describe('Three comparison scene resources', () => {
  it('requires the exact Unity model keys and throws rather than substitute a primitive', () => {
    const plan = fixture(); plan.vehicle = true; plan.geometry = 'closed'; plan.supports[0].modelKey = 'plastic-pallet';
    plan.decorations = [{ x: 0, y: 0, z: 0, length: .1, width: .1, height: 1, color: '#aaa', supportIndex: 0, modelKey: 'corner-guard' }];
    expect(requiredComparisonModelKeys(plan)).toEqual(['carton', 'container-shell', 'truck-cab', 'plastic-pallet', 'corner-guard']);
    expect(() => createComparisonSceneResources(plan, {}, new Map())).toThrow('Required Meshy asset is missing');
  });

  it('instances actual model parts, keeps 4 label faces inside the physical box and tracks visibility', () => {
    const plan = fixture(), before = JSON.stringify(plan), { scene } = resourcesFor(plan);
    scene.updateVisibility(shown);
    expect(scene.modelCount).toBe(4); expect(scene.labelFaces).toBe(12); expect(scene.visibleLabelFaces).toBe(12); expect(scene.visibleCargo).toBe(3);
    const label = scene.root.getObjectByName('Printed carton labels A') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); label.getMatrixAt(0, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.z).toBeCloseTo(-.4 + .4 * .99 * .503);
    expect(position.z).toBeLessThan(-.2);
    scene.updateVisibility({ ...shown, cut: 20 });
    expect(scene.visibleCargo).toBe(2); expect(scene.visibleLabelFaces).toBe(8);
    scene.updateVisibility({ ...shown, labels: false }); expect(scene.visibleLabelFaces).toBe(0);
    scene.updateVisibility({ ...shown, weight: true }); expect(scene.visibleCargo).toBe(0); expect(scene.root.getObjectByName('Supports')!.visible).toBe(false);
    expect(scene.root.getObjectByName('Weight cells')!.visible).toBe(true); expect(scene.root.getObjectByName('Center of gravity')!.visible).toBe(true);
    expect(JSON.stringify(plan)).toBe(before); scene.dispose();
  });

  it('moves labels, cargo selection and attached securing with the complete inertial pose', () => {
    const plan = fixture();
    plan.decorations = [{ x: 1, y: .5, z: .15, length: .035, width: .035, height: .9, color: '#aaa', supportIndex: 0, modelKey: 'corner-guard' }];
    const { scene } = resourcesFor(plan), frame = frameFor(plan);
    scene.applyFrame(frame); scene.updateVisibility({ ...shown, selected: 0 });
    const support = scene.root.getObjectByName('Support_0')!;
    expect(support.position.toArray()).toEqual([1, 2, 3]);
    expect(support.quaternion.y).toBeCloseTo(Math.SQRT1_2);
    expect(support.children).toHaveLength(2);
    expect(scene.root.getObjectByName('Cargo selection')!.matrix.elements[12]).toBeCloseTo(frame.cargo[0]);
    const label = scene.root.getObjectByName('Printed carton labels A') as THREE.InstancedMesh, labelMatrix = new THREE.Matrix4(); label.getMatrixAt(0, labelMatrix);
    const cargo = plan.placements[0], expectedCargo = poseMatrix(frame.cargo, 0, new THREE.Vector3(cargo.length * .99, cargo.height * .99, cargo.width * .99));
    const expected = new THREE.Vector3(0, 0, .503).applyMatrix4(expectedCargo), actual = new THREE.Vector3().setFromMatrixPosition(labelMatrix);
    expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
    scene.applyFrame(); scene.updateVisibility(shown);
    expect(support.position.y).toBeCloseTo(.075); expect(support.quaternion.w).toBe(1); scene.dispose();
  });

  it('maps compacted instance IDs back to original indices after slicing', () => {
    const { scene } = resourcesFor(); scene.updateVisibility({ ...shown, cut: 20 });
    const cargo: THREE.Object3D[] = []; scene.root.traverse(object => { if (object.userData.kind === 'cargo') cargo.push(object); });
    expect(cargo.flatMap(object => object.userData.batch.visibleIndices)).toEqual([0, 2]); scene.dispose();
  });

  it('does not dispose cache-owned geometry or texture on scene teardown', () => {
    const { scene, geometry, texture, material } = resourcesFor();
    let geometryDisposed = false, textureDisposed = false, materialDisposed = false;
    geometry.addEventListener('dispose', () => { geometryDisposed = true; }); texture.addEventListener('dispose', () => { textureDisposed = true; }); material.addEventListener('dispose', () => { materialDisposed = true; });
    scene.dispose(); expect(geometryDisposed).toBe(false); expect(textureDisposed).toBe(false); expect(materialDisposed).toBe(false);
  });
});
