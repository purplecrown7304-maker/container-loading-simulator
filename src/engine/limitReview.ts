import { isARules } from './loadingRuleset';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { auditLoading } from './loadingAudit';
import { validateOperationalLoading } from './operationalValidator';
import { assessPlacementSupport, MIN_SUPPORT_RATIO, supportContactArea, REVIEW_SUPPORT_RATIO } from './support';
import { configuredFloorLoadLimit } from './floorLoadLimit';
import type { CargoItem, ContainerSpec, LimitReviewConfig, LimitReviewMetric, LoadingResult, Placement } from './types';

const EPS = 1e-6;
/** Computational input bounds only. These are not safe operating limits or margins. */
export const LIMIT_REVIEW_BOUNDS = { weight: 10_000_000, floorLoad: 10_000_000, layers: 10_000, displacementMm: 1_000_000, rotationDeg: 180 } as const;
export type LimitReviewResolution = {
  status: 'strict' | 'active' | 'invalid' | 'unsupported';
  container: ContainerSpec;
  cargo: CargoItem[];
  errors: string[];
  minimumSupportRatio: number;
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value,key);

/** Resolve an isolated scenario. Never overwrite a registered rating or strength provenance. */
export function resolveLimitReview(container: ContainerSpec, cargo: CargoItem[]): LimitReviewResolution {
  const strict = { status:'strict' as const, container, cargo, errors:[] as string[], minimumSupportRatio:MIN_SUPPORT_RATIO };
  if (container.limitReview === undefined) return strict;
  const config = container.limitReview as unknown;
  const errors: string[] = [];
  const fail = (message:string) => errors.push(message);
  if (!object(config) || config.mode !== 'what-if') return { ...strict,status:'invalid',errors:['WHAT-IF REVIEW 설정 형식이 올바르지 않습니다.'] };
  const known = ['mode','maxPayloadKg','floorLoadLimitKgPerM2','minimumSupportRatio','cargoLimits','simulation'];
  if (Object.keys(config).some(key=>!known.includes(key))) fail('선택할 수 없는 검토 한도 항목이 있습니다.');
  const check = (value:unknown,label:string,lower:number,upper:number,integer=false,positive=false) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < lower || value > upper || (positive && value <= 0) || (integer && !Number.isInteger(value))) fail(`${label}: ${positive && lower===0 ? '0 초과' : lower}~${upper} 범위의 ${integer?'정수':'유한한 수'}를 입력하세요.`);
  };
  const originalError = containerInputError(container);
  if (originalError) fail(`원래 장비 입력 오류: ${originalError}`);
  const preflight = preflightCargoInput(cargo);
  for (const row of preflight.rejected) fail(`원래 화물 입력 오류 (${row.cargoId}): ${row.reason}`);
  if (own(config,'maxPayloadKg')) check(config.maxPayloadKg,'검토 총중량',container.maxPayloadKg,LIMIT_REVIEW_BOUNDS.weight,false,true);
  if (own(config,'floorLoadLimitKgPerM2')) check(config.floorLoadLimitKgPerM2,'검토 바닥하중',configuredFloorLoadLimit(container) ?? 0,LIMIT_REVIEW_BOUNDS.floorLoad,false,true);
  if (own(config,'minimumSupportRatio')) check(config.minimumSupportRatio,'검토 최소 지지율',0,MIN_SUPPORT_RATIO,false,true);
  if (own(config,'cargoLimits')) {
    if (!object(config.cargoLimits)) fail('품목별 검토 한도 형식이 올바르지 않습니다.');
    else for (const [id,limits] of Object.entries(config.cargoLimits)) {
      const item = preflight.cargo.find(c=>c.id===id);
      if (!item) { fail(`검토 한도의 품목을 찾을 수 없습니다: ${id}`); continue; }
      if (!object(limits) || Object.keys(limits).some(key=>!['maxStackLayers','maxTopLoadKg'].includes(key))) { fail(`품목 ${id}: 검토 한도 형식이 올바르지 않습니다.`);continue; }
      if (own(limits,'maxStackLayers')) check(limits.maxStackLayers,`${id} 검토 적층단`,item.strengthUnverified?1:item.maxStackLayers??1,LIMIT_REVIEW_BOUNDS.layers,true);
      if (own(limits,'maxTopLoadKg')) check(limits.maxTopLoadKg,`${id} 검토 상부하중`,item.strengthUnverified?0:item.maxTopLoadKg??0,LIMIT_REVIEW_BOUNDS.weight);
    }
  }
  if (own(config,'simulation')) {
    if (!object(config.simulation) || Object.keys(config.simulation).some(key=>!['maxDisplacementMm','maxRotationDeg'].includes(key))) fail('관성 검토 한도 형식이 올바르지 않습니다.');
    else {
      if (own(config.simulation,'maxDisplacementMm')) check(config.simulation.maxDisplacementMm,'검토 변위',0,LIMIT_REVIEW_BOUNDS.displacementMm,false,true);
      if (own(config.simulation,'maxRotationDeg')) check(config.simulation.maxRotationDeg,'검토 회전각',0,LIMIT_REVIEW_BOUNDS.rotationDeg,false,true);
    }
  }
  if (errors.length) return {...strict,status:'invalid',errors};
  if (isARules(container) || cargo.some(item=>item.unitKind==='pallet' || item.mixedLoadingMethod === 'pallet' || item.sourcePalletIndex != null)) return {...strict,status:'unsupported',errors:['WHAT-IF REVIEW는 legacy 직접 박스 적재만 지원합니다. A·팔레트·MIXED는 엄격 모드로 전환하세요.']};
  const valid = config as LimitReviewConfig;
  const { limitReview: _review, ...originalContainer } = container;
  const scenario: ContainerSpec = { ...originalContainer,
    ...(valid.maxPayloadKg !== undefined ? {maxPayloadKg:valid.maxPayloadKg} : {}),
    ...(valid.floorLoadLimitKgPerM2 !== undefined ? {floorLoadLimitKgPerM2:valid.floorLoadLimitKgPerM2} : {}),
  };
  if (valid.minimumSupportRatio !== undefined) Object.assign(scenario,{[REVIEW_SUPPORT_RATIO]:valid.minimumSupportRatio});
  const scenarioCargo = preflight.cargo.map(item=>{
    const limits = valid.cargoLimits?.[item.id];
    if (!limits || !Object.keys(limits).length) return item;
    // Unverified strength has two independent operational limits. Selecting only one
    // must never silently relax the other, or rewrite original provenance.
    return {...item,
      ...(item.strengthUnverified ? {strengthUnverified:false,maxStackLayers:1,maxTopLoadKg:0} : {}),
      ...limits,
    };
  });
  return {status:'active',container:scenario,cargo:scenarioCargo,errors:[],minimumSupportRatio:valid.minimumSupportRatio ?? MIN_SUPPORT_RATIO};
}

/** Exact peak of piecewise-constant projected density; no grid averaging/spreader assumption. */
export function actualPeakFloorLoad(placements: Placement[]): number {
  const xs = [...new Set(placements.flatMap(p=>[p.x,p.x+p.length]))].sort((a,b)=>a-b);
  let peak = 0;
  for (let i=1;i<xs.length;i++) {
    const x = (xs[i-1]+xs[i])/2;
    const events = placements.filter(p=>p.x<x && p.x+p.length>x).flatMap(p=>[
      {y:p.y,d:p.weightKg/(p.length*p.width)}, {y:p.y+p.width,d:-p.weightKg/(p.length*p.width)},
    ]).sort((a,b)=>a.y-b.y);
    let sum = 0;
    for (let j=0;j<events.length;) {
      const y = events[j].y;
      do {sum+=events[j++].d;} while(j<events.length && events[j].y===y);
      if (j<events.length && events[j].y>y+1e-9) peak=Math.max(peak,sum);
    }
  }
  return peak;
}

/** Review acceptance checks scenario numbers, while output audits stay against originals. */
export function reviewPlacementBlockers(container:ContainerSpec,cargo:CargoItem[],placements:Placement[],totalTransportWeightKg?:number):string[] {
  const resolution=resolveLimitReview(container,cargo);
  if (resolution.status==='invalid' || resolution.status==='unsupported') return resolution.errors;
  const scenario=resolution.container;
  const threshold=resolution.minimumSupportRatio;

  if (resolution.status!=='active') {
    const issues=auditLoading(scenario,resolution.cargo,placements);
    const findings=validateOperationalLoading(scenario,resolution.cargo,placements,[],{legacyDirectBox:true}).filter(f=>f.severity==='error');
    const errors=[...issues.map(i=>i.message),...findings.map(f=>f.message)];
    if (totalTransportWeightKg!==undefined && (!Number.isFinite(totalTransportWeightKg) || totalTransportWeightKg>scenario.maxPayloadKg+EPS)) {
      errors.push('화물과 필수 고정·메움재 합계가 허용 총중량을 초과합니다.');
    }
    return [...new Set(errors)];
  }

  // Section 7: selected numerical limits remain hard for the scenario, but
  // unrelated operational verdicts (for example longitudinal CG) must be shown
  // with the placement instead of preventing the WHAT-IF calculation.
  const issues=auditLoading(scenario,resolution.cargo,placements).filter(issue=>{
    if (issue.type!=='UNSUPPORTED') return true;
    if (container.limitReview?.minimumSupportRatio===undefined) return true;
    return issue.placementIndexes.some(index=>{
      const assessment=assessPlacementSupport(placements[index],placements,undefined,threshold);
      return !assessment.supported;
    });
  });

  const nonWaivableOperational = new Set(['FLOATING','CG_OUTSIDE_SUPPORT','UNLOAD_BLOCKED','UNLOAD_BLOCKED_ABOVE']);
  const findings=validateOperationalLoading(
    {...scenario,maxPayloadKg:container.maxPayloadKg},
    resolution.cargo,
    placements,
    [],
    {legacyDirectBox:true},
  ).filter(f=>{
    if (f.severity!=='error' || !nonWaivableOperational.has(f.code)) return false;
    if ((f.code==='UNLOAD_BLOCKED' || f.code==='UNLOAD_BLOCKED_ABOVE') && container.unloadingPolicy!=='strict') return false;
    return true;
  });

  const errors=[...issues.map(i=>i.message),...findings.map(f=>f.message)];
  if (totalTransportWeightKg!==undefined) {
    if (!Number.isFinite(totalTransportWeightKg)) errors.push('고정·메움재 포함 총중량 계산값이 유효한 숫자가 아닙니다.');
    else if (totalTransportWeightKg>scenario.maxPayloadKg+EPS) errors.push('화물과 필수 고정·메움재 합계가 선택한 검토 총중량 한도를 초과합니다.');
  }
  return [...new Set(errors)];
}

/** Decorate original audits; this function never changes severity or claims a PASS. */
export function decorateLimitReview(container:ContainerSpec,cargo:CargoItem[],result:LoadingResult):LoadingResult {
  if (container.limitReview===undefined) {
    if (!result.limitReview) return result;
    const {limitReview:_review,...strict}=result;return strict;
  }
  const resolution=resolveLimitReview(container,cargo);
  const metrics:LimitReviewMetric[]=[];
  const config=container.limitReview;
  const add=(key:LimitReviewMetric['key'],unit:LimitReviewMetric['unit'],originalLimit:number|null,scenarioLimit:number,actual:number,provenance:LimitReviewMetric['provenance'],cargoId?:string,direction:LimitReviewMetric['direction']='maximum')=>{
    const excess=originalLimit===null?null:Math.max(0,direction==='maximum'?actual-originalLimit:originalLimit-actual);
    metrics.push({key,unit,originalLimit,scenarioLimit,actual,excess,excessPercent:originalLimit!==null && originalLimit>0 && excess!==null?excess/originalLimit*100:null,provenance,direction,...(cargoId?{cargoId}:{})});
  };
  if (resolution.status==='active') {
    if(config.maxPayloadKg!==undefined) add('payload','kg',container.maxPayloadKg,config.maxPayloadKg,result.securingBudget?.totalTransportWeightKg??result.placements.reduce((s,p)=>s+p.weightKg,0),'configured');
    if(config.floorLoadLimitKgPerM2!==undefined) add('floor-load','kg/m²',configuredFloorLoadLimit(container)??null,config.floorLoadLimitKgPerM2,actualPeakFloorLoad(result.placements),configuredFloorLoadLimit(container)===undefined?'unknown':'configured');
    if(config.minimumSupportRatio!==undefined) add('support','ratio',MIN_SUPPORT_RATIO,config.minimumSupportRatio,Math.min(1,...result.placements.map(p=>assessPlacementSupport(p,result.placements).supportRatio)),'app-default',undefined,'minimum');
    if(config.cargoLimits && Object.keys(config.cargoLimits).length) {
      const upper=result.placements.map(()=>[] as number[]),lower=result.placements.map(()=>[] as number[]);
      result.placements.forEach((p,i)=>result.placements.forEach((q,j)=>{if(i!==j && supportContactArea(p,q)>0){upper[i].push(j);lower[j].push(i);}}));
      const order=result.placements.map((_,i)=>i).sort((a,b)=>result.placements[a].z-result.placements[b].z);
      const depth=result.placements.map(()=>1),height=result.placements.map(()=>1);
      for(const i of order) for(const j of lower[i]) depth[i]=Math.max(depth[i],depth[j]+1);
      for(const i of [...order].reverse()) for(const j of upper[i]) height[i]=Math.max(height[i],height[j]+1);
      for(const [id,limits] of Object.entries(config.cargoLimits)) {
        const item=preflightCargoInput(cargo).cargo.find(c=>c.id===id)!;
        const indexes=result.placements.flatMap((p,i)=>p.cargoId===id?[i]:[]);
        if(limits.maxStackLayers!==undefined) add('stack-layers','layers',item.strengthUnverified?1:item.maxStackLayers??null,limits.maxStackLayers,Math.max(0,...indexes.map(i=>Math.max(depth[i],height[i]))),item.strengthUnverified?'unverified':item.maxStackLayers===undefined?'unknown':'configured',id);
        if(limits.maxTopLoadKg!==undefined) {
          const loads=indexes.map(i=>{const seen=new Set<number>(),queue=[...upper[i]];while(queue.length){const j=queue.pop()!;if(seen.has(j))continue;seen.add(j);queue.push(...upper[j]);}return [...seen].reduce((sum,j)=>sum+result.placements[j].weightKg,0);});
          add('top-load','kg',item.strengthUnverified?0:item.maxTopLoadKg??null,limits.maxTopLoadKg,Math.max(0,...loads),item.strengthUnverified?'unverified':item.maxTopLoadKg===undefined?'unknown':'configured',id);
        }
      }
    }
  }
  return {...result,limitReview:{mode:'what-if',label:'WHAT-IF REVIEW',status:resolution.status==='strict'?'invalid':resolution.status,config,metrics,errors:resolution.errors},
    operationalFindings:[...(result.operationalFindings??[]).filter(f=>f.code!=='LIMIT_REVIEW_ACTIVE' && f.code!=='LIMIT_REVIEW_INVALID'),
      {code:resolution.status==='active'?'LIMIT_REVIEW_ACTIVE':'LIMIT_REVIEW_INVALID',severity:resolution.status==='active'?'warning':'error',message:resolution.status==='active'?'WHAT-IF REVIEW: 원래 안전 한도 위반은 유지됩니다. 운송 승인·안전 인증이 아닙니다.':resolution.errors.join(' '),placementIndexes:[]}],
  };
}
