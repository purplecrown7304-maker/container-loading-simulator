import type { CargoItem, ContainerSpec, Placement } from './types';
import { isInsideContainer, overlaps } from './constraints';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';

const EPS = 1e-9;
const TOUCH = 0.0015;
const GLOBAL_BEAM_WIDTH = 8;
const WALL_BEAM_WIDTH = 14;
const MAX_DEPTHS = 20;
const MAX_WALL_PLANS = 8;
const MAX_WALL_STEPS = 18;
const MAX_GLOBAL_STEPS = 80;
const MAX_TOP_STEPS = 200;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const volumeOfItem = (item: CargoItem) => item.length * item.width * item.height;

export type StrictWallStrategy = 'capacity' | 'stability' | 'unloading';
export type StrictWallOutput = {
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>;
  loadedWeightKg: number;
  usedVolumeM3: number;
};

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
type Lane = { block: Block; y: number };
type WallLocal = {
  usedWidth: number;
  remaining: Map<string, number>;
  lanes: Lane[];
  weightKg: number;
  volumeM3: number;
  loadedCount: number;
};
type WallPlan = WallLocal & { depth: number; score: number };
type State = {
  xFront: number;
  placements: Placement[];
  remaining: Map<string, number>;
  loadedWeightKg: number;
  usedVolumeM3: number;
  loadedCount: number;
};
type Context = {
  container: ContainerSpec;
  cargo: CargoItem[];
  cargoById: Map<string, CargoItem>;
  strategy: StrictWallStrategy;
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
    limit = Math.min(limit, 1 + Math.floor((Math.max(0, item.maxTopLoadKg) + EPS) / Math.max(item.weightKg, EPS)));
  }
  return Math.max(1, limit);
}

function countOptions(max: number) {
  if (max < 1) return [];
  return [...new Set([max, Math.max(1, max - 1), Math.max(1, Math.ceil(max / 2)), 1])].sort((a, b) => b - a);
}

function depthCandidates(state: State, context: Context) {
  const room = context.container.length - state.xFront;
  const values = new Set<number>();
  for (const item of context.cargo) {
    const left = state.remaining.get(item.id) ?? 0;
    if (left <= 0) continue;
    for (const o of orientations(item)) {
      const maxNx = Math.min(fitCount(room, o.boxLength), Math.max(1, Math.min(8, left)));
      for (const nx of countOptions(maxNx)) {
        const depth = round6(nx * o.boxLength);
        if (depth > EPS && depth <= room + EPS) values.add(depth);
      }
    }
  }
  return [...values].sort((a, b) => a - b).slice(0, MAX_DEPTHS);
}

function blockOptionsForDepth(
  depth: number,
  widthLeft: number,
  remaining: Map<string, number>,
  context: Context,
) {
  const blocks: Block[] = [];
  for (const item of context.cargo) {
    const left = remaining.get(item.id) ?? 0;
    if (left <= 0) continue;
    for (const o of orientations(item)) {
      const nx = Math.round(depth / Math.max(EPS, o.boxLength));
      if (nx < 1 || Math.abs(nx * o.boxLength - depth) > 0.00001) continue;
      const maxNy = fitCount(widthLeft, o.boxWidth);
      if (maxNy < 1) continue;
      const maxByHeight = Math.min(fitCount(context.container.height, item.height), safeLayers(item));
      for (const ny of countOptions(maxNy)) {
        const footprintUnits = nx * ny;
        if (footprintUnits > left) continue;
        const maxNz = Math.min(maxByHeight, Math.floor(left / footprintUnits));
        for (const nz of countOptions(maxNz)) {
          const quantity = footprintUnits * nz;
          if (quantity < 1 || quantity > left) continue;
          blocks.push({
            ...o,
            item,
            nx,
            ny,
            nz,
            quantity,
            length: depth,
            width: round6(ny * o.boxWidth),
            height: round6(nz * item.height),
            weightKg: quantity * item.weightKg,
            volumeM3: quantity * volumeOfItem(item),
          });
        }
      }
    }
  }
  return blocks.sort((a, b) =>
    b.width - a.width
    || b.volumeM3 - a.volumeM3
    || b.height - a.height
    || b.item.weightKg - a.item.weightKg
    || a.item.id.localeCompare(b.item.id),
  ).slice(0, 36);
}

function localScore(local: WallLocal, depth: number, context: Context) {
  const widthFill = clamp01(local.usedWidth / Math.max(EPS, context.container.width));
  const wallVolume = Math.max(EPS, depth * context.container.width * context.container.height);
  const volumeFill = clamp01(local.volumeM3 / wallVolume);
  const edgeVoid = 1 - widthFill;
  const fragmentation = Math.max(0, local.lanes.length - 1);
  return widthFill * 760 + volumeFill * 420 + local.loadedCount * 0.15 - edgeVoid * 520 - fragmentation * 0.25;
}

function localSignature(local: WallLocal) {
  const remaining = [...local.remaining.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, q]) => `${id}:${q}`).join(',');
  return `${round6(local.usedWidth)}|${remaining}`;
}

function trimLocal(states: WallLocal[], depth: number, context: Context) {
  const unique = new Map<string, WallLocal>();
  for (const state of states) {
    const key = localSignature(state);
    const old = unique.get(key);
    if (!old || localScore(state, depth, context) > localScore(old, depth, context)) unique.set(key, state);
  }
  return [...unique.values()]
    .sort((a, b) => localScore(b, depth, context) - localScore(a, depth, context) || b.usedWidth - a.usedWidth || b.volumeM3 - a.volumeM3)
    .slice(0, WALL_BEAM_WIDTH);
}

function buildWallPlans(state: State, context: Context): WallPlan[] {
  const payloadLeft = context.container.maxPayloadKg - state.loadedWeightKg;
  if (payloadLeft <= EPS) return [];
  const plans: WallPlan[] = [];

  for (const depth of depthCandidates(state, context)) {
    let beam: WallLocal[] = [{
      usedWidth: 0,
      remaining: new Map(state.remaining),
      lanes: [],
      weightKg: 0,
      volumeM3: 0,
      loadedCount: 0,
    }];

    for (let step = 0; step < MAX_WALL_STEPS; step += 1) {
      let moved = false;
      const expanded: WallLocal[] = [];
      for (const local of beam) {
        const widthLeft = context.container.width - local.usedWidth;
        const options = blockOptionsForDepth(depth, widthLeft, local.remaining, context)
          .filter((block) => local.weightKg + block.weightKg <= payloadLeft + EPS);
        if (!options.length) {
          expanded.push(local);
          continue;
        }
        moved = true;
        for (const block of options) {
          const remaining = new Map(local.remaining);
          remaining.set(block.item.id, Math.max(0, (remaining.get(block.item.id) ?? 0) - block.quantity));
          expanded.push({
            usedWidth: round6(local.usedWidth + block.width),
            remaining,
            lanes: [...local.lanes, { block, y: local.usedWidth }],
            weightKg: local.weightKg + block.weightKg,
            volumeM3: local.volumeM3 + block.volumeM3,
            loadedCount: local.loadedCount + block.quantity,
          });
        }
      }
      beam = trimLocal(expanded, depth, context);
      if (!moved || beam.every((b) => context.container.width - b.usedWidth <= TOUCH)) break;
    }

    for (const local of beam) {
      if (!local.lanes.length) continue;
      const widthFill = local.usedWidth / Math.max(EPS, context.container.width);
      // 화물 사이 내부 통로는 구조적으로 불가능하다. 남는 폭은 y+ 측벽 한 곳에만 존재한다.
      // 너무 좁은 한 줄만 앞으로 돌출되는 벽은 제외해 전도/이동 여유를 줄인다.
      if (widthFill < 0.5) continue;
      plans.push({ ...local, depth, score: localScore(local, depth, context) });
    }
  }

  return plans.sort((a, b) => b.score - a.score || b.usedWidth - a.usedWidth || b.volumeM3 - a.volumeM3 || a.depth - b.depth).slice(0, MAX_WALL_PLANS);
}

function blockPlacements(block: Block, x0: number, y0: number): Placement[] {
  const placements: Placement[] = [];
  for (let iz = 0; iz < block.nz; iz += 1) {
    for (let ix = 0; ix < block.nx; ix += 1) {
      for (let iy = 0; iy < block.ny; iy += 1) {
        placements.push({
          cargoId: block.item.id,
          x: round6(x0 + ix * block.boxLength),
          y: round6(y0 + iy * block.boxWidth),
          z: round6(iz * block.item.height),
          length: block.boxLength,
          width: block.boxWidth,
          height: block.item.height,
          weightKg: block.item.weightKg,
          rotated: block.rotated,
        });
      }
    }
  }
  return placements;
}

function applyWall(state: State, plan: WallPlan, context: Context): State | null {
  const additions = plan.lanes.flatMap((lane) => blockPlacements(lane.block, state.xFront, lane.y));
  if (additions.some((p) => !isInsideContainer(context.container, p))) return null;
  if (additions.some((p, i) => state.placements.some((q) => overlaps(p, q)) || additions.slice(0, i).some((q) => overlaps(p, q)))) return null;
  return {
    xFront: round6(state.xFront + plan.depth),
    placements: [...state.placements, ...additions],
    remaining: new Map(plan.remaining),
    loadedWeightKg: state.loadedWeightKg + plan.weightKg,
    usedVolumeM3: state.usedVolumeM3 + plan.volumeM3,
    loadedCount: state.loadedCount + plan.loadedCount,
  };
}

function weightMetrics(container: ContainerSpec, placements: Placement[]) {
  const total = placements.reduce((sum, p) => sum + p.weightKg, 0);
  if (total <= EPS) return { nx: 0.5, ny: 0.5, nz: 0 };
  let sx = 0, sy = 0, sz = 0;
  for (const p of placements) {
    sx += (p.x + p.length / 2) * p.weightKg;
    sy += (p.y + p.width / 2) * p.weightKg;
    sz += (p.z + p.height / 2) * p.weightKg;
  }
  return {
    nx: sx / total / Math.max(EPS, container.length),
    ny: sy / total / Math.max(EPS, container.width),
    nz: sz / total / Math.max(EPS, container.height),
  };
}

function stateScore(state: State, context: Context) {
  const containerVolume = Math.max(EPS, context.container.length * context.container.width * context.container.height);
  const utilization = state.usedVolumeM3 / containerVolume;
  const completion = state.usedVolumeM3 / Math.max(EPS, context.requestedVolumeM3);
  const w = weightMetrics(context.container, state.placements);
  const lateralBalance = clamp01(1 - Math.abs(w.ny - 0.5) * 1.7);
  const lowCog = clamp01(1 - Math.max(0, w.nz - 0.32) * 1.8);
  let score = utilization * 1000 + clamp01(completion) * 420 + state.loadedCount * 0.08 + lateralBalance * 70 + lowCog * 70;
  if (context.strategy === 'capacity') score += utilization * 260;
  if (context.strategy === 'stability') score += lateralBalance * 100 + lowCog * 130;
  return score;
}

function stateSignature(state: State) {
  const remaining = [...state.remaining.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, q]) => `${id}:${q}`).join(',');
  return `${state.xFront}|${remaining}`;
}

function trimStates(states: State[], context: Context) {
  const unique = new Map<string, State>();
  for (const state of states) {
    const key = stateSignature(state);
    const old = unique.get(key);
    if (!old || stateScore(state, context) > stateScore(old, context)) unique.set(key, state);
  }
  return [...unique.values()].sort((a, b) => stateScore(b, context) - stateScore(a, context) || b.usedVolumeM3 - a.usedVolumeM3).slice(0, GLOBAL_BEAM_WIDTH);
}

function exactFootprintMatch(a: Placement, item: CargoItem, rotated: boolean) {
  const length = rotated ? item.width : item.length;
  const width = rotated ? item.length : item.width;
  return Math.abs(a.length - length) <= TOUCH && Math.abs(a.width - width) <= TOUCH;
}

function topFill(state: State, context: Context) {
  let current = state;
  for (let step = 0; step < MAX_TOP_STEPS; step += 1) {
    let best: { placement: Placement; item: CargoItem; score: number } | null = null;
    for (const item of context.cargo) {
      if ((current.remaining.get(item.id) ?? 0) <= 0) continue;
      if (current.loadedWeightKg + item.weightKg > context.container.maxPayloadKg + EPS) continue;
      for (const support of current.placements) {
        const supportTop = support.z + support.height;
        for (const rotated of item.allowRotation === false ? [false] : [false, true]) {
          if (!exactFootprintMatch(support, item, rotated)) continue;
          const candidate: Placement = {
            cargoId: item.id,
            x: support.x,
            y: support.y,
            z: round6(supportTop),
            length: rotated ? item.width : item.length,
            width: rotated ? item.length : item.width,
            height: item.height,
            weightKg: item.weightKg,
            rotated,
          };
          if (!isInsideContainer(context.container, candidate)) continue;
          if (current.placements.some((p) => overlaps(candidate, p))) continue;
          if (!hasAdequateSupport(candidate, current.placements, undefined, 0.999)) continue;
          if (!canPlaceByStackingRules(item, candidate, current.placements, context.cargoById)) continue;
          const weightRank = item.weightKg / Math.max(EPS, context.maxUnitWeightKg);
          const zNorm = (candidate.z + candidate.height / 2) / Math.max(EPS, context.container.height);
          const score = -zNorm * 90 - weightRank * zNorm * 80 + (support.cargoId === item.id ? 35 : 0);
          if (!best || score > best.score || (Math.abs(score - best.score) <= EPS && item.id.localeCompare(best.item.id) < 0)) {
            best = { placement: candidate, item, score };
          }
        }
      }
    }
    if (!best) break;
    const remaining = new Map(current.remaining);
    remaining.set(best.item.id, Math.max(0, (remaining.get(best.item.id) ?? 0) - 1));
    current = {
      ...current,
      placements: [...current.placements, best.placement],
      remaining,
      loadedWeightKg: current.loadedWeightKg + best.item.weightKg,
      usedVolumeM3: current.usedVolumeM3 + volumeOfItem(best.item),
      loadedCount: current.loadedCount + 1,
    };
  }
  return current;
}

export function packByStrictWalls(container: ContainerSpec, cargo: CargoItem[], strategy: StrictWallStrategy): StrictWallOutput {
  const ordered = [...cargo].sort((a, b) => a.id.localeCompare(b.id));
  const priorities = ordered.map((i) => i.unloadPriority).filter((v): v is number => Number.isFinite(v));
  const context: Context = {
    container,
    cargo: ordered,
    cargoById: new Map(ordered.map((i) => [i.id, i])),
    strategy,
    requestedVolumeM3: ordered.reduce((sum, i) => sum + volumeOfItem(i) * i.quantity, 0),
    requestedCount: ordered.reduce((sum, i) => sum + i.quantity, 0),
    maxUnitWeightKg: Math.max(EPS, ...ordered.map((i) => i.weightKg)),
    unloadMin: priorities.length ? Math.min(...priorities) : 0,
    unloadMax: priorities.length ? Math.max(...priorities) : 0,
  };

  const initial: State = {
    xFront: 0,
    placements: [],
    remaining: new Map(ordered.map((i) => [i.id, i.quantity])),
    loadedWeightKg: 0,
    usedVolumeM3: 0,
    loadedCount: 0,
  };

  let beam = [initial];
  for (let step = 0; step < MAX_GLOBAL_STEPS; step += 1) {
    const expanded: State[] = [];
    let moved = false;
    for (const state of beam) {
      if ([...state.remaining.values()].every((q) => q <= 0)) {
        expanded.push(state);
        continue;
      }
      const plans = buildWallPlans(state, context);
      if (!plans.length) {
        expanded.push(state);
        continue;
      }
      for (const plan of plans) {
        const next = applyWall(state, plan, context);
        if (next) {
          moved = true;
          expanded.push(next);
        }
      }
    }
    beam = trimStates(expanded, context);
    if (!moved) break;
  }

  let best = trimStates(beam, context)[0] ?? initial;
  best = topFill(best, context);

  const remaining = ordered.flatMap((item) => {
    const quantity = Math.max(0, best.remaining.get(item.id) ?? 0);
    if (!quantity) return [];
    return [{
      cargoId: item.id,
      quantity,
      reason: best.loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS
        ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함'
        : '화물 사이 내부 빈 통로를 만들지 않는 연속 벽 적재 또는 동일 바닥면 100% 지지 적층 위치를 찾지 못함',
    }];
  });

  return {
    placements: best.placements,
    remaining,
    loadedWeightKg: best.loadedWeightKg,
    usedVolumeM3: best.usedVolumeM3,
  };
}
