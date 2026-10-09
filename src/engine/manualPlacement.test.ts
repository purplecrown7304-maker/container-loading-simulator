import { describe, expect, it } from 'vitest';
import { assessManualMove, snapManualCoordinate, supportsOtherPlacement } from './manualPlacement';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import { auditLoading } from './loadingAudit';

const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [{ id:'A', name:'A', length:1, width:1, height:0.5, weightKg:20, quantity:2, maxStackLayers:3, maxTopLoadKg:100 }];
const source: LoadingResult = {
  placements:[
    { cargoId:'A', x:0,y:0,z:0,length:1,width:1,height:0.5,weightKg:20 },
    { cargoId:'A', x:0,y:0,z:0.5,length:1,width:1,height:0.5,weightKg:20 },
  ], remaining:[], loadedWeightKg:40, usedVolumeM3:1, validationIssues:[],
};

describe('manual placement', () => {
  it('snaps coordinates', () => expect(snapManualCoordinate(1.027,0.05)).toBe(1.05));
  it('locks a lower box supporting another box', () => expect(supportsOtherPlacement(0,source.placements)).toBe(true));
  it('rejects moving a supporting lower box', () => {
    const assessment = assessManualMove(container,cargo,source,0,{x:2,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('지지');
  });
  it('allows a top box to move to a safe floor position', () => {
    const assessment = assessManualMove(container,cargo,source,1,{x:3,y:1,z:0});
    expect(assessment.valid).toBe(true);
    expect(assessment.result.placements[1].x).toBe(3);
  });
  it('rejects collision', () => {
    const assessment = assessManualMove(container,cargo,source,1,{x:0,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('충돌');
  });

  it('rejects a move that blocks strict unloading before it can be applied', () => {
    const stops = [{ ...cargo[0], id:'FIRST', quantity:1, unloadPriority:1 }, { ...cargo[0], id:'LATER', quantity:1, unloadPriority:2 }];
    const current: LoadingResult = { ...source, placements:[
      { ...source.placements[0], cargoId:'FIRST', x:3 },
      { ...source.placements[0], cargoId:'LATER', x:1 },
    ] };
    const strict = { ...container, unloadingPolicy:'strict' as const };
    expect(auditLoading(strict,stops,current.placements)).toEqual([]);
    const assessment = assessManualMove(strict,stops,current,0,{x:0,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('BLOCKS_UNLOAD_PATH');
    expect(assessment.result.operationalFindings?.some(f => f.code === 'UNLOAD_BLOCKED')).toBe(true);
    expect(current.placements[0].x).toBe(3);
  });

  it('rejects a fully supported move that exceeds the configured floor limit', () => {
    const heavy = [{ ...cargo[0], weightKg:100, maxTopLoadKg:200 }];
    const current: LoadingResult = { ...source, loadedWeightKg:200, placements:[
      { ...source.placements[0], weightKg:100 },
      { ...source.placements[0], x:2, weightKg:100 },
    ] };
    const limited = { ...container, floorLoadLimitKgPerM2:150 };
    expect(auditLoading(limited,heavy,current.placements)).toEqual([]);
    const assessment = assessManualMove(limited,heavy,current,1,{x:0,y:0,z:.5});
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('FLOOR_LOAD_LIMIT');
    expect(current.placements[1]).toMatchObject({x:2,z:0});
  });

  it('retains stricter full support for manual movement than the 80% final minimum', () => {
    const assessment = assessManualMove(container,cargo,source,1,{x:.2,y:0,z:.5});
    expect(assessment.result.validationIssues).toEqual([]);
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('전체 바닥면');
  });

  it('allows an existing CG verdict to persist or improve, but rejects worsening it', () => {
    const spec: ContainerSpec = { length:4,width:2,height:2,maxPayloadKg:100 };
    const items: CargoItem[] = [{ id:'CG',name:'CG',length:1,width:1,height:.5,weightKg:80,quantity:1,maxStackLayers:1,maxTopLoadKg:0 }];
    const current: LoadingResult = {
      placements:[{cargoId:'CG',x:.5,y:.5,z:0,length:1,width:1,height:.5,weightKg:80}],
      remaining:[],loadedWeightKg:80,usedVolumeM3:.5,validationIssues:[],
    };
    const same = assessManualMove(spec,items,current,0,{x:.5,y:.5,z:0});
    expect(same.valid).toBe(true);
    expect(same.result.operationalFindings?.some(f=>f.code==='CG_LONGITUDINAL'&&f.severity==='error')).toBe(true);
    const improved = assessManualMove(spec,items,current,0,{x:1,y:.5,z:0});
    expect(improved.valid).toBe(true);
    const worsened = assessManualMove(spec,items,current,0,{x:0,y:.5,z:0});
    expect(worsened.valid).toBe(false);
    expect(worsened.reasons.join(' ')).toContain('기존 운영 오류가 악화');
  });

  it('keeps an existing securing-payload error visible when the manual move does not worsen it', () => {
    const assessment = assessManualMove({...container,maxPayloadKg:41},cargo,source,1,{x:3,y:1,z:0});
    expect(assessment.valid).toBe(true);
    expect(assessment.result.validationIssues.some(issue => issue.type === 'PAYLOAD')).toBe(true);
    expect(assessment.result.securingBudget?.totalTransportWeightKg).toBeGreaterThan(41);
  });
  it('rejects a manual move that creates a new payload blocker through extra void-fill mass', () => {
    const spec: ContainerSpec = { length:4,width:2.35,height:2,maxPayloadKg:100 };
    const items: CargoItem[] = [{ id:'VOID',name:'VOID',length:.6,width:2.35,height:.8,weightKg:95,quantity:1,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }];
    const current: LoadingResult = {
      placements:[{cargoId:'VOID',x:3.4,y:0,z:0,length:.6,width:2.35,height:.8,weightKg:95}],
      remaining:[],loadedWeightKg:95,usedVolumeM3:1.128,validationIssues:[],
    };
    const assessment=assessManualMove(spec,items,current,0,{x:0,y:0,z:0});
    expect(assessment.valid).toBe(false);
    expect(assessment.result.validationIssues.some(issue=>issue.type==='PAYLOAD')).toBe(true);
    expect(assessment.reasons.join(' ')).toContain('새 안전 차단 오류');
  });

  it('preserves level 3 securing weight and reserve for a non-worsening no-op edit', () => {
    const current: LoadingResult = {...source,placements:[source.placements[0],{...source.placements[0],x:3,y:1}],
      securingBudget:{level:3,reservedWeightKg:30,requiredWeightKg:14.2,totalTransportWeightKg:54.2}};
    const assessment = assessManualMove({...container,maxPayloadKg:50},cargo,current,1,{x:3,y:1,z:0});
    expect(assessment.valid).toBe(true);
    expect(assessment.result.validationIssues.some(issue => issue.type === 'PAYLOAD')).toBe(true);
    expect(assessment.result.securingBudget).toMatchObject({level:3,reservedWeightKg:30});
    expect(assessment.result.securingBudget?.totalTransportWeightKg).toBeCloseTo(54.2);
  });

  it('retains an unloading-strategy conflict warning when refreshing manual findings', () => {
    const stops = [{...cargo[0],id:'FIRST',quantity:1,weightKg:30,unloadPriority:1},
      {...cargo[0],id:'LATER',quantity:1,weightKg:10,unloadPriority:2}];
    const current: LoadingResult = {...source,placements:[
      {...source.placements[0],cargoId:'FIRST',x:2,y:.5,weightKg:30},
      {...source.placements[0],cargoId:'LATER',x:0,y:.5,weightKg:10},
    ],operationalFindings:[{code:'HEAVY_INNER_UNLOAD_CONFLICT',severity:'warning',message:'source unloading strategy',placementIndexes:[]}]};
    const assessment = assessManualMove(container,stops,current,0,{x:2,y:.5,z:0});
    expect(assessment.valid).toBe(true);
    expect(assessment.result.operationalFindings?.filter(f=>f.code==='HEAVY_INNER_UNLOAD_CONFLICT')).toHaveLength(1);
  });

  it('rejects a centered rotation outside allowedOrientations', () => {
    const space = {length:2,width:2,height:2,maxPayloadKg:100};
    const item: CargoItem = {...cargo[0],length:1,width:.5,quantity:1,weightKg:10,allowRotation:true,allowedOrientations:['LWH']};
    const current: LoadingResult = {...source,placements:[{...source.placements[0],x:.5,y:.75,width:.5,weightKg:10}],loadedWeightKg:10,usedVolumeM3:.25};
    const assessment = assessManualMove(space,[item],current,0,{x:.75,y:.5,z:0},true);
    expect(assessment.valid).toBe(false);
    expect(assessment.reasons.join(' ')).toContain('ORIENTATION_RESTRICTED');
  });
  it('rejects manual stacking over a pressure cap or an unverified carton', () => {
    const space = {length:4,width:2,height:2,maxPayloadKg:100};
    const current: LoadingResult = {...source,placements:[
      {...source.placements[0],x:1.5,y:.5}, {...source.placements[0],x:0,y:.5},
    ]};
    const pressure = [{...cargo[0],maxTopLoadKg:undefined,maxTopPressureKgPerM2:10}];
    expect(assessManualMove(space,pressure,current,1,{x:1.5,y:.5,z:.5}).reasons.join(' ')).toContain('TOP_PRESSURE_LIMIT');
    const unverified = [{...cargo[0],maxStackLayers:undefined,maxTopLoadKg:undefined,strengthUnverified:true}];
    const assessment = assessManualMove(space,unverified,current,1,{x:1.5,y:.5,z:.5});
    expect(assessment.valid).toBe(false);
    expect(assessment.result.validationIssues.some(issue=>issue.type==='STACK_LIMIT')).toBe(true);
  });
});
