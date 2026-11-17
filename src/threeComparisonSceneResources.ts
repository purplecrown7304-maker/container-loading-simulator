import * as THREE from 'three';
import { selectedCargoClearance, type ClearanceSelection } from './cargoClearance';
import { buildWeightSurfaceGeometry } from './weightSurfaceGeometry';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import { acquireStudioCartonGeometry, createLitMeshyMaterial, createPalletFilmMaterial, createStudioCartonMaterial, meshyTint, type MeshyModel, type ModelKey } from './threeComparisonModels';
import { poseMatrix, sceneBoxMatrix, sceneCenter, visibleCargoIndexes, type ThreeComparisonPlan } from './threeComparisonSceneState';

import { createVehicleResources } from './threeVehicleResources';
import type { VehicleModels } from './threeVehicleModels';
import { flatRackParts } from './flatRackVisual';

export type ComparisonModels = Partial<Record<ModelKey, MeshyModel>>;
/** World-space final-to-current rigid transform; never an engine placement. */
export type DisplayFlightTransform = { cargoIndices: readonly number[]; supportIndex?: number | null; matrix: THREE.Matrix4 };
type VisibilityOptions = { cut: number; step: number; shell: boolean; labels: boolean; weight: boolean; showCg: boolean; selected: number | null; selectedSupport?: number | null };

const near = (value: number, expected = 0) => Math.abs(value - expected) <= 1e-5;
function isRigidDisplayMatrix(matrix: THREE.Matrix4) {
  if (!matrix || !Array.isArray(matrix.elements) || matrix.elements.length !== 16) return false;
  const e = matrix.elements;
  for (let index = 0; index < 16; index++) if (!Number.isFinite(e[index])) return false;
  return near(e[3]) && near(e[7]) && near(e[11]) && near(e[15], 1)
    && near(e[0] * e[0] + e[1] * e[1] + e[2] * e[2], 1)
    && near(e[4] * e[4] + e[5] * e[5] + e[6] * e[6], 1)
    && near(e[8] * e[8] + e[9] * e[9] + e[10] * e[10], 1)
    && near(e[0] * e[4] + e[1] * e[5] + e[2] * e[6])
    && near(e[0] * e[8] + e[1] * e[9] + e[2] * e[10])
    && near(e[4] * e[8] + e[5] * e[9] + e[6] * e[10])
    && near(matrix.determinant(), 1);
}
type CargoBatch = { indices: number[]; meshes: THREE.InstancedMesh[]; visibleIndices: number[] };
type LabelBatch = { indices: number[]; mesh: THREE.InstancedMesh; visibleIndices: number[] };
const noRaycast = () => {};
export function isRoadTruckBody(plan: ThreeComparisonPlan) {
  return (plan.vehicleRig !== undefined && !['none', 'articulated'].includes(plan.vehicleRig))
    || ['curtain', 'reefer-truck', 'isotherm-truck', 'mega-truck', 'jumbo-truck'].includes(plan.geometry);
}

export function requiredComparisonModelKeys(plan: ThreeComparisonPlan): ModelKey[] {
  const keys = new Set<ModelKey>();
  if (plan.placements.length) keys.add('carton');
  if (!isRoadTruckBody(plan) && !['platform', 'flat-rack', 'tank'].includes(plan.geometry)) keys.add('container-shell');
  if (plan.vehicle && !plan.vehicleRig) keys.add('truck-cab');
  for (const support of plan.supports) keys.add(support.modelKey || 'wood-pallet');
  for (const aid of plan.decorations) if (aid.modelKey) keys.add(aid.modelKey as ModelKey);
  return [...keys];
}

function surfaceMaterial(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({ color: meshyTint(color).convertSRGBToLinear(), roughness: .88, metalness: .02 });
}

/** Owns only per-scene material/primitive objects. Meshy geometry and textures are cache-owned. */
export function createComparisonSceneResources(plan: ThreeComparisonPlan, models: ComparisonModels, labelMaterials: Map<string, THREE.MeshBasicMaterial>, vehicleModels: VehicleModels = {}) {
  for (const key of requiredComparisonModelKeys(plan)) if (!models[key]) throw new Error(`Required Meshy asset is missing: ${key}`);
  const root = new THREE.Group(); root.name = 'Three comparison · exact Unity scene';
  const equipment = new THREE.Group(), cargoRoot = new THREE.Group(), supportRoot = new THREE.Group(), decorRoot = new THREE.Group(), weightRoot = new THREE.Group(), cgRoot = new THREE.Group();
  equipment.name = 'Equipment'; cargoRoot.name = 'Cargo'; supportRoot.name = 'Supports'; decorRoot.name = 'Securing'; weightRoot.name = 'Weight cells'; cgRoot.name = 'Center of gravity';
  root.add(equipment, cargoRoot, supportRoot, decorRoot, weightRoot, cgRoot);
  const { length: l, width: w, height: h } = plan.container;
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), labelGeometry = new THREE.PlaneGeometry(1, 1), sphereGeometry = new THREE.SphereGeometry(.08, 20, 12);
  const cartonGeometry = plan.placements.length ? acquireStudioCartonGeometry() : null;
  const ownedMaterials: THREE.Material[] = [], instanceMeshes: THREE.InstancedMesh[] = [];
  const mat = (color: THREE.ColorRepresentation) => { const material = surfaceMaterial(color); ownedMaterials.push(material); return material; };
  const cube = (name: string, position: number[], size: number[], material: THREE.Material, parent: THREE.Object3D, data?: Record<string, unknown>) => {
    const mesh = new THREE.Mesh(boxGeometry, material); mesh.name = name;
    mesh.position.fromArray(position); mesh.scale.fromArray(size); parent.add(mesh);
    mesh.receiveShadow = true;
    if (data) mesh.userData = data; else mesh.raycast = noRaycast;
    return mesh;
  };
  const edgeBox = (position: number[], size: number[], material: THREE.Material, parent: THREE.Object3D, thickness: number) => {
    for (let axis = 0; axis < 3; axis++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const p = [...position], dims = [thickness, thickness, thickness]; dims[axis] = size[axis] + thickness;
      p[(axis + 1) % 3] += a * size[(axis + 1) % 3] / 2; p[(axis + 2) % 3] += b * size[(axis + 2) % 3] / 2;
      cube('Edge', p, dims, material, parent);
    }
  };
  let modelCount = 0;
  const materials = new Map<string, THREE.MeshStandardMaterial[]>();
  const modelMaterials = (key: ModelKey, tint: THREE.Color, clipInterior?: THREE.Box3) => {
    const id = `${key}:${tint.getHexString()}:${Boolean(clipInterior)}`;
    let value = materials.get(id);
    const model = models[key];
    if (!model) throw new Error(`Required Meshy asset is missing: ${key}`);
    const parts = key === 'carton' && cartonGeometry ? [{ ...model.parts[0], geometry: cartonGeometry.geometry }] : model.parts;
    if (!value) {
      value = parts.map(part => key === 'carton' ? createStudioCartonMaterial({ tint, clipInterior }) : createLitMeshyMaterial(part.texture, { tint, clipInterior, roughness: key === 'plastic-pallet' ? .5 : .84 }));
      ownedMaterials.push(...value); materials.set(id, value);
    }
    return { model: { ...model, parts }, materials: value };
  };
  const addModel = (key: ModelKey, parent: THREE.Object3D, position: number[], size: number[], data?: Record<string, unknown>, clipInterior?: THREE.Box3) => {
    const group = new THREE.Group(); group.position.fromArray(position); group.scale.fromArray(size); parent.add(group);
    const model = modelMaterials(key, new THREE.Color(1, 1, 1), clipInterior);
    model.model.parts.forEach((part, index) => {
      const mesh = new THREE.Mesh(part.geometry, model.materials[index]); mesh.name = `Meshy ${key}`;
      mesh.castShadow = key !== 'container-shell'; mesh.receiveShadow = true;
      if (data) mesh.userData = data; else mesh.raycast = noRaycast;
      group.add(mesh);
    });
    modelCount++;
    return group;
  };

  const roadBody = isRoadTruckBody(plan);
  const floor = mat(new THREE.Color(.65, .73, .79)), frame = mat(roadBody ? '#8c9aa6' : new THREE.Color(.20, .37, .48)), wall = mat(roadBody ? '#f3f4f6' : new THREE.Color(.76, .83, .88)), grid = mat(new THREE.Color(.82, .87, .9));
  if (!roadBody && !['platform', 'flat-rack', 'tank'].includes(plan.geometry)) addModel('container-shell', equipment, [0, h / 2, 0], [l + .12, h + .12, w + .12], undefined, new THREE.Box3(new THREE.Vector3(-l / 2 - .03, -.005, -w / 2 - .03), new THREE.Vector3(l / 2 + .03, h + .005, w / 2 + .03)));
  if (plan.geometry === 'flat-rack') {
    const rackMaterials = new Map<string, THREE.Material>();
    for (const part of flatRackParts(l, w, h, plan.equipmentId?.endsWith('-collapsible'))) {
      let material = rackMaterials.get(part.color);
      if (!material) { material = mat(part.color); rackMaterials.set(part.color, material); }
      cube(part.name, part.position, part.size, material, equipment);
    }
  } else {
    cube('Floor', [0, -.055, 0], [l, .11, w], floor, equipment);
    if (plan.geometry !== 'platform') {
      edgeBox([0, h / 2, 0], [l + .04, h + .04, w + .04], frame, equipment, .035);
      cube('Back wall', [-l / 2 - .045, h / 2, 0], [.05, h, w], wall, equipment);
    }
  }
  if (!['platform', 'flat-rack'].includes(plan.geometry)) {
    cube('Far wall', [0, h / 2, -w / 2 - .045], [l, h, .05], wall, equipment);
    if (!roadBody) for (let x = -l / 2; x < l / 2; x += .3) cube('Corrugation', [x, h / 2, -w / 2 - .016], [.035, h, .025], floor, equipment);
    if (roadBody && plan.geometry === 'curtain') {
      cube('Wing body seam', [0, h * .43, -w / 2 - .016], [l, .018, .012], frame, equipment);
      for (let i = 1; i <= 4; i++) cube('Wing latch', [-l / 2 + l * i / 5, .16, -w / 2 - .012], [.05, .14, .02], frame, equipment);
    }
    if (roadBody && plan.geometry === 'reefer-truck') cube('Refrigeration unit', [-l / 2 - .18, h * .8, 0], [.28, h * .25, w * .65], wall, equipment);
  }
  for (let x = -l / 2; x <= l / 2; x++) cube('Floor grid', [x, .002, 0], [.009, .004, w], grid, equipment);
  for (let z = -w / 2; z <= w / 2; z += .5) cube('Floor grid', [0, .002, z], [l, .004, .009], grid, equipment);
  if (!['platform', 'flat-rack'].includes(plan.geometry)) cube('Door threshold', [l / 2, .025, 0], [.08, .05, w], mat(new THREE.Color(.13, .56, .76)), equipment);
  const vehicle = plan.vehicleRig ? createVehicleResources(plan.vehicleRig, plan.container, vehicleModels) : null;
  if (vehicle) { equipment.add(vehicle.root); modelCount += vehicle.modelCount; }
  if (plan.vehicle && !plan.vehicleRig) addModel('truck-cab', equipment, [-l / 2 - w * .64, h * .43, 0], [w * 1.15, h * 1.03, w]);

  const cargoMatrices = plan.placements.map(box => sceneBoxMatrix(box, plan.container));
  const initialCargo = cargoMatrices.map(matrix => matrix.clone());
  const cargoBatches: CargoBatch[] = [], labelBatches: LabelBatch[] = [];
  const byColor = new Map<string, number[]>();
  plan.placements.forEach((box, index) => {
    const key = box.invalid ? '#ff3d3d' : box.color || '#76b9de';
    const indices = byColor.get(key) ?? []; indices.push(index); byColor.set(key, indices);
  });
  for (const [color, indices] of byColor) {
    const tint = plan.placements[indices[0]].invalid ? new THREE.Color(1, .24, .24) : new THREE.Color(1, 1, 1).lerp(meshyTint(color), .30);
    const { model, materials: mapped } = modelMaterials('carton', tint);
    const batch: CargoBatch = { indices, meshes: [], visibleIndices: [] };
    model.parts.forEach((part, index) => {
      const mesh = new THREE.InstancedMesh(part.geometry, mapped[index], indices.length);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = `Cartons ${color}`; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData = { kind: 'cargo', batch };
      // Unity selects a physical box collider, not every Meshy triangle. Preserve
      // that behavior without rendering another primitive or doing O(triangles) hits.
      if (index === 0) {
        const proxy = new THREE.InstancedMesh(boxGeometry, mapped[index], indices.length);
        proxy.instanceMatrix = mesh.instanceMatrix;
        mesh.raycast = (raycaster, hits) => {
          proxy.count = mesh.count; proxy.matrixWorld.copy(mesh.matrixWorld); proxy.boundingSphere = mesh.boundingSphere;
          const proxyHits: THREE.Intersection[] = []; proxy.raycast(raycaster, proxyHits);
          for (const hit of proxyHits) hits.push({ ...hit, object: mesh });
        };
        instanceMeshes.push(proxy);
      } else mesh.raycast = noRaycast;
      batch.meshes.push(mesh); instanceMeshes.push(mesh); cargoRoot.add(mesh);
    });
    cargoBatches.push(batch); modelCount += indices.length;
  }
  const byLabel = new Map<string, number[]>();
  plan.placements.forEach((box, index) => { const indices = byLabel.get(box.cargoId) ?? []; indices.push(index); byLabel.set(box.cargoId, indices); });
  for (const [id, indices] of byLabel) {
    const material = labelMaterials.get(id);
    if (!material) continue;
    const mesh = new THREE.InstancedMesh(labelGeometry, material, indices.length * 4);
    mesh.name = `Printed carton labels ${id}`; mesh.raycast = noRaycast; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    labelBatches.push({ indices, mesh, visibleIndices: [] }); instanceMeshes.push(mesh); cargoRoot.add(mesh);
  }
  const labelLocalMatrices = [
    { p: [0, 0, .5005], ry: 0 }, { p: [0, 0, -.5005], ry: Math.PI },
    { p: [.5005, 0, 0], ry: Math.PI / 2 }, { p: [-.5005, 0, 0], ry: -Math.PI / 2 },
  ].map(face => new THREE.Matrix4().compose(new THREE.Vector3(...face.p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face.ry), new THREE.Vector3(.82, .62, 1)));
  const selection = new THREE.Group(); selection.name = 'Cargo selection'; selection.matrixAutoUpdate = false; cargoRoot.add(selection);
  edgeBox([0, 0, 0], [1, 1, 1], mat(new THREE.Color(1, .6, .04)), selection, .025);

  const supportSelection = new THREE.Group(); supportSelection.name = 'Support selection'; supportRoot.add(supportSelection);
  edgeBox([0, 0, 0], [1, 1, 1], mat(new THREE.Color(1, .6, .04)), supportSelection, .025);

  const supports = plan.supports.map((support, index) => {
    const unit = new THREE.Group(); unit.position.fromArray(sceneCenter(support, plan.container)); unit.name = `Support_${index}`; supportRoot.add(unit);
    addModel(support.modelKey || 'wood-pallet', unit, [0, 0, 0], [support.length, support.height, support.width], { kind: 'support', index });
    return unit;
  });
  const initialSupports = supports.map(support => {
    support.updateMatrix();
    return { matrix: support.matrix.clone(), position: support.position.clone(), quaternion: support.quaternion.clone(), scale: support.scale.clone() };
  });
  for (const aid of plan.decorations) {
    const unit = new THREE.Group(); unit.position.fromArray(sceneCenter(aid, plan.container));
    const parent = supports[aid.supportIndex];
    if (parent) { unit.position.sub(parent.position); parent.add(unit); } else decorRoot.add(unit);
    const size = [aid.length, aid.height, aid.width];
    if ('wrapping' in aid && aid.wrapping === true) {
      const film = createPalletFilmMaterial(); ownedMaterials.push(film);
      const mesh = cube('Pallet stretch film', [0, 0, 0], size, film, unit);
      mesh.renderOrder = 2; mesh.castShadow = false; mesh.userData.aoExclude = true;
    } else if (aid.wire) edgeBox([0, 0, 0], size, mat(aid.color), unit, .008);
    else if (aid.modelKey) addModel(aid.modelKey as ModelKey, unit, [0, 0, 0], size);
    else cube('Securing', [0, 0, 0], size, mat(aid.color), unit);
  }

  const surface = buildWeightSurfaceGeometry(plan.cells, 20, 8, plan.container, h * .72);
  const weightGeometry = new THREE.BufferGeometry();
  weightGeometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
  weightGeometry.setAttribute('color', new THREE.BufferAttribute(surface.colors, 3));
  weightGeometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  weightGeometry.computeVertexNormals();
  const weightMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide,
    transparent: true, opacity: .68, roughness: .42, metalness: .02, depthWrite: false,
    // Keep zero-load vertices exactly on the floor without coplanar flickering.
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  ownedMaterials.push(weightMaterial);
  const weightMesh = new THREE.Mesh(weightGeometry, weightMaterial);
  weightMesh.name = 'Weight surface'; weightMesh.userData = { kind: 'weightSurface' };
  weightMesh.renderOrder = 0; // Preserve the direct Three bars' default render order.
  weightRoot.add(weightMesh);
  const weightedBodies = [...plan.placements, ...plan.supports];
  const totalWeight = weightedBodies.reduce((sum, body) => sum + body.weightKg, 0);
  const hasCg = totalWeight > 0 && weightedBodies.every(body => Number.isFinite(body.weightKg) && body.weightKg >= 0)
    && Object.values(plan.centerOfGravity).every(Number.isFinite);
  let cgSphere: THREE.Mesh | undefined, cgStem: THREE.Mesh | undefined;
  if (hasCg) {
    // A cargo centroid is commonly inside a solid box. Render the annotation above
    // cargo so it remains visible without changing the actual models or materials.
    const purple = new THREE.MeshBasicMaterial({ color: '#7c3aed', depthTest: false, depthWrite: false });
    ownedMaterials.push(purple);
    cgStem = cube('CG stem', [0, 0, 0], [.025, .025, .025], purple, cgRoot); cgStem.renderOrder = 1000;
    cgSphere = new THREE.Mesh(sphereGeometry, purple); cgSphere.name = 'CG marker'; cgSphere.renderOrder = 1001; cgSphere.raycast = noRaycast; cgRoot.add(cgSphere);
    const center = mat(new THREE.Color(.06, .46, .43));
    cube('Container center X', [0, .025, 0], [.5, .04, .025], center, cgRoot); cube('Container center Z', [0, .025, 0], [.025, .04, .5], center, cgRoot);
  }

  function updateCenterOfGravity(frame?: InertiaAnimationFrame) {
    if (!cgSphere || !cgStem) return;
    const cg = plan.centerOfGravity;
    const position = new THREE.Vector3(cg.x - l / 2, cg.z, cg.y - w / 2);
    if (frame) {
      position.set(0, 0, 0);
      for (const [bodies, poses] of [[plan.placements, frame.cargo], [plan.supports, frame.supports]] as const) {
        bodies.forEach((body, index) => {
          const offset = index * 7, ratio = body.weightKg / totalWeight;
          position.x += poses[offset] * ratio; position.y += poses[offset + 1] * ratio; position.z += poses[offset + 2] * ratio;
        });
      }
    }
    cgSphere.position.copy(position);
    cgStem.position.set(position.x, position.y / 2, position.z); cgStem.scale.y = Math.max(.025, Math.abs(position.y));
  }
  updateCenterOfGravity();

  let visibleIndices: number[] = [];
  let acceptedFrame: InertiaAnimationFrame | undefined;
  let lastVisibility: VisibilityOptions | null = null;
  let displayFlightCount = 0, disposed = false;
  const scratch = new THREE.Matrix4(), flightScratch = new THREE.Matrix4();
  const assignedCargo = new Uint8Array(cargoMatrices.length), assignedSupports = new Uint8Array(supports.length);
  const visibleCargo = new Uint8Array(cargoMatrices.length);
  /** Flight frames only rewrite existing matrices/bounds; membership and label
   * filtering are cached by updateVisibility when display options change. */
  function refreshDisplayMatrices() {
    const options = lastVisibility;
    if (!options) return;
    equipment.visible = options.shell; supportRoot.visible = decorRoot.visible = !options.weight;
    weightRoot.visible = options.weight; cgRoot.visible = hasCg && options.showCg;
    for (let batchIndex = 0; batchIndex < cargoBatches.length; batchIndex++) {
      const batch = cargoBatches[batchIndex];
      for (let meshIndex = 0; meshIndex < batch.meshes.length; meshIndex++) {
        const mesh = batch.meshes[meshIndex];
        mesh.count = batch.visibleIndices.length;
        for (let slot = 0; slot < batch.visibleIndices.length; slot++) mesh.setMatrixAt(slot, cargoMatrices[batch.visibleIndices[slot]]);
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      }
    }
    for (let batchIndex = 0; batchIndex < labelBatches.length; batchIndex++) {
      const batch = labelBatches[batchIndex];
      let slot = 0;
      for (let index = 0; index < batch.visibleIndices.length; index++) {
        const cargoMatrix = cargoMatrices[batch.visibleIndices[index]];
        for (let face = 0; face < labelLocalMatrices.length; face++) batch.mesh.setMatrixAt(slot++, scratch.multiplyMatrices(cargoMatrix, labelLocalMatrices[face]));
      }
      batch.mesh.count = slot; batch.mesh.instanceMatrix.needsUpdate = true; batch.mesh.computeBoundingSphere();
    }
    selection.visible = options.selected !== null && visibleCargo[options.selected] === 1;
    if (options.selected !== null && cargoMatrices[options.selected]) { selection.matrix.copy(cargoMatrices[options.selected]); selection.matrixWorldNeedsUpdate = true; }
    const selectedSupport = options.selectedSupport == null ? undefined : supports[options.selectedSupport];
    supportSelection.visible = Boolean(selectedSupport) && !options.weight;
    if (selectedSupport && options.selectedSupport != null) {
      const body = plan.supports[options.selectedSupport];
      supportSelection.position.copy(selectedSupport.position); supportSelection.quaternion.copy(selectedSupport.quaternion);
      supportSelection.scale.set(body.length, body.height, body.width);
    }
    root.updateMatrixWorld(true);
  }
  function updateVisibility(options: VisibilityOptions) {
    if (disposed) return;
    lastVisibility = { ...options };
    visibleIndices = visibleCargoIndexes(plan, options.cut, options.step, options.weight);
    visibleCargo.fill(0);
    for (let index = 0; index < visibleIndices.length; index++) visibleCargo[visibleIndices[index]] = 1;
    for (let batchIndex = 0; batchIndex < cargoBatches.length; batchIndex++) {
      const batch = cargoBatches[batchIndex]; batch.visibleIndices.length = 0;
      for (let index = 0; index < batch.indices.length; index++) if (visibleCargo[batch.indices[index]]) batch.visibleIndices.push(batch.indices[index]);
    }
    for (let batchIndex = 0; batchIndex < labelBatches.length; batchIndex++) {
      const batch = labelBatches[batchIndex]; batch.visibleIndices.length = 0;
      if (options.labels) for (let index = 0; index < batch.indices.length; index++) if (visibleCargo[batch.indices[index]]) batch.visibleIndices.push(batch.indices[index]);
    }
    refreshDisplayMatrices();
  }
  function restoreDisplayBaseline() {
    for (let index = 0; index < cargoMatrices.length; index++) cargoMatrices[index].copy(initialCargo[index]);
    for (let index = 0; index < supports.length; index++) {
      const support = supports[index];
      const initial = initialSupports[index];
      support.position.copy(initial.position); support.quaternion.copy(initial.quaternion); support.scale.copy(initial.scale);
    }
  }
  function applyDisplayFlights(transforms: readonly DisplayFlightTransform[]) {
    if (disposed) return;
    displayFlightCount = 0;
    // An accepted Rapier pose is authoritative even if an old display consumer
    // tries to advance or clear a flight on the same demand frame.
    if (acceptedFrame) { refreshDisplayMatrices(); return; }
    restoreDisplayBaseline(); assignedCargo.fill(0); assignedSupports.fill(0);
    let valid = true;
    for (let transformIndex = 0; transformIndex < transforms.length; transformIndex++) {
      const transform = transforms[transformIndex];
      if (!transform || !Array.isArray(transform.cargoIndices) || !isRigidDisplayMatrix(transform.matrix)) { valid = false; break; }
      for (let cargoIndex = 0; cargoIndex < transform.cargoIndices.length; cargoIndex++) {
        const index = transform.cargoIndices[cargoIndex];
        if (!Number.isInteger(index) || index < 0 || index >= cargoMatrices.length || assignedCargo[index]) { valid = false; break; }
        assignedCargo[index] = 1;
      }
      if (!valid) break;
      const index = transform.supportIndex;
      if (index != null) {
        if (!Number.isInteger(index) || index < 0 || index >= supports.length || assignedSupports[index]) { valid = false; break; }
        assignedSupports[index] = 1;
      }
    }
    if (valid) for (let transformIndex = 0; transformIndex < transforms.length; transformIndex++) {
      const transform = transforms[transformIndex];
      if (!transform.cargoIndices.length && transform.supportIndex == null) continue;
      for (let index = 0; index < transform.cargoIndices.length; index++) cargoMatrices[transform.cargoIndices[index]].premultiply(transform.matrix);
      if (transform.supportIndex != null) {
        const support = supports[transform.supportIndex];
        flightScratch.multiplyMatrices(transform.matrix, initialSupports[transform.supportIndex].matrix)
          .decompose(support.position, support.quaternion, support.scale);
      }
      displayFlightCount++;
    }
    if (lastVisibility) refreshDisplayMatrices();
    else root.updateMatrixWorld(true);
  }
  function applyFrame(frame?: InertiaAnimationFrame) {
    if (disposed) return;
    displayFlightCount = 0;
    acceptedFrame = frame;
    updateCenterOfGravity(frame);
    cargoMatrices.forEach((matrix, index) => {
      if (!frame) matrix.copy(initialCargo[index]);
      else { const box = plan.placements[index]; poseMatrix(frame.cargo, index, new THREE.Vector3(box.length, box.height, box.width), matrix); }
    });
    supports.forEach((support, index) => {
      if (!frame) { const initial = initialSupports[index]; support.position.copy(initial.position); support.quaternion.copy(initial.quaternion); support.scale.copy(initial.scale); }
      else {
        const offset = index * 7, poses = frame.supports;
        support.scale.copy(initialSupports[index].scale);
        support.position.set(poses[offset], poses[offset + 1], poses[offset + 2]);
        support.quaternion.set(poses[offset + 3], poses[offset + 4], poses[offset + 5], poses[offset + 6]).normalize();
      }
    });
  }
  return {
    isCargoVisible: (index: number) => visibleCargo[index] === 1,
    clearanceForSelection: (selection: ClearanceSelection | null) => selectedCargoClearance(plan, selection, acceptedFrame),
    root, modelCount, labelFaces: labelBatches.reduce((count, batch) => count + batch.indices.length * 4, 0), updateVisibility, applyFrame, applyDisplayFlights,
    get displayFlightActive() { return displayFlightCount > 0; },
    get displayFlightCount() { return displayFlightCount; },
    get visibleCargo() { return visibleIndices.length; },
    get centerOfGravityVisible() { return cgRoot.visible && hasCg; },
    get centerOfGravityPosition(): [number, number, number] | null { return cgSphere ? cgSphere.position.toArray() : null; },
    get visibleLabelFaces() { let count = 0; for (let index = 0; index < labelBatches.length; index++) count += labelBatches[index].mesh.count; return count; },
    dispose() {
      if (disposed) return; disposed = true; displayFlightCount = 0;
      for (const material of ownedMaterials) material.dispose();
      for (const mesh of instanceMeshes) mesh.dispose();
      vehicle?.dispose();
      cartonGeometry?.release();
      weightGeometry.dispose(); boxGeometry.dispose(); labelGeometry.dispose(); sphereGeometry.dispose(); root.clear();
    },
  };
}
