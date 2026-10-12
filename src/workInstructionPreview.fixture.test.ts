import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { reportFixture } from './reportZones.fixture';
import { buildReportZones } from './reportZones';
import { buildNumberedZonePlans } from './reportZoneGraphics';
import { buildLoadingReportHtml } from './report';
import { buildWorkInstructionRuns, formatWorkRun, workInstructionLegend } from './workInstructionGrid';
import { buildPalletAssemblyHtml, type PalletWorkSnapshot } from './palletWorkerReportV2';
import { defaultPalletSpec, type PalletLoad } from './engine/palletOptimization';
import { setUiLanguage } from './uiLanguage';
import { loadContainer } from './engine/loadingEngine';

it('verifies actual solver output addresses for mixed boxes and the 74-carton truck case', () => {
  const container = { length: 2.83, width: 1.67, height: 1.58, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 220, floorLoadWarningMultiplier: 3, unloadingPolicy: 'strict' as const, ceilingClearanceM: .05 };
  const full = { id: 'GST-002', name: 'GST-002', length: .235, width: .13, height: .265, weightKg: 1.42, quantity: 73, allowRotation: true, maxTopLoadKg: 34.3 };
  for (const cargo of [[full, {...full,id:'GST-002-PARTIAL',quantity:1,weightKg:.74}], [{...full,quantity:15},{...full,id:'B',length:.3,width:.2,height:.4,quantity:7}]]) {
    const result = loadContainer(container,cargo,{strategy:'capacity',publish:false});
    const zones=buildReportZones(result.placements), before=JSON.stringify(result);
    const all=zones.flatMap(z=>buildWorkInstructionRuns(result.placements,z.indices));
    expect(all.reduce((s,r)=>s+r.quantity,0)).toBe(result.placements.length);
    expect(new Set(all.flatMap(r=>r.indices)).size).toBe(result.placements.length);
    for(const r of all) expect(r.quantity).toBe((r.columnTo-r.columnFrom+1)*(r.rowTo-r.rowFrom+1));
    expect(result.placements.length+result.remaining.reduce((s,r)=>s+r.quantity,0)).toBe(cargo.reduce((s,c)=>s+c.quantity,0));
    if(cargo[0].quantity===73) expect(result.placements).toHaveLength(74);
    expect(JSON.stringify(result)).toBe(before);
  }
});

it.runIf(Boolean(process.env.WORK_GRID_PREVIEW_DIR))('exports actual presentation fixtures for local preview', () => {
  const dir=process.env.WORK_GRID_PREVIEW_DIR!; mkdirSync(dir,{recursive:true});
  const {container,cargo,result}=reportFixture(), zones=buildReportZones(result.placements);
  for(const lang of ['ko','en','vi'] as const) { setUiLanguage(lang); writeFileSync(`${dir}/work-order-${lang}.html`,buildLoadingReportHtml(container,cargo,result)); }
  setUiLanguage('ko');
  const plans=new DOMParser().parseFromString(buildNumberedZonePlans(container,cargo,result.placements,zones),'text/html');
  const selections=[{zone:zones[0],layer:1},{zone:zones.at(-1)!,layer:2}];
  const pages=selections.map(({zone,layer})=>{
    const article=plans.querySelector(`[data-zone="${zone.label}"][data-layer="${layer}"]`)!;
    const svg=article.querySelector('svg')!.outerHTML.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans CJK KR" ');
    writeFileSync(`${dir}/zone-${zone.label}-${layer}.svg`,svg);
    const rows=buildWorkInstructionRuns(result.placements,zone.indices).map((run,i)=>({marker:`${zone.label}-${i+1}`,location:formatWorkRun(run),id:run.cargoId,quantity:run.quantity,layer:run.layer})).filter(r=>r.layer===layer);
    return {title:`${zone.label} 구역 · ${layer}단`,svg:`zone-${zone.label}-${layer}.svg`,rows};
  });
  const local=[{cargoId:'제품 A',x:0,y:0,z:0,length:.5,width:.5,height:.3,weightKg:1},{cargoId:'제품 A',x:0,y:.5,z:0,length:.5,width:.5,height:.3,weightKg:1},{cargoId:'제품 A',x:.5,y:0,z:0,length:.5,width:.5,height:.3,weightKg:1},{cargoId:'제품 A',x:0,y:0,z:.3,length:.5,width:.5,height:.3,weightKg:1}];
  const p:PalletLoad={palletIndex:2,stackColumn:1,stackLevel:2,x:0,y:0,z:.8,length:1.1,width:1.1,height:.15,cargoPlacements:local.map(b=>({...b,z:b.z+.95})),cargoWeightKg:4,packagingWeightKg:0,packagingExtraHeightM:0,cornerGuardsUsed:false,wrappingUsed:false,totalWeightKg:29,centerOfGravity:{x:.5,y:.5,z:1.15}};
  const snapshot:PalletWorkSnapshot={spec:defaultPalletSpec,result:{pallets:[p],placements:p.cargoPlacements,remaining:[],palletCount:1,loadedCargoWeightKg:4,totalPackagingWeightKg:0,avoidedPackagingWeightKg:0,packagedPalletCount:0,totalPalletizedWeightKg:29,consolidatedPallets:0,lateralImbalanceKg:0,stackedPallets:1,maxUsedStackLevel:2,optimization:{selectedStackTarget:2,candidateCount:1,floorPositions:1,redistributedForLowUtilization:false,consolidationPasses:0}}};
  const palletHtml=buildPalletAssemblyHtml(snapshot,[{...cargo[0],id:'제품 A',name:'제품 A'}]);
  const pdoc=new DOMParser().parseFromString(palletHtml,'text/html');
  const psvg=pdoc.querySelector('svg')!.outerHTML.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans CJK KR" ');
  writeFileSync(`${dir}/pallet-2.svg`,psvg);
  pages.push({title:'팔레트 P2 · 팔레트 위 박스 1단',svg:'pallet-2.svg',rows:buildWorkInstructionRuns(local).map((r,i)=>({marker:`#${r.indices.map(i=>i+1).join(', #')}`,location:formatWorkRun(r),id:r.cargoId,quantity:r.quantity,layer:r.layer}))});
  writeFileSync(`${dir}/preview-data.json`,JSON.stringify({legend:workInstructionLegend(),pages},null,2));
  expect(pages).toHaveLength(3);
});
