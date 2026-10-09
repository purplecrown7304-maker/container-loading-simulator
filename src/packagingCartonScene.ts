import { Box3, DoubleSide, Group, Mesh, Plane, Vector3 } from 'three';
import { createMeshyMaterial, type MeshyModel } from './threeComparisonModels';

/** Existing Meshy closed carton, opened by display-only clipping. Not a new Meshy generation. */
export function createPackagingCartonScene(source: MeshyModel, inner: number[], outer: number[], scale: number) {
  if (source.key !== 'carton' || !Number.isFinite(scale) || scale <= 0
    || inner.length !== 3 || outer.length !== 3
    || [...inner, ...outer].some(v => !Number.isFinite(v) || v <= 0)
    || inner.some((v, i) => v > outer[i])) throw new Error('Invalid carton display dimensions');
  const [l, w, h] = inner.map(v => v / scale);
  const interior = new Box3(new Vector3(-l / 2, -h / 2, -w / 2), new Vector3(l / 2, h / 2, w / 2));
  const materials = source.parts.map(part => {
    const material = createMeshyMaterial(part.texture, { clipInterior: interior });
    material.side = DoubleSide;
    // Cut at the physical inner surfaces: top, front and camera-facing right.
    // No source faces/UVs are changed and no model geometry enters the product volume.
    material.clippingPlanes = [
      new Plane(new Vector3(0, -1, 0), h / 2),
      new Plane(new Vector3(0, 0, -1), w / 2),
      new Plane(new Vector3(-1, 0, 0), l / 2),
    ];
    return material;
  });
  const object = new Group();
  object.name = 'Meshy carton · open cutaway';
  source.parts.forEach((part, i) => object.add(new Mesh(part.geometry, materials[i])));
  object.scale.set(outer[0] / scale, outer[2] / scale, outer[1] / scale);
  return { object, dispose: () => materials.forEach(material => material.dispose()) };
}
