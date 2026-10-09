import * as THREE from 'three';
import { fittedRailX, railXSlope, vehicleLayout, type RailFit, type VehicleFootprint, type VehicleRigKind } from './threeVehicleLayout';
import type { VehicleModels } from './threeVehicleModels';

/** Copy complete rear-wheel/axle triangles only. Compact attributes too so unused
 * source vertices cannot expand the camera/ground bounds. Source stays cached. */
export function vehicleAxleGeometry(source: THREE.BufferGeometry) {
  const p = source.getAttribute('position'), idx = source.index;
  const vertices = new Map<number, number>(), indices: number[] = [];
  const count = idx?.count ?? p.count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(k => idx ? idx.getX(i + k) : i + k);
    if (!triangle.every(v => p.getX(v) > .02 && p.getX(v) < .72)) continue;
    for (const v of triangle) { if (!vertices.has(v)) vertices.set(v, vertices.size); indices.push(vertices.get(v)!); }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(source.attributes)) {
    const array = new Float32Array(vertices.size * a.itemSize);
    for (const [v, k] of vertices) for (let c = 0; c < a.itemSize; c++) array[k * a.itemSize + c] = a.getComponent(v, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, a.itemSize));
  }
  geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function fitVehicleRails(source: THREE.BufferGeometry, fit: RailFit, scale: number) {
  const geometry = source.clone(), position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    position.setXYZ(i, fittedRailX(x, fit, scale), position.getY(i) * scale, position.getZ(i) * scale);
    if (normal) { n.set(normal.getX(i) / railXSlope(x, fit, scale), normal.getY(i) / scale, normal.getZ(i) / scale).normalize(); normal.setXYZ(i, n.x, n.y, n.z); }
  }
  geometry.userData = { vehicleSceneOwned: true };
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
export function createVehicleResources(kind: VehicleRigKind, footprint: VehicleFootprint, models: VehicleModels) {
  const layout = vehicleLayout(kind, footprint), root = new THREE.Group(), owned: THREE.BufferGeometry[] = [];
  root.name = `Cosmetic vehicle: ${kind}`; root.userData = { kind: 'cosmetic-vehicle', physics: false };
  const dispose = () => { for (const geometry of owned.splice(0)) geometry.dispose(); root.clear(); };
  try {
    for (const placement of layout.placements) {
      const model = models[placement.key]; if (!model) throw new Error(`Vehicle asset is missing: ${placement.key}`);
      const group = new THREE.Group(); group.name = `Vehicle ${placement.key}`; group.position.fromArray(placement.position);
      group.userData = { key: placement.key, uniformScale: placement.scale, railFit: placement.rails };
      if (!placement.rails) group.scale.setScalar(placement.scale);
      for (const part of model.parts) {
        const axle = placement.axleOnly ? vehicleAxleGeometry(part.geometry) : null;
        const geometry = placement.rails ? fitVehicleRails(axle ?? part.geometry, placement.rails, placement.scale) : part.geometry;
        axle?.dispose();
        if (placement.rails) owned.push(geometry);
        const mesh = new THREE.Mesh(geometry, part.material); mesh.raycast = () => {}; group.add(mesh);
      }
      root.add(group);
    }
    return { root, groundY: layout.groundY, modelCount: layout.placements.length, dispose };
  } catch (error) { dispose(); throw error; }
}
