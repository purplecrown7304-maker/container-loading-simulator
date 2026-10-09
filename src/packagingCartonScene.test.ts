/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DoubleSide, Mesh, Texture } from 'three';
import { createPackagingCartonScene } from './packagingCartonScene';
import { createMeshyMaterial, parseMeshyGeometry, type MeshyModel } from './threeComparisonModels';

describe('Meshy carton open cutaway', () => {
  it('fits actual box dimensions, preserves original assets and clears the physical interior', () => {
    const { geometries, bounds } = parseMeshyGeometry(readFileSync(resolve('src/assets/Meshy/carton/model.obj'), 'utf8'));
    const texture = new Texture(); const prototype = createMeshyMaterial(texture);
    const source: MeshyModel = { key: 'carton', bounds, parts: geometries.map(geometry => ({ geometry, texture, material: prototype })), triangleCount: 469 };
    const before = geometries.map(g => Array.from(g.getAttribute('position').array));
    const geometryDispose = vi.spyOn(geometries[0], 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    const a = createPackagingCartonScene(source, [.227, .122, .257], [.235, .130, .265], .265);
    const b = createPackagingCartonScene(source, [.227, .122, .257], [.235, .130, .265], .265);
    expect(a.object.scale.toArray()).toEqual([.235 / .265, 1, .130 / .265]);
    const mesh = a.object.children[0] as Mesh;
    expect(mesh.geometry).toBe(geometries[0]);
    expect(mesh.material).not.toBe(prototype); expect(mesh.material).not.toBe((b.object.children[0] as Mesh).material);
    const material = mesh.material as ReturnType<typeof createMeshyMaterial>;
    expect(material.side).toBe(DoubleSide); expect(material.clippingPlanes).toHaveLength(3);
    expect(material.uniforms.clipInterior.value).toBe(1);
    expect(material.uniforms.cargoInteriorMax.value.toArray()).toEqual([.227 / .265 / 2, .257 / .265 / 2, .122 / .265 / 2]);
    expect(geometries.map(g => Array.from(g.getAttribute('position').array))).toEqual(before);
    a.dispose(); b.dispose();
    expect(geometryDispose).not.toHaveBeenCalled(); expect(textureDispose).not.toHaveBeenCalled();
    geometries.forEach(g => g.dispose()); texture.dispose(); prototype.dispose();
  });
});
