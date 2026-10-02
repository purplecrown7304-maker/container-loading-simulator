import * as THREE from 'three';
import { fittedRailX, railXSlope, vehicleLayout, type RailFit, type VehicleFootprint, type VehicleRigKind } from './threeVehicleLayout';
import type { VehicleModels } from './threeVehicleModels';

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
        const geometry = placement.rails ? fitVehicleRails(part.geometry, placement.rails, placement.scale) : part.geometry;
        if (placement.rails) owned.push(geometry);
        const mesh = new THREE.Mesh(geometry, part.material); mesh.raycast = () => {}; group.add(mesh);
      }
      root.add(group);
    }
    return { root, groundY: layout.groundY, modelCount: layout.placements.length, dispose };
  } catch (error) { dispose(); throw error; }
}
