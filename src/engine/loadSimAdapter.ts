import type { CargoItem, ContainerSpec, LoadingResult, OperationalRuleFinding, Placement, ValidationIssue } from './types';
import type { Item, Placement as APlacement, Space } from './loadSimA/types';
import { ALL_ORIENTATIONS } from './loadSimA/types';
import { allowedOrientations, canPlace, orientedSize, validate, checkSupport, checkOverlap, checkStacking } from './loadSimA/validate';
import { pack } from './loadSimA/pack';
import { aConfig, placementOrientation } from './loadingRuleset';
import { analyzeFloorLoad } from './floorLoad';

export type SupportBody = { id: string; x: number; y: number; z: number; length: number; width: number; height: number; weightKg: number; unitHeightM?: number; unitCenterOfGravity?: {x:number;y:number;z:number} };
export function toASpace(c: ContainerSpec): Space {
  const r = c.rules;
  return { id: r?.equipmentId ?? 'custom', kind: r?.kind ?? 'container',
    inner: { l: c.length * 1000, w: c.width * 1000, h: c.height * 1000 }, maxPayload: c.maxPayloadKg,
    access: r?.access ?? ['rear'], door: r?.door, tare: r?.tareKg ?? 0,
    floorLineLoad: r?.floorLineLoadKgPerM, heightLimit: r?.heightLimitMm, axles: r?.axles };
}
export function toAItem(c: CargoItem, id: string): Item {
  return { id, type: c.unitKind === 'pallet' ? 'pallet' : 'carton',
    dims: { l: c.length * 1000, w: c.width * 1000, h: c.height * 1000 }, weight: c.weightKg,
    allowedOrientations: c.allowRotation === false ? ['LWH'] : c.allowedOrientations,
    thisSideUp: c.thisSideUp, maxTopLoad: c.maxTopLoadKg,
    canBePlacedOnTop: c.floorOnly ? false : undefined,
    stopSeq: (c.unloadPriority ?? 0) > 0 ? c.unloadPriority : undefined,
    groupId: c.id, cgOffset: c.cgOffsetMm, friction: c.friction,
    maxTopPressure: c.maxTopPressureKgPerM2, segregationClass: c.segregationClass, tempZone: c.tempZone };
}
export function expandCargo(cargo: CargoItem[]) {
  const originals = new Map<string, CargoItem>();
  const items = cargo.flatMap((c, sku) => Array.from({ length: c.quantity }, (_, ordinal) => {
    const id = JSON.stringify([sku, c.id, ordinal]); originals.set(id, c); return toAItem(c, id);
  }));
  return { items, originals };
}
export function fromAPlacement(p: APlacement, c: CargoItem): Placement {
  const s = orientedSize(p.item.dims, p.orientation);
  return { cargoId: c.id, unitId: p.item.id, x: p.pos.x / 1000, y: p.pos.y / 1000, z: p.pos.z / 1000,
    length: s.x / 1000, width: s.y / 1000, height: s.z / 1000, weightKg: p.item.weight,
    orientation: p.orientation, rotated: p.orientation === 'WLH' };
}
export function toAPlacements(cargo: CargoItem[], ps: Placement[]): APlacement[] {
  const map = new Map(cargo.map(c => [c.id, c]));
  return ps.map((p, i) => ({ item: toAItem(map.get(p.cargoId) ?? {
    id: p.cargoId, name: p.cargoId, length: p.length, width: p.width, height: p.height, weightKg: p.weightKg, quantity: 1,
  }, p.unitId ?? `placement:${i}`), pos: { x: p.x * 1000, y: p.y * 1000, z: p.z * 1000 }, orientation: placementOrientation(p) }));
}

/** Identity audit and constraints absent from A. No legacy orientation/support tolerance is reused. */
export function auditAIdentity(c: ContainerSpec, cargo: CargoItem[], ps: Placement[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [], counts = new Map<string, number>(), byId = new Map(cargo.map(x => [x.id, x]));
  const add = (type: ValidationIssue['type'], message: string, indexes: number[]) => issues.push({ type, message, placementIndexes: indexes });
  const ids = new Set<string>();
  ps.forEach((p, i) => {
    const item = byId.get(p.cargoId), orientation = placementOrientation(p);
    counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
    if (p.unitId && ids.has(p.unitId)) add('QUANTITY', '중복 화물 개체 ID', [i]);
    if (p.unitId) ids.add(p.unitId);
    if (!item || !ALL_ORIENTATIONS.includes(orientation) || ![p.x,p.y,p.z,p.length,p.width,p.height,p.weightKg].every(Number.isFinite) || Math.min(p.length,p.width,p.height) <= 0) {
      add('INVALID_CARGO', '화물 사양 또는 좌표가 유효하지 않습니다.', [i]); return;
    }
    const a = toAItem(item, p.unitId ?? `${i}`), s = orientedSize(a.dims, orientation);
    if (!allowedOrientations(a).includes(orientation) || [s.x / 1000 - p.length,s.y / 1000 - p.width,s.z / 1000 - p.height,p.weightKg-item.weightKg].some(d => Math.abs(d)>1e-6)) add('INVALID_CARGO', '원본 치수·회전·중량 불일치', [i]);
  });
  for (const [id, n] of counts) if (n > (byId.get(id)?.quantity ?? 0)) add('QUANTITY', '원본 수량 초과', ps.flatMap((p,i)=>p.cargoId===id?[i]:[]));
  const tol = aConfig(c).heightTolerance / 1000;
  const above = ps.map((p,i) => ps.flatMap((q,j) => j!==i && q.z>p.z && Math.abs(p.z+p.height-q.z)<=tol &&
    Math.min(p.x+p.length,q.x+q.length)>Math.max(p.x,q.x) && Math.min(p.y+p.width,q.y+q.width)>Math.max(p.y,q.y) ? [j] : []));
  const below = ps.map((_,i)=>above.flatMap((children,j)=>children.includes(i)?[j]:[]));
  const order = ps.map((_,i)=>i).sort((a,b)=>ps[a].z-ps[b].z), depth=ps.map(()=>1), height=ps.map(()=>1);
  for (const i of order) for(const j of below[i]) depth[i]=Math.max(depth[i],depth[j]+1);
  for (const i of [...order].reverse()) for(const j of above[i]) height[i]=Math.max(height[i],height[j]+1);
  ps.forEach((p,i)=>{
    const item=byId.get(p.cargoId); if(!item) return;
    if(item.maxStackLayers!==undefined && Math.max(depth[i],height[i])>item.maxStackLayers) add('STACK_LIMIT','기존 화물 적층 한도 초과',[i]);
    const descendants=new Set<number>(), queue=[...above[i]];
    while(queue.length){ const j=queue.pop()!; if(descendants.has(j))continue; descendants.add(j); queue.push(...above[j]); }
    const load=[...descendants].reduce((n,j)=>n+ps[j].weightKg,0);
    if(item.maxTopLoadKg!==undefined && load>item.maxTopLoadKg+1e-6) add('TOP_LOAD','기존 보수적 상부하중 한도 초과',[i]);
  });
  return issues;
}
const finding = (code:string,message:string,placementIndexes:number[]=[],severity:'error'|'warning'='error'):OperationalRuleFinding=>({code,message,placementIndexes,severity});

/** Truck hard CG policy and area floor load remain distinct from A's line-load model. */
function retainedFindings(c: ContainerSpec, ps: Placement[]): OperationalRuleFinding[] {
  const out:OperationalRuleFinding[]=[];
  if(c.floorLoadLimitKgPerM2 && analyzeFloorLoad(c,{placements:ps}).maxKgPerM2>c.floorLoadLimitKgPerM2+1e-6) out.push(finding('FLOOR_AREA_LOAD','기존 바닥 면하중 한도 초과'));
  if(c.rules?.kind==='truck' && ps.length){
    const mass=ps.reduce((s,p)=>s+p.weightKg,0);
    if(mass>0) for(const [axis,size,dim] of [['x',c.length,'length'],['y',c.width,'width']] as const){
      const center=ps.reduce((s,p)=>s+(p[axis]+p[dim]/2)*p.weightKg,0)/mass;
      if(Math.abs(center-size/2)>size*.05+1e-6) out.push(finding(`RETAINED_CG_${axis.toUpperCase()}`,'기존 트럭 무게중심 한도 초과'));
    }
  }
  return out;
}

/** Vehicle units and their enclosed cartons must never appear in the same mass/collision list. */
function transportUnits(cargo:CargoItem[], ps:Placement[], supports:SupportBody[]) {
  const raw=toAPlacements(cargo,ps), groups=supports.map(()=>[] as number[]), loose:number[]=[];
  ps.forEach((p,i)=>{
    let owner=-1;
    supports.forEach((s,j)=>{if(p.z>=s.z+s.height-.005 && p.x>=s.x-.0005 && p.y>=s.y-.0005 && p.x+p.length<=s.x+s.length+.0005 && p.y+p.width<=s.y+s.width+.0005 && (owner<0 || s.z>supports[owner].z))owner=j;});
    if(owner<0)loose.push(i);else groups[owner].push(i);
  });
  const indices=new Map<string,number[]>();
  const units=loose.map(i=>{indices.set(raw[i].item.id,[i]);return raw[i];});
  supports.forEach((s,j)=>{
    const members=groups[j], h=Math.max(s.unitHeightM??s.height,...members.map(i=>ps[i].z+ps[i].height-s.z));
    const mass=s.weightKg+members.reduce((sum,i)=>sum+ps[i].weightKg,0), id=`support:${j}:${s.id}`;
    const cg={x:(s.x+s.length/2)*s.weightKg,y:(s.y+s.width/2)*s.weightKg,z:(s.z+s.height/2)*s.weightKg};
    members.forEach(i=>{const p=ps[i]; cg.x+=(p.x+p.length/2)*p.weightKg; cg.y+=(p.y+p.width/2)*p.weightKg; cg.z+=(p.z+p.height/2)*p.weightKg;});
    if(s.unitCenterOfGravity){cg.x=s.unitCenterOfGravity.x*mass;cg.y=s.unitCenterOfGravity.y*mass;cg.z=s.unitCenterOfGravity.z*mass;}
    const stops=members.map(i=>raw[i].item.stopSeq).filter((n):n is number=>n!==undefined);
    units.push({item:{id,type:'pallet',dims:{l:s.length*1000,w:s.width*1000,h:h*1000},weight:mass,allowedOrientations:['LWH'],stopSeq:stops.length?Math.min(...stops):undefined,
      cgOffset:mass>0?{l:(cg.x/mass-s.x-s.length/2)*1000,w:(cg.y/mass-s.y-s.width/2)*1000,h:(cg.z/mass-s.z-h/2)*1000}:undefined},pos:{x:s.x*1000,y:s.y*1000,z:s.z*1000},orientation:'LWH'});
    indices.set(id,members);
  });
  return {units,indices};
}

export function aPlanMetrics(c:ContainerSpec,cargo:CargoItem[],ps:Placement[],supports:SupportBody[]=[]){
  const {units}=transportUnits(cargo,ps,supports);
  return validate(units,toASpace(c),aConfig(c)).metrics;
}

export function validateAPlan(c:ContainerSpec,cargo:CargoItem[],ps:Placement[],supports:SupportBody[]=[]):OperationalRuleFinding[]{
  const identity=auditAIdentity(c,cargo,ps);
  if(identity.some(x=>x.type==='INVALID_CARGO'||x.type==='QUANTITY')) return identity.map(x=>finding(x.type,x.message,x.placementIndexes));
  const {units,indices}=transportUnits(cargo,ps,supports), result=validate(units,toASpace(c),aConfig(c));
  const out:OperationalRuleFinding[]=result.violations.map(v=>({...v,placementIndexes:[...new Set(v.itemIds.flatMap(id=>indices.get(id)??[]))]}));
  if (supports.length) {
    const bodies = [...toAPlacements(cargo,ps), ...supports.map((s,i):APlacement=>({item:{id:`base:${i}`,type:'carton',dims:{l:s.length*1000,w:s.width*1000,h:s.height*1000},weight:s.weightKg},pos:{x:s.x*1000,y:s.y*1000,z:s.z*1000},orientation:'LWH'}))];
    const cfg=aConfig(c);
    out.push(...[...checkSupport(bodies,cfg),...checkOverlap(bodies,cfg),...checkStacking(bodies,cfg)].map(v=>({...v,placementIndexes:ps.flatMap((_,i)=>v.itemIds.includes(bodies[i].item.id)?[i]:[])})));
  }
  out.push(...identity.map(x=>finding(x.type,x.message,x.placementIndexes)));
  out.push(...retainedFindings(c,[...ps,...supports.map(s=>({...s,cargoId:s.id}))]));
  if(!c.rules?.door)out.push(finding('NOT_CHECKED_DOOR','문 개구 정보 없음: 도어 검사 미실행',[],'warning'));
  if(c.rules?.kind==='truck'&&!c.rules.axles)out.push(finding('NOT_CHECKED_AXLES','실제 축 제원 없음: 축하중 검사 미실행',[],'warning'));
  if(c.rules?.tareKg===undefined)out.push(finding('NOT_CHECKED_GROSS','차량 자중 없음: 차량 총중량 검사 미실행',[],'warning'));
  return out;
}

export function aCandidateAllowed(c:ContainerSpec,cargo:CargoItem[],ps:Placement[],candidate:Placement):boolean{
  const all=[...ps,candidate], ap=toAPlacements(cargo,all);
  return !auditAIdentity(c,cargo,all).length && !canPlace(ap.slice(0,-1),ap.at(-1)!,toASpace(c),aConfig(c)).length;
}
export function packWithARules(c:ContainerSpec,cargo:CargoItem[],strategy='capacity'):LoadingResult{
  const {items,originals}=expandCargo(cargo);
  const decode=(ps:APlacement[])=>ps.map(p=>fromAPlacement(p,originals.get(p.item.id)!));
  const result=pack(items,toASpace(c),{config:aConfig(c),
    acceptCandidate:(ps,p)=>!auditAIdentity(c,cargo,decode([...ps,p])).length,
    candidateKey:r=>{
      const ps=decode(r.placements), errors=validateAPlan(c,cargo,ps).filter(v=>v.severity==='error').length;
      const loaded=r.placements.reduce((sum,p)=>sum+(originals.get(p.item.id)?.demandUnits??1),0);
      const high=ps.reduce((sum,p)=>sum+(p.z+p.height/2)*p.weightKg,0);
      return [errors?1:0, errors?errors:0,-loaded,strategy==='stability'?high:0,r.unplaced.reduce((sum,i)=>sum+i.dims.l*i.dims.w*i.dims.h,0)];
    }});
  const placements=decode(result.placements), findings=validateAPlan(c,cargo,placements);
  const remaining=new Map<string,number>();
  result.unplaced.forEach(i=>{const id=originals.get(i.id)!.id;remaining.set(id,(remaining.get(id)??0)+1);});
  return {placements,remaining:[...remaining].map(([cargoId,quantity])=>({cargoId,quantity,reason:'A 규칙에서 배치 후보를 찾지 못했습니다.'})),
    loadedWeightKg:placements.reduce((s,p)=>s+p.weightKg,0),usedVolumeM3:placements.reduce((s,p)=>s+p.length*p.width*p.height,0),
    validationIssues:auditAIdentity(c,cargo,placements),operationalFindings:findings,ruleset:'a-v1',autoCorrections:[]};
}
