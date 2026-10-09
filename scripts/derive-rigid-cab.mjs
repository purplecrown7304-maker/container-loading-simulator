// Deterministic, local derivative of the user's Meshy tractor. Keeps the front
// cab/front axle and its original UVs/textures; removes fifth wheel/rear axles.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = 'public/models/vehicles/', input = 'cargo-container-tractor-v2-web.glb', output = 'cargo-rigid-heavy-cab-v1.glb';
const bytes = readFileSync(dir + input), n = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + n));
const bin = bytes.subarray(28 + n), primitive = json.meshes[0].primitives[0];
function data(index) {
  const a = json.accessors[index], v = json.bufferViews[a.bufferView], components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  if (v.byteStride) throw new Error('Expected packed source');
  const size = a.componentType === 5123 ? 2 : 4, start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const copy = Uint8Array.from(bin.subarray(start, start + a.count * components * size)).buffer;
  return a.componentType === 5126 ? new Float32Array(copy) : a.componentType === 5123 ? new Uint16Array(copy) : new Uint32Array(copy);
}
const p = data(primitive.attributes.POSITION), indices = data(primitive.indices), kept = [], vertices = new Map();
for (let i = 0; i < indices.length; i += 3) {
  const t = Array.from(indices.subarray(i, i + 3));
  if (!t.every(v => p[v * 3] <= -.28)) continue;
  for (const v of t) { if (!vertices.has(v)) vertices.set(v, vertices.size); kept.push(vertices.get(v)); }
}
const views = [], accessors = [], chunks = []; let offset = 0;
function view(buffer) {
  const padded = Buffer.alloc(Math.ceil(buffer.length / 4) * 4); buffer.copy(padded);
  const id = views.length; views.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length }); chunks.push(padded); offset += padded.length; return id;
}
for (const image of json.images) { const v = json.bufferViews[image.bufferView]; image.bufferView = view(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)); }
for (const [name, original] of Object.entries(primitive.attributes)) {
  const a = json.accessors[original], old = data(original), count = { VEC2: 2, VEC3: 3 }[a.type];
  const next = new Float32Array(vertices.size * count);
  for (const [v, k] of vertices) next.set(old.subarray(v * count, (v + 1) * count), k * count);
  const accessor = { bufferView: view(Buffer.from(next.buffer)), componentType: 5126, count: vertices.size, type: a.type };
  if (name === 'POSITION') {
    accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < next.length; i++) { const axis = i % 3; accessor.min[axis] = Math.min(accessor.min[axis], next[i]); accessor.max[axis] = Math.max(accessor.max[axis], next[i]); }
  }
  primitive.attributes[name] = accessors.length; accessors.push(accessor);
}
const nextIndex = new Uint16Array(kept); primitive.indices = accessors.length;
accessors.push({ bufferView: view(Buffer.from(nextIndex.buffer)), componentType: 5123, count: kept.length, type: 'SCALAR' });
json.bufferViews = views; json.accessors = accessors; json.buffers = [{ byteLength: offset }];
json.asset.extras = { derivative: 'Front cab/front axle only', source: input, cutX: -.28 };
const js = Buffer.from(JSON.stringify(json)), jp = Buffer.alloc(Math.ceil(js.length / 4) * 4, 32); js.copy(jp);
const bp = Buffer.concat(chunks), header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jp.length + bp.length, 8); header.writeUInt32LE(jp.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bp.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, jp, bh, bp]); writeFileSync(dir + output, result);
const provenance = JSON.parse(readFileSync(dir + 'provenance.json'));
provenance.rigid_cab_derivative = { filename: output, source_filename: input, source_sha256: createHash('sha256').update(bytes).digest('hex'), sha256: createHash('sha256').update(result).digest('hex'), triangles: kept.length / 3, retained_vertices: vertices.size, cut_x: -.28, original_uv_textures: true, purpose: 'Representative medium/heavy rigid cab, not an exact manufacturer replica' };
writeFileSync(dir + 'provenance.json', JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ size: result.length, triangles: kept.length / 3, bounds: accessors[primitive.attributes.POSITION], sha256: provenance.rigid_cab_derivative.sha256 }));
