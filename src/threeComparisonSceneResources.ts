import * as THREE from 'three';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import { createMeshyMaterial, meshyTint, type MeshyModel, type ModelKey } from './threeComparisonModels';
import { poseMatrix, sceneBoxMatrix, sceneCenter, UNITY_CARTON_SCALE, visibleCargoIndexes, type ThreeComparisonPlan } from './threeComparisonSceneState';

export type ComparisonModels = Partial<Record<ModelKey, MeshyModel>>;
type CargoBatch = { indices: number[]; meshes: THREE.InstancedMesh[]; visibleIndices: number[] };
type LabelBatch = { indices: number[]; mesh: THREE.InstancedMesh };
const noRaycast = () => {};

export function requiredComparisonModelKeys(plan: ThreeComparisonPlan): ModelKey[] {
  const keys = new Set<ModelKey>();
  if (plan.placements.length) keys.add('carton');
  if (!['platform', 'flat-rack', 'tank'].includes(plan.geometry)) keys.add('container-shell');
  if (plan.vehicle) keys.add('truck-cab');
  for (const support of plan.supports) keys.add(support.modelKey || 'wood-pallet');
  for (const aid of plan.decorations) if (aid.modelKey) keys.add(aid.modelKey as ModelKey);
  return [...keys];
}

function surfaceMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: meshyTint(color) } },
    vertexShader: `varying vec3 worldNormal;
      void main(){worldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform vec3 tint;varying vec3 worldNormal;
      void main(){float light=.62+.38*max(0.,dot(normalize(worldNormal),normalize(vec3(.4,1.,.6))));gl_FragColor=vec4(tint*light,1.);
      }`,
    toneMapped: false,
  });
}

/** Owns only per-scene material/primitive objects. Meshy geometry and textures are cache-owned. */
export function createComparisonSceneResources(plan: ThreeComparisonPlan, models: ComparisonModels, labelMaterials: Map<string, THREE.MeshBasicMaterial>) {
  for (const key of requiredComparisonModelKeys(plan)) if (!models[key]) throw new Error(`Required Meshy asset is missing: ${key}`);
  const root = new THREE.Group(); root.name = 'Three comparison · exact Unity scene';
  const equipment = new THREE.Group(), cargoRoot = new THREE.Group(), supportRoot = new THREE.Group(), decorRoot = new THREE.Group(), weightRoot = new THREE.Group(), cgRoot = new THREE.Group();
  equipment.name = 'Equipment'; cargoRoot.name = 'Cargo'; supportRoot.name = 'Supports'; decorRoot.name = 'Securing'; weightRoot.name = 'Weight cells'; cgRoot.name = 'Center of gravity';
  root.add(equipment, cargoRoot, supportRoot, decorRoot, weightRoot, cgRoot);
  const { length: l, width: w, height: h } = plan.container;
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), labelGeometry = new THREE.PlaneGeometry(1, 1), sphereGeometry = new THREE.SphereGeometry(.08, 20, 12);
  const ownedMaterials: THREE.Material[] = [], instanceMeshes: THREE.InstancedMesh[] = [];
  const mat = (color: THREE.ColorRepresentation) => { const material = surfaceMaterial(color); ownedMaterials.push(material); return material; };
  const cube = (name: string, position: number[], size: number[], material: THREE.Material, parent: THREE.Object3D, data?: Record<string, unknown>) => {
    const mesh = new THREE.Mesh(boxGeometry, material); mesh.name = name;
    mesh.position.fromArray(position); mesh.scale.fromArray(size); parent.add(mesh);
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
  const materials = new Map<string, THREE.ShaderMaterial[]>();
  const modelMaterials = (key: ModelKey, tint: THREE.Color, clipInterior?: THREE.Box3) => {
    const id = `${key}:${tint.getHexString()}:${Boolean(clipInterior)}`;
    let value = materials.get(id);
    const model = models[key];
    if (!model) throw new Error(`Required Meshy asset is missing: ${key}`);
    if (!value) {
      value = model.parts.map(part => createMeshyMaterial(part.texture, { tint, clipInterior }));
      ownedMaterials.push(...value); materials.set(id, value);
    }
    return { model, materials: value };
  };
  const addModel = (key: ModelKey, parent: THREE.Object3D, position: number[], size: number[], data?: Record<string, unknown>, clipInterior?: THREE.Box3) => {
    const group = new THREE.Group(); group.position.fromArray(position); group.scale.fromArray(size); parent.add(group);
    const model = modelMaterials(key, new THREE.Color(1, 1, 1), clipInterior);
    model.model.parts.forEach((part, index) => {
      const mesh = new THREE.Mesh(part.geometry, model.materials[index]); mesh.name = `Meshy ${key}`;
      if (data) mesh.userData = data; else mesh.raycast = noRaycast;
      group.add(mesh);
    });
    modelCount++;
    return group;
  };

  const floor = mat(new THREE.Color(.65, .73, .79)), frame = mat(new THREE.Color(.20, .37, .48)), wall = mat(new THREE.Color(.76, .83, .88)), grid = mat(new THREE.Color(.82, .87, .9));
  if (!['platform', 'flat-rack', 'tank'].includes(plan.geometry)) addModel('container-shell', equipment, [0, h / 2, 0], [l + .12, h + .12, w + .12], undefined, new THREE.Box3(new THREE.Vector3(-l / 2 - .03, -.005, -w / 2 - .03), new THREE.Vector3(l / 2 + .03, h + .005, w / 2 + .03)));
  cube('Floor', [0, -.055, 0], [l, .11, w], floor, equipment);
  edgeBox([0, h / 2, 0], [l + .04, h + .04, w + .04], frame, equipment, .035);
  if (plan.geometry !== 'platform') cube('Back wall', [-l / 2 - .045, h / 2, 0], [.05, h, w], wall, equipment);
  if (!['platform', 'flat-rack'].includes(plan.geometry)) {
    cube('Far wall', [0, h / 2, -w / 2 - .045], [l, h, .05], wall, equipment);
    for (let x = -l / 2; x < l / 2; x += .3) cube('Corrugation', [x, h / 2, -w / 2 - .016], [.035, h, .025], floor, equipment);
  }
  for (let x = -l / 2; x <= l / 2; x++) cube('Floor grid', [x, .002, 0], [.009, .004, w], grid, equipment);
  for (let z = -w / 2; z <= w / 2; z += .5) cube('Floor grid', [0, .002, z], [l, .004, .009], grid, equipment);
  cube('Door threshold', [l / 2, .025, 0], [.08, .05, w], mat(new THREE.Color(.13, .56, .76)), equipment);
  if (plan.vehicle) addModel('truck-cab', equipment, [-l / 2 - w * .64, h * .43, 0], [w * 1.15, h * 1.03, w]);

  const cargoMatrices = plan.placements.map(box => sceneBoxMatrix(box, plan.container, UNITY_CARTON_SCALE));
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
    labelBatches.push({ indices, mesh }); instanceMeshes.push(mesh); cargoRoot.add(mesh);
  }
  const labelLocalMatrices = [
    { p: [0, 0, .503], ry: 0 }, { p: [0, 0, -.503], ry: Math.PI },
    { p: [.503, 0, 0], ry: Math.PI / 2 }, { p: [-.503, 0, 0], ry: -Math.PI / 2 },
  ].map(face => new THREE.Matrix4().compose(new THREE.Vector3(...face.p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face.ry), new THREE.Vector3(.82, .62, 1)));
  const selection = new THREE.Group(); selection.name = 'Cargo selection'; selection.matrixAutoUpdate = false; cargoRoot.add(selection);
  edgeBox([0, 0, 0], [1, 1, 1], mat(new THREE.Color(1, .6, .04)), selection, .025);

  const supports = plan.supports.map((support, index) => {
    const unit = new THREE.Group(); unit.position.fromArray(sceneCenter(support, plan.container)); unit.name = `Support_${index}`; supportRoot.add(unit);
    addModel(support.modelKey || 'wood-pallet', unit, [0, 0, 0], [support.length, support.height, support.width], { kind: 'support', index });
    return unit;
  });
  for (const aid of plan.decorations) {
    const unit = new THREE.Group(); unit.position.fromArray(sceneCenter(aid, plan.container));
    const parent = supports[aid.supportIndex];
    if (parent) { unit.position.sub(parent.position); parent.add(unit); } else decorRoot.add(unit);
    const size = [aid.length, aid.height, aid.width];
    if (aid.wire) edgeBox([0, 0, 0], size, mat(aid.color), unit, .008);
    else if (aid.modelKey) addModel(aid.modelKey as ModelKey, unit, [0, 0, 0], size);
    else cube('Securing', [0, 0, 0], size, mat(aid.color), unit);
  }

  const maxLoad = Math.max(0, ...plan.cells.map(cell => cell.loadKg));
  plan.cells.forEach((cell, index) => {
    if (cell.loadKg <= 0 || maxLoad <= 0) return;
    const t = cell.loadKg / maxLoad, barHeight = Math.max(.035, t * h * .72);
    const blue = new THREE.Color(.14, .39, .92), green = new THREE.Color(.13, .77, .37), amber = new THREE.Color(.96, .62, .04), red = new THREE.Color(.94, .27, .27);
    const color = t < .34 ? blue.lerp(green, t / .34) : t < .67 ? green.lerp(amber, (t - .34) / .33) : amber.lerp(red, (t - .67) / .33);
    cube(`Cell_${index}`, [cell.x + cell.length / 2 - l / 2, .025 + barHeight / 2, cell.y + cell.width / 2 - w / 2], [cell.length * .88, barHeight, cell.width * .82], mat(color), weightRoot, { kind: 'cell', index });
  });
  const weightedBodies = [...plan.placements, ...plan.supports];
  const totalWeight = weightedBodies.reduce((sum, body) => sum + body.weightKg, 0);
  const hasCg = totalWeight > 0 && weightedBodies.every(body => Number.isFinite(body.weightKg) && body.weightKg >= 0)
    && Object.values(plan.centerOfGravity).every(Number.isFinite);
  let cgSphere: THREE.Mesh | undefined, cgStem: THREE.Mesh | undefined;
  if (hasCg) {
    // A cargo centroid is commonly inside a solid box. Render the annotation above
    // cargo so it remains visible without changing the actual models or materials.
    const purple = new THREE.MeshBasicMaterial({ color: '#7c3aed', depthTest: false, depthWrite: false, toneMapped: false });
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
  const scratch = new THREE.Matrix4();
  function updateVisibility(options: { cut: number; step: number; shell: boolean; labels: boolean; weight: boolean; showCg: boolean; selected: number | null }) {
    visibleIndices = visibleCargoIndexes(plan, options.cut, options.step, options.weight);
    const visible = new Set(visibleIndices);
    equipment.visible = options.shell; supportRoot.visible = decorRoot.visible = !options.weight;
    weightRoot.visible = options.weight; cgRoot.visible = hasCg && options.showCg;
    for (const batch of cargoBatches) {
      batch.visibleIndices = batch.indices.filter(index => visible.has(index));
      for (const mesh of batch.meshes) {
        mesh.count = batch.visibleIndices.length;
        batch.visibleIndices.forEach((index, slot) => mesh.setMatrixAt(slot, cargoMatrices[index]));
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      }
    }
    for (const batch of labelBatches) {
      let slot = 0;
      if (options.labels) for (const index of batch.indices) if (visible.has(index)) for (const local of labelLocalMatrices) batch.mesh.setMatrixAt(slot++, scratch.multiplyMatrices(cargoMatrices[index], local));
      batch.mesh.count = slot; batch.mesh.instanceMatrix.needsUpdate = true; batch.mesh.computeBoundingSphere();
    }
    selection.visible = options.selected !== null && visible.has(options.selected);
    if (options.selected !== null && cargoMatrices[options.selected]) { selection.matrix.copy(cargoMatrices[options.selected]); selection.matrixWorldNeedsUpdate = true; }
    root.updateMatrixWorld(true);
  }
  function applyFrame(frame?: InertiaAnimationFrame) {
    updateCenterOfGravity(frame);
    cargoMatrices.forEach((matrix, index) => {
      if (!frame) matrix.copy(initialCargo[index]);
      else { const box = plan.placements[index]; poseMatrix(frame.cargo, index, new THREE.Vector3(box.length * UNITY_CARTON_SCALE, box.height * UNITY_CARTON_SCALE, box.width * UNITY_CARTON_SCALE), matrix); }
    });
    supports.forEach((support, index) => {
      if (!frame) { support.position.fromArray(sceneCenter(plan.supports[index], plan.container)); support.quaternion.identity(); }
      else {
        const offset = index * 7, poses = frame.supports;
        support.position.set(poses[offset], poses[offset + 1], poses[offset + 2]);
        support.quaternion.set(poses[offset + 3], poses[offset + 4], poses[offset + 5], poses[offset + 6]).normalize();
      }
    });
  }
  return {
    root, modelCount, labelFaces: labelBatches.reduce((count, batch) => count + batch.indices.length * 4, 0), updateVisibility, applyFrame,
    get visibleCargo() { return visibleIndices.length; },
    get centerOfGravityVisible() { return cgRoot.visible && hasCg; },
    get centerOfGravityPosition(): [number, number, number] | null { return cgSphere ? cgSphere.position.toArray() : null; },
    get visibleLabelFaces() { return labelBatches.reduce((count, batch) => count + batch.mesh.count, 0); },
    dispose() {
      for (const material of ownedMaterials) material.dispose();
      for (const mesh of instanceMeshes) mesh.dispose();
      boxGeometry.dispose(); labelGeometry.dispose(); sphereGeometry.dispose(); root.clear();
    },
  };
}
