import { isARules } from './loadingRuleset';
import { validateAPlan } from './loadSimAdapter';
import { cargoWithUnloadingPolicy } from './unloadingPolicy';
import { CONTACT_TOLERANCE_M, MIN_SUPPORT_RATIO, supportContactArea } from './support';
import { findMatchingEquipment } from '../transportEquipment';
import type { CargoItem, ContainerSpec, OperationalRuleFinding, Placement } from './types';

const EPS = 1e-6;
const HEIGHT_TOLERANCE_M = CONTACT_TOLERANCE_M;
const CG_LONG_TOLERANCE = 0.05;
const CG_LAT_TOLERANCE = 0.05;
const CG_HEIGHT_RATIO = 0.5;
const GAP_WARNING_M = 0.15;
const DEFAULT_FRICTION = 0.45;
const ACCEL = { forward: 0.8, rearward: 0.5, sideways: 0.5 };

export type OperationalSupport = {
  id: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  weightKg: number;
};

type Body = {
  kind: 'cargo' | 'support';
  placement: Placement;
  cargo?: CargoItem;
  cargoIndex?: number;
};

type SupportLink = { bodyIndex: number; area: number };

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function overlapsVolume(a: Placement, b: Placement) {
  return overlap1d(a.x, a.x + a.length, b.x, b.x + b.length) > EPS
    && overlap1d(a.y, a.y + a.width, b.y, b.y + b.width) > EPS
    && overlap1d(a.z, a.z + a.height, b.z, b.z + b.height) > EPS;
}

function cargoIndexes(bodies: Body[], indexes: number[]) {
  return indexes.flatMap(index => bodies[index]?.cargoIndex == null ? [] : [bodies[index].cargoIndex!]);
}

function finding(
  code: string,
  severity: OperationalRuleFinding['severity'],
  message: string,
  placementIndexes: number[] = [],
  value?: number,
  limit?: number,
): OperationalRuleFinding {
  return { code, severity, message, placementIndexes: [...new Set(placementIndexes)], value, limit };
}

function equipmentFor(container: ContainerSpec) {
  return findMatchingEquipment(container.length, container.width, container.height, container.maxPayloadKg);
}

function buildBodies(cargo: CargoItem[], placements: Placement[], supports: OperationalSupport[] = []) {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const bodies: Body[] = placements.map((placement, cargoIndex) => ({
    kind: 'cargo',
    placement,
    cargo: cargoMap.get(placement.cargoId),
    cargoIndex,
  }));
  for (const support of supports) {
    bodies.push({
      kind: 'support',
      placement: {
        cargoId: support.id,
        x: support.x,
        y: support.y,
        z: support.z,
        length: support.length,
        width: support.width,
        height: support.height,
        weightKg: support.weightKg,
      },
    });
  }
  return bodies;
}

function supportersOf(bodies: Body[]) {
  return bodies.map((body, index) => {
    const p = body.placement;
    const links: SupportLink[] = [];
    if (p.z <= HEIGHT_TOLERANCE_M) return links;
    for (let j = 0; j < bodies.length; j += 1) {
      if (j === index) continue;
      const below = bodies[j].placement;
      const area = supportContactArea(below, p);
      if (area > 0) links.push({ bodyIndex: j, area });
    }
    return links;
  });
}

function checkBounds(container: ContainerSpec, bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  bodies.forEach((body, index) => {
    const p = body.placement;
    const outside = p.x < -EPS || p.y < -EPS || p.z < -EPS
      || p.x + p.length > container.length + EPS
      || p.y + p.width > container.width + EPS
      || p.z + p.height > container.height + EPS;
    if (outside) {
      out.push(finding(
        'OUT_OF_BOUNDS',
        'error',
        `${p.cargoId}: 적재 공간 경계를 벗어났습니다.`,
        cargoIndexes(bodies, [index]),
      ));
    }
  });
  return out;
}

function checkOverlap(bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      if (!overlapsVolume(bodies[i].placement, bodies[j].placement)) continue;
      out.push(finding(
        'OVERLAP',
        'error',
        `${bodies[i].placement.cargoId}와 ${bodies[j].placement.cargoId}가 겹칩니다.`,
        cargoIndexes(bodies, [i, j]),
      ));
    }
  }
  return out;
}

function checkDoor(container: ContainerSpec, bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const equipment = equipmentFor(container);
  const doorWidth = equipment?.doorWidth;
  const doorHeight = equipment?.doorHeight;
  if (doorWidth == null || doorHeight == null) return out;

  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo') return;
    const p = body.placement;
    if (p.width > doorWidth + EPS || p.height > doorHeight + EPS) {
      out.push(finding(
        'DOOR_NOT_PASSABLE',
        'error',
        `${p.cargoId}: 도어 개구 ${Math.round(doorWidth * 1000)}×${Math.round(doorHeight * 1000)}mm를 통과할 수 없습니다.`,
        cargoIndexes(bodies, [index]),
      ));
    }
  });
  return out;
}

function checkSupport(bodies: Body[], supporters: SupportLink[][]) {
  const out: OperationalRuleFinding[] = [];
  bodies.forEach((body, index) => {
    // Elevated pallet decks are physical loads too. Treating them as unconditional
    // supports would hide an unsafe deck even when its own cartons are supported.
    const p = body.placement;
    if (p.z <= HEIGHT_TOLERANCE_M) return;

    const baseArea = p.length * p.width;
    const links = supporters[index];
    const supported = links.reduce((sum, link) => sum + link.area, 0);
    const ratio = supported / Math.max(EPS, baseArea);
    if (ratio + EPS < MIN_SUPPORT_RATIO) {
      out.push(finding(
        links.length ? 'INSUFFICIENT_SUPPORT' : 'FLOATING',
        'error',
        `${p.cargoId}: 지지율 ${(ratio * 100).toFixed(1)}%로 기준 ${MIN_SUPPORT_RATIO * 100}% 미만입니다.`,
        cargoIndexes(bodies, [index, ...links.map(link => link.bodyIndex)]),
        ratio,
        MIN_SUPPORT_RATIO,
      ));
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const link of links) {
      const q = bodies[link.bodyIndex].placement;
      minX = Math.min(minX, Math.max(p.x, q.x));
      maxX = Math.max(maxX, Math.min(p.x + p.length, q.x + q.length));
      minY = Math.min(minY, Math.max(p.y, q.y));
      maxY = Math.max(maxY, Math.min(p.y + p.width, q.y + q.width));
    }
    const cgX = p.x + p.length / 2;
    const cgY = p.y + p.width / 2;
    if (cgX < minX - EPS || cgX > maxX + EPS || cgY < minY - EPS || cgY > maxY + EPS) {
      out.push(finding(
        'CG_OUTSIDE_SUPPORT',
        'error',
        `${p.cargoId}: 무게중심 투영점이 지지 영역 밖에 있습니다.`,
        cargoIndexes(bodies, [index, ...links.map(link => link.bodyIndex)]),
      ));
    }
  });
  return out;
}

function checkStacking(bodies: Body[], supporters: SupportLink[][]) {
  const out: OperationalRuleFinding[] = [];
  const upper = bodies.map(() => [] as number[]);
  supporters.forEach((links, index) => links.forEach(link => upper[link.bodyIndex].push(index)));
  const depth = bodies.map(() => 1);
  const height = bodies.map(() => 1);
  const order = bodies.map((_, index) => index)
    .sort((a, b) => bodies[a].placement.z - bodies[b].placement.z);
  // A physical pallet/deck is a support surface, not another carton layer.
  for (const index of order) for (const link of supporters[index]) {
    if (bodies[link.bodyIndex].kind === 'cargo') depth[index] = Math.max(depth[index], depth[link.bodyIndex] + 1);
  }
  for (const index of [...order].reverse()) for (const next of upper[index]) {
    if (bodies[next].kind === 'cargo') height[index] = Math.max(height[index], height[next] + 1);
  }

  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo') return;
    const layers = Math.max(depth[index], height[index]);
    const maxLayers = body.cargo?.strengthUnverified ? Math.min(1,body.cargo.maxStackLayers ?? 1) : body.cargo?.maxStackLayers;
    if (maxLayers != null && layers > maxLayers) {
      out.push(finding('STACK_LIMIT', 'error', `${body.placement.cargoId}: 혼합 화물을 포함한 최대 적층단을 초과했습니다.`,
        cargoIndexes(bodies, [index]), layers, maxLayers));
    }
    const maxTop = body.cargo?.strengthUnverified ? 0 : body.cargo?.maxTopLoadKg;
    const maxPressure = body.cargo?.maxTopPressureKgPerM2;
    if (maxTop == null && maxPressure == null) return;
    // Match candidate/final legacy safety: each supporting box carries the full
    // load of every reachable descendant, counted once. Area-based sharing
    // assumes a load-distribution model that this engine does not establish.
    const descendants = new Set<number>();
    const queue = [...upper[index]];
    while (queue.length) {
      const next = queue.pop()!;
      if (descendants.has(next)) continue;
      descendants.add(next);
      queue.push(...upper[next]);
    }
    const carried = [...descendants].reduce((sum, next) => sum + bodies[next].placement.weightKg, 0);
    if (maxTop != null && carried > maxTop + EPS) {
      out.push(finding(
        maxTop <= EPS ? 'NO_STACK_ON_TOP' : 'TOP_LOAD_EXCEEDED',
        'error',
        `${body.placement.cargoId}: 누적 상부하중 ${carried.toFixed(1)}kg이 허용 ${maxTop}kg을 초과했습니다.`,
        cargoIndexes(bodies, [index]),
        carried,
        maxTop,
      ));
    }
    if (maxPressure != null && carried > maxPressure * body.placement.length * body.placement.width + EPS) {
      out.push(finding('TOP_PRESSURE_LIMIT','error',`${body.placement.cargoId}: 누적 상부 압력이 허용 면적하중을 초과했습니다.`,
        cargoIndexes(bodies,[index]),carried / (body.placement.length * body.placement.width),maxPressure));
    }
  });
  return out;
}

function checkUnloadOrder(bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const cargoBodies = bodies
    .map((body, bodyIndex) => ({ body, bodyIndex }))
    .filter(row => row.body.kind === 'cargo' && (row.body.cargo?.unloadPriority ?? 0) > 0);

  for (const current of cargoBodies) {
    const a = current.body.placement;
    const priority = current.body.cargo!.unloadPriority!;
    const blockers: number[] = [];
    const above: number[] = [];
    for (const later of cargoBodies) {
      if (later.bodyIndex === current.bodyIndex) continue;
      const laterPriority = later.body.cargo!.unloadPriority!;
      if (laterPriority <= priority) continue;
      const b = later.body.placement;
      const xy = overlap1d(a.x, a.x + a.length, b.x, b.x + b.length) > EPS
        && overlap1d(a.y, a.y + a.width, b.y, b.y + b.width) > EPS;
      const yz = overlap1d(a.y, a.y + a.width, b.y, b.y + b.width) > EPS
        && overlap1d(a.z, a.z + a.height, b.z, b.z + b.height) > EPS;
      if (b.z >= a.z + a.height - HEIGHT_TOLERANCE_M && xy) above.push(later.bodyIndex);
      if (b.x >= a.x + a.length - EPS && yz) blockers.push(later.bodyIndex);
    }
    if (above.length) {
      out.push(finding(
        'UNLOAD_BLOCKED_ABOVE',
        'error',
        `${a.cargoId}: 먼저 하역해야 하지만 나중 하역 화물이 위를 막고 있습니다.`,
        cargoIndexes(bodies, [current.bodyIndex, ...above]),
      ));
    }
    if (blockers.length) {
      out.push(finding(
        'UNLOAD_BLOCKED',
        'error',
        `${a.cargoId}: 도어 방향 반출 경로가 나중 하역 화물에 막혀 있습니다.`,
        cargoIndexes(bodies, [current.bodyIndex, ...blockers]),
      ));
    }
  }
  return out;
}

function cargoOnly(bodies: Body[]) {
  return bodies.filter(body => body.kind === 'cargo');
}

function checkWeightAndCog(container: ContainerSpec, bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const cargoBodies = cargoOnly(bodies);
  const weight = cargoBodies.reduce((sum, body) => sum + body.placement.weightKg, 0);
  if (weight > container.maxPayloadKg + EPS) {
    out.push(finding(
      'PAYLOAD_EXCEEDED',
      'error',
      `화물 총중량 ${weight.toFixed(1)}kg이 허용 ${container.maxPayloadKg.toFixed(1)}kg을 초과했습니다.`,
      [],
      weight,
      container.maxPayloadKg,
    ));
  }
  if (weight <= EPS) return out;

  const cg = cargoBodies.reduce((acc, body) => {
    const p = body.placement;
    acc.x += (p.x + p.length / 2) * p.weightKg;
    acc.y += (p.y + p.width / 2) * p.weightKg;
    acc.z += (p.z + p.height / 2) * p.weightKg;
    return acc;
  }, { x: 0, y: 0, z: 0 });
  cg.x /= weight; cg.y /= weight; cg.z /= weight;

  const longDev = Math.abs(cg.x - container.length / 2);
  // Weight-proportional: identical to the legacy limit at full payload, wider for light loads.
  const longLimit = Math.min(container.length / 2, container.length * CG_LONG_TOLERANCE * Math.max(1, container.maxPayloadKg / weight));
  if (longDev > longLimit + EPS) {
    out.push(finding(
      'CG_LONGITUDINAL',
      'error',
      `길이 방향 무게중심 편차 ${(longDev * 1000).toFixed(0)}mm가 허용 ±${(longLimit * 1000).toFixed(0)}mm를 넘습니다.`,
      [],
      longDev,
      longLimit,
    ));
  }

  const latDev = Math.abs(cg.y - container.width / 2);
  const latLimit = container.width * CG_LAT_TOLERANCE;
  if (latDev > latLimit + EPS) {
    out.push(finding(
      'CG_LATERAL',
      'error',
      `폭 방향 무게중심 편차 ${(latDev * 1000).toFixed(0)}mm가 허용 ±${(latLimit * 1000).toFixed(0)}mm를 넘습니다.`,
      [],
      latDev,
      latLimit,
    ));
  }

  const highLimit = container.height * CG_HEIGHT_RATIO;
  if (cg.z > highLimit + EPS) {
    out.push(finding(
      'CG_HIGH',
      'warning',
      `무게중심 높이 ${(cg.z * 1000).toFixed(0)}mm가 권장 한도 ${(highLimit * 1000).toFixed(0)}mm를 넘습니다.`,
      [],
      cg.z,
      highLimit,
    ));
  }
  return out;
}

/** Exact legacy operational weight/CG checks without rebuilding support graphs. */
export function validateOperationalWeightAndCog(container: ContainerSpec, placements: Placement[]): OperationalRuleFinding[] {
  return checkWeightAndCog(container, placements.map((placement, cargoIndex) => ({ kind: 'cargo', placement, cargoIndex })));
}

function checkSecuring(container: ContainerSpec, bodies: Body[], supporters: SupportLink[][]) {
  const out: OperationalRuleFinding[] = [];
  const cargoBodies = cargoOnly(bodies);
  const maxX = cargoBodies.reduce((max, body) => Math.max(max, body.placement.x + body.placement.length), 0);
  const rearGap = cargoBodies.length ? Math.max(0, container.length - maxX) : 0;
  if (rearGap > GAP_WARNING_M + EPS) {
    out.push(finding(
      'REAR_GAP',
      'warning',
      `도어 쪽 빈 공간이 ${(rearGap * 1000).toFixed(0)}mm입니다. 블로킹·에어백·래싱 고정을 검토하세요.`,
      [],
      rearGap,
      GAP_WARNING_M,
    ));
  }

  bodies.forEach((body, bodyIndex) => {
    if (body.kind !== 'cargo' || supporters[bodyIndex].length > 0 || body.placement.z > HEIGHT_TOLERANCE_M) return;
    const p = body.placement;
    // Contact restraint: a face within 30 mm of a wall or neighbouring cargo is blocked.
    const near = 0.03;
    const blocked = (axis: 'x' | 'y', positive: boolean) => {
      const face = axis === 'x' ? (positive ? p.x + p.length : p.x) : (positive ? p.y + p.width : p.y);
      const wall = positive ? (axis === 'x' ? container.length : container.width) : 0;
      if (Math.abs(wall - face) <= near) return true;
      return cargoBodies.some(other => {
        const q = other.placement;
        if (q === p || overlap1d(p.z, p.z + p.height, q.z, q.z + q.height) <= EPS) return false;
        const gap = axis === 'x' ? (positive ? q.x - face : face - (q.x + q.length)) : (positive ? q.y - face : face - (q.y + q.width));
        const lateral = axis === 'x' ? overlap1d(p.y, p.y + p.width, q.y, q.y + q.width) : overlap1d(p.x, p.x + p.length, q.x, q.x + q.length);
        return gap >= -EPS && gap <= near && lateral > EPS;
      });
    };
    const xOpen = !blocked('x', true) || !blocked('x', false);
    const yOpen = !blocked('y', true) || !blocked('y', false);
    if (!xOpen && !yOpen) return;
    const hcg = p.height / 2;
    const forwardTip = xOpen && ACCEL.forward * hcg > p.length / 2;
    const sideTip = yOpen && ACCEL.sideways * hcg > p.width / 2;
    if (forwardTip || sideTip) {
      out.push(finding(
        'TIPPING_RISK',
        'warning',
        `${p.cargoId}: ${sideTip ? '측방' : '전방'} 전도 위험이 있어 블로킹 또는 래싱이 필요합니다.`,
        cargoIndexes(bodies, [bodyIndex]),
      ));
    }
    const requiredForwardDaN = Math.max(0, (ACCEL.forward - DEFAULT_FRICTION) * p.weightKg * 9.81 / 10);
    if (xOpen && requiredForwardDaN > EPS) {
      out.push(finding(
        'SECURING_FORCE',
        'warning',
        `${p.cargoId}: 전방 필요 고정력 약 ${requiredForwardDaN.toFixed(1)}daN입니다.`,
        cargoIndexes(bodies, [bodyIndex]),
        requiredForwardDaN,
      ));
    }
  });
  return out;
}

function checkAfterStops(bodies: Body[], initialSupporters: SupportLink[][]) {
  const priorities = [...new Set(
    bodies.flatMap(body => body.kind === 'cargo' && (body.cargo?.unloadPriority ?? 0) > 0
      ? [body.cargo!.unloadPriority!]
      : []),
  )].sort((a, b) => a - b);
  if (priorities.length < 2) return [] as OperationalRuleFinding[];

  const upper = bodies.map(() => [] as number[]);
  initialSupporters.forEach((links,index)=>links.forEach(link=>upper[link.bodyIndex].push(index)));
  const cargoAboveSupport = new Map<Body, Set<number>>();
  bodies.forEach((body,index)=>{
    if (body.kind !== 'support') return;
    const visited = new Set<number>();
    const cargo = new Set<number>();
    const queue = [...upper[index]];
    while (queue.length) {
      const next = queue.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      if (bodies[next].kind === 'cargo') cargo.add(next);
      queue.push(...upper[next]);
    }
    cargoAboveSupport.set(body,cargo);
  });

  const out: OperationalRuleFinding[] = [];
  for (const priority of priorities.slice(0, -1)) {
    const remainingCargo = new Set(bodies.flatMap((body,index)=>body.kind === 'cargo'
      && (body.cargo?.unloadPriority == null || body.cargo.unloadPriority > priority) ? [index] : []));
    // Pallets with no remaining supported cargo leave with their unloaded cargo.
    // Retain every support in a remaining cargo chain so removing early-stop
    // cartons cannot conceal an unsupported later-stop pallet above them.
    const remaining = bodies.filter((body,index)=>body.kind === 'cargo' ? remainingCargo.has(index)
      : [...(cargoAboveSupport.get(body) ?? [])].some(cargoIndex=>remainingCargo.has(cargoIndex)));
    const supporters = supportersOf(remaining);
    for (const issue of checkSupport(remaining, supporters)) {
      if (issue.severity !== 'error') continue;
      out.push({ ...issue, code: `AFTER_STOP_${issue.code}`, message: `하역 순서 ${priority} 완료 후: ${issue.message}` });
    }
  }
  return out;
}

export function validateOperationalLoading(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
  supports: OperationalSupport[] = [],
): OperationalRuleFinding[] {
  if (isARules(container)) return validateAPlan(container, cargo, placements, supports);
  if (!placements.length && !supports.length) return [];
  const bodies = buildBodies(cargoWithUnloadingPolicy(container,cargo), placements, supports);
  const supporters = supportersOf(bodies);
  return [
    ...checkBounds(container, bodies),
    ...checkOverlap(bodies),
    ...checkDoor(container, bodies),
    ...checkSupport(bodies, supporters),
    ...checkStacking(bodies, supporters),
    ...checkUnloadOrder(bodies).map(issue => container.unloadingPolicy === 'soft'
      ? { ...issue, severity: 'warning' as const, message: `${issue.message} 완화 모드: 현장 재취급이 필요합니다.` } : issue),
    ...checkWeightAndCog(container, bodies),
    ...checkSecuring(container, bodies, supporters),
    ...checkAfterStops(bodies, supporters),
  ];
}

export function operationalErrors(findings: OperationalRuleFinding[]) {
  return findings.filter(finding => finding.severity === 'error');
}
