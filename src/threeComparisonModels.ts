import {
  Box3,
  BufferGeometry,
  Color,
  FrontSide,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  NoColorSpace,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// These are the original Meshy sources, relocated without conversion or resampling.
// Explicit ?url imports let Vite serve/build OBJ and MTL files without a plugin.
import cartonObj from './assets/Meshy/carton/model.obj?url';
import cartonMtl from './assets/Meshy/carton/model.mtl?url';
import cartonTexture from './assets/Meshy/carton/basecolor.jpg?url';
import woodObj from './assets/Meshy/wood-pallet/model.obj?url';
import woodMtl from './assets/Meshy/wood-pallet/model.mtl?url';
import woodTexture from './assets/Meshy/wood-pallet/basecolor.jpg?url';
import plasticObj from './assets/Meshy/plastic-pallet/model.obj?url';
import plasticMtl from './assets/Meshy/plastic-pallet/model.mtl?url';
import plasticTexture from './assets/Meshy/plastic-pallet/basecolor.jpg?url';
import truckObj from './assets/Meshy/truck-cab/model.obj?url';
import truckMtl from './assets/Meshy/truck-cab/model.mtl?url';
import truckTexture from './assets/Meshy/truck-cab/basecolor.jpg?url';
import shellObj from './assets/Meshy/container-shell/model.obj?url';
import shellMtl from './assets/Meshy/container-shell/model.mtl?url';
import shellTexture from './assets/Meshy/container-shell/basecolor.jpg?url';
import guardObj from './assets/Meshy/corner-guard/model.obj?url';
import guardMtl from './assets/Meshy/corner-guard/model.mtl?url';
import guardTexture from './assets/Meshy/corner-guard/basecolor.jpg?url';
import blockObj from './assets/Meshy/dunnage-block/model.obj?url';
import blockMtl from './assets/Meshy/dunnage-block/model.mtl?url';
import blockTexture from './assets/Meshy/dunnage-block/basecolor.jpg?url';
import airbagObj from './assets/Meshy/dunnage-airbag/model.obj?url';
import airbagMtl from './assets/Meshy/dunnage-airbag/model.mtl?url';
import airbagTexture from './assets/Meshy/dunnage-airbag/basecolor.jpg?url';

export const MESHY_MODEL_MANIFEST = {
  carton: { obj: cartonObj, mtl: cartonMtl, texture: cartonTexture },
  'wood-pallet': { obj: woodObj, mtl: woodMtl, texture: woodTexture },
  'plastic-pallet': { obj: plasticObj, mtl: plasticMtl, texture: plasticTexture },
  'truck-cab': { obj: truckObj, mtl: truckMtl, texture: truckTexture },
  'container-shell': { obj: shellObj, mtl: shellMtl, texture: shellTexture },
  'corner-guard': { obj: guardObj, mtl: guardMtl, texture: guardTexture },
  'dunnage-block': { obj: blockObj, mtl: blockMtl, texture: blockTexture },
  'dunnage-airbag': { obj: airbagObj, mtl: airbagMtl, texture: airbagTexture },
} as const;

export type ModelKey = keyof typeof MESHY_MODEL_MANIFEST;
export const MESHY_MODEL_KEYS = Object.keys(MESHY_MODEL_MANIFEST) as ModelKey[];

export interface MeshyModelPart {
  readonly geometry: BufferGeometry;
  readonly texture: Texture;
  readonly material: ShaderMaterial;
}

/** Cache-owned resources. Use createMeshyMaterial for per-scene tint/clipping. */
export interface MeshyModel {
  readonly key: ModelKey;
  readonly parts: readonly MeshyModelPart[];
  readonly bounds: Box3;
  readonly triangleCount: number;
}

export interface MeshyMaterialOptions {
  /** CSS/hex input uses Unity's gamma RGB values; Color input is copied as-is. */
  tint?: ColorRepresentation;
  /** World-space physical cargo volume discarded by container-shell's shader. */
  clipInterior?: Box3;
}

/** Convert display RGB without Three's automatic sRGB-to-linear conversion. */
export function meshyTint(tint: ColorRepresentation = 0xffffff): Color {
  if (typeof tint === 'string') return new Color().setStyle(tint, LinearSRGBColorSpace);
  if (typeof tint === 'number') return new Color().setHex(tint, LinearSRGBColorSpace);
  return tint.clone();
}

/**
 * CargoTextured.shader reproduced directly: original UV image × tint × the
 * same two directional terms. Unity ProjectSettings uses Gamma color space;
 * this shader deliberately has no Three tone mapping/output transfer step.
 * Standard normal/project chunks also support nonuniform InstancedMesh scale.
 * The returned material belongs to the caller; its texture does not.
 */
export function createMeshyMaterial(texture: Texture, options: MeshyMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    name: 'Cargo/Textured (Three comparison)',
    side: FrontSide,
    toneMapped: false,
    clipping: true,
    uniforms: {
      baseColorMap: { value: texture },
      tint: { value: meshyTint(options.tint) },
      clipInterior: { value: options.clipInterior ? 1 : 0 },
      cargoInteriorMin: { value: options.clipInterior?.min.clone() ?? new Vector3() },
      cargoInteriorMax: { value: options.clipInterior?.max.clone() ?? new Vector3() },
    },
    vertexShader: `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec2 vMeshyUv;
      varying vec3 vMeshyNormal;
      varying vec3 vMeshyWorld;
      varying vec3 vMeshyInstanceTint;
      void main() {
        vMeshyUv = uv;
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        vMeshyNormal = transformNormalByInverseViewMatrix(transformedNormal, viewMatrix);
        vec3 transformed = position;
        #include <project_vertex>
        #include <clipping_planes_vertex>
        vec4 world = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          world = instanceMatrix * world;
        #endif
        vMeshyWorld = (modelMatrix * world).xyz;
        vMeshyInstanceTint = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vMeshyInstanceTint = instanceColor;
        #endif
      }
    `,
    fragmentShader: `
      #include <clipping_planes_pars_fragment>
      uniform sampler2D baseColorMap;
      uniform vec3 tint;
      uniform float clipInterior;
      uniform vec3 cargoInteriorMin;
      uniform vec3 cargoInteriorMax;
      varying vec2 vMeshyUv;
      varying vec3 vMeshyNormal;
      varying vec3 vMeshyWorld;
      varying vec3 vMeshyInstanceTint;
      void main() {
        #include <clipping_planes_fragment>
        if (clipInterior > 0.5 && all(greaterThan(vMeshyWorld, cargoInteriorMin))
          && all(lessThan(vMeshyWorld, cargoInteriorMax))) discard;
        vec3 n = normalize(vMeshyNormal);
        float key = clamp(dot(n, normalize(vec3(0.4, 1.0, 0.6))), 0.0, 1.0);
        float fill = clamp(dot(n, normalize(vec3(-0.8, 0.4, -0.3))), 0.0, 1.0);
        vec3 rgb = texture2D(baseColorMap, vMeshyUv).rgb * tint * vMeshyInstanceTint;
        gl_FragColor = vec4(rgb * (0.53 + 0.38 * key + 0.09 * fill), 1.0);
      }
    `,
  });
}

/**
 * Normalize a whole model, never each part independently. Returns new geometry
 * so the caller's source is untouched. Reflection reproduces Unity's OBJ X
 * handedness conversion, including the shell's door moving from -X to +X.
 * No faces, vertices, normals or UVs are simplified, welded, or regenerated.
 */
export function normalizeMeshyGeometries(sources: readonly BufferGeometry[], mirrorX = true): {
  geometries: BufferGeometry[];
  bounds: Box3;
} {
  if (sources.length === 0) throw new Error('Meshy model has no geometry');
  const bounds = new Box3();
  const handedness = new Matrix4().makeScale(mirrorX ? -1 : 1, 1, 1);
  const geometries = sources.map((source) => source.clone());
  try {
    for (const geometry of geometries) {
      const position = geometry.getAttribute('position');
      if (!position || position.count === 0) throw new Error('Meshy model has no vertices');
      for (let i = 0; i < position.count; i++) {
        if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) {
          throw new Error('Meshy model has non-finite vertices');
        }
      }
      geometry.applyMatrix4(handedness);
      if (mirrorX) {
        // Keep each attribute paired with its original vertex. Reversing only
        // indices restores front-facing triangles after the negative scale.
        const original = geometry.index;
        const count = original?.count ?? position.count;
        if (count % 3 !== 0) throw new Error('Meshy geometry must contain complete triangles');
        const indices = new Array<number>(count);
        for (let i = 0; i < count; i += 3) {
          indices[i] = original?.getX(i) ?? i;
          indices[i + 1] = original?.getX(i + 2) ?? i + 2;
          indices[i + 2] = original?.getX(i + 1) ?? i + 1;
        }
        geometry.setIndex(indices);
      }
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
    }
    const size = bounds.getSize(new Vector3());
    if (![size.x, size.y, size.z].every((extent) => Number.isFinite(extent) && extent > 0)) {
      throw new Error('Meshy model must have finite, nonzero bounds on all axes');
    }
    const center = bounds.getCenter(new Vector3());
    const normalized = new Box3();
    const matrix = new Matrix4().makeScale(1 / size.x, 1 / size.y, 1 / size.z)
      .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    for (const geometry of geometries) {
      geometry.applyMatrix4(matrix);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      normalized.union(geometry.boundingBox!);
    }
    return { geometries, bounds: normalized };
  } catch (error) {
    geometries.forEach((geometry) => geometry.dispose());
    throw error;
  }
}

/** Parse the original OBJ, including every face and its exact UV association. */
export function parseMeshyGeometry(source: string): ReturnType<typeof normalizeMeshyGeometries> {
  const object = new OBJLoader().parse(source);
  const geometries: BufferGeometry[] = [];
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.applyMatrix4(child.matrixWorld);
    geometries.push(child.geometry);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
  try {
    // prepare-meshy.py already baked truck/pallet/carton orientation. Applying
    // those rotations again here would diverge from the current Unity models.
    return normalizeMeshyGeometries(geometries);
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
  }
}

const modelCache = new Map<ModelKey, Promise<MeshyModel>>();

async function fetchObj(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Meshy OBJ request failed (${response.status}): ${url}`);
  return response.text();
}

async function loadModel(key: ModelKey): Promise<MeshyModel> {
  const manifest = MESHY_MODEL_MANIFEST[key];
  // Every original MTL uses one white "meshy" material and map_Kd basecolor.jpg.
  // Tests assert that contract against all eight MTL files; no material/texture
  // substitutions or network requests to the original generation service occur.
  const [source, loadedTexture] = await Promise.allSettled([
    fetchObj(manifest.obj), new TextureLoader().loadAsync(manifest.texture),
  ]);
  if (source.status === 'rejected' || loadedTexture.status === 'rejected') {
    if (loadedTexture.status === 'fulfilled') loadedTexture.value.dispose();
    throw source.status === 'rejected' ? source.reason : (loadedTexture as PromiseRejectedResult).reason;
  }
  const texture = loadedTexture.value;
  texture.name = `Meshy/${key}/basecolor.jpg`;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.userData.meshyCacheOwned = true;
  try {
    const { geometries, bounds } = parseMeshyGeometry(source.value);
    geometries.forEach((geometry) => { geometry.userData.meshyCacheOwned = true; });
    const material = createMeshyMaterial(texture);
    material.name = `Meshy/${key}/shared prototype`;
    material.userData.meshyCacheOwned = true;
    return {
      key,
      parts: geometries.map((geometry) => ({ geometry, texture, material })),
      bounds,
      triangleCount: geometries.reduce((sum, geometry) => (
        sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3
      ), 0),
    };
  } catch (error) {
    texture.dispose();
    throw error;
  }
}

/**
 * Cache promises as well as results: simultaneous viewers issue one request.
 * Shared prototype resources intentionally live for the app/module lifetime.
 * Scenes dispose only their own materials, never returned geometry/texture.
 * Failed loads are evicted, so reopening the comparison can retry safely.
 */
export function loadMeshyModel(key: ModelKey): Promise<MeshyModel> {
  if (!Object.hasOwn(MESHY_MODEL_MANIFEST, key)) return Promise.reject(new Error(`Unknown Meshy model: ${key}`));
  const cached = modelCache.get(key);
  if (cached) return cached;
  const pending = loadModel(key).catch((error: unknown) => {
    modelCache.delete(key);
    throw error;
  });
  modelCache.set(key, pending);
  return pending;
}

/** Most scenes can instead load only the keys they actually display. */
export async function loadThreeComparisonModels(): Promise<Record<ModelKey, MeshyModel>> {
  const models = await Promise.all(MESHY_MODEL_KEYS.map(loadMeshyModel));
  return Object.fromEntries(models.map((model) => [model.key, model])) as Record<ModelKey, MeshyModel>;
}
