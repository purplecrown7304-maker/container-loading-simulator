import { describe, expect, it, vi, afterEach } from 'vitest';
import { boxSecuringBudget, boxSecuringRequirements } from './securingBudget';
import { defaultSecuringMaterialSettings, SECURING_MATERIAL_SETTINGS_STORAGE_KEY } from '../securingMaterialSettings';
import { buildSecuringUsage } from '../inertiaCertification';
import { loadContainer } from './loadingEngine';
import { loadContainerAsync } from './asyncLoading';
import { buildSecuringPayloadAdjustmentCandidateAsync } from './finalResultOptimization';
import type { CargoItem, ContainerSpec } from './types';
const materials = defaultSecuringMaterialSettings;
const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 100 };
const cargo: CargoItem[] = [{ id: 'box', name: 'box', length: .5, width: .5, height: .5, weightKg: 10, quantity: 20, maxStackLayers: 2 }];
afterEach(()=>{ vi.unstubAllGlobals(); localStorage.removeItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY); });
describe('securing-inclusive payload budget', ()=>{
  it('shares exact material counts with certification at all reinforcement levels', ()=>{
    for (const level of [1,2,3] as const) {
      const result = loadContainer(container, cargo, { publish:false, securingLevel:level });
      const usage = buildSecuringUsage({mode:'boxes',container,cargo,result},level);
      expect(usage.estimatedAddedWeightKg).toBeCloseTo(boxSecuringRequirements(result.placements.length,level,materials).weightKg,10);
      expect(result.loadedWeightKg + usage.estimatedAddedWeightKg).toBeLessThanOrEqual(container.maxPayloadKg);
      expect(result.securingBudget?.requiredWeightKg).toBeCloseTo(usage.estimatedAddedWeightKg,10);
    }
  });
  it('reserves before accepting cargo instead of filling to cargo-only payload', ()=>{
    const result=loadContainer(container,cargo,{publish:false});
    expect(result.placements).toHaveLength(9);
    expect(result.remaining.reduce((sum,row)=>sum+row.quantity,0)).toBe(11);
    expect(result.loadedWeightKg + buildSecuringUsage({mode:'boxes',container,cargo,result},1).estimatedAddedWeightKg).toBeLessThanOrEqual(100);
  });
  it('bounds material weight even when a lower payload admits more light boxes', ()=>{
    const mixed=[...cargo,{...cargo[0],id:'light',weightKg:1,quantity:60}];
    const budget=boxSecuringBudget(container,mixed,3,materials);
    expect(budget).toBeGreaterThanOrEqual(boxSecuringRequirements(64,3,materials).weightKg);
  });
  it('transfers exact user material settings into the browser worker', async()=>{
    const custom={...materials,antiSlipKgPerEa:4.5};
    localStorage.setItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY,JSON.stringify(custom));
    let sent: {securingOptions:{securingMaterials:typeof custom}} | undefined;
    vi.stubGlobal('Worker',class { onmessage?: (event:unknown)=>void; terminate() {} postMessage(data:typeof sent) {sent=data; queueMicrotask(()=>this.onmessage?.({data:{result:{placements:[],remaining:[],loadedWeightKg:0,usedVolumeM3:0,validationIssues:[]}}}));} });
    await loadContainerAsync(container,cargo,'capacity');
    expect(sent?.securingOptions.securingMaterials).toEqual(custom);
  });
  it('re-packs a higher-level payload failure with waiting cargo instead of permuting the same count', async()=>{
    vi.stubGlobal('Worker',undefined);
    const result=loadContainer(container,cargo,{publish:false});
    const target={mode:'boxes' as const,container,cargo,result};
    expect(result.loadedWeightKg+buildSecuringUsage(target,3).estimatedAddedWeightKg).toBeGreaterThan(100);
    const adjusted=await buildSecuringPayloadAdjustmentCandidateAsync(target);
    expect(adjusted).not.toBeNull();
    expect(adjusted!.result.placements.length).toBeLessThan(result.placements.length);
    expect(adjusted!.result.loadedWeightKg+buildSecuringUsage(adjusted!.target,3).estimatedAddedWeightKg).toBeLessThanOrEqual(100);
    expect(adjusted!.result.placements.length+adjusted!.result.remaining.reduce((sum,row)=>sum+row.quantity,0)).toBe(20);
  });
});

it('keeps rejected-edit coordinates for review but refreshes overweight evidence after material changes', async()=>{
  const { writeManualOverride, clearManualOverride } = await import('./manualOverride');
  const { restoreLoadingResult } = await import('./loadingEngine');
  const result=loadContainer(container,cargo,{publish:false});
  localStorage.setItem(SECURING_MATERIAL_SETTINGS_STORAGE_KEY,JSON.stringify({...materials,antiSlipKgPerEa:100}));
  writeManualOverride(container,cargo,{...result,placements:result.placements.map((p,i)=>i ? p : {...p,x:99})});
  const restored=restoreLoadingResult(container,cargo,result);
  expect(restored.placements).toEqual(result.placements);
  expect(restored.securingBudget!.totalTransportWeightKg).toBeGreaterThan(100);
  expect(restored.validationIssues.some(issue=>issue.type==='PAYLOAD')).toBe(true);
  clearManualOverride();
});

it('does not charge securing weight for impossible or invalid requested cargo',()=>{
  for (const extra of [ {...cargo[0],id:'invalid',length:-1,weightKg:.01,quantity:10000},
    {...cargo[0],id:'oversize',length:400,width:200,height:200,weightKg:.01,quantity:10000} ]) {
    const result=loadContainer(container,[{...cargo[0],quantity:1},extra],{publish:false});
    expect(result.placements).toHaveLength(1);
    expect(result.securingBudget!.requiredWeightKg).toBe(2.2);
    expect(result.remaining.find(row=>row.cargoId===extra.id)?.reason).not.toMatch(/필수 고정재/);
  }
});
it('bases securing on actual floor-limited tiny-box count, not ten thousand requested boxes',()=>{
  const tiny=[{...cargo[0],length:.1,width:.1,height:.1,weightKg:.01,quantity:10000,maxStackLayers:1}];
  const result=loadContainer(container,tiny,{publish:false});
  expect(result.placements).toHaveLength(800);
  expect(result.securingBudget!.totalTransportWeightKg).toBeLessThanOrEqual(100);
});
it('keeps a feasible load at discrete material-count boundaries rather than emptying it',()=>{
  const tiny=[{...cargo[0],length:.1,width:.1,height:.1,weightKg:.01,quantity:10000,maxStackLayers:10}];
  const result=loadContainer(container,tiny,{publish:false});
  expect(result.placements.length).toBeGreaterThanOrEqual(2400);
  expect(result.placements.length).toBeLessThanOrEqual(2460);
  expect(result.securingBudget!.totalTransportWeightKg).toBeLessThanOrEqual(100);
  expect(result.placements.length+result.remaining.reduce((n,row)=>n+row.quantity,0)).toBe(10000);
});
