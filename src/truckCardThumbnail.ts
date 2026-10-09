import * as THREE from 'three';
import { createVehicleResources } from './threeVehicleResources';
import { loadVehicleModel, type VehicleModels } from './threeVehicleModels';
import { vehicleLayout, vehicleRigForEquipment } from './threeVehicleLayout';
import type { TransportEquipment } from './transportEquipment';

const WIDTH = 640, HEIGHT = 360, CACHE_LIMIT = 48;
const images = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let queue: Promise<void> = Promise.resolve();
let queued = 0;
let renderer: THREE.WebGLRenderer | undefined;

export function truckThumbnailKey(item: TransportEquipment) {
  return JSON.stringify(['truck-photo-v1', vehicleRigForEquipment(item), item.id, item.geometry, item.length, item.width, item.height]);
}

/** Only the thumbnail's shell owns these resources. Cached Meshy source assets
 * are borrowed by createVehicleResources and must never be disposed here. */
function createClosedBody(item: TransportEquipment) {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const paint = new THREE.MeshStandardMaterial({ color: '#f8f9fb', roughness: .55, metalness: .14 });
  const trim = new THREE.MeshStandardMaterial({ color: '#9da9b5', roughness: .45, metalness: .65 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3b4654', roughness: .8 });
  materials.push(paint, trim, dark);
  const { length: l, width: w, height: h } = item;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material) => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  };
  // Loading coordinates stay untouched: inner floor Y=0, front X=-length/2.
  box(0, h / 2, 0, l + .08, h + .08, w + .08, paint);
  for (const z of [-1, 1]) {
    box(0, .04, z * (w / 2 + .047), l + .10, .07, .026, trim);
    box(0, h, z * (w / 2 + .047), l + .10, .045, .026, trim);
    // Wing body seam and hinge details are cosmetic, never a physical partition.
    if (item.geometry === 'curtain') {
      box(0, h * .43, z * (w / 2 + .047), l, .014, .009, trim);
      for (let i = 1; i <= 4; i++) box(-l / 2 + l * i / 5, .15, z * (w / 2 + .055), .045, .13, .018, trim);
    }
  }
  box(l / 2 + .046, h / 2, 0, .015, h, .018, trim);
  for (const z of [-w * .22, w * .22]) box(l / 2 + .055, h / 2, z, .018, h * .8, .025, trim);
  if (item.geometry === 'reefer-truck') {
    box(-l / 2 - .13, h * .84, 0, .25, h * .23, w * .65, paint);
    box(-l / 2 - .262, h * .84, 0, .014, h * .14, w * .5, dark);
  }
  return { root, dispose: () => { geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); root.clear(); } };
}

async function renderThumbnail(item: TransportEquipment): Promise<string> {
  const kind = vehicleRigForEquipment(item);
  const layout = vehicleLayout(kind, item);
  const models: VehicleModels = {};
  await Promise.all([...new Set(layout.placements.map(part => part.key))].map(async key => { models[key] = await loadVehicleModel(key); }));
  const vehicle = createVehicleResources(kind, item, models);
  const body = createClosedBody(item);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#ffffff');
  let groundGeometry: THREE.PlaneGeometry | undefined;
  let groundMaterial: THREE.ShadowMaterial | undefined;
  const keyLight = new THREE.DirectionalLight('#fff9ef', 3.2);
  try {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setSize(WIDTH, HEIGHT, false); renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    const subject = new THREE.Group(); subject.add(vehicle.root, body.root); scene.add(subject);
    vehicle.root.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
    const bounds = new THREE.Box3().setFromObject(subject), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const radius = size.length() * .5;
    const aspect = WIDTH / HEIGHT;
    const camera = new THREE.OrthographicCamera(-radius * aspect, radius * aspect, radius, -radius, .01, radius * 20);
    camera.position.copy(center).add(new THREE.Vector3(-1.25, .65, 1.5).normalize().multiplyScalar(radius * 4)); camera.lookAt(center); camera.updateMatrixWorld();
    // Fit projected bounds, including the cab, without stretching the truck.
    const projected = new THREE.Box3();
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    const view = projected.getSize(new THREE.Vector3());
    const halfHeight = Math.max(view.y, view.x / aspect) * .58;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
    scene.add(new THREE.HemisphereLight('#ffffff', '#c5cdd7', 2.3));
    keyLight.position.copy(center).add(new THREE.Vector3(-radius, radius * 2, radius)); keyLight.target.position.copy(center);
    keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -radius * 2, right: radius * 2, top: radius * 2, bottom: -radius * 2, near: .1, far: radius * 8 });
    keyLight.shadow.bias = -.0005; keyLight.shadow.normalBias = .03;
    scene.add(keyLight, keyLight.target);
    groundGeometry = new THREE.PlaneGeometry(radius * 7, radius * 7); groundMaterial = new THREE.ShadowMaterial({ opacity: .16 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.rotation.x = -Math.PI / 2; ground.position.set(center.x, vehicle.groundY - .02, center.z); ground.receiveShadow = true; scene.add(ground);
    renderer.render(scene, camera);
    if (renderer.getContext().isContextLost()) throw new Error('Truck thumbnail WebGL context was lost');
    return renderer.domElement.toDataURL('image/png');
  } finally {
    vehicle.dispose(); body.dispose(); groundGeometry?.dispose(); groundMaterial?.dispose(); keyLight.shadow.dispose(); scene.clear();
    renderer?.renderLists.dispose();
  }
}

/** One renderer for the queue, a bounded image cache after it drains. No live
 * canvas/context belongs to any card; source GLBs remain in their shared cache. */
export function requestTruckThumbnail(item: TransportEquipment): Promise<string> {
  item = { ...item };
  const key = truckThumbnailKey(item);
  const cached = images.get(key); if (cached) { images.delete(key); images.set(key, cached); return Promise.resolve(cached); }
  const active = pending.get(key); if (active) return active;
  queued++;
  const request = queue.then(() => renderThumbnail({ ...item })).then(image => {
    images.set(key, image);
    while (images.size > CACHE_LIMIT) images.delete(images.keys().next().value!);
    return image;
  }).finally(() => {
    pending.delete(key);
    if (--queued === 0 && renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer = undefined; }
  });
  pending.set(key, request); queue = request.then(() => undefined, () => undefined);
  return request;
}
