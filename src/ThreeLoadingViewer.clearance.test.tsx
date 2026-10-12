import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ThreeComparisonSceneProps } from './ThreeComparisonScene';
import ThreeLoadingViewer from './ThreeLoadingViewer';
import { selectPlacement } from './selectionEvents';
import { setUiLanguage } from './uiLanguage';
import { readTransportEquipment, selectTransportEquipment, getTransportEquipment } from './transportEquipment';
const captured = vi.hoisted(()=>({scene:null as ThreeComparisonSceneProps|null}));
vi.mock('./ThreeComparisonScene',()=>({default:(props:ThreeComparisonSceneProps)=>{captured.scene=props;return <canvas/>;}}));
const container = {length:6,width:2.4,height:2.6,maxPayloadKg:1000};
const box = {cargoId:'A',x:1,y:.3,z:.2,length:2,width:.5,height:.7,weightKg:10};
const result = {placements:[box,{...box,cargoId:'B',x:3}],remaining:[],validationIssues:[],usedVolumeM3:1.4,loadedWeightKg:20};
const supports = [{id:'P-1',x:.5,y:.2,z:0,length:1.2,width:1,height:.15,weightKg:20}];
let root:Root, host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);setUiLanguage('ko');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();setUiLanguage('ko');vi.unstubAllGlobals();});
const render = () => act(async()=>root.render(<ThreeLoadingViewer container={container} result={result} supports={supports} syncSelection/>));
const panel = () => host.querySelector('.three-clearance-inspector');
it('switches cargo/pallet selection, changes displayed axis and clears via button, Escape and synced events',async()=>{
  await render();
  const originalPlan = captured.scene!.plan;
  await act(async()=>captured.scene!.onSelect(0));
  expect(panel()!.textContent).toContain('A');
  expect(panel()!.querySelectorAll('[data-clearance-face]')).toHaveLength(6);
  expect(panel()!.querySelector('[data-clearance-face="rear"]')!.textContent).toContain('3,000'.replace(',',''));
  await act(async()=>captured.scene!.onSelect(1)); expect(panel()!.textContent).toContain('B');
  await act(async()=>captured.scene!.onSupportSelect!(0)); expect(panel()!.textContent).toContain('팔레트 받침');
  expect(captured.scene!.selected).toBeNull();expect(captured.scene!.selectedSupport).toBe(0);
  const heightButton = Array.from(panel()!.querySelectorAll('button')).find(b=>b.textContent==='높이')!;
  await act(async()=>heightButton.click()); expect(captured.scene!.clearanceAxis).toBe('height');
  await act(async()=>panel()!.querySelector<HTMLButtonElement>('[aria-label="선택 해제"]')!.click()); expect(panel()).toBeNull();
  await act(async()=>selectPlacement(0));expect(panel()).not.toBeNull();expect(captured.scene!.selectedSupport).toBeNull();
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))); expect(panel()).toBeNull();
  await act(async()=>captured.scene!.onSelect(0)); await act(async()=>captured.scene!.onSelect(null));expect(panel()).toBeNull();
  expect(captured.scene!.plan).toBe(originalPlan);
});
it('localizes the inspector live without rebuilding or altering the plan',async()=>{
  await render();await act(async()=>captured.scene!.onSelect(0));const plan=captured.scene!.plan;
  for(const language of ['en','vi'] as const){await act(async()=>setUiLanguage(language));expect(panel()!.textContent).not.toMatch(/[가-힣]/);expect(captured.scene!.plan).toBe(plan);}
});
it('hides hidden cargo measurements and clears obsolete plan selection',async()=>{
  await render();await act(async()=>captured.scene!.onSelect(0));
  await act(async()=>root.render(<ThreeLoadingViewer container={container} result={result} supports={supports} syncSelection weightView/>));
  expect(panel()).toBeNull();
  await act(async()=>root.render(<ThreeLoadingViewer container={container} result={{...result,placements:[]}} supports={[]} syncSelection/>));
  expect(panel()).toBeNull();expect(captured.scene!.selected).toBeNull();
});
it('keeps existing selection callbacks, recorded doors and open rear references',async()=>{
  const original=readTransportEquipment(),cargoSelect=vi.fn(),supportSelect=vi.fn();
  try {
    for(const [id,access] of [['40-high-cube','door'],['20-flatrack','rear']] as const){
      const equipment=getTransportEquipment(id)!;act(()=>selectTransportEquipment(equipment));
      await act(async()=>root.render(<ThreeLoadingViewer container={equipment} result={result} supports={supports} onCargoSelect={cargoSelect} onSupportSelect={supportSelect}/>));
      expect(captured.scene!.plan.rearAccess).toBe(access);
    }
    await act(async()=>{captured.scene!.onSelect(1);captured.scene!.onSelect(1);});
    expect(cargoSelect).not.toHaveBeenCalled();expect(panel()).not.toBeNull();
    await act(async()=>Array.from(panel()!.querySelectorAll('button')).find(b=>b.textContent==='팔레트 상세 보기')!.click());
    expect(cargoSelect).toHaveBeenCalledExactlyOnceWith(1);
    await act(async()=>captured.scene!.onSupportSelect!(0));expect(supportSelect).not.toHaveBeenCalled();
    await act(async()=>Array.from(panel()!.querySelectorAll('button')).find(b=>b.textContent==='팔레트 상세 보기')!.click());
    expect(supportSelect).toHaveBeenCalledExactlyOnceWith(0);
  } finally {act(()=>selectTransportEquipment(original));}
});
it('keeps accepted replay values, then restores static distances and weight-view selection',async()=>{
  await render();await act(async()=>captured.scene!.onSelect(0));
  const plan=captured.scene!.plan;
  const frame={phase:'force' as const,step:1,cargo:new Float32Array(),supports:new Float32Array()};
  await act(async()=>root.render(<ThreeLoadingViewer container={container} result={result} supports={supports} syncSelection frameData={frame}/>));
  // Mock the scene report, which is sourced from the accepted (not incoming) pose.
  const clearance={selection:{kind:'cargo' as const,index:0},measurements:[{face:'inner' as const,axis:'length' as const,distanceM:-.02,from:[0,0,0] as [number,number,number],to:[0,0,0] as [number,number,number]}]};
  await act(async()=>captured.scene!.onStats!({revision:plan.revision,clearance,modelCount:2,labelFaces:8,visibleLabelFaces:8,visibleCargo:2,renderCalls:1,triangles:12,geometries:1,textures:1,acceptedFrameStep:0,rejectedFrame:true,cgVisible:false,cgPosition:null,cameraPose:''}));
  expect(panel()!.textContent).toContain('−20 mm');expect(panel()!.textContent).toContain('경계 초과');
  await render();expect(panel()!.querySelector('[data-clearance-face="inner"]')!.textContent).toContain('1000 mm');
  await act(async()=>root.render(<ThreeLoadingViewer container={container} result={result} supports={supports} syncSelection weightView/>));expect(panel()).toBeNull();
  await render();expect(panel()).not.toBeNull();expect(captured.scene!.selected).toBe(0);
});
