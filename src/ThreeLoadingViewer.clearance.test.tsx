import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ThreeComparisonSceneProps } from './ThreeComparisonScene';
import ThreeLoadingViewer from './ThreeLoadingViewer';
import { selectPlacement, PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { setUiLanguage } from './uiLanguage';
import { readTransportEquipment, selectTransportEquipment, getTransportEquipment } from './transportEquipment';
import { StagingSceneContext, type StagingSceneBridge } from './stagingSceneContext';
import { buildStagingInventory, stagingInputSignature } from './stagingInventory';
import { buildStagingYardLayout } from './stagingYardLayout';
import { readViewerQuality, saveViewerQuality } from './viewerQuality';
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
function bridgeFor(withPlan = true): StagingSceneBridge {
  const input = { scopeKey: 'viewer-test', mode: 'boxes' as const, container, cargo: ['A', 'B'].map(id => ({ id, name: id, length: 2, width: .5, height: .7, weightKg: 10, quantity: 2, allowRotation: false })) };
  const inventory = buildStagingInventory({ ...input, selectedPlan: withPlan ? { inputSignature: stagingInputSignature(input), result } : undefined });
  const layout = buildStagingYardLayout(inventory.yardUnits, { container, vehicleRig: 'articulated' });
  return { inventory, layout, visibleZoneIds: layout.zones.slice(0, 1).map(zone => zone.id), selectedUnitId: null, view: 'all', viewRequest: 0, dragging: false, preview: null,
    selectUnit: vi.fn(), selectVehicleUnit: vi.fn(), setView: vi.fn(), onDragStart: vi.fn(), onDragMove: vi.fn(), onDragEnd: vi.fn(), onDraggingChange: vi.fn() };
}
function markReady() {
  captured.scene!.onReady!({ revision: captured.scene!.plan.revision, modelCount: 0, labelFaces: 0, visibleLabelFaces: 0, visibleCargo: 0, renderCalls: 1, triangles: 12, geometries: 1, textures: 0, acceptedFrameStep: null, rejectedFrame: false, cgVisible: false, cgPosition: null, cameraPose: '' });
}
it('connects pre-calculation preview inventory to the main scene without adding duplicate scope controls', async () => {
  const bridge = bridgeFor(false), empty = { ...result, placements: [], loadedWeightKg: 0, usedVolumeM3: 0 };
  await act(async () => root.render(<StagingSceneContext.Provider value={bridge}><ThreeLoadingViewer container={container} result={empty} preview /></StagingSceneContext.Provider>));
  expect(captured.scene!.staging).toBe(bridge); expect(captured.scene!.view).toBe('all');
  expect(host.querySelector('[data-three-staging-yard]')!.getAttribute('data-three-staging-yard')).toBe('4');
  expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === '전체 보기')).toBe(false);
  expect(captured.scene!.plan.placements).toHaveLength(0);
});
it('links 3D/list vehicle selection once while preserving existing box callbacks and selection sync', async () => {
  let bridge = bridgeFor(); const cargoSelect = vi.fn();
  const renderBridge = () => act(async () => root.render(<StagingSceneContext.Provider value={bridge}><ThreeLoadingViewer container={container} result={result} syncSelection onCargoSelect={cargoSelect} /></StagingSceneContext.Provider>));
  await renderBridge(); const plan = captured.scene!.plan;
  await act(async () => captured.scene!.onSelect(0));
  expect(bridge.selectVehicleUnit).toHaveBeenCalledExactlyOnceWith('cargo', 0); expect(cargoSelect).toHaveBeenCalledExactlyOnceWith(0);
  const unit = bridge.inventory.vehicleUnits.find(item => item.sourcePlacementIndex === 0)!;
  bridge = { ...bridge, selectedUnitId: unit.id }; await renderBridge();
  expect(captured.scene!.selected).toBe(0); expect(captured.scene!.plan).toBe(plan);
  await act(async () => selectPlacement(1)); expect(bridge.selectVehicleUnit).toHaveBeenLastCalledWith('cargo', 1);
  let lastLegacyIndex: number | null | undefined;
  const observeLegacy = (event: Event) => { lastLegacyIndex = (event as CustomEvent<PlacementSelectDetail>).detail.index; };
  window.addEventListener(PLACEMENT_SELECT_EVENT, observeLegacy);
  bridge = { ...bridge, selectedUnitId: bridge.inventory.yardUnits[0].id }; await renderBridge();
  window.removeEventListener(PLACEMENT_SELECT_EVENT, observeLegacy);
  expect(captured.scene!.selected).toBeNull(); expect(captured.scene!.selectedSupport).toBeNull();
  expect(lastLegacyIndex).toBeNull(); expect(bridge.selectUnit).not.toHaveBeenCalled();
  await act(async () => captured.scene!.onSelect(null)); expect(bridge.selectUnit).toHaveBeenLastCalledWith(null);
});
it('switches legacy orientations to vehicle scope and retains their request stamp until a new panel view action', async () => {
  let bridge = bridgeFor();
  const renderBridge = () => act(async () => root.render(<StagingSceneContext.Provider value={bridge}><ThreeLoadingViewer container={container} result={result} /></StagingSceneContext.Provider>));
  await renderBridge(); await act(async () => markReady());
  const top = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '상단')!;
  expect(top.dataset.viewOnly).toBe('true'); await act(async () => top.click());
  expect(bridge.setView).toHaveBeenCalledExactlyOnceWith('vehicle');
  bridge = { ...bridge, view: 'vehicle', viewRequest: 1 }; await renderBridge();
  expect(captured.scene!.view).toBe('top'); expect(top.getAttribute('aria-pressed')).toBe('true');
  bridge = { ...bridge, selectedUnitId: bridge.inventory.yardUnits[0].id }; await renderBridge();
  expect(captured.scene!.view).toBe('top');
  bridge = { ...bridge, view: 'yard', viewRequest: 2 }; await renderBridge();
  expect(captured.scene!.view).toBe('yard'); expect(top.getAttribute('aria-pressed')).toBe('false');
});
it('keeps staging details clear until boundary distances are explicitly opened and closes them without clearing root selection', async () => {
  let bridge = bridgeFor(); bridge = { ...bridge, selectedUnitId: bridge.inventory.vehicleUnits[0].id };
  const renderBridge = () => act(async () => root.render(<StagingSceneContext.Provider value={bridge}><ThreeLoadingViewer container={container} result={result} syncSelection /></StagingSceneContext.Provider>));
  await renderBridge();
  expect(panel()).toBeNull(); expect(captured.scene!.clearanceVisible).toBe(false);
  const toggle = Array.from(host.querySelectorAll<HTMLButtonElement>('.viewer-bottom-info button')).find(button => button.textContent === '경계 거리')!;
  expect(toggle.dataset.viewOnly).toBe('true'); expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async () => toggle.click());
  expect(panel()!.classList.contains('staging-clearance-inspector')).toBe(true);
  expect(panel()!.parentElement).toBe(host.querySelector('.unity-viewer'));
  expect(captured.scene!.clearanceVisible).toBe(true); expect(toggle.getAttribute('aria-controls')).toBe(panel()!.id);
  await act(async () => setUiLanguage('en'));
  expect(toggle.textContent).toBe('Boundary distances');
  await act(async () => panel()!.querySelector<HTMLButtonElement>('[aria-label="Close boundary distances"]')!.click());
  expect(panel()).toBeNull(); expect(bridge.selectUnit).not.toHaveBeenCalled();
  await act(async () => toggle.click()); expect(panel()).not.toBeNull();
  bridge = { ...bridge, selectedUnitId: bridge.inventory.vehicleUnits[1].id }; await renderBridge();
  expect(panel()).toBeNull(); expect(captured.scene!.clearanceVisible).toBe(false);
});
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
it('repeats an explicit camera view request without changing the selected plan', async () => {
  await render();
  await act(async () => markReady());
  const plan = captured.scene!.plan, request = captured.scene!.viewRequest ?? 0;
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === '입체')!;
  await act(async () => button.click());
  expect(captured.scene!.viewRequest).toBe(request + 1);
  await act(async () => button.click());
  expect(captured.scene!.viewRequest).toBe(request + 2);
  expect(captured.scene!.plan).toBe(plan);
});
it('clears render measurements on quality changes and ignores a late measurement from the previous profile', async () => {
  const previous = readViewerQuality();
  try {
    saveViewerQuality({ quality: 'standard', ambientOcclusion: true });
    await act(async () => root.render(<ThreeLoadingViewer container={container} result={result} showDiagnostics />));
    await act(async () => markReady());
    const start = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === '5초 회전 측정')!;
    await act(async () => start.click());
    const sample = { durationMs: 5000, sampleCount: 50, meanFrameMs: 100, p95FrameMs: 120, fps: 10, renderCalls: 20, triangles: 100 };
    await act(async () => captured.scene!.onBenchmark!(sample));
    expect(host.querySelector('[data-three-benchmark]')).not.toBeNull();
    await act(async () => saveViewerQuality({ quality: 'high', ambientOcclusion: true }));
    expect(host.querySelector('[data-three-benchmark]')).toBeNull();
    await act(async () => captured.scene!.onBenchmark!(sample));
    expect(host.querySelector('[data-three-benchmark]')).toBeNull();
  } finally { saveViewerQuality(previous); }
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
