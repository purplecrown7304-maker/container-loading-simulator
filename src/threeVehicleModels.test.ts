import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { vehicleLayout, vehicleRigForEquipment, VEHICLE_BOUNDS, VEHICLE_DECK_Y, type VehicleModelKey } from './threeVehicleLayout';
import { loadVehicleModel, prepareVehicleModel, VEHICLE_MODEL_URLS, type VehicleModels } from './threeVehicleModels';
import { createVehicleResources, fitVehicleRails } from './threeVehicleResources';
import { CONTAINER_EQUIPMENT, TRUCK_EQUIPMENT } from './transportEquipment';
import { sceneCameraPose } from './threeComparisonSceneState';
import { viewerPlan } from './viewerSceneProtocol';

function source(key: VehicleModelKey) {
  const bytes = readFileSync(`public${VEHICLE_MODEL_URLS[key]}`);
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const bin = bytes.subarray(28 + jsonLength), primitive = json.meshes[0].primitives[0], geometry = new THREE.BufferGeometry();
  function values(index: number) {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView], size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type as 'SCALAR' | 'VEC2' | 'VEC3'];
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), copy = Uint8Array.from(bin.subarray(start, start + a.count * size * (a.componentType === 5123 ? 2 : 4))).buffer;
    return a.componentType === 5126 ? new Float32Array(copy) : a.componentType === 5123 ? new Uint16Array(copy) : new Uint32Array(copy);
  }
  for (const [name, attribute, size] of [['POSITION', 'position', 3], ['NORMAL', 'normal', 3], ['TEXCOORD_0', 'uv', 2]] as const) geometry.setAttribute(attribute, new THREE.BufferAttribute(values(primitive.attributes[name]), size));
  geometry.setIndex(new THREE.BufferAttribute(values(primitive.indices), 1)); geometry.computeBoundingBox();
  return { bytes, json, geometry };
}
function models(): VehicleModels {
  return Object.fromEntries((Object.keys(VEHICLE_MODEL_URLS) as VehicleModelKey[]).map(key => {
    const { geometry } = source(key);
    return [key, { key, bounds: geometry.boundingBox!, parts: [{ geometry, material: new THREE.MeshStandardMaterial() }] }];
  }));
}
afterEach(() => vi.restoreAllMocks());

describe('user supplied vehicle assets', () => {
  const expected = {
    cab: [10886, 'cbe7b6709faf0a7f6a4c42b34a4ae8d0e9b00c8c8faee61b9323d554794376ff'],
    tractor: [19841, '9282f024d5f723d242ee5c4bff1d970d591f93df4dd4b33055cf3210801d256b'],
    'truck-underbody': [14645, ''], 'container-chassis': [19483, ''],
  } as const;
  for (const key of Object.keys(VEHICLE_MODEL_URLS) as VehicleModelKey[]) it(`${key}: self-contained GLB with retained triangles/UVs and calibrated bounds`, () => {
    const { bytes, json, geometry } = source(key);
    expect(bytes.toString('ascii', 0, 4)).toBe('glTF'); expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(bytes.length).toBeLessThan(4_000_000);
    expect((json.images ?? []).every((v: { uri?: string }) => !v.uri)).toBe(true);
    expect((json.buffers ?? []).every((v: { uri?: string }) => !v.uri)).toBe(true);
    expect(geometry.index!.count / 3).toBe(expected[key][0]);
    if (expected[key][1]) expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected[key][1]);
    const provenance = JSON.parse(readFileSync('public/models/vehicles/provenance.json', 'utf8'));
    const entry = key === 'cab' ? provenance.cab_cleanup[0] : provenance.sources.find((v: { filename: string }) => VEHICLE_MODEL_URLS[key].endsWith(v.filename));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    for (const axis of ['x', 'y', 'z'] as const) {
      const i = ['x', 'y', 'z'].indexOf(axis);
      expect(geometry.boundingBox!.min[axis]).toBeCloseTo(VEHICLE_BOUNDS[key].min[i], 6);
      expect(geometry.boundingBox!.max[axis]).toBeCloseTo(VEHICLE_BOUNDS[key].max[i], 6);
    }
    geometry.dispose();
  });
  it('shares concurrent loads, evicts failure and retries without touching the eight legacy assets', async () => {
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const loader = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce({ scene } as GLTF);
    const a = loadVehicleModel('cab'), b = loadVehicleModel('cab'); expect(a).toBe(b);
    await expect(a).rejects.toThrow('404');
    const model = await loadVehicleModel('cab'); expect(await loadVehicleModel('cab')).toBe(model); expect(loader).toHaveBeenCalledTimes(2);
  });
  it('releases invalid decoded GLB resources including textures', () => {
    const scene = new THREE.Group(), geometry = new THREE.BufferGeometry(), map = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map });
    scene.add(new THREE.Mesh(geometry, material));
    const gd = vi.spyOn(geometry, 'dispose'), md = vi.spyOn(material, 'dispose'), td = vi.spyOn(map, 'dispose');
    expect(() => prepareVehicleModel('tractor', { scene })).toThrow('missing');
    expect(gd).toHaveBeenCalledOnce(); expect(md).toHaveBeenCalledOnce(); expect(td).toHaveBeenCalledOnce();
  });
});

describe('view-only equipment assembly', () => {
  it('uses articulated rigs for containers and named semi-trailers, rigid cab for short custom trucks', () => {
    for (const equipment of [...CONTAINER_EQUIPMENT, ...TRUCK_EQUIPMENT]) expect(vehicleRigForEquipment(equipment)).toBe('articulated');
    expect(vehicleRigForEquipment({ id: 'custom-truck', category: 'truck', length: 4 })).toBe('rigid');
  });
  const cases = [
    { kind: 'articulated' as const, length: 5.9, width: 2.352, height: 2.395 },
    { kind: 'articulated' as const, length: 12.032, width: 2.352, height: 2.7 },
    { kind: 'rigid' as const, length: 3.1, width: 1.7, height: 1.8 },
    { kind: 'rigid' as const, length: 6.2, width: 2.35, height: 2.6 },
    { kind: 'articulated' as const, length: 1.5, width: 3.5, height: 2.6 },
  ];
  for (const footprint of cases) it(`${footprint.kind} ${footprint.length}m: fits beneath cargo, preserves wheels and grounds both components`, () => {
    const loaded = models(), layout = vehicleLayout(footprint.kind, footprint);
    for (const placement of layout.placements) {
      const src = loaded[placement.key]!.parts[0].geometry, before = Array.from(src.getAttribute('position').array);
      const fitted = placement.rails ? fitVehicleRails(src, placement.rails, placement.scale) : src.clone().scale(placement.scale, placement.scale, placement.scale);
      fitted.translate(...placement.position); fitted.computeBoundingBox();
      expect(fitted.boundingBox!.min.y).toBeCloseTo(layout.groundY, 5);
      if (placement.rails) {
        expect(fitted.boundingBox!.max.y).toBeCloseTo(VEHICLE_DECK_Y, 5);
        expect(fitted.boundingBox!.min.x).toBeCloseTo(-placement.rails.targetLength / 2 + placement.position[0], 5);
        expect(fitted.boundingBox!.max.x).toBeCloseTo((footprint.length + .12) / 2, 5);
        const p = src.getAttribute('position'), f = fitted.getAttribute('position');
        const wheelIndices: number[] = [];
        for (let i = 0; i < p.count; i++) if (p.getX(i) > .05 && p.getX(i) < .68) wheelIndices.push(i);
        const a = wheelIndices[0], b = wheelIndices.at(-1)!;
        const d = new THREE.Vector3().fromBufferAttribute(p, a).distanceTo(new THREE.Vector3().fromBufferAttribute(p, b));
        expect(new THREE.Vector3().fromBufferAttribute(f, a).distanceTo(new THREE.Vector3().fromBufferAttribute(f, b))).toBeCloseTo(d * placement.scale, 5);
      }
      const positions = fitted.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        // Every cosmetic vertex above floor level is ahead of the cargo plane.
        if (positions.getY(i) >= -.001) expect(positions.getX(i)).toBeLessThan(-footprint.length / 2 - .05);
      }
      expect(Array.from(src.getAttribute('position').array)).toEqual(before); fitted.dispose();
    }
    const resources = createVehicleResources(footprint.kind, footprint, loaded), sourceDispose = vi.spyOn(loaded.cab!.parts[0].geometry, 'dispose');
    const owned = (resources.root.children[0].children[0] as THREE.Mesh).geometry, ownedDispose = vi.spyOn(owned, 'dispose');
    resources.dispose(); resources.dispose(); expect(ownedDispose).toHaveBeenCalledOnce(); expect(sourceDispose).not.toHaveBeenCalled();
    const plan = { ...viewerPlan({ ...footprint, maxPayloadKg: 1000 }, { placements: [], remaining: [], usedVolumeM3: 0, loadedWeightKg: 0, validationIssues: [] }, 1), vehicleRig: footprint.kind };
    for (const aspect of [.5, 2.4]) for (const view of ['free', 'top', 'side', 'door']) {
      const pose = sceneCameraPose(plan, view, aspect), camera = new THREE.PerspectiveCamera(40, aspect, .02, 500);
      camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
      for (const x of [layout.bounds.min.x, layout.bounds.max.x]) for (const y of [layout.groundY, footprint.height]) for (const z of [-footprint.width / 2, footprint.width / 2]) {
        const p = new THREE.Vector3(x, y, z).project(camera); expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1);
      }
    }
  });
  it('does not create a vehicle for isolated pallet previews and rejects invalid dimensions', () => {
    expect(vehicleLayout('none', { length: 1, width: 1, height: 1 }).placements).toHaveLength(0);
    expect(() => vehicleLayout('rigid', { length: NaN, width: 1, height: 1 })).toThrow('finite');
    expect(() => createVehicleResources('rigid', { length: 4, width: 2, height: 2 }, {})).toThrow('missing');
  });
});
