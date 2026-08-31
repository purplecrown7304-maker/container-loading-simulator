import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';

const EPS = 1e-9;
const BEAM_WIDTH = 6;
const MAX_SPACES = 10;
const MAX_CANDIDATES = 24;
const MAX_VARIANTS = 6;
const MAX_STEPS = 96;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const volumeOfItem = (item: CargoItem) => item.length * item.width * item.height;

export type BeamPackingStrategy = 'capacity' | 'stability' | 'unloading';
export type BeamPackingOutput = {
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>;
  loadedWeightKg: number;
  usedVolumeM3: number;
};

type Space = { x: number; y: number; z: number; length: number; width: number; height: number };
type Orientation = { boxLength: number; boxWidth: number; rotated: boolean };
type Block = Orientation & {
  item: CargoItem;
  nx: number;
  ny: number;
  nz: number;
  quantity: number;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  volumeM3: number;
};
type Candidate = { block: Block; space: Space; x: number; y: number; z: number; score: number };
type State = {
  placements: Placement[];
  spaces: Space[];
  remaining: Map<string, number>;
  loadedWeightKg: number;
  usedVolumeM3: number;
  loadedCount: number;
};
type Context = {
  container: ContainerSpec;
  cargo: CargoItem[];
  cargoById: Map<string, CargoItem>;
  strategy: BeamPackingStrategy;
  requestedVolumeM3: number;
  requestedCount: number;
  maxUnitWeightKg: number;
  unloadMin: number;
  unloadMax: number;
};

function orientations(item: CargoItem): Orientation[] {
  const normal = { boxLength: item.length, boxWidth: item.width, rotated: false };
  if (item.allowRotation === false || Math.abs(item.length - item.width) <= EPS) return [normal];
  return [normal, { boxLength: item.width, boxWidth: item.length, rotated: true }];
}

function fitCount(available: number, size: number) {
  return size > 0 ? Math.floor((available + EPS) / size) : 0;
}

function safeLayers(item: CargoItem) {
  let limit = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
  if (item.maxTopLoadKg !== undefined) {
    const topLoadLimit = 1 + Math.floor((Math.max(0, item.maxTopLoadKg) + EPS) / Math.max(item.weightKg, EPS));
    limit = Math.min(limit, topLoadLimit);
  }
  return Math.max(1, limit);
}

function countOptions(max: number) {
  if (max < 1) return [];
  return [...new Set([max, Math.max(1, max - 1), Math.max(1, Math.ceil(max / 2)), 1])].sort((a, b) => b - a);
}

function blocksFor(item: CargoItem, remaining: number, space: Space, allowSingles: boolean): Block[] {
  const all: Block[] = [];
  for (const orientation of orientations(item)) {
    const maxX = fitCount(space.length, orientation.boxLength);
    const maxY = fitCount(space.width, orientation.boxWidth);
    const maxZ = Math.min(fitCount(space.height, item.height), safeLayers(item));
    if (maxX < 1 || maxY < 1 || maxZ < 1) continue;
    const variants: Block[] = [];
    const seen = new Set<string>();
    for (const nx of countOptions(maxX)) for (const ny of countOptions(maxY)) for (const nz of countOptions(maxZ)) {
      const quantity = nx * ny * nz;
      if (quantity > remaining || (!allowSingles && quantity < 2)) continue;
      const key = `${orientation.rotated ? 1 : 0}:${nx}:${ny}:${nz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push({
        ...orientation, item, nx, ny, nz, quantity,
        length: round6(nx * orientation.boxLength),
        width: round6(ny * orientation.boxWidth),
        height: round6(nz * item.height),
        weightKg: item.weightKg * quantity,
        volumeM3: volumeOfItem(item) * quantity,
      });
    }
    variants.sort((a, b) => b.quantity - a.quantity || b.volumeM3 - a.volumeM3 || b.nz - a.nz || b.length * b.width - a.length * a.width);
    all.push(...variants.slice(0, MAX_VARIANTS));
  }
  return all;
}

function unitsOf(block: Block, x: number, y: number, z: number): Placement[] {
  const units: Placement[] = [];
  for (let iz = 0; iz < block.nz; iz += 1) for (let ix = 0; ix < block.nx; ix += 1) for (let iy = 0; iy < block.ny; iy += 1) {
    units.push({
      cargoId: block.item.id,
      x: round6(x + ix * block.boxLength),
      y: round6(y + iy * block.boxWidth),
      z: round6(z + iz * block.item.height),
      length: block.boxLength,
      width: block.boxWidth,
      height: block.item.height,
      weightKg: block.item.weightKg,
      rotated: block.rotated,
    });
  }
  return units;
}

function occupied(candidate: Candidate): Placement {
  return {
    cargoId: candidate.block.item.id,
    x: candidate.x, y: candidate.y, z: candidate.z,
    length: candidate.block.length, width: candidate.block.width, height: candidate.block.height,
    weightKg: candidate.block.weightKg, rotated: candidate.block.rotated,
  };
}

function physicallyValid(candidate: Candidate, state: State, context: Context) {
  const block = candidate.block;
  if (state.loadedWeightKg + block.weightKg > context.container.maxPayloadKg + EPS) return false;
  const box = occupied(candidate);
  if (!isInsideContainer(context.container, box)) return false;
  if (state.placements.some((p) => overlaps(box, p))) return false;
  const units = unitsOf(block, candidate.x, candidate.y, candidate.z);
  const staged = [...state.placements];
  for (const unit of units) {
    if (!isInsideContainer(context.container, unit) || staged.some((p) => overlaps(unit, p))) return false;
    if (unit.z > EPS && !hasAdequateSupport(unit, staged)) return false;
    if (!canPlaceByStackingRules(block.item, unit, staged, context.cargoById)) return false;
    staged.push(unit);
  }
  return true;
}

function spaceVolume(space: Space) {
  return Math.max(0, space.length) * Math.max(0, space.width) * Math.max(0, space.height);
}

function unloadTarget(item: CargoItem, context: Context): number | null {
  if (context.unloadMax <= context.unloadMin || !Number.isFinite(item.unloadPriority)) return null;
  return 1 - (((item.unloadPriority as number) - context.unloadMin) / (context.unloadMax - context.unloadMin));
}

function estimatedCog(state: State, candidate: Candidate) {
  const p = occupied(candidate);
  const total = state.loadedWeightKg + candidate.block.weightKg;
  if (total <= EPS) return { x: 0.5, y: 0.5, z: 0 };
  let sx = (p.x + p.length / 2) * candidate.block.weightKg;
  let sy = (p.y + p.width / 2) * candidate.block.weightKg;
  let sz = (p.z + p.height / 2) * candidate.block.weightKg;
  for (const item of state.placements) {
    sx += (item.x + item.length / 2) * item.weightKg;
    sy += (item.y + item.width / 2) * item.weightKg;
    sz += (item.z + item.height / 2) * item.weightKg;
  }
  return { x: sx / total, y: sy / total, z: sz / total };
}

function candidateScore(candidate: Candidate, state: State, context: Context) {
  const block = candidate.block;
  const containerVolume = Math.max(EPS, context.container.length * context.container.width * context.container.height);
  const fill = block.volumeM3 / Math.max(EPS, spaceVolume(candidate.space));
  const blockRatio = block.volumeM3 / containerVolume;
  const xNorm = (candidate.x + block.length / 2) / Math.max(EPS, context.container.length);
  const zNorm = (candidate.z + block.height / 2) / Math.max(EPS, context.container.height);
  const weightRank = block.item.weightKg / Math.max(EPS, context.maxUnitWeightKg);
  const cog = estimatedCog(state, candidate);
  const cogX = cog.x / Math.max(EPS, context.container.length);
  const cogY = cog.y / Math.max(EPS, context.container.width);
  let contact = candidate.z <= EPS ? 1 : 0;
  if (candidate.x <= EPS) contact += 0.7;
  if (candidate.y <= EPS || candidate.y + block.width >= context.container.width - EPS) contact += 0.4;

  let score = blockRatio * 950 + fill * 90 + block.quantity * 0.35 + contact * 12;
  score -= xNorm * 3;
  score -= zNorm * (12 + weightRank * 28);
  score -= Math.abs(cogX - 0.5) * 22 + Math.abs(cogY - 0.5) * 30;
  if (context.strategy === 'capacity') score += fill * 40 + blockRatio * 250;
  if (context.strategy === 'stability') score -= zNorm * 40 + Math.abs(cogY - 0.5) * 24;
  if (context.strategy === 'unloading') {
    const target = unloadTarget(block.item, context);
    if (target !== null) score -= Math.abs(xNorm - target) * 90;
  }
  return score;
}

function candidateList(state: State, context: Context, allowSingles: boolean) {
  const candidates: Candidate[] = [];
  const spaces = [...state.spaces].sort((a, b) => a.z - b.z || a.x - b.x || spaceVolume(b) - spaceVolume(a) || a.y - b.y).slice(0, MAX_SPACES);
  for (const space of spaces) for (const item of context.cargo) {
    const left = state.remaining.get(item.id) ?? 0;
    if (left <= 0) continue;
    for (const block of blocksFor(item, left, space, allowSingles)) {
      const yOptions = [...new Set([round6(space.y), round6(space.y + space.width - block.width)])];
      for (const y of yOptions) {
        if (y < space.y - EPS || y + block.width > space.y + space.width + EPS) continue;
        const candidate: Candidate = { block, space, x: space.x, y, z: space.z, score: 0 };
        if (!physicallyValid(candidate, state, context)) continue;
        candidate.score = candidateScore(candidate, state, context);
        candidates.push(candidate);
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score || b.block.quantity - a.block.quantity || a.block.item.id.localeCompare(b.block.item.id) || a.x - b.x || a.y - b.y || a.z - b.z).slice(0, MAX_CANDIDATES);
}

function intersects(space: Space, p: Placement) {
  return !(space.x + space.length <= p.x + EPS || p.x + p.length <= space.x + EPS || space.y + space.width <= p.y + EPS || p.y + p.width <= space.y + EPS || space.z + space.height <= p.z + EPS || p.z + p.height <= space.z + EPS);
}

function subtract(space: Space, p: Placement): Space[] {
  if (!intersects(space, p)) return [space];
  const x2 = space.x + space.length, y2 = space.y + space.width, z2 = space.z + space.height;
  const px2 = p.x + p.length, py2 = p.y + p.width, pz2 = p.z + p.height;
  return [
    { x: space.x, y: space.y, z: space.z, length: p.x - space.x, width: space.width, height: space.height },
    { x: px2, y: space.y, z: space.z, length: x2 - px2, width: space.width, height: space.height },
    { x: space.x, y: space.y, z: space.z, length: space.length, width: p.y - space.y, height: space.height },
    { x: space.x, y: py2, z: space.z, length: space.length, width: y2 - py2, height: space.height },
    { x: space.x, y: space.y, z: space.z, length: space.length, width: space.width, height: p.z - space.z },
    { x: space.x, y: space.y, z: pz2, length: space.length, width: space.width, height: z2 - pz2 },
  ].filter((s) => s.length > EPS && s.width > EPS && s.height > EPS).map((s) => ({ ...s, x: round6(s.x), y: round6(s.y), z: round6(s.z), length: round6(s.length), width: round6(s.width), height: round6(s.height) }));
}

function contains(outer: Space, inner: Space) {
  return inner.x >= outer.x - EPS && inner.y >= outer.y - EPS && inner.z >= outer.z - EPS && inner.x + inner.length <= outer.x + outer.length + EPS && inner.y + inner.width <= outer.y + outer.width + EPS && inner.z + inner.height <= outer.z + outer.height + EPS;
}

function nextSpaces(spaces: Space[], p: Placement) {
  const unique = new Map<string, Space>();
  for (const s of spaces.flatMap((space) => subtract(space, p))) unique.set([s.x, s.y, s.z, s.length, s.width, s.height].join('|'), s);
  const values = [...unique.values()];
  return values.filter((s, i) => !values.some((other, j) => i !== j && contains(other, s) && spaceVolume(other) > spaceVolume(s) + EPS));
}

function apply(state: State, candidate: Candidate): State {
  const left = new Map(state.remaining);
  left.set(candidate.block.item.id, (left.get(candidate.block.item.id) ?? 0) - candidate.block.quantity);
  return {
    placements: [...state.placements, ...unitsOf(candidate.block, candidate.x, candidate.y, candidate.z)],
    spaces: nextSpaces(state.spaces, occupied(candidate)),
    remaining: left,
    loadedWeightKg: state.loadedWeightKg + candidate.block.weightKg,
    usedVolumeM3: state.usedVolumeM3 + candidate.block.volumeM3,
    loadedCount: state.loadedCount + candidate.block.quantity,
  };
}

function weightMetrics(container: ContainerSpec, placements: Placement[]) {
  const total = placements.reduce((sum, p) => sum + p.weightKg, 0);
  if (total <= EPS) return { nx: 0.5, ny: 0.5, nz: 0, maxHalfRatio: 0 };
  let sx = 0, sy = 0, sz = 0, inner = 0;
  for (const p of placements) {
    const cx = p.x + p.length / 2, cy = p.y + p.width / 2, cz = p.z + p.height / 2;
    sx += cx * p.weightKg; sy += cy * p.weightKg; sz += cz * p.weightKg;
    if (cx <= container.length / 2 + EPS) inner += p.weightKg;
  }
  const half = inner / total;
  return { nx: sx / total / container.length, ny: sy / total / container.width, nz: sz / total / container.height, maxHalfRatio: Math.max(half, 1 - half) };
}

function stateScore(state: State, context: Context) {
  const containerVolume = Math.max(EPS, context.container.length * context.container.width * context.container.height);
  const utilization = state.usedVolumeM3 / containerVolume;
  const demandCompletion = state.usedVolumeM3 / Math.max(EPS, context.requestedVolumeM3);
  const countCompletion = state.loadedCount / Math.max(1, context.requestedCount);
  const w = weightMetrics(context.container, state.placements);
  const balance = clamp01(1 - Math.abs(w.nx - 0.5) * 1.4 - Math.abs(w.ny - 0.5) * 2);
  const lowCog = clamp01(1 - Math.max(0, w.nz - 0.32) * 1.8);
  const halfPenalty = Math.max(0, w.maxHalfRatio - 0.6) * 700 * clamp01(demandCompletion / 0.5);
  let score = utilization * 850 + clamp01(demandCompletion) * 360 + countCompletion * 120 + balance * 75 + lowCog * 70 - halfPenalty - Math.min(80, state.spaces.length * 0.32);
  if (context.strategy === 'capacity') score += utilization * 240;
  if (context.strategy === 'stability') score += balance * 110 + lowCog * 130;
  return score;
}

function signature(state: State) {
  const remaining = [...state.remaining.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, q]) => `${id}:${q}`).join(',');
  const tail = state.placements.slice(-8).map((p) => `${p.cargoId}@${p.x},${p.y},${p.z}`).join(';');
  return `${remaining}|${tail}`;
}

function trim(states: State[], context: Context) {
  const unique = new Map<string, State>();
  for (const state of states) {
    const key = signature(state);
    const old = unique.get(key);
    if (!old || stateScore(state, context) > stateScore(old, context)) unique.set(key, state);
  }
  return [...unique.values()].sort((a, b) => stateScore(b, context) - stateScore(a, context) || b.usedVolumeM3 - a.usedVolumeM3 || b.loadedCount - a.loadedCount).slice(0, BEAM_WIDTH);
}

function phase(initial: State[], context: Context, allowSingles: boolean) {
  let beam = trim(initial, context);
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const expanded: State[] = [];
    let moved = false;
    for (const state of beam) {
      const candidates = candidateList(state, context, allowSingles);
      if (!candidates.length) expanded.push(state);
      else {
        moved = true;
        for (const candidate of candidates) expanded.push(apply(state, candidate));
      }
    }
    beam = trim(expanded, context);
    if (!moved || beam.every((state) => [...state.remaining.values()].every((q) => q <= 0))) break;
  }
  return beam;
}

export function packByBlockSpaceBeam(container: ContainerSpec, cargo: CargoItem[], strategy: BeamPackingStrategy): BeamPackingOutput {
  const ordered = [...cargo].sort((a, b) => a.id.localeCompare(b.id));
  const priorities = ordered.map((i) => i.unloadPriority).filter((v): v is number => Number.isFinite(v));
  const context: Context = {
    container, cargo: ordered, cargoById: new Map(ordered.map((i) => [i.id, i])), strategy,
    requestedVolumeM3: ordered.reduce((sum, i) => sum + volumeOfItem(i) * i.quantity, 0),
    requestedCount: ordered.reduce((sum, i) => sum + i.quantity, 0),
    maxUnitWeightKg: Math.max(EPS, ...ordered.map((i) => i.weightKg)),
    unloadMin: priorities.length ? Math.min(...priorities) : 0,
    unloadMax: priorities.length ? Math.max(...priorities) : 0,
  };
  const initial: State = {
    placements: [], spaces: [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }],
    remaining: new Map(ordered.map((i) => [i.id, i.quantity])), loadedWeightKg: 0, usedVolumeM3: 0, loadedCount: 0,
  };

  // 논문식 1차: 동일 SKU 직육면체 블록. 2차: 같은 EMS/Beam 탐색에 단품까지 풀어 잔여 빈 공간을 혼합 적재한다.
  const blockBeam = phase([initial], context, false);
  const finalBeam = phase(blockBeam, context, true);
  const best = trim(finalBeam, context)[0] ?? initial;
  const remaining = ordered.flatMap((item) => {
    const quantity = Math.max(0, best.remaining.get(item.id) ?? 0);
    if (!quantity) return [];
    return [{
      cargoId: item.id,
      quantity,
      reason: best.loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS
        ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함'
        : '블록·최대 빈 공간·회전·경계·지지·적층단·상부 허용중량 조건을 동시에 만족하는 안전한 위치를 찾지 못함',
    }];
  });
  return { placements: best.placements, remaining, loadedWeightKg: best.loadedWeightKg, usedVolumeM3: best.usedVolumeM3 };
}
