/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Color, FrontSide, Texture, TextureLoader, Vector3 } from 'three';
import provenance from '../docs/meshy-models.json';
import {
  MESHY_MODEL_KEYS,
  MESHY_MODEL_MANIFEST,
  createMeshyMaterial,
  loadMeshyModel,
  meshyTint,
  normalizeMeshyGeometries,
  parseMeshyGeometry,
  type ModelKey,
} from './threeComparisonModels';

const assetFile = (key: ModelKey, file: string) => resolve(process.cwd(), 'unity/Assets/Resources/Meshy', key, file);
const source = (key: ModelKey) => readFileSync(assetFile(key, 'model.obj'), 'utf8');

// Snapshot only the original JPEG bytes; no texture resampling or replacement
// is permitted when comparing these Unity models in the Three viewer.
const textureHashes: Record<ModelKey, string> = {
  carton: 'a6635fe9e48938ffd71b1439b2b9493895af2f6d3c3ca9d5cc71106af4b37cdd',
  'container-shell': '4cea409d49574f8461036ca3a46f3067fda8bed7f2cd7a0ec18fbbbff3c9d334',
  'corner-guard': 'efece015f3568f8df4a16d6548588de7189564179412fb1497d1359a1ce713f0',
  'dunnage-airbag': 'c8e95c9422053add4af2602068f9601c7e7e916d10684986db3eb8ce252394b7',
  'dunnage-block': '8eae91c2f707aadcf220d9e820d4b61a1169e28bf0adadc231c2e363fce16cfd',
  'plastic-pallet': '1c8548dac62526589bc3e20b4235ed705471c86f38f274dbd6d52149f5f965d1',
  'truck-cab': 'd97210ce3800aaf60f2c8e8cd5d161ab380fb5cbb79556ad76c0ca1fcb39fbe7',
  'wood-pallet': '620ad28172b68ba2692ca9f103cc7b6844e681d7546d3177a9d81a6deea567fe',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('original Unity Meshy asset parity', () => {
  it('lists exactly the same eight roles as the Unity asset manifest', () => {
    expect([...MESHY_MODEL_KEYS].sort()).toEqual(provenance.models.map((model) => model.key).sort());
  });

  for (const key of MESHY_MODEL_KEYS) {
    it(`${key}: keeps every triangle and UV, with Unity handedness and unit-centered bounds`, () => {
      const obj = source(key);
      const parsed = parseMeshyGeometry(obj);
      const expected = provenance.models.find((model) => model.key === key)!;
      expect(parsed.geometries).toHaveLength(1);
      const geometry = parsed.geometries[0];
      expect(geometry.index!.count / 3).toBe(expected.triangles);
      expect(parsed.bounds.min.toArray()).toEqual([-.5, -.5, -.5]);
      expect(parsed.bounds.max.toArray()).toEqual([.5, .5, .5]);

      const positions: number[][] = [];
      const uvs: number[][] = [];
      const expectedPositions: number[] = [];
      const expectedUvs: number[] = [];
      for (const line of obj.split('\n')) {
        const [kind, ...data] = line.trim().split(/\s+/);
        if (kind === 'v') positions.push(data.map(Number));
        if (kind === 'vt') uvs.push(data.map(Number));
        if (kind !== 'f') continue;
        expect(data).toHaveLength(3);
        for (const vertex of [data[0], data[2], data[1]]) {
          const [positionIndex, uvIndex] = vertex.split('/').map(Number);
          const [x, y, z] = positions[positionIndex - 1];
          expectedPositions.push(-x, y, z);
          expectedUvs.push(...uvs[uvIndex - 1]);
        }
      }
      const actualPositions: number[] = [];
      const actualUvs: number[] = [];
      for (let i = 0; i < geometry.index!.count; i++) {
        const index = geometry.index!.getX(i);
        const position = geometry.getAttribute('position');
        const uv = geometry.getAttribute('uv');
        actualPositions.push(position.getX(index), position.getY(index), position.getZ(index));
        actualUvs.push(uv.getX(index), uv.getY(index));
      }
      expect(new Float32Array(actualPositions)).toEqual(new Float32Array(expectedPositions));
      expect(new Float32Array(actualUvs)).toEqual(new Float32Array(expectedUvs));
      geometry.dispose();
    });

    it(`${key}: uses the original MTL and unchanged JPEG bytes`, () => {
      expect(readFileSync(assetFile(key, 'model.mtl'), 'utf8').trim()).toBe(
        'newmtl meshy\nKd 1 1 1\nKa 1 1 1\nmap_Kd basecolor.jpg',
      );
      const jpeg = readFileSync(assetFile(key, 'basecolor.jpg'));
      expect(createHash('sha256').update(jpeg).digest('hex')).toBe(textureHashes[key]);
      expect(MESHY_MODEL_MANIFEST[key].obj).toContain(`/Meshy/${key}/model.obj`);
      expect(MESHY_MODEL_MANIFEST[key].texture).toContain(`/Meshy/${key}/basecolor.jpg`);
    });
  }
});

describe('model transforms and resource ownership', () => {
  it('normalizes whole multi-part models without recentering each part or mutating sources', () => {
    const left = new BoxGeometry(2, 4, 6).translate(-3, 8, 2);
    const right = new BoxGeometry(2, 4, 6).translate(3, 8, 2);
    const originalLeft = Array.from(left.getAttribute('position').array);
    const originalUv = Array.from(left.getAttribute('uv').array);
    const normalized = normalizeMeshyGeometries([left, right]);
    expect(normalized.bounds.min.toArray()).toEqual([-.5, -.5, -.5]);
    expect(normalized.bounds.max.toArray()).toEqual([.5, .5, .5]);
    expect(normalized.geometries[0].boundingBox!.min.x).toBe(.25);
    expect(normalized.geometries[1].boundingBox!.max.x).toBe(-.25);
    expect(Array.from(left.getAttribute('position').array)).toEqual(originalLeft);
    expect(Array.from(normalized.geometries[0].getAttribute('uv').array)).toEqual(originalUv);
    expect(normalized.geometries[0].index!.array.slice(0, 3)).toEqual(
      new Uint16Array([left.index!.getX(0), left.index!.getX(2), left.index!.getX(1)]),
    );
    [left, right, ...normalized.geometries].forEach((geometry) => geometry.dispose());
  });

  it('rejects empty or degenerate models rather than displaying invalid scales', () => {
    expect(() => normalizeMeshyGeometries([])).toThrow('no geometry');
    const flat = new BoxGeometry(1, 0, 1);
    expect(() => normalizeMeshyGeometries([flat])).toThrow('nonzero bounds');
    flat.dispose();
  });

  it('creates independent tint/clipping uniforms without transferring ownership of the texture', () => {
    const texture = new Texture<HTMLImageElement>();
    const box = new Box3(new Vector3(-1, 0, -2), new Vector3(1, 3, 2));
    const one = createMeshyMaterial(texture, { tint: '#808080', clipInterior: box });
    const two = createMeshyMaterial(texture);
    expect(one.uniforms.baseColorMap.value).toBe(texture);
    expect(two.uniforms.baseColorMap.value).toBe(texture);
    expect(one.uniforms.tint.value.r).toBe(128 / 255);
    expect(one.uniforms.cargoInteriorMin.value).not.toBe(box.min);
    expect(one.uniforms.clipInterior.value).toBe(1);
    expect(two.uniforms.clipInterior.value).toBe(0);
    one.uniforms.tint.value.setRGB(0, 0, 0);
    expect(two.uniforms.tint.value).toEqual(new Color(1, 1, 1));
    expect(one.toneMapped).toBe(false);
    expect(one.side).toBe(FrontSide);
    const textureDisposed = vi.fn();
    texture.addEventListener('dispose', textureDisposed);
    one.dispose();
    two.dispose();
    expect(textureDisposed).not.toHaveBeenCalled();
    texture.dispose();
    expect(meshyTint('#808080').r).toBe(128 / 255);
  });

  it('shares concurrent and repeated successful requests', async () => {
    const texture = new Texture<HTMLImageElement>();
    const fetchMock = vi.fn().mockResolvedValue(new Response(source('carton')));
    vi.stubGlobal('fetch', fetchMock);
    const textureLoad = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture);
    const first = loadMeshyModel('carton');
    const second = loadMeshyModel('carton');
    expect(first).toBe(second);
    const model = await first;
    expect(await loadMeshyModel('carton')).toBe(model);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(textureLoad).toHaveBeenCalledTimes(1);
    expect(model.triangleCount).toBe(469);
    expect(model.parts[0].texture).toBe(texture);
    expect(model.parts[0].geometry.userData.meshyCacheOwned).toBe(true);
  });

  it('evicts failed requests and disposes a texture when the matching OBJ fails', async () => {
    const failedTexture = new Texture<HTMLImageElement>();
    const disposed = vi.fn();
    failedTexture.addEventListener('dispose', disposed);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response(source('dunnage-airbag')));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(TextureLoader.prototype, 'loadAsync')
      .mockResolvedValueOnce(failedTexture)
      .mockResolvedValueOnce(new Texture<HTMLImageElement>());
    await expect(loadMeshyModel('dunnage-airbag')).rejects.toThrow('404');
    expect(disposed).toHaveBeenCalledOnce();
    const model = await loadMeshyModel('dunnage-airbag');
    expect(model.triangleCount).toBe(1041);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
