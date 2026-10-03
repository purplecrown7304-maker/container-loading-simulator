import { findMatchingEquipment } from '../transportEquipment';
import { allowedCargoOrientations, isForkliftCargo, orientationFromPlacement } from './cargoOrientation';
import type { AxleModel, CargoItem, ContainerSpec, OperationalRuleFinding, Placement } from './types';

const EPS = 1e-6;
const HEIGHT_TOLERANCE_M = 0.005;
const MIN_SUPPORT_RATIO = 0.8;
const CG_LONG_TOLERANCE = 0.05;
const CG_LAT_TOLERANCE = 0.05;
const CG_HEIGHT_RATIO = 0.5;
const GAP_WARNING_M = 0.15;
const FORKLIFT_CLEARANCE_M = 0.08;
const DEFAULT_FRICTION = 0.45;
const LEGAL_AXLE_LOAD_KG = 10000;
const MIN_FRONT_AXLE_RATIO = 0.2;
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
type Propagated = { carried: number[]; floorLoad: number[]; tier: number[] };

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
function overlapXY(a: Placement, b: Placement) {
  return overlap1d(a.x, a.x + a.length, b.x, b.x + b.length)
    * overlap1d(a.y, a.y + a.width, b.y, b.y + b.width);
}
function overlapsVolume(a: Placement, b: Placement) {
  return overlap1d(a.x, a.x + a.length, b.x, b.x + b.length) > EPS
    && overlap1d(a.y, a.y + a.width, b.y, b.y + b.width) > EPS
    && overlap1d(a.z, a.z + a.height, b.z, b.z + b.height) > EPS;
}
function cargoIndexes(bodies: Body[], indexes: number[]) {
  return indexes.flatMap(index => bodies[index]?.cargoIndex == null ? [] : [bodies[index].cargoIndex!]);
}
function finding(code: string, severity: OperationalRuleFinding['severity'], message: string, placementIndexes: number[] = [], value?: number, limit?: number): OperationalRuleFinding {
  return { code, severity, message, placementIndexes: [...new Set(placementIndexes)], value, limit };
}
function equipmentFor(container: ContainerSpec) {
  return findMatchingEquipment(container.length, container.width, container.height, container.maxPayloadKg);
}
function transportKind(container: ContainerSpec) {
  return container.kind ?? equipmentFor(container)?.category ?? 'container';
}
function accessSides(container: ContainerSpec) {
  if (container.access?.length) return container.access;
  const equipment = equipmentFor(container);
  const sides: Array<'rear' | 'left' | 'right' | 'top'> = ['rear'];
  if (equipment?.sideLoading) sides.push('left', 'right');
  if (equipment?.topLoading) sides.push('top');
  return sides;
}
function doorSize(container: ContainerSpec) {
  const equipment = equipmentFor(container);
  return {
    width: container.doorWidth ?? equipment?.doorWidth,
    height: container.doorHeight ?? equipment?.doorHeight,
  };
}
function lineLoadLimit(container: ContainerSpec) {
  return container.floorLineLoadKgPerM ?? equipmentFor(container)?.floorLineLoadKgPerM;
}
function axleModel(container: ContainerSpec): AxleModel | undefined {
  return container.axles;
}

function buildBodies(cargo: CargoItem[], placements: Placement[], supports: OperationalSupport[] = []) {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const bodies: Body[] = placements.map((placement, cargoIndex) => ({
    kind: 'cargo', placement, cargo: cargoMap.get(placement.cargoId), cargoIndex,
  }));
  for (const support of supports) {
    bodies.push({
      kind: 'support',
      placement: {
        cargoId: support.id, x: support.x, y: support.y, z: support.z,
        length: support.length, width: support.width, height: support.height, weightKg: support.weightKg,
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
      if (Math.abs(below.z + below.height - p.z) > HEIGHT_TOLERANCE_M) continue;
      const area = overlapXY(p, below);
      if (area > EPS) links.push({ bodyIndex: j, area });
    }
    return links;
  });
}

function propagateLoads(bodies: Body[], supporters: SupportLink[][]): Propagated {
  const carried = bodies.map(() => 0);
  const floorLoad = bodies.map(() => 0);
  const tier = bodies.map(() => 1);
  const topDown = bodies.map((_, index) => index).sort((a, b) => bodies[b].placement.z - bodies[a].placement.z);
  for (const index of topDown) {
    const total = bodies[index].placement.weightKg + carried[index];
    const links = supporters[index];
    if (bodies[index].placement.z <= HEIGHT_TOLERANCE_M) {
      floorLoad[index] = total;
      continue;
    }
    const area = links.reduce((sum, link) => sum + link.area, 0);
    if (area <= EPS) continue;
    for (const link of links) carried[link.bodyIndex] += total * link.area / area;
  }
  for (const index of [...topDown].reverse()) {
    for (const link of supporters[index]) tier[index] = Math.max(tier[index], tier[link.bodyIndex] + 1);
  }
  return { carried, floorLoad, tier };
}

function checkBounds(container: ContainerSpec, bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const marginL = 0.03, marginW = 0.02, marginH = 0.03;
  bodies.forEach((body, index) => {
    const p = body.placement;
    const roof = container.height - marginH - (body.cargo && isForkliftCargo(body.cargo) ? FORKLIFT_CLEARANCE_M : 0);
    if (p.x < -EPS || p.y < -EPS || p.z < -EPS || p.x + p.length > container.length - marginL + EPS || p.y + p.width > container.width - marginW + EPS) {
      out.push(finding('OUT_OF_BOUNDS', 'error', `${p.cargoId}: 안전 마진을 적용한 적재 공간을 벗어났습니다.`, cargoIndexes(bodies, [index])));
    }
    if (p.z + p.height > roof + EPS) {
      out.push(finding('HEIGHT_EXCEEDED', 'error', `${p.cargoId}: 허용 높이 ${(roof * 1000).toFixed(0)}mm를 초과했습니다.`, cargoIndexes(bodies, [index]), p.z + p.height, roof));
    }
    if (container.heightLimit != null && p.z + p.height > container.heightLimit + EPS) {
      out.push(finding('LOAD_LINE_EXCEEDED', 'error', `${p.cargoId}: 적재 한계선 ${(container.heightLimit * 1000).toFixed(0)}mm를 초과했습니다.`, cargoIndexes(bodies, [index]), p.z + p.height, container.heightLimit));
    }
  });
  return out;
}

function checkDoor(container: ContainerSpec, bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const access = accessSides(container);
  if (access.length !== 1 || access[0] !== 'rear') return out;
  const door = doorSize(container);
  if (door.width == null || door.height == null) return out;
  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo' || !body.cargo) return;
    const p = body.placement;
    const clearance = isForkliftCargo(body.cargo) ? FORKLIFT_CLEARANCE_M : 0;
    const needH = p.height + clearance;
    if (p.width > door.width + EPS || needH > door.height + EPS) {
      out.push(finding('DOOR_NOT_PASSABLE', 'error', `${p.cargoId}: 도어 개구 ${Math.round(door.width * 1000)}×${Math.round(door.height * 1000)}mm 통과 불가입니다.`, cargoIndexes(bodies, [index])));
    } else if (isForkliftCargo(body.cargo) && p.z > HEIGHT_TOLERANCE_M && p.z + p.height + clearance > door.height + EPS) {
      out.push(finding('DOOR_HEADER_CLEARANCE', 'warning', `${p.cargoId}: 윗단 적재 시 도어 헤더 여유가 부족해 내부에서 들어올려야 합니다.`, cargoIndexes(bodies, [index])));
    }
  });
  return out;
}

function checkOverlap(bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      if (!overlapsVolume(bodies[i].placement, bodies[j].placement)) continue;
      out.push(finding('OVERLAP', 'error', `${bodies[i].placement.cargoId}와 ${bodies[j].placement.cargoId}가 겹칩니다.`, cargoIndexes(bodies, [i, j])));
    }
  }
  return out;
}

function checkOrientation(bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo' || !body.cargo) return;
    const orientation = orientationFromPlacement(body.cargo, body.placement.length, body.placement.width, body.placement.height);
    if (!orientation || !allowedCargoOrientations(body.cargo).includes(orientation)) {
      out.push(finding('ORIENTATION_NOT_ALLOWED', 'error', `${body.placement.cargoId}: 화물 유형에 허용되지 않은 회전입니다.`, cargoIndexes(bodies, [index])));
    }
  });
  return out;
}

function checkSupport(bodies: Body[], supporters: SupportLink[][]) {
  const out: OperationalRuleFinding[] = [];
  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo') return;
    const p = body.placement;
    if (p.z <= HEIGHT_TOLERANCE_M) return;
    const links = supporters[index];
    const baseArea = p.length * p.width;
    const supported = links.reduce((sum, link) => sum + link.area, 0);
    const ratio = supported / Math.max(EPS, baseArea);
    if (ratio + EPS < MIN_SUPPORT_RATIO) {
      out.push(finding(links.length ? 'INSUFFICIENT_SUPPORT' : 'FLOATING', 'error', `${p.cargoId}: 지지율 ${(ratio * 100).toFixed(1)}%로 기준 80% 미만입니다.`, cargoIndexes(bodies, [index, ...links.map(link => link.bodyIndex)]), ratio, MIN_SUPPORT_RATIO));
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
    const cgX = p.x + p.length / 2, cgY = p.y + p.width / 2;
    if (cgX < minX - EPS || cgX > maxX + EPS || cgY < minY - EPS || cgY > maxY + EPS) {
      out.push(finding('CG_OUTSIDE_SUPPORT', 'error', `${p.cargoId}: 무게중심 투영점이 지지 영역 밖에 있습니다.`, cargoIndexes(bodies, [index, ...links.map(link => link.bodyIndex)])));
    }
  });
  return out;
}

function checkStacking(bodies: Body[], supporters: SupportLink[][], loads: Propagated) {
  const out: OperationalRuleFinding[] = [];
  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo' || !body.cargo) return;
    const item = body.cargo;
    const p = body.placement;
    if (item.maxTopLoadKg != null && loads.carried[index] > item.maxTopLoadKg + EPS) {
      out.push(finding(item.maxTopLoadKg <= EPS ? 'NO_STACK_ON_TOP' : 'TOP_LOAD_EXCEEDED', 'error', `${p.cargoId}: 누적 상부하중 ${loads.carried[index].toFixed(1)}kg이 허용 ${item.maxTopLoadKg}kg을 초과했습니다.`, cargoIndexes(bodies, [index]), loads.carried[index], item.maxTopLoadKg));
    }
    if (item.canBePlacedOnTop === false && p.z > HEIGHT_TOLERANCE_M) {
      out.push(finding('MUST_BE_ON_FLOOR', 'error', `${p.cargoId}: 바닥 전용 화물인데 다른 화물 위에 놓였습니다.`, cargoIndexes(bodies, [index])));
    }
    if (item.maxStackLayers != null && loads.tier[index] > item.maxStackLayers) {
      out.push(finding('TIER_EXCEEDED', 'error', `${p.cargoId}: ${loads.tier[index]}단에 놓여 최대 ${item.maxStackLayers}단을 초과했습니다.`, cargoIndexes(bodies, [index]), loads.tier[index], item.maxStackLayers));
    }
    for (let k = 0; k < bodies.length; k += 1) {
      const link = supporters[k].find(value => value.bodyIndex === index);
      if (!link || body.kind !== 'cargo') continue;
      // The source validator supports maxTopPressure. The current product schema has
      // no pressure field, so pressure is intentionally not fabricated here.
    }
  });
  return out;
}

function checkSegregation(cargo: CargoItem[], bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const temps = new Map<string, number[]>();
  const classes = new Map<string, number[]>();
  bodies.forEach((body, index) => {
    if (body.kind !== 'cargo' || !body.cargo) return;
    if (body.cargo.tempZone) (temps.get(body.cargo.tempZone) ?? (temps.set(body.cargo.tempZone, []), temps.get(body.cargo.tempZone)!)).push(index);
    if (body.cargo.segregationClass) (classes.get(body.cargo.segregationClass) ?? (classes.set(body.cargo.segregationClass, []), classes.get(body.cargo.segregationClass)!)).push(index);
  });
  if (temps.size > 1) {
    out.push(finding('MIXED_TEMP_ZONE', 'error', `온도대가 다른 화물이 섞였습니다: ${[...temps.keys()].join(', ')}`, cargoIndexes(bodies, [...temps.values()].flat())));
  }
  // The uploaded rules require an incompatible-pair matrix. No pair list exists in
  // current persisted company data, so only explicit "A|B" reciprocal class notation
  // is enforced instead of inventing company policy.
  for (const [name, indexes] of classes) {
    const [a, b] = name.split('|');
    if (!b) continue;
    const opposite = classes.get(`${b}|${a}`);
    if (opposite?.length) out.push(finding('INCOMPATIBLE_CARGO', 'error', `혼적 금지 그룹 ${a} / ${b}가 같은 공간에 있습니다.`, cargoIndexes(bodies, [...indexes, ...opposite])));
  }
  void cargo;
  return out;
}

function checkUnloadOrder(container: ContainerSpec, bodies: Body[]) {
  const out: OperationalRuleFinding[] = [];
  const access = accessSides(container);
  const topAccess = access.includes('top');
  const horizontal = access.filter(side => side !== 'top');
  const rows = bodies.map((body, bodyIndex) => ({ body, bodyIndex })).filter(row => row.body.kind === 'cargo' && (row.body.cargo?.unloadPriority ?? 0) > 0);
  for (const current of rows) {
    const a = current.body.placement;
    const priority = current.body.cargo!.unloadPriority!;
    const above: number[] = [];
    const blocked = new Map<string, number[]>();
    for (const later of rows) {
      if (later.bodyIndex === current.bodyIndex || (later.body.cargo?.unloadPriority ?? 0) <= priority) continue;
      const b = later.body.placement;
      const xy = overlap1d(a.x, a.x+a.length, b.x, b.x+b.length) > EPS && overlap1d(a.y, a.y+a.width, b.y, b.y+b.width) > EPS;
      const yz = overlap1d(a.y, a.y+a.width, b.y, b.y+b.width) > EPS && overlap1d(a.z, a.z+a.height, b.z, b.z+b.height) > EPS;
      const xz = overlap1d(a.x, a.x+a.length, b.x, b.x+b.length) > EPS && overlap1d(a.z, a.z+a.height, b.z, b.z+b.height) > EPS;
      if (b.z >= a.z + a.height - HEIGHT_TOLERANCE_M && xy) above.push(later.bodyIndex);
      const mark = (side: string) => blocked.set(side, [...(blocked.get(side) ?? []), later.bodyIndex]);
      if (b.x >= a.x + a.length - EPS && yz) mark('rear');
      if (b.y + b.width <= a.y + EPS && xz) mark('left');
      if (b.y >= a.y + a.width - EPS && xz) mark('right');
    }
    if (above.length) out.push(finding('UNLOAD_BLOCKED_ABOVE', 'error', `${a.cargoId}: 먼저 하역해야 하지만 나중 하역 화물이 위에 있습니다.`, cargoIndexes(bodies, [current.bodyIndex, ...above])));
    if (!topAccess && horizontal.length && horizontal.every(side => (blocked.get(side)?.length ?? 0) > 0)) {
      const blockers = [...new Set(horizontal.flatMap(side => blocked.get(side) ?? []))];
      out.push(finding('UNLOAD_BLOCKED', 'error', `${a.cargoId}: 모든 반출 경로가 나중 하역 화물에 막혀 있습니다.`, cargoIndexes(bodies, [current.bodyIndex, ...blockers])));
    }
  }
  return out;
}

function centerOfGravity(bodies: Body[]) {
  const rows = bodies.filter(body => body.kind === 'cargo');
  const weight = rows.reduce((sum, body) => sum + body.placement.weightKg, 0);
  if (weight <= EPS) return null;
  return rows.reduce((acc, body) => {
    const p = body.placement;
    acc.x += (p.x+p.length/2)*p.weightKg; acc.y += (p.y+p.width/2)*p.weightKg; acc.z += (p.z+p.height/2)*p.weightKg;
    return acc;
  }, {x:0,y:0,z:0,weight}).weight ? {
    x: rows.reduce((s,b)=>s+(b.placement.x+b.placement.length/2)*b.placement.weightKg,0)/weight,
    y: rows.reduce((s,b)=>s+(b.placement.y+b.placement.width/2)*b.placement.weightKg,0)/weight,
    z: rows.reduce((s,b)=>s+(b.placement.z+b.placement.height/2)*b.placement.weightKg,0)/weight,
  } : null;
}
function axleLoads(bodies: Body[], axles?: AxleModel) {
  if (!axles) return null;
  const rows = bodies.filter(body => body.kind === 'cargo');
  const weight = rows.reduce((sum, body) => sum + body.placement.weightKg, 0);
  const cg = centerOfGravity(bodies);
  const rearAdd = cg ? weight * (cg.x - axles.frontX) / (axles.rearX - axles.frontX) : 0;
  const front = axles.emptyFront + weight - rearAdd;
  const rear = axles.emptyRear + rearAdd;
  const gross = front + rear;
  return { front, rear, gross, frontRatio: gross > EPS ? front / gross : 0 };
}

function checkWeightAndBalance(container: ContainerSpec, bodies: Body[], loads: Propagated) {
  const out: OperationalRuleFinding[] = [];
  const rows = bodies.filter(body => body.kind === 'cargo');
  const weight = rows.reduce((sum, body) => sum + body.placement.weightKg, 0);
  if (weight > container.maxPayloadKg + EPS) out.push(finding('PAYLOAD_EXCEEDED','error',`화물 총중량 ${weight.toFixed(1)}kg이 허용 ${container.maxPayloadKg.toFixed(1)}kg을 초과했습니다.`,[],weight,container.maxPayloadKg));

  const lineLimit = lineLoadLimit(container);
  if (lineLimit != null) {
    const events: Array<{x:number;delta:number}> = [];
    bodies.forEach((body,index) => {
      if (loads.floorLoad[index] <= EPS) return;
      const p=body.placement;
      const density = loads.floorLoad[index] / Math.max(EPS,p.length);
      events.push({x:p.x,delta:density},{x:p.x+p.length,delta:-density});
    });
    events.sort((a,b)=>a.x-b.x || a.delta-b.delta);
    let current=0,best=0,bestX=0;
    for (const event of events) { current += event.delta; if (current > best) { best=current; bestX=event.x; } }
    if (best > lineLimit + EPS) out.push(finding('LINE_LOAD_EXCEEDED','error',`X=${(bestX*1000).toFixed(0)}mm 부근 선하중 ${best.toFixed(1)}kg/m이 허용 ${lineLimit}kg/m을 초과했습니다.`,[],best,lineLimit));
  }

  const cg=centerOfGravity(bodies);
  if (!cg) return out;
  const kind=transportKind(container);
  if (kind === 'container') {
    const dev=Math.abs(cg.x-container.length/2), limit=container.length*CG_LONG_TOLERANCE;
    if (dev>limit+EPS) out.push(finding('CG_LONGITUDINAL','error',`길이 방향 무게중심 편차 ${(dev*1000).toFixed(0)}mm가 허용 ±${(limit*1000).toFixed(0)}mm를 넘습니다.`,[],dev,limit));
  }
  const devY=Math.abs(cg.y-container.width/2), limY=container.width*CG_LAT_TOLERANCE;
  if (devY>limY+EPS) out.push(finding('CG_LATERAL',kind==='container'?'error':'warning',`폭 방향 무게중심 편차 ${(devY*1000).toFixed(0)}mm가 허용 ±${(limY*1000).toFixed(0)}mm를 넘습니다.`,[],devY,limY));
  const high=container.height*CG_HEIGHT_RATIO;
  if(cg.z>high+EPS) out.push(finding('CG_HIGH','warning',`무게중심 높이 ${(cg.z*1000).toFixed(0)}mm가 권장 한도 ${(high*1000).toFixed(0)}mm를 넘습니다.`,[],cg.z,high));

  const axles=axleModel(container), axle=axleLoads(bodies,axles);
  if(axles&&axle){
    const frontLimit=Math.min(axles.maxFront,LEGAL_AXLE_LOAD_KG*(axles.frontAxleCount??1));
    const rearLimit=Math.min(axles.maxRear,LEGAL_AXLE_LOAD_KG*axles.rearAxleCount);
    if(axle.front>frontLimit+EPS) out.push(finding('FRONT_AXLE_OVERLOAD','error',`전축 하중 ${axle.front.toFixed(1)}kg이 허용 ${frontLimit}kg을 초과했습니다.`,[],axle.front,frontLimit));
    if(axle.rear>rearLimit+EPS) out.push(finding('REAR_AXLE_OVERLOAD','error',`후축 하중 ${axle.rear.toFixed(1)}kg이 허용 ${rearLimit}kg을 초과했습니다.`,[],axle.rear,rearLimit));
    if(axle.gross>axles.maxGross+EPS) out.push(finding('GROSS_WEIGHT_EXCEEDED','error',`총중량 ${axle.gross.toFixed(1)}kg이 한도 ${axles.maxGross}kg을 초과했습니다.`,[],axle.gross,axles.maxGross));
    if(axle.frontRatio<MIN_FRONT_AXLE_RATIO) out.push(finding('FRONT_AXLE_TOO_LIGHT','error',`전축 하중 비율 ${(axle.frontRatio*100).toFixed(1)}%가 최소 20%보다 낮습니다.`,[],axle.frontRatio,MIN_FRONT_AXLE_RATIO));
  }
  return out;
}

function checkSecuring(container: ContainerSpec, bodies: Body[], loads: Propagated) {
  const out: OperationalRuleFinding[] = [];
  const rows=bodies.filter(body=>body.kind==='cargo');
  const maxX=rows.reduce((max,body)=>Math.max(max,body.placement.x+body.placement.length),0);
  const rearGap=rows.length?Math.max(0,container.length-maxX):0;
  if(rearGap>GAP_WARNING_M+EPS) out.push(finding('REAR_GAP','warning',`도어 쪽 빈 공간 ${(rearGap*1000).toFixed(0)}mm. 각목·에어백·래싱 고정이 필요합니다.`,[],rearGap,GAP_WARNING_M));

  const floorBodies=bodies.map((body,index)=>({body,index})).filter(row=>loads.floorLoad[row.index]>EPS);
  const cuts=[...new Set(floorBodies.flatMap(({body})=>[body.placement.x,body.placement.x+body.placement.length]))].sort((a,b)=>a-b);
  let maxLateralGap=0;
  for(let k=0;k+1<cuts.length;k+=1){
    const mid=(cuts[k]+cuts[k+1])/2;
    const spans=floorBodies.filter(({body})=>body.placement.x<mid&&body.placement.x+body.placement.length>mid).map(({body})=>[body.placement.y,body.placement.y+body.placement.width] as [number,number]).sort((a,b)=>a[0]-b[0]);
    let covered=0,end=-Infinity;
    for(const [y0,y1] of spans){if(y1<=end)continue;covered+=y1-Math.max(y0,end);end=Math.max(end,y1);}
    if(spans.length) maxLateralGap=Math.max(maxLateralGap,container.width-covered);
  }
  if(maxLateralGap>GAP_WARNING_M+EPS) out.push(finding('LATERAL_GAP','warning',`폭 방향 빈틈 합계 ${(maxLateralGap*1000).toFixed(0)}mm. 에어백 등으로 채움이 필요합니다.`,[],maxLateralGap,GAP_WARNING_M));

  bodies.forEach((body,index)=>{
    if(body.kind!=='cargo'||loads.floorLoad[index]<=EPS||!body.cargo)return;
    const p=body.placement, mu=body.cargo.friction??DEFAULT_FRICTION, mass=loads.floorLoad[index];
    const forward=Math.max(0,(ACCEL.forward-mu)*mass*9.81/10), rearward=Math.max(0,(ACCEL.rearward-mu)*mass*9.81/10), sideways=Math.max(0,(ACCEL.sideways-mu)*mass*9.81/10);
    const hcg=p.height/2, tipForward=ACCEL.forward*hcg>p.length/2, tipSide=ACCEL.sideways*hcg>p.width/2;
    if(tipForward||tipSide) out.push(finding('TIPPING_RISK','warning',`${p.cargoId}: ${tipSide?'측방':'전방'} 전도 위험. 블로킹 또는 래싱이 필요합니다.`,cargoIndexes(bodies,[index])));
    if(Math.max(forward,rearward,sideways)>EPS) out.push(finding('SECURING_FORCE','warning',`${p.cargoId}: 필요 고정력 전방 ${forward.toFixed(1)} / 후방 ${rearward.toFixed(1)} / 측방 ${sideways.toFixed(1)} daN.`,cargoIndexes(bodies,[index]),Math.max(forward,rearward,sideways)));
  });
  return out;
}

function checkAfterStops(container: ContainerSpec,bodies: Body[]) {
  const priorities=[...new Set(bodies.flatMap(body=>body.kind==='cargo'&&(body.cargo?.unloadPriority??0)>0?[body.cargo!.unloadPriority!]:[]))].sort((a,b)=>a-b);
  const out:OperationalRuleFinding[]=[];
  for(const priority of priorities.slice(0,-1)){
    const remaining=bodies.filter(body=>body.kind==='support'||body.cargo?.unloadPriority==null||body.cargo.unloadPriority>priority);
    const supporters=supportersOf(remaining),loads=propagateLoads(remaining,supporters);
    const checks=[...checkSupport(remaining,supporters)];
    if(transportKind(container)==='truck') checks.push(...checkWeightAndBalance(container,remaining,loads).filter(issue=>issue.code==='CG_LATERAL'||issue.code.includes('AXLE')||issue.code==='GROSS_WEIGHT_EXCEEDED'||issue.code==='FRONT_AXLE_TOO_LIGHT'));
    for(const issue of checks.filter(issue=>issue.severity==='error')) out.push({...issue,code:`AFTER_STOP_${issue.code}`,message:`하역 순서 ${priority} 완료 후: ${issue.message}`});
  }
  return out;
}

export function validateOperationalLoading(container: ContainerSpec,cargo: CargoItem[],placements: Placement[],supports: OperationalSupport[]=[]): OperationalRuleFinding[] {
  if(!placements.length&&!supports.length)return[];
  const bodies=buildBodies(cargo,placements,supports),supporters=supportersOf(bodies),loads=propagateLoads(bodies,supporters);
  return [
    ...checkBounds(container,bodies),
    ...checkDoor(container,bodies),
    ...checkOverlap(bodies),
    ...checkOrientation(bodies),
    ...checkSupport(bodies,supporters),
    ...checkStacking(bodies,supporters,loads),
    ...checkSegregation(cargo,bodies),
    ...checkUnloadOrder(container,bodies),
    ...checkWeightAndBalance(container,bodies,loads),
    ...checkSecuring(container,bodies,loads),
    ...checkAfterStops(container,bodies),
  ];
}
export function operationalErrors(findings: OperationalRuleFinding[]){return findings.filter(finding=>finding.severity==='error');}
