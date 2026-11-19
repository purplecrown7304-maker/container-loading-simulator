import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { cargoColor } from './cargoColors';
import { palletBandingSegments } from './palletBanding';
import { sceneCenter } from './threeComparisonSceneState';
import { acquireStudioCartonGeometry, createLitMeshyMaterial, createPalletFilmMaterial, createStudioCartonMaterial, loadMeshyModel, meshyTint, type MeshyModel, type ModelKey } from './threeComparisonModels';
import type { StagingUnit } from './stagingInventory';
import type { StagingYardLayout, StagingYardSlot } from './stagingYardLayout';
import type { Placement } from './engine/types';
import { acquireComparisonLabels } from './threeComparisonLabels';
import { stagingCartonLabelPlan } from './stagingCartonLabels';
import { createStagingPointerInteraction, type StagingPointerCallbacks } from './stagingPointerInteraction';
import { createSceneRetirement } from './sceneRetirement';
import { nearestStagingHit, STAGING_HOVER_COLOR, stagingHitSource } from './stagingDragCues';

type YardModels = Partial<Record<ModelKey, MeshyModel>>;
export type StagingYardDrag = { unitId: string; point: [number, number, number]; cancelled?: boolean };
export type StagingYardLabels = { empty: string; aisle: string; doorClearance: string; boxes: string; pallets: string; unloaded: string; pending: string; checking: string; error: string };
const DEFAULT_LABELS: StagingYardLabels = { empty: '대기 화물 없음', aisle: '이동 통로', doorClearance: '출입문 여유 공간', boxes: '낱박스', pallets: '파렛트', unloaded: '미적재', pending: '계산 전', checking: '검토 중', error: '입력·포장 확인' };
export type ThreeStagingYardProps = {
  units: readonly StagingUnit[];
  layout: StagingYardLayout;
  selectedUnitId?: string | null;
  /** The unit under the pointer, outlined without a label. Display only. */
  hoveredUnitId?: string | null;
  /** The unit the pointer is over, or null once it is over none of this yard's units. */
  onHover?: (unitId: string | null) => void;
  /** Explicit zone paging; the owner retains all inventory and layout slots. */
  visibleZoneIds?: readonly string[];
  labels?: Partial<StagingYardLabels>;
  cartonLabelsEnabled?: boolean;
  onSelect?: (unitId: string) => void;
  onInspect?: (unitId: string) => void;
  canDrag?: boolean;
  onDragStart?: (drag: StagingYardDrag) => void;
  onDragMove?: (drag: StagingYardDrag) => void;
  onDragEnd?: (drag: StagingYardDrag) => void;
  onDraggingChange?: (dragging: boolean) => void;
  /** Current vehicle cargo floor in the existing renderer coordinates. */
  dragPlaneY?: number;
  onError?: (message: string) => void;
};
type Part = { unitId: string; cargoId?: string; key?: ModelKey; color: string; position: [number, number, number]; size: [number, number, number]; rotationY: number; transparent?: boolean };
const noRaycast = () => {};
const tuple = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

export function requiredStagingModelKeys(units: readonly StagingUnit[]): ModelKey[] {
  const keys = new Set<ModelKey>();
  for (const unit of units) {
    if (unit.kind === 'box' || unit.localPlacements?.length) keys.add('carton');
    if (unit.kind === 'pallet') {
      keys.add(unit.palletSpec?.material === 'plastic' ? 'plastic-pallet' : 'wood-pallet');
      if (unit.packaging?.cornerGuards ?? unit.pallet?.cornerGuardsUsed) keys.add('corner-guard');
    }
  }
  return [...keys];
}

/** Exact source carton placements and actual packaging flags; no packing or
 * material-weight calculation occurs in this display adapter. */
export function stagingUnitParts(unit: StagingUnit, slot: StagingYardSlot): Part[] {
  const result: Part[] = [];
  const rotate = new THREE.Matrix4().makeRotationY(slot.rotationY);
  const origin = new THREE.Vector3(...slot.center);
  const add = (key: ModelKey | undefined, position: [number, number, number], size: [number, number, number], color: string, transparent = false, rotationY = 0, cargoId?: string) => {
    const point = new THREE.Vector3(...position).applyMatrix4(rotate).add(origin);
    result.push({ unitId: unit.id, cargoId, key, color, position: tuple(point), size, rotationY: slot.rotationY + rotationY, transparent });
  };
  const color = cargoColor(unit.cargoId ?? unit.cargoIds[0] ?? unit.id, unit.displayColor);
  if (unit.kind === 'box') {
    add('carton', [0, unit.height / 2, 0], [unit.length, unit.height, unit.width], color, false, 0, unit.cargoId ?? unit.cargoIds[0] ?? unit.id);
    return result;
  }
  if (!unit.pallet || !unit.localPlacements) throw new Error(`Missing prepared pallet contents: ${unit.id}`);
  const deckHeight = unit.pallet.height;
  add(unit.palletSpec?.material === 'plastic' ? 'plastic-pallet' : 'wood-pallet', [0, deckHeight / 2, 0], [unit.length, deckHeight, unit.width], '#ffffff');
  const colors = new Map(unit.contents?.map(item => [item.cargoId, item.displayColor]));
  for (const box of unit.localPlacements) add('carton', sceneCenter(box, unit), [box.length, box.height, box.width], cargoColor(box.cargoId, colors.get(box.cargoId) ?? (unit.cargoIds.length === 1 ? unit.displayColor : undefined)), false, 0, box.cargoId);
  const top = unit.localPlacements.reduce((max, box) => Math.max(max, box.z + box.height), deckHeight);
  const loadHeight = top - deckHeight;
  if (loadHeight <= 0) return result;
  if (unit.packaging?.wrapping ?? unit.pallet.wrappingUsed) add(undefined, [0, deckHeight + loadHeight / 2, 0], [unit.length + .024, loadHeight, unit.width + .024], '#bcdce5', true);
  if (unit.packaging?.cornerGuards ?? unit.pallet.cornerGuardsUsed) {
    for (const [x, z, rotation] of [[-1, -1, 0], [-1, 1, Math.PI / 2], [1, 1, Math.PI], [1, -1, Math.PI * 1.5]]) {
      add('corner-guard', [x * (unit.length / 2 - .0175), deckHeight + loadHeight / 2, z * (unit.width / 2 - .0175)], [.035, loadHeight, .035], '#ffffff', false, rotation);
    }
  }
  const straps = unit.packaging?.bandingStraps ?? 0;
  for (const band of palletBandingSegments({ x: 0, y: 0, z: deckHeight, length: unit.length, width: unit.width, height: loadHeight }, straps)) {
    add(undefined, sceneCenter(band, unit), [band.length, band.height, band.width], '#27313b');
  }
  return result;
}

function labelTexture(text: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(248,250,252,.94)'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c4cbd2'; context.lineWidth = 3; context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.fillStyle = '#334155'; context.font = '500 40px Pretendard, sans-serif'; context.textBaseline = 'middle'; context.textAlign = 'center';
  context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 36);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

/** Owns the ground, per-yard materials, instance buffers and label textures.
 * Original Meshy geometry/textures remain cache-owned, like the vehicle viewer. */
export function createStagingYardResources(units: readonly StagingUnit[], layout: StagingYardLayout, models: YardModels, options: { visibleZoneIds?: readonly string[]; labels?: Partial<StagingYardLabels>; labelsEnabled?: boolean; cartonLabelMaterials?: Map<string, THREE.MeshBasicMaterial> } = {}) {
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const visibleZones = options.visibleZoneIds ? new Set(options.visibleZoneIds) : null;
  const visibleSlots = layout.slots.filter(slot => !visibleZones || visibleZones.has(slot.zoneId));
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const renderedUnits = visibleSlots.flatMap(slot => byId.has(slot.unitId) ? [byId.get(slot.unitId)!] : []);
  for (const key of requiredStagingModelKeys(renderedUnits)) if (!models[key]) throw new Error(`Required staging model is missing: ${key}`);
  // Check source contents before allocating scene-owned resources.
  const preparedParts = visibleSlots.flatMap(slot => { const unit = byId.get(slot.unitId); return unit ? stagingUnitParts(unit, slot) : []; });
  const cartonGeometry = preparedParts.some(part => part.key === 'carton') ? acquireStudioCartonGeometry() : null;
  const root = new THREE.Group(); root.name = 'Staging yard · display inventory only';
  root.userData = { stagingUnits: units.length, displayedUnits: renderedUnits.length, kind: 'stagingCargo', unitIds: visibleSlots.map(slot => slot.unitId) };
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), edgeGeometry = new THREE.EdgesGeometry(boxGeometry);
  const ownedGeometries: THREE.BufferGeometry[] = [boxGeometry, edgeGeometry], materials: THREE.Material[] = [], textures: THREE.Texture[] = [], instances: THREE.InstancedMesh[] = [];
  const material = (color: string, transparent = false) => {
    const value = transparent ? createPalletFilmMaterial() : new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: 0 });
    materials.push(value); return value;
  };
  const plane = (name: string, u: number, v: number, length: number, width: number, color: string, elevation: number, height = .012) => {
    const mesh = new THREE.Mesh(boxGeometry, material(color)); mesh.name = name;
    const [dx, dz] = layout.frame.outward;
    mesh.position.set(layout.frame.rearCenter[0] + u * dx - v * dz, layout.frame.groundY + elevation, layout.frame.rearCenter[2] + u * dz + v * dx);
    mesh.rotation.y = -Math.atan2(dz, dx); mesh.scale.set(length, height, width); mesh.raycast = noRaycast; root.add(mesh);
    mesh.receiveShadow = true;
    return mesh;
  };
  const { ground, settings } = layout;
  const floor = plane('Yard ground', (ground.start + ground.end) / 2, 0, ground.end - ground.start, ground.maxLateral - ground.minLateral, '#d5d9dc', -.015, .03);
  // Top surface is the measured outside ground, not the vehicle cargo deck.
  // Bias only the raster depth so the existing environment floor cannot hide it.
  const floorMaterial = floor.material as THREE.MeshStandardMaterial;
  floorMaterial.polygonOffset = true; floorMaterial.polygonOffsetFactor = -1; floorMaterial.polygonOffsetUnits = -1;
  plane('Rear door work clearance', settings.doorClearance / 2, 0, settings.doorClearance, ground.maxLateral - ground.minLateral - .04, '#e2e5e7', .002);
  // One shared line buffer rather than a mesh per dashed aisle marking.
  const linePositions: number[] = [];
  const addLine = (u1: number, v1: number, u2: number, v2: number, elevation = .013) => {
    const [dx, dz] = layout.frame.outward;
    for (const [u, v] of [[u1, v1], [u2, v2]]) linePositions.push(layout.frame.rearCenter[0] + u * dx - v * dz, layout.frame.groundY + elevation, layout.frame.rearCenter[2] + u * dz + v * dx);
  };
  for (const side of [-1, 1]) addLine(settings.doorClearance, side * settings.aisleWidth / 2, ground.end, side * settings.aisleWidth / 2);
  addLine(settings.doorClearance, ground.minLateral, settings.doorClearance, ground.maxLateral);
  for (const slot of visibleSlots) {
    if (slot.center[1] > layout.frame.groundY + 1e-6) continue;
    const [u, v] = slot.localCenter, l = slot.length / 2 + .06, w = slot.width / 2 + .06;
    addLine(u - l, v - w, u + l, v - w); addLine(u + l, v - w, u + l, v + w);
    addLine(u + l, v + w, u - l, v + w); addLine(u - l, v + w, u - l, v - w);
  }
  const linesGeometry = new THREE.BufferGeometry(); linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3)); ownedGeometries.push(linesGeometry);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#9ba4ad' }); materials.push(lineMaterial);
  const lines = new THREE.LineSegments(linesGeometry, lineMaterial); lines.name = 'Aisle and slot boundaries'; lines.raycast = noRaycast; root.add(lines);
  const addLabel = (text: string, position: [number, number, number], width: number) => {
    if (options.labelsEnabled === false) return null;
    const texture = labelTexture(text); if (!texture) return null;
    textures.push(texture);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthWrite: false }); materials.push(spriteMaterial);
    const sprite = new THREE.Sprite(spriteMaterial); sprite.position.fromArray(position); sprite.scale.set(width, width / 6, 1); sprite.raycast = noRaycast; root.add(sprite); return sprite;
  };
  const worldPoint = (u: number, v: number, h: number): [number, number, number] => {
    const [dx, dz] = layout.frame.outward; return [layout.frame.rearCenter[0] + u * dx - v * dz, layout.frame.groundY + h, layout.frame.rearCenter[2] + u * dz + v * dx];
  };
  addLabel(labels.doorClearance, worldPoint(settings.doorClearance / 2, 0, .1), Math.min(2.4, ground.maxLateral));
  for (const zone of layout.zones) if (!visibleZones || visibleZones.has(zone.id)) {
    addLabel(`${zone.id} · ${zone.kind === 'pallet' ? labels.pallets : labels.boxes}`, worldPoint(zone.start + .12, 0, .12), 1.7);
  }
  if (!units.length) addLabel(labels.empty, worldPoint(Math.max(settings.doorClearance + 1, ground.end / 2), 0, .22), 2.5);
  const batches = new Map<string, Part[]>();
  for (const part of preparedParts) {
    const key = `${part.key ?? 'primitive'}:${part.color}:${Boolean(part.transparent)}`;
    const parts = batches.get(key) ?? []; parts.push(part); batches.set(key, parts);
  }
  const quaternion = new THREE.Quaternion(), matrix = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  for (const parts of batches.values()) {
    const first = parts[0], source = first.key ? models[first.key]! : null;
    const sourceParts = first.key === 'carton' && source && cartonGeometry ? [{ ...source.parts[0], geometry: cartonGeometry.geometry }] : source?.parts ?? [{ geometry: boxGeometry, texture: null }];
    for (const part of sourceParts) {
      const tint = meshyTint(first.color);
      const mat = first.key === 'carton' ? createStudioCartonMaterial({ tint }) : part.texture ? createLitMeshyMaterial(part.texture, { tint, roughness: first.key === 'plastic-pallet' ? .5 : .84 }) : material(first.color, first.transparent);
      if (part.texture) materials.push(mat);
      const mesh = new THREE.InstancedMesh(part.geometry, mat, parts.length); mesh.name = `Yard ${first.key ?? (first.transparent ? 'wrapping' : 'banding')}`;
      mesh.userData = { kind: 'stagingCargo', unitIds: parts.map(p => p.unitId) };
      mesh.raycast = noRaycast;
      mesh.castShadow = !first.transparent; mesh.receiveShadow = true;
      if (first.transparent) { mesh.renderOrder = 2; mesh.userData.aoExclude = true; }
      parts.forEach((piece, index) => {
        quaternion.setFromAxisAngle(up, piece.rotationY);
        matrix.compose(new THREE.Vector3(...piece.position), quaternion, new THREE.Vector3(...piece.size)); mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); root.add(mesh); instances.push(mesh);
    }
  }
  const cartonLabelGeometry = new THREE.PlaneGeometry(1, 1); ownedGeometries.push(cartonLabelGeometry);
  const labelFaces = [
    { position: [0, 0, .5005], rotation: 0 }, { position: [0, 0, -.5005], rotation: Math.PI },
    { position: [.5005, 0, 0], rotation: Math.PI / 2 }, { position: [-.5005, 0, 0], rotation: -Math.PI / 2 },
  ].map(face => new THREE.Matrix4().compose(new THREE.Vector3(...face.position), new THREE.Quaternion().setFromAxisAngle(up, face.rotation), new THREE.Vector3(.82, .62, 1)));
  let cartonLabelFaces = 0;
  for (const [cargoId, labelMaterial] of options.cartonLabelMaterials ?? []) {
    const parts = preparedParts.filter(part => part.key === 'carton' && part.cargoId === cargoId);
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(cartonLabelGeometry, labelMaterial, parts.length * 4);
    mesh.name = `Yard printed carton labels ${cargoId}`; mesh.raycast = noRaycast;
    const local = new THREE.Matrix4();
    parts.forEach((part, index) => {
      matrix.compose(new THREE.Vector3(...part.position), new THREE.Quaternion().setFromAxisAngle(up, part.rotationY), new THREE.Vector3(...part.size));
      labelFaces.forEach((face, faceIndex) => mesh.setMatrixAt(index * 4 + faceIndex, local.multiplyMatrices(matrix, face)));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); root.add(mesh); instances.push(mesh); cartonLabelFaces += mesh.count;
  }
  // Pick one rigid physical root per unit, as the existing viewer does for
  // cartons. Never raycast every original-model triangle or inner pallet box.
  const proxy = new THREE.InstancedMesh(boxGeometry, floorMaterial, visibleSlots.length);
  visibleSlots.forEach((slot, index) => {
    matrix.compose(new THREE.Vector3(slot.center[0], slot.center[1] + slot.height / 2, slot.center[2]), new THREE.Quaternion().setFromAxisAngle(up, slot.rotationY), new THREE.Vector3(slot.length, slot.height, slot.width)); proxy.setMatrixAt(index, matrix);
  });
  proxy.computeBoundingSphere(); instances.push(proxy);
  root.raycast = (raycaster, hits) => {
    proxy.matrixWorld.copy(root.matrixWorld);
    const result: THREE.Intersection[] = []; proxy.raycast(raycaster, result);
    for (const hit of result) hits.push({ ...hit, object: root });
  };
  // Unloaded/error units get a cross as well as a colored outline. Long status
  // text is reserved for the selected root unit and the owner's inventory list.
  for (const verdict of ['unloaded', 'error'] as const) {
    const positions: number[] = [];
    for (const slot of visibleSlots) if (byId.get(slot.unitId)?.verdict === verdict) {
      const [u, v] = slot.localCenter, l = slot.length / 2 + .075, w = slot.width / 2 + .075;
      for (const [a, b, c, d] of [[-l, -w, l, -w], [l, -w, l, w], [l, w, -l, w], [-l, w, -l, -w]]) positions.push(...worldPoint(u + a, v + b, .019), ...worldPoint(u + c, v + d, .019));
      const marker = Math.min(.16, slot.length / 4, slot.width / 4);
      const top = slot.center[1] - layout.frame.groundY + slot.height + .025;
      for (const sign of [-1, 1]) positions.push(...worldPoint(u - marker, v - sign * marker, top), ...worldPoint(u + marker, v + sign * marker, top));
    }
    if (!positions.length) continue;
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); ownedGeometries.push(geometry);
    const mat = new THREE.LineBasicMaterial({ color: verdict === 'unloaded' ? '#b45309' : '#b91c1c' }); materials.push(mat);
    const marker = new THREE.LineSegments(geometry, mat); marker.name = `Yard ${verdict} cross`; marker.raycast = noRaycast; root.add(marker);
  }
  const selectedMaterial = new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: false }); materials.push(selectedMaterial);
  const selection = new THREE.LineSegments(edgeGeometry, selectedMaterial); selection.name = 'Selected staging root unit'; selection.visible = false; selection.renderOrder = 5; selection.raycast = noRaycast; root.add(selection);
  const hoverMaterial = new THREE.LineBasicMaterial({ color: STAGING_HOVER_COLOR, depthTest: false }); materials.push(hoverMaterial);
  const hover = new THREE.LineSegments(edgeGeometry, hoverMaterial); hover.name = 'Pointer-over staging root unit'; hover.visible = false; hover.renderOrder = 4; hover.raycast = noRaycast; root.add(hover);
  let selectedLabel: THREE.Sprite | null = null;
  let selectedTexture: THREE.Texture | null = null;
  let selectedLabelMaterial: THREE.SpriteMaterial | null = null;
  const clearSelectedLabel = () => { if (selectedLabel) root.remove(selectedLabel); selectedTexture?.dispose(); selectedLabelMaterial?.dispose(); selectedLabel = null; selectedTexture = null; selectedLabelMaterial = null; };
  let disposed = false;
  return {
    root, renderedUnitIds: renderedUnits.map(unit => unit.id), cartonLabelFaces, instanceCount: [...batches.values()].reduce((sum, parts) => sum + parts.length, 0),
    setSelected(id: string | null) {
      clearSelectedLabel(); const slot = visibleSlots.find(item => item.unitId === id), unit = id ? byId.get(id) : null;
      selection.visible = Boolean(slot && unit);
      if (!slot || !unit) return;
      selection.position.set(slot.center[0], slot.center[1] + slot.height / 2, slot.center[2]); selection.rotation.y = slot.rotationY;
      selection.scale.set(slot.length + .05, slot.height + .05, slot.width + .05);
      if (options.labelsEnabled === false) return;
      const state = unit.verdict === 'unloaded' ? labels.unloaded : unit.verdict === 'error' ? labels.error : unit.verdict === 'checking' ? labels.checking : labels.pending;
      selectedTexture = labelTexture(`${slot.label} · ${unit.name} · ${state}`); if (!selectedTexture) return;
      selectedLabelMaterial = new THREE.SpriteMaterial({ map: selectedTexture, depthWrite: false, depthTest: false });
      selectedLabel = new THREE.Sprite(selectedLabelMaterial); selectedLabel.position.set(slot.center[0], slot.center[1] + slot.height + .3, slot.center[2]); selectedLabel.scale.set(3.5, 3.5 / 6, 1); selectedLabel.renderOrder = 6; selectedLabel.raycast = noRaycast; root.add(selectedLabel);
    },
    /** Outline only: the label and status text belong to the selected unit. */
    setHovered(id: string | null) {
      const slot = id && byId.has(id) ? visibleSlots.find(item => item.unitId === id) : undefined;
      hover.visible = Boolean(slot);
      if (!slot) return;
      hover.position.set(slot.center[0], slot.center[1] + slot.height / 2, slot.center[2]); hover.rotation.y = slot.rotationY;
      hover.scale.set(slot.length + .05, slot.height + .05, slot.width + .05);
    },
    dispose() {
      if (disposed) return; disposed = true; clearSelectedLabel(); instances.forEach(mesh => mesh.dispose());
      ownedGeometries.forEach(geometry => geometry.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); root.raycast = noRaycast; root.clear();
      cartonGeometry?.release();
    },
  };
}

/** Separate R3F group: never inserted into vehicle placements, weight, Rapier or
 * securing inputs. Resource/model changes invalidate demand rendering once. */
export default function ThreeStagingYard(props: ThreeStagingYardProps) {
  const { invalidate } = useThree();
  const callbacks = useRef(props); callbacks.current = props;
  const [loaded, setLoaded] = useState<{ units: readonly StagingUnit[]; layout: StagingYardLayout; options: unknown; resources: ReturnType<typeof createStagingYardResources> } | null>(null);
  const optionsKey = JSON.stringify([props.visibleZoneIds, props.labels, props.cartonLabelsEnabled]);
  const pointerCallbacks = useRef<StagingPointerCallbacks>(null!);
  pointerCallbacks.current = {
    resolve: event => {
      const data = event.object.userData;
      const id = data.kind === 'stagingCargo' ? data.unitIds[event.instanceId ?? -1] as string | undefined : undefined;
      const slot = id ? props.layout.slots.find(value => value.unitId === id) : null;
      return id && slot ? { id, center: slot.center, planeY: props.dragPlaneY ?? 0 } : null;
    },
    canDrag: () => callbacks.current.canDrag !== false,
    onSelect: props.onSelect, onInspect: unit => callbacks.current.onInspect?.(unit.id),
    onDragStart: props.onDragStart, onDragMove: props.onDragMove, onDragEnd: props.onDragEnd,
    onDraggingChange: props.onDraggingChange,
  };
  const pointer = useMemo(() => createStagingPointerInteraction(() => pointerCallbacks.current), []);
  useLayoutEffect(() => { pointer.activate(); return () => pointer.dispose(); }, [pointer]);
  useLayoutEffect(() => { if (props.canDrag === false) pointer.cancel(); }, [props.canDrag, pointer]);
  // The yard is rebuilt for every inventory, zone or label change. Keep the replaced
  // yard until the new one has drawn so its shaders and label textures are reused.
  const live = useRef<{ dispose: () => void } | null>(null);
  const retirement = useMemo(() => createSceneRetirement(), []);
  useEffect(() => {
    let cancelled = false;
    const ids = props.visibleZoneIds ? new Set(props.layout.slots.filter(slot => props.visibleZoneIds!.includes(slot.zoneId)).map(slot => slot.unitId)) : null;
    const units = ids ? props.units.filter(unit => ids.has(unit.id)) : props.units;
    const printed = props.cartonLabelsEnabled === false ? Promise.resolve(null) : acquireComparisonLabels(stagingCartonLabelPlan(units));
    Promise.all([Promise.all(requiredStagingModelKeys(units).map(async key => [key, await loadMeshyModel(key)] as const)), printed]).then(([entries, acquired]) => {
      if (cancelled) { acquired?.release(); return; }
      try {
        const resources = createStagingYardResources(props.units, props.layout, Object.fromEntries(entries), { visibleZoneIds: props.visibleZoneIds, labels: props.labels, cartonLabelMaterials: acquired?.materials });
        const previous = live.current;
        live.current = { dispose: () => { resources.dispose(); acquired?.release(); } };
        if (previous) retirement.retire(previous.dispose);
        setLoaded({ units: props.units, layout: props.layout, options: optionsKey, resources }); invalidate();
      } catch (error) { acquired?.release(); throw error; }
    }).catch(error => {
      void printed.then(acquired => acquired?.release(), () => {});
      if (!cancelled) callbacks.current.onError?.(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; pointer.cancel(); };
  }, [props.units, props.layout, optionsKey, invalidate, retirement]);
  useEffect(() => () => {
    const current = live.current; live.current = null;
    current?.dispose(); retirement.flush();
  }, [retirement]);
  const resources = loaded?.units === props.units && loaded.layout === props.layout && loaded.options === optionsKey ? loaded.resources : null;
  useEffect(() => {
    if (!resources || !retirement.size) return;
    // The replacement is in the scene now and compiles on the next demand frame.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => retirement.flush()); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [resources, retirement]);
  useLayoutEffect(() => { resources?.setSelected(props.selectedUnitId ?? null); invalidate(); }, [resources, props.selectedUnitId, invalidate]);
  useLayoutEffect(() => { resources?.setHovered(props.hoveredUnitId ?? null); invalidate(); }, [resources, props.hoveredUnitId, invalidate]);
  // A yard that goes away takes its pointer-over state with it.
  useEffect(() => () => callbacks.current.onHover?.(null), []);
  const unitAt = (hit: Pick<THREE.Intersection, 'object' | 'instanceId'>) => hit.object.userData.kind === 'stagingCargo'
    ? hit.object.userData.unitIds[hit.instanceId ?? -1] as string | undefined : undefined;
  if (!resources) return null;
  return <primitive object={resources.root} dispose={null} {...pointer.handlers}
    onClick={(event: ThreeEvent<MouseEvent>) => {
      if (event.button !== 0 || event.delta > 4) return;
      const id = unitAt(event); if (id) { event.stopPropagation(); callbacks.current.onSelect?.(id); }
    }}
    onPointerMove={(event: ThreeEvent<PointerEvent>) => {
      pointer.handlers.onPointerMove(event);
      // Only the nearest unit under the pointer is "over"; one behind it is not.
      const nearest = nearestStagingHit(event.intersections);
      if (!nearest) callbacks.current.onHover?.(null);
      else if (stagingHitSource(nearest) === 'yard' && nearest.object === resources.root) callbacks.current.onHover?.(unitAt(nearest) ?? null);
    }}
    onPointerOut={() => callbacks.current.onHover?.(null)}
  />;
}

/** A transient whole-unit ghost. Its transforms never enter inventory or vehicle
 * placements; only the command owner may commit a validated candidate. */
export function createStagingPreviewResources(unit: StagingUnit, models: YardModels) {
  const slot: StagingYardSlot = { unitId: unit.id, zoneId: '', label: '', slotIndex: 0, groupKey: '', center: [0, 0, 0], rotationY: 0, localCenter: [0, 0], length: unit.length, width: unit.width, height: unit.height };
  const parts = stagingUnitParts(unit, slot);
  for (const key of requiredStagingModelKeys([unit])) if (!models[key]) throw new Error(`Required staging preview model is missing: ${key}`);
  const root = new THREE.Group(); root.name = 'Staging candidate · visual preview only';
  const cartonGeometry = parts.some(part => part.key === 'carton') ? acquireStudioCartonGeometry() : null;
  const geometry = new THREE.BoxGeometry(1, 1, 1), edges = new THREE.EdgesGeometry(geometry);
  const material = new THREE.MeshBasicMaterial({ color: '#16a34a', transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#15803d', transparent: true, opacity: .9, depthTest: false });
  const meshes: THREE.InstancedMesh[] = [];
  const batches = new Map<ModelKey | undefined, Part[]>();
  for (const part of parts) { const group = batches.get(part.key) ?? []; group.push(part); batches.set(part.key, group); }
  for (const [key, group] of batches) for (const source of key === 'carton' && cartonGeometry ? [{ geometry: cartonGeometry.geometry }] : key ? models[key]!.parts : [{ geometry }]) {
    const mesh = new THREE.InstancedMesh(source.geometry, material, group.length); mesh.name = `Preview ${key ?? 'packaging'}`; mesh.raycast = noRaycast;
    const matrix = new THREE.Matrix4();
    group.forEach((part, index) => {
      matrix.compose(new THREE.Vector3(...part.position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), part.rotationY), new THREE.Vector3(...part.size)); mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); root.add(mesh); meshes.push(mesh);
  }
  const outline = new THREE.LineSegments(edges, edgeMaterial); outline.position.y = unit.height / 2; outline.scale.set(unit.length, unit.height, unit.width); outline.renderOrder = 7; outline.raycast = noRaycast; root.add(outline);
  let disposed = false;
  return { root,
    /** `caution`: accepted, but it would leave an error on the plan that blocks verification. */
    update(candidate: Placement, container: { length: number; width: number; height: number }, valid: boolean, caution = false) {
      root.position.set(candidate.x + candidate.length / 2 - container.length / 2, candidate.z, candidate.y + candidate.width / 2 - container.width / 2);
      root.rotation.y = unit.kind === 'box' && Math.abs(candidate.length - unit.length) > 1e-6
        && Math.abs(candidate.length - unit.width) < 1e-6 && Math.abs(candidate.width - unit.length) < 1e-6 ? Math.PI / 2 : 0;
      const warned = valid && caution;
      material.color.set(!valid ? '#dc2626' : warned ? '#d97706' : '#16a34a'); edgeMaterial.color.set(!valid ? '#b91c1c' : warned ? '#b45309' : '#15803d');
      root.userData = { valid, unitId: unit.id, displayOnly: true, ...(warned ? { caution: true } : {}) };
    },
    dispose() { if (disposed) return; disposed = true; meshes.forEach(mesh => mesh.dispose()); geometry.dispose(); edges.dispose(); material.dispose(); edgeMaterial.dispose(); cartonGeometry?.release(); root.clear(); },
  };
}

export function ThreeStagingPreview({ unit, candidate, container, valid, caution = false, onError }: { unit: StagingUnit; candidate: Placement; container: { length: number; width: number; height: number }; valid: boolean; caution?: boolean; onError?: (message: string) => void }) {
  const { invalidate } = useThree();
  const callback = useRef(onError); callback.current = onError;
  const [loaded, setLoaded] = useState<{ unit: StagingUnit; resources: ReturnType<typeof createStagingPreviewResources> } | null>(null);
  useEffect(() => {
    let cancelled = false, dispose: (() => void) | undefined;
    Promise.all(requiredStagingModelKeys([unit]).map(async key => [key, await loadMeshyModel(key)] as const)).then(entries => {
      if (cancelled) return;
      const resources = createStagingPreviewResources(unit, Object.fromEntries(entries)); dispose = resources.dispose; setLoaded({ unit, resources }); invalidate();
    }).catch(error => { if (!cancelled) callback.current?.(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; dispose?.(); };
  }, [unit, invalidate]);
  const resources = loaded?.unit === unit ? loaded.resources : null;
  useLayoutEffect(() => { resources?.update(candidate, container, valid, caution); invalidate(); }, [resources, candidate, container, valid, caution, invalidate]);
  return resources ? <primitive object={resources.root} dispose={null} /> : null;
}
