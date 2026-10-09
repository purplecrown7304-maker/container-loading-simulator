import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { VehicleModelKey } from './threeVehicleLayout';

export const VEHICLE_MODEL_URLS: Record<VehicleModelKey, string> = {
  cab: `${import.meta.env.BASE_URL}models/vehicles/cargo-1ton-cab-v2-clean.glb`,
  'big-cab': `${import.meta.env.BASE_URL}models/vehicles/cargo-rigid-heavy-cab-v1.glb`,
  tractor: `${import.meta.env.BASE_URL}models/vehicles/cargo-container-tractor-v2-web.glb`,
  'truck-underbody': `${import.meta.env.BASE_URL}models/vehicles/cargo-truck-underbody-v2-web.glb`,
  'container-chassis': `${import.meta.env.BASE_URL}models/vehicles/cargo-container-chassis-v2-web.glb`,
};
export type VehicleModel = { key: VehicleModelKey; parts: { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }[]; bounds: THREE.Box3 };
export type VehicleModels = Partial<Record<VehicleModelKey, VehicleModel>>;

/** GLBs own their textures/materials; scene teardown never releases this cache. */
export function disposeVehicleSource(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
}
export function prepareVehicleModel(key: VehicleModelKey, gltf: Pick<GLTF, 'scene'>): VehicleModel {
  const parts: VehicleModel['parts'] = [], bounds = new THREE.Box3();
  try {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh) throw new Error('Vehicle must be static');
      const geometry = object.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      if (!positions?.count || !normals || !uv) throw new Error('Vehicle is missing position, normal or UV data');
      for (let i = 0; i < positions.count; i++) {
        if (![positions.getX(i), positions.getY(i), positions.getZ(i), uv.getX(i), uv.getY(i), normals.getX(i), normals.getY(i), normals.getZ(i)].every(Number.isFinite)) throw new Error('Vehicle contains non-finite geometry');
      }
      const count = geometry.index?.count ?? positions.count;
      if (count % 3) throw new Error('Vehicle has incomplete triangles');
      if (geometry.index) for (let i = 0; i < count; i++) if (geometry.index.getX(i) >= positions.count) throw new Error('Vehicle has invalid indices');
      geometry.applyMatrix4(object.matrixWorld); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); bounds.union(geometry.boundingBox!);
      geometry.userData.vehicleCacheOwned = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.userData.vehicleCacheOwned = true;
      parts.push({ geometry, material: object.material });
    });
    if (!parts.length || !bounds.getSize(new THREE.Vector3()).toArray().every(v => Number.isFinite(v) && v > 0)) throw new Error('Vehicle has empty or degenerate bounds');
    return { key, parts, bounds };
  } catch (error) { disposeVehicleSource(gltf.scene); throw error; }
}
const cache = new Map<VehicleModelKey, Promise<VehicleModel>>();
export function loadVehicleModel(key: VehicleModelKey): Promise<VehicleModel> {
  if (!Object.hasOwn(VEHICLE_MODEL_URLS, key)) return Promise.reject(new Error(`Unknown vehicle model: ${key}`));
  const cached = cache.get(key); if (cached) return cached;
  const pending = new GLTFLoader().loadAsync(VEHICLE_MODEL_URLS[key]).then(gltf => prepareVehicleModel(key, gltf)).catch((reason: unknown) => {
    cache.delete(key); throw reason;
  });
  cache.set(key, pending); return pending;
}
