import * as THREE from 'three';
import type { EnvironmentId } from './viewerEnvironment';

type Footprint = { length: number; width: number; height: number };
type Part = 'sky' | 'ground' | 'scenery';
type Primitive = 'box' | 'cone' | 'cylinder' | 'rock' | 'leaf';
type Vector = [number, number, number];
type Instance = { position: Vector; scale: Vector; color: string; rotation?: THREE.Quaternion };
const noRaycast = () => {};
const FLOOR_Y = -.14;
const THEMES: Record<EnvironmentId, { horizon: string; zenith: string; floor: string; accent: string }> = {
  forest: { horizon: '#dcebdc', zenith: '#91b6cf', floor: '#a0ad83', accent: '#748568' },
  warehouse: { horizon: '#e0e8ed', zenith: '#91aec5', floor: '#c0c7c6', accent: '#a4afae' },
  beach: { horizon: '#d8f0e8', zenith: '#69bbde', floor: '#e6d8b4', accent: '#c7b892' },
  space: { horizon: '#182347', zenith: '#05091b', floor: '#4a6279', accent: '#24cdd8' },
};

// Match the existing CargoSurface shaders' display RGB and fixed directional light.
const tint = (value: string) => new THREE.Color().setStyle(value, THREE.LinearSRGBColorSpace);
const quaternion = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function createSurfaceMaterial(unlit = false) {
  return new THREE.ShaderMaterial({
    name: unlit ? 'Environment accent' : 'Environment fixed light', toneMapped: false,
    side: THREE.DoubleSide,
    uniforms: { unlit: { value: +unlit } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vTint;
      void main() {
        vec3 p=position; vec3 n=normal; vTint=vec3(1.);
        #ifdef USE_INSTANCING
          mat3 m=mat3(instanceMatrix);
          n=m*(n/vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2])));
          p=(instanceMatrix*vec4(p,1.)).xyz;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTint=instanceColor;
        #endif
        vNormal=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `
      uniform float unlit; varying vec3 vNormal; varying vec3 vTint;
      void main() {
        float light=.62+.38*max(0.,dot(normalize(vNormal),normalize(vec3(.4,1.,.6))));
        gl_FragColor=vec4(vTint*mix(light,1.,unlit),1.);
      }`,
  });
}

function leafGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, .34, .025, -.16, .34, .10, 0, .34, .025, .16,
    .73, -.055, -.10, .73, .02, 0, .73, -.055, .10, 1, -.22, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 4, 7, 5, 5, 7, 6]);
  geometry.computeVertexNormals();
  return geometry;
}

/** Presentation-only scenery. No loading plan, physics object, camera or cached
 * Meshy resource is read or changed. Everything allocated here belongs to dispose(). */
export function createViewerEnvironmentResources(id: EnvironmentId, footprint: Footprint) {
  const theme = THEMES[id];
  if (!theme) throw new Error('Unknown viewer environment');
  if (![footprint.length, footprint.width, footprint.height].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('Viewer environment requires a finite positive footprint');
  }
  const { length: l, width: w, height: h } = footprint;
  const size = Math.max(1, Math.min(2, l / 8));
  // Includes the original truck cab on -X, plus orbit/selection breathing room.
  const exclusion = { minX: -l / 2 - w * 1.25 - 1.25, maxX: l / 2 + 1.25, minZ: -w / 2 - 1.25, maxZ: w / 2 + 1.25 };
  const rx = Math.max(Math.abs(exclusion.minX) + 4, 10), rz = Math.max(w / 2 + 6, 9);
  const radius = Math.max(60, rx * 4), skyRadius = Math.max(240, radius * 2.5);
  const root = new THREE.Group(); root.name = `Viewer environment: ${id}`;
  root.userData = { environmentId: id, footprint: { ...footprint }, exclusion };
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const instances: THREE.InstancedMesh[] = [];
  const primitiveGeometry = new Map<Primitive, THREE.BufferGeometry>();
  const batches = new Map<string, { kind: Primitive; part: Part; unlit: boolean; values: Instance[] }>();
  const ownGeometry = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.add(geometry); return geometry; };
  const ownMaterial = <T extends THREE.Material>(material: T) => { materials.add(material); return material; };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const mesh of instances) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    root.clear();
  };
  const mount = (object: THREE.Object3D, part: Part, name: string) => {
    object.name = name; object.userData.environmentPart = part; object.raycast = noRaycast; root.add(object);
    return object;
  };
  const add = (kind: Primitive, position: Vector, scale: Vector, color: string, rotation?: THREE.Quaternion, part: Part = 'scenery', unlit = false) => {
    const key = `${kind}:${part}:${unlit}`;
    let batch = batches.get(key);
    if (!batch) { batch = { kind, part, unlit, values: [] }; batches.set(key, batch); }
    batch.values.push({ position, scale, color, rotation });
  };
  const bar = (from: Vector, to: Vector, thickness: number, color: string, kind: 'box' | 'cylinder' = 'box') => {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to), direction = end.clone().sub(start);
    add(kind, start.add(end).multiplyScalar(.5).toArray(), [thickness, direction.length(), thickness], color,
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  };

  try {
  const sky = ownMaterial(new THREE.ShaderMaterial({
    name: 'Environment gradient sky', side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { horizon: { value: tint(theme.horizon) }, zenith: { value: tint(theme.zenith) }, space: { value: +(id === 'space') } },
    vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      uniform vec3 horizon; uniform vec3 zenith; uniform float space; varying vec3 vDirection;
      void main(){
        vec3 d=normalize(vDirection); float up=smoothstep(-.08,.82,d.y);
        vec3 color=mix(horizon,zenith,up);
        float glow=pow(max(0.,dot(d,normalize(vec3(-.4,.28,-.8)))),14.);
        color+=mix(vec3(.055,.038,.005),vec3(.13,.05,.19),space)*glow;
        gl_FragColor=vec4(color,1.);
      }`,
  }));
  const dome = mount(new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(skyRadius, 32, 12)), sky), 'sky', 'Gradient sky');
  dome.renderOrder = -1000;

  const ground = ownMaterial(new THREE.ShaderMaterial({
    name: 'Environment ground and analytic contact shade', toneMapped: false,
    uniforms: { base: { value: tint(theme.floor) }, accent: { value: tint(theme.accent) }, style: { value: ['forest', 'warehouse', 'beach', 'space'].indexOf(id) },
      extent: { value: new THREE.Vector2(l / 2 + .6, w / 2 + .7) }, pad: { value: new THREE.Vector2(rx * .8, rz * .7) } },
    vertexShader: 'varying vec3 vWorld; void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
    fragmentShader: `
      uniform vec3 base; uniform vec3 accent; uniform float style; uniform vec2 extent; uniform vec2 pad; varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz; float grain=sin(p.x*.72)*sin(p.y*.58)*.016;
        float distanceFromCargo=length(p/extent);
        float shade=.16*exp(-distanceFromCargo*distanceFromCargo*1.45);
        vec3 color=base+grain-shade;
        if(style>.5&&style<1.5){
          vec2 seam=abs(fract((p+.01)/4.)-.5);
          float line=smoothstep(.491,.499,max(seam.x,seam.y)); color=mix(color,accent,line*.35);
        }
        if(style>2.5){
          float edge=max(abs(p.x)/pad.x,abs(p.y)/pad.y);
          if(edge>1.)discard;
          color=mix(vec3(.022,.038,.065),color,1.-smoothstep(.985,1.,edge));
          float rim=smoothstep(.93,.95,edge)*(1.-smoothstep(.965,.98,edge)); color=mix(color,accent,rim*.85);
          float grid=step(.975,fract(p.x/2.))+step(.975,fract(p.y/2.)); color+=min(grid,1.)*.025*(1.-step(.90,edge));
        }
        gl_FragColor=vec4(color,1.);
      }`,
  }));
  const groundMesh = mount(new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(radius * 2, radius * 2)), ground), 'ground', 'Ground below cargo');
  groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = FLOOR_Y;

  if (id === 'forest') {
    // Two irregular but deterministic rings; no random seed or frame loop.
    for (let i = 0; i < 30; i++) {
      const angle = i * Math.PI * 2 / 30 + .1, spread = 1.25 + (i % 3) * .16;
      const x = Math.cos(angle) * rx * spread, z = Math.sin(angle) * rz * spread;
      const height = (3.5 + (i * 7 % 9) * .29) * size, crown = (1.0 + i % 4 * .13) * size;
      add('cylinder', [x, height * .22, z], [.14 * size, height * .48, .14 * size], '#6c6250');
      add('cone', [x, height * .66, z], [crown, height * .66, crown], ['#4d7d62', '#5b896b', '#3d6f62'][i % 3]);
      add('cone', [x, height * .87, z], [crown * .72, height * .48, crown * .72], ['#658f70', '#72977a', '#4a806c'][i % 3]);
    }
    for (let i = 0; i < 11; i++) {
      const x = (i - 5) * rx * .58, z = -rz * (3 + (i % 3) * .2);
      add('rock', [x, 3.8 * size, z], [rx * .48, (5 + i % 3) * size, rz * .8], ['#9aafa5', '#8ea79c', '#acbcb0'][i % 3]);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + .3;
      add('rock', [Math.cos(a) * rx * 1.05, .28 * size, Math.sin(a) * rz * 1.12], [.65 * size, .48 * size, .43 * size], i % 2 ? '#929f87' : '#7d9081', quaternion(0, a, 0));
    }
    // A soft clearing and discreet path edges stay below the physical floor.
    for (const side of [-1, 1]) add('box', [0, -.125, side * (w / 2 + 1.4)], [l + 7, .012, .10], '#d0c6a5', undefined, 'ground');
  } else if (id === 'warehouse') {
    const rackZ = Math.max(rz * 2.4, w / 2 + 5 * size), rackWidth = 4.4 * size, rackHeight = 4.5 * size;
    for (const side of [-1, 1]) for (let bank = -1; bank <= 1; bank++) {
      const x = bank * 5.2 * size, z = side * rackZ;
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) add('box', [x + dx * rackWidth / 2, rackHeight / 2, z + dz * .68 * size], [.11 * size, rackHeight, .11 * size], '#496d82');
      for (let tier = 0; tier < 3; tier++) {
        const y = .45 * size + tier * 1.35 * size;
        add('box', [x, y, z], [rackWidth + .1, .14 * size, 1.5 * size], '#d79356');
        for (let carton = 0; carton < 4; carton++) add('box', [x + (carton - 1.5) * size, y + .47 * size, z], [.88 * size, .80 * size, 1.1 * size], ['#bbac86', '#d0bb91', '#94a9a7', '#b9ae99'][(bank + carton + tier + 3) % 4]);
      }
    }
    const wallZ = -rackZ - 3 * size, roof = Math.max(h + 4, rackHeight + 2.3);
    for (let i = -3; i <= 3; i++) {
      add('box', [i * rx * .43, roof / 2, wallZ], [rx * .435, roof, .28], '#adbcc4');
      add('box', [i * rx * .43, roof * .50, wallZ + .18], [.075, roof, .09], '#859daa');
      add('box', [i * rx * .43, roof * .82, wallZ + .20], [rx * .36, roof * .17, .04], '#deedf0', undefined, 'scenery', true);
    }
    for (const side of [-1, 1]) {
      const z = side * (rackZ + 1.9 * size);
      for (const end of [-1, 1]) add('box', [end * rx * 1.30, roof / 2, z], [.30, roof, .30], '#7c919d');
      add('box', [0, roof, z], [rx * 2.65, .23, .28], '#829ba8');
      for (let lamp = -1; lamp <= 1; lamp++) add('box', [lamp * rx * .72, roof - .22, z], [2.1 * size, .05, .19], '#fff3c9', undefined, 'scenery', true);
      for (let dash = -4; dash <= 4; dash++) add('box', [dash * (l + 5) / 9, -.125, side * (w / 2 + 1.6)], [.72, .012, .12], '#e7c56c', undefined, 'ground');
    }
    for (const side of [-1, 1]) {
      const x = l / 2 + 3 * size, z = side * (w / 2 + 2.5);
      add('cylinder', [x, .46, z], [.15, .92, .15], '#cfaa56');
      add('cylinder', [x, .55, z], [.154, .17, .154], '#5a6970');
    }
  } else if (id === 'beach') {
    const oceanMaterial = ownMaterial(new THREE.ShaderMaterial({
      name: 'Static ocean bands', toneMapped: false,
      uniforms: { shore: { value: -rz * 1.2 }, depth: { value: rz * 3 } },
      vertexShader: 'varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
      fragmentShader: `uniform float shore;uniform float depth;varying vec3 vWorld;
        void main(){float d=clamp((shore-vWorld.z)/depth,0.,1.);vec3 c=mix(vec3(.38,.77,.76),vec3(.13,.43,.62),d);
          float wave=pow(max(0.,sin(vWorld.z*2.4+sin(vWorld.x*.24)*.8)),22.);c+=vec3(.15,.18,.16)*wave*(1.-d*.7);
          float foam=exp(-pow((vWorld.z-shore+.5)*1.8,2.));gl_FragColor=vec4(mix(c,vec3(.90,.95,.86),foam*.65),1.);}`,
    }));
    const ocean = mount(new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(radius * 2, radius)), oceanMaterial), 'ground', 'Ocean beyond the clearing');
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -.126, -rz * 1.2 - radius / 2);
    for (let i = 0; i < 7; i++) {
      const angle = .22 + i * Math.PI * 2 / 7;
      const x = Math.cos(angle) * rx * 1.6, z = Math.sin(angle) * rz * 1.55;
      const height = (4.8 + i % 3 * .45) * size;
      let previous: Vector = [x, 0, z];
      for (let segment = 1; segment <= 4; segment++) {
        const t = segment / 4;
        const next: Vector = [x + .52 * size * t * t, height * t, z + .20 * size * t];
        bar(previous, next, .14 * size * (1 - t * .28), '#947a59', 'cylinder'); previous = next;
      }
      for (let leaf = 0; leaf < 7; leaf++) add('leaf', previous, [3.2 * size, 3.2 * size, 3.2 * size], leaf % 2 ? '#559775' : '#70ab78', quaternion(0, leaf * Math.PI * 2 / 7 + angle, -.10));
      add('rock', [x, .28 * size, z], [1.6 * size, .55 * size, 1.1 * size], '#daca9f');
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) add('rock', [side * rx * (1.45 + i * .62), .40 * size, rz * .80], [3.8 * size, (1.0 + i % 2 * .25) * size, 2.6 * size], i % 2 ? '#d6c59b' : '#e4d6b0');
  } else {
    const starPositions: number[] = [], starColors: number[] = [];
    for (let i = 0; i < 180; i++) {
      const azimuth = i * 2.399963229728653, vertical = -1 + (i + .5) / 180 * 2;
      const horizontal = Math.sqrt(1 - vertical * vertical), r = 170;
      starPositions.push(Math.cos(azimuth) * horizontal * r, vertical * r, Math.sin(azimuth) * horizontal * r);
      const brightness = .62 + i % 5 * .085; starColors.push(brightness, brightness * .96, Math.min(1, brightness + .09));
    }
    const starsGeometry = ownGeometry(new THREE.BufferGeometry());
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    mount(new THREE.Points(starsGeometry, ownMaterial(new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, toneMapped: false, depthWrite: false }))), 'sky', 'Fixed star field');
    const planetMaterial = ownMaterial(new THREE.ShaderMaterial({
      name: 'Planet fixed bands', toneMapped: false,
      vertexShader: 'varying vec3 n;varying vec3 p;void main(){n=normal;p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 n;varying vec3 p;void main(){float bands=sin(p.y*18.+sin(p.x*5.)*.7)*.5+.5;
        vec3 c=mix(vec3(.34,.55,.70),vec3(.73,.78,.76),bands*.58);float light=.30+.70*max(0.,dot(normalize(n),normalize(vec3(-.5,.7,.5))));gl_FragColor=vec4(c*light,1.);}`,
    }));
    const planet = mount(new THREE.Mesh(ownGeometry(new THREE.SphereGeometry(1, 24, 12)), planetMaterial), 'scenery', 'Distant ringed planet');
    planet.position.set(-rx * 2.4, -rz * 1.5, -rz * 3.6); planet.scale.setScalar(9);
    const ring = mount(new THREE.Mesh(ownGeometry(new THREE.RingGeometry(11.8, 17.5, 64)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#90abc4', side: THREE.DoubleSide, transparent: true, opacity: .43, depthWrite: false, toneMapped: false }))), 'scenery', 'Planet rings');
    ring.position.copy(planet.position); ring.rotation.set(1.16, -.25, .36);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const x = end * rx * 1.15, z = side * rz * 1.1;
        add('box', [x, .52, z], [.55, 1.04, .55], '#516a80');
        add('box', [x, 1.09, z], [.43, .11, .43], '#73e9eb', undefined, 'scenery', true);
        add('box', [x, .15, z], [1.1, .3, 1.1], '#2c3f56');
      }
      for (let dash = -3; dash <= 3; dash++) add('box', [dash * rx * .19, -.123, side * (w / 2 + 1.4)], [.55, .016, .09], '#9de8e6', undefined, 'ground', true);
    }
    for (const side of [-1, 1]) {
      const z = side * rz * 2.5;
      add('box', [rx * 1.8, 1.7, z], [.28, 3.4, .28], '#466178');
      add('box', [rx * 1.8, 3.4, z], [5.2, .10, 2.8], '#244b71', quaternion(0, -.20, .15));
      for (let cell = -2; cell <= 2; cell++) add('box', [rx * 1.8 + cell * .9, 3.55 + cell * .14, z], [.025, .02, 2.7], '#6d9cae', quaternion(0, -.20, .15), 'scenery', true);
    }
  }

  const surfaceMaterials = new Map<boolean, THREE.ShaderMaterial>();
  for (const batch of batches.values()) {
    let geometry = primitiveGeometry.get(batch.kind);
    if (!geometry) {
      geometry = ownGeometry(batch.kind === 'box' ? new THREE.BoxGeometry(1, 1, 1)
        : batch.kind === 'cone' ? new THREE.ConeGeometry(1, 1, 8)
          : batch.kind === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, 6)
            : batch.kind === 'leaf' ? leafGeometry() : new THREE.IcosahedronGeometry(1, 0));
      primitiveGeometry.set(batch.kind, geometry);
    }
    let material = surfaceMaterials.get(batch.unlit);
    if (!material) { material = ownMaterial(createSurfaceMaterial(batch.unlit)); surfaceMaterials.set(batch.unlit, material); }
    const mesh = new THREE.InstancedMesh(geometry, material, batch.values.length); instances.push(mesh);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    batch.values.forEach((instance, index) => {
      matrix.compose(position.fromArray(instance.position), instance.rotation ?? new THREE.Quaternion(), scale.fromArray(instance.scale));
      mesh.setMatrixAt(index, matrix); mesh.setColorAt(index, tint(instance.color));
    });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    mount(mesh, batch.part, `${id} ${batch.kind} ${batch.unlit ? 'accents' : 'scenery'}`);
  }
  root.traverse(object => { object.raycast = noRaycast; });
  root.updateMatrixWorld(true);
  // Keep the rear diorama only. A decoration entirely behind the cargo's XZ
  // support plane cannot lie on a camera-to-cargo ray, regardless of its height.
  // This protects short and 40ft loads without moving their camera or models.
  const visibilityBatches: {
    mesh: THREE.InstancedMesh; originalMatrices: Float32Array; originalColors: Float32Array;
    bounds: Float32Array; shown: Uint8Array; slots: Int32Array;
  }[] = [];
  const standalone: { object: THREE.Object3D; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const matrix = new THREE.Matrix4(), box = new THREE.Box3();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.environmentPart !== 'scenery') return;
    object.geometry.computeBoundingBox();
    if (object instanceof THREE.InstancedMesh) {
      const bounds = new Float32Array(object.count * 4), slots = new Int32Array(object.count);
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, matrix); box.copy(object.geometry.boundingBox!).applyMatrix4(matrix).applyMatrix4(object.matrixWorld);
        bounds.set([box.min.x, box.max.x, box.min.z, box.max.z], index * 4); slots[index] = index;
      }
      visibilityBatches.push({ mesh: object, originalMatrices: new Float32Array(object.instanceMatrix.array), originalColors: new Float32Array(object.instanceColor!.array),
        bounds, shown: new Uint8Array(object.count).fill(1), slots });
    } else {
      box.copy(object.geometry.boundingBox!).applyMatrix4(object.matrixWorld);
      standalone.push({ object, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    }
  });
  let lastCameraX = NaN, lastCameraZ = NaN;
  const color = new THREE.Color();
  const updateCamera = (position: THREE.Vector3) => {
    if (disposed || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    const distance = Math.hypot(position.x, position.z);
    const dx = distance > 1e-8 ? position.x / distance : 0, dz = distance > 1e-8 ? position.z / distance : 0;
    if (Math.abs(dx - lastCameraX) < 1e-7 && Math.abs(dz - lastCameraZ) < 1e-7) return;
    lastCameraX = dx; lastCameraZ = dz;
    const rearLimit = distance > 1e-8 ? Math.min(exclusion.minX * dx, exclusion.maxX * dx) + Math.min(exclusion.minZ * dz, exclusion.maxZ * dz) - .15 : 0;
    for (const batch of visibilityBatches) {
      let changed = false;
      for (let index = 0; index < batch.shown.length; index++) {
        const offset = index * 4;
        const maxProjection = Math.max(batch.bounds[offset] * dx, batch.bounds[offset + 1] * dx)
          + Math.max(batch.bounds[offset + 2] * dz, batch.bounds[offset + 3] * dz);
        const visible = +(maxProjection <= rearLimit);
        if (visible !== batch.shown[index]) { changed = true; batch.shown[index] = visible; }
      }
      if (!changed) continue;
      let slot = 0, rewritten = false;
      for (let index = 0; index < batch.shown.length; index++) {
        if (!batch.shown[index]) continue;
        if (batch.slots[slot] !== index) {
          batch.mesh.setMatrixAt(slot, matrix.fromArray(batch.originalMatrices, index * 16));
          batch.mesh.setColorAt(slot, color.fromArray(batch.originalColors, index * 3));
          batch.slots[slot] = index; rewritten = true;
        }
        slot++;
      }
      batch.mesh.count = slot;
      if (rewritten) { batch.mesh.instanceMatrix.needsUpdate = true; batch.mesh.instanceColor!.needsUpdate = true; }
      // Original full-scene bounds remain a conservative culling volume.
    }
    for (const item of standalone) item.object.visible = Math.max(item.minX * dx, item.maxX * dx) + Math.max(item.minZ * dz, item.maxZ * dz) <= rearLimit;
  };
  return { root, background: new THREE.Color(theme.horizon), updateCamera, dispose };
  } catch (error) { dispose(); throw error; }
}
