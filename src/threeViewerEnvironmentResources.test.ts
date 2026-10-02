import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createViewerEnvironmentResources } from './threeViewerEnvironmentResources';
import type { EnvironmentId } from './viewerEnvironment';

const ids: EnvironmentId[] = ['forest', 'warehouse', 'beach', 'space'];
const footprint = { length: 12, width: 2.4, height: 2.7 };
afterEach(() => vi.restoreAllMocks());

function signature(root: THREE.Group) {
  return root.children.map(object => {
    const mesh = object as THREE.Mesh;
    return {
      name: mesh.name, part: mesh.userData.environmentPart, matrix: mesh.matrixWorld.toArray(),
      positions: mesh.geometry ? Array.from(mesh.geometry.getAttribute('position').array) : [],
      indices: mesh.geometry?.index ? Array.from(mesh.geometry.index.array) : [],
      instances: mesh instanceof THREE.InstancedMesh ? Array.from(mesh.instanceMatrix.array) : [],
      colors: mesh instanceof THREE.InstancedMesh && mesh.instanceColor ? Array.from(mesh.instanceColor.array) : [],
    };
  });
}

describe('presentation-only procedural environments', () => {
  it.each(ids)('%s is deterministic, bounded and never changes the supplied footprint', id => {
    const original = { ...footprint }, first = createViewerEnvironmentResources(id, footprint), second = createViewerEnvironmentResources(id, footprint);
    expect(footprint).toEqual(original);
    expect(signature(first.root)).toEqual(signature(second.root));
    expect(first.background.getHex()).toBe(second.background.getHex());
    let draws = 0, triangles = 0;
    first.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        draws++; const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
        triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * copies;
      } else if (object instanceof THREE.Points) draws++;
    });
    expect(draws).toBeLessThan(25); expect(triangles).toBeLessThan(12000);
    expect(first.root.getObjectByName('Gradient sky')).toBeDefined();
    first.dispose(); second.dispose();
  });

  it.each(ids)('%s keeps every scenery instance outside the cargo and original truck cab envelope', id => {
    for (const dimensions of [footprint, { length: 2.4, width: 1.8, height: 1.5 }, { length: 18, width: 3, height: 4 }]) {
      const environment = createViewerEnvironmentResources(id, dimensions), bounds = environment.root.userData.exclusion;
      const matrix = new THREE.Matrix4();
      environment.root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.computeBoundingBox();
        const boxes: THREE.Box3[] = [];
        if (object instanceof THREE.InstancedMesh) {
          for (let index = 0; index < object.count; index++) {
            object.getMatrixAt(index, matrix);
            boxes.push(object.geometry.boundingBox!.clone().applyMatrix4(matrix).applyMatrix4(object.matrixWorld));
          }
        } else boxes.push(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
        for (const box of boxes) {
          if (object.userData.environmentPart === 'scenery') {
            const outside = box.max.x <= bounds.minX || box.min.x >= bounds.maxX || box.max.z <= bounds.minZ || box.min.z >= bounds.maxZ;
            expect(outside, `${id} ${object.name}: ${JSON.stringify(box)}`).toBe(true);
          } else if (object.userData.environmentPart === 'ground') expect(box.max.y).toBeLessThan(-.11);
        }
      });
      environment.dispose();
    }
  });

  it.each(ids)('%s has no picking surface and releases each owned allocation exactly once', id => {
    const environment = createViewerEnvironmentResources(id, footprint);
    const geometryEvents = new Map<THREE.BufferGeometry, number>(), materialEvents = new Map<THREE.Material, number>();
    const instanceEvents = new Map<THREE.InstancedMesh, number>();
    environment.root.traverse(object => {
      const hits: THREE.Intersection[] = [];
      object.raycast(new THREE.Raycaster(), hits); expect(hits).toEqual([]);
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        if (!geometryEvents.has(object.geometry)) { geometryEvents.set(object.geometry, 0); object.geometry.addEventListener('dispose', () => geometryEvents.set(object.geometry, geometryEvents.get(object.geometry)! + 1)); }
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (materialEvents.has(material)) continue;
          materialEvents.set(material, 0); material.addEventListener('dispose', () => materialEvents.set(material, materialEvents.get(material)! + 1));
        }
      }
      if (object instanceof THREE.InstancedMesh) { instanceEvents.set(object, 0); object.addEventListener('dispose', () => instanceEvents.set(object, instanceEvents.get(object)! + 1)); }
    });
    environment.dispose(); environment.dispose();
    expect(environment.root.children).toHaveLength(0);
    for (const count of [...geometryEvents.values(), ...materialEvents.values(), ...instanceEvents.values()]) expect(count).toBe(1);
  });

  it.each(ids)('%s keeps visible scenery behind the whole cargo/cab from every orbit direction', id => {
    const environment = createViewerEnvironmentResources(id, footprint), bounds = environment.root.userData.exclusion;
    const matrix = new THREE.Matrix4();
    for (const position of [new THREE.Vector3(30, 18, 24), ...Array.from({ length: 8 }, (_, index) => new THREE.Vector3(Math.cos(index * Math.PI / 4) * 35, 12, Math.sin(index * Math.PI / 4) * 35))]) {
      environment.updateCamera(position);
      const d = Math.hypot(position.x, position.z), dx = position.x / d, dz = position.z / d;
      const rearLimit = Math.min(bounds.minX * dx, bounds.maxX * dx) + Math.min(bounds.minZ * dz, bounds.maxZ * dz) - .15;
      environment.root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.visible || object.userData.environmentPart !== 'scenery') return;
        const count = object instanceof THREE.InstancedMesh ? object.count : 1;
        for (let index = 0; index < count; index++) {
          if (object instanceof THREE.InstancedMesh) object.getMatrixAt(index, matrix); else matrix.identity();
          const box = object.geometry.boundingBox!.clone().applyMatrix4(matrix).applyMatrix4(object.matrixWorld);
          const maxProjection = Math.max(box.min.x * dx, box.max.x * dx) + Math.max(box.min.z * dz, box.max.z * dz);
          expect(maxProjection, `${id}: ${object.name}`).toBeLessThanOrEqual(rearLimit + 1e-5);
        }
      });
      expect(environment.root.getObjectByName('Ground below cargo')!.visible).toBe(true);
      expect(environment.root.getObjectByName('Gradient sky')!.visible).toBe(true);
    }
    environment.dispose();
  });

  it('does not rewrite instance buffers when the camera direction or visibility set is unchanged', () => {
    const environment = createViewerEnvironmentResources('warehouse', footprint);
    const update = vi.spyOn(THREE.InstancedMesh.prototype, 'setMatrixAt');
    environment.updateCamera(new THREE.Vector3(30, 10, 24));
    update.mockClear();
    environment.updateCamera(new THREE.Vector3(60, 20, 48));
    environment.updateCamera(new THREE.Vector3(60, 80, 48));
    expect(update).not.toHaveBeenCalled();
    environment.dispose();
    environment.updateCamera(new THREE.Vector3(-30, 10, -24));
    expect(update).not.toHaveBeenCalled();
  });

  it('cleans already allocated geometry, materials and instances after an interrupted construction', () => {
    const geometryDisposal = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDisposal = vi.spyOn(THREE.Material.prototype, 'dispose');
    const instanceDisposal = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    vi.spyOn(THREE.InstancedMesh.prototype, 'setColorAt').mockImplementationOnce(() => { throw new Error('test allocation failure'); });
    expect(() => createViewerEnvironmentResources('warehouse', footprint)).toThrow('test allocation failure');
    expect(geometryDisposal.mock.calls.length).toBeGreaterThan(0);
    expect(materialDisposal.mock.calls.length).toBeGreaterThan(0);
    expect(instanceDisposal).toHaveBeenCalledTimes(1);
    expect(new Set(geometryDisposal.mock.contexts).size).toBe(geometryDisposal.mock.calls.length);
    expect(new Set(materialDisposal.mock.contexts).size).toBe(materialDisposal.mock.calls.length);
  });

  it('rejects invalid dimensions before allocating scene resources', () => {
    for (const value of [0, -1, NaN, Infinity]) expect(() => createViewerEnvironmentResources('warehouse', { ...footprint, length: value })).toThrow('finite positive footprint');
  });
});
