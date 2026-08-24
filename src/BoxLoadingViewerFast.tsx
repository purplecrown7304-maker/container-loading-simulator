import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CARGO_FILTER_EVENT } from './CargoFilterBar';
import { cargoColor } from './cargoColors';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import { assessZoneUtilization, detectZoneFlowWarning } from './engine/zoneUtilization';
import type { ContainerSpec, LoadingResult, Placement } from './engine/types';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';

type IndexedPlacement = { placement: Placement; index: number };
type CargoFilterDetail = { cargoId: string | null };
type LayerLimit = null | 1 | 3 | 5;

function CargoInstances({ items, container, scale, onSelect, selectedIndex, filteredCargoId }: {
  items: IndexedPlacement[];
  container: ContainerSpec;
  scale: number;
  onSelect: (index:number) => void;
  selectedIndex: number | null;
  filteredCargoId: string | null;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cargoId = items[0]?.placement.cargoId ?? 'cargo';
  const baseColor = useMemo(() => new THREE.Color(cargoColor(cargoId)), [cargoId]);
  const hidden = filteredCargoId !== null && filteredCargoId !== cargoId;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach(({ placement:p, index }, i) => {
      object.position.set((p.x+p.length/2)*scale-container.length*scale/2,(p.z+p.height/2)*scale,(p.y+p.width/2)*scale-container.width*scale/2);
      object.scale.set(p.length*scale,p.height*scale,p.width*scale);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      const color = baseColor.clone();
      if (selectedIndex !== null && selectedIndex !== index) color.multiplyScalar(.55);
      if (selectedIndex === index) color.lerp(new THREE.Color('#ffffff'), .18);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, container.length, container.width, scale, baseColor, selectedIndex]);

  if (hidden || !items.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} frustumCulled
    onClick={event => { event.stopPropagation(); if (event.instanceId === undefined) return; const selected = items[event.instanceId]; if (selected) onSelect(selected.index); }}>
    <boxGeometry args={[1,1,1]}/><meshStandardMaterial roughness={.62}/>
  </instancedMesh>;
}

function SelectedOutline({ placement, container, scale }: { placement:Placement; container:ContainerSpec; scale:number }) {
  const position:[number,number,number]=[(placement.x+placement.length/2)*scale-container.length*scale/2,(placement.z+placement.height/2)*scale,(placement.y+placement.width/2)*scale-container.width*scale/2];
  return <mesh position={position} scale={[placement.length*scale*1.045,placement.height*scale*1.045,placement.width*scale*1.045]}><boxGeometry args={[1,1,1]}/><meshBasicMaterial wireframe color="#0f172a"/></mesh>;
}

function Scene({ result, container, selectedIndex, filteredCargoId, layerLimit, onSelect, onClear }: {
  result: LoadingResult; container: ContainerSpec; selectedIndex:number|null; filteredCargoId:string|null; layerLimit:LayerLimit; onSelect:(index:number)=>void; onClear:()=>void;
}) {
  const scale=.45;
  const addresses=useMemo(()=>buildPlacementAddresses(result.placements,container.length),[result.placements,container.length]);
  const quality=useMemo(()=>assessWeightBalance(container,result),[container,result]);
  const selected=selectedIndex===null?undefined:result.placements[selectedIndex];
  const grouped=useMemo(()=>{const map=new Map<string,IndexedPlacement[]>();result.placements.forEach((placement,index)=>{if(layerLimit!==null&&(addresses[index]?.layer??Infinity)>layerLimit)return;const group=map.get(placement.cargoId)??[];group.push({placement,index});map.set(placement.cargoId,group);});return [...map.entries()];},[result.placements,addresses,layerLimit]);
  const cy=container.height*scale/2;
  const insideX=-container.length*scale/2;
  const doorX=container.length*scale/2;
  const cogX=quality.centerOfGravity.x*scale-container.length*scale/2;
  const cogY=quality.centerOfGravity.z*scale;
  const cogZ=quality.centerOfGravity.y*scale-container.width*scale/2;
  const selectedVisible=selected&&(layerLimit===null||(addresses[selectedIndex??-1]?.layer??Infinity)<=layerLimit)&&(!filteredCargoId||selected.cargoId===filteredCargoId);

  return <>
    <ambientLight intensity={1.45}/><directionalLight position={[5,8,6]} intensity={1.8}/>
    <gridHelper args={[8,20]} position={[0,-.01,0]} onClick={onClear}/>
    <mesh position={[0,cy,0]} onClick={event=>{event.stopPropagation();onClear();}}><boxGeometry args={[container.length*scale,container.height*scale,container.width*scale]}/><meshBasicMaterial wireframe transparent opacity={.2}/></mesh>
    {[container.length/3,container.length*2/3].map(x=><mesh key={x} position={[x*scale-container.length*scale/2,cy,0]}><boxGeometry args={[.012,container.height*scale,container.width*scale]}/><meshBasicMaterial transparent opacity={.13}/></mesh>)}
    <Text position={[insideX+.28,container.height*scale+.16,0]} fontSize={.12} anchorX="left">안쪽</Text><Text position={[doorX-.22,container.height*scale+.16,0]} fontSize={.12} anchorX="right">문</Text>
    {grouped.map(([cargoId,items])=><CargoInstances key={cargoId} items={items} container={container} scale={scale} onSelect={onSelect} selectedIndex={selectedIndex} filteredCargoId={filteredCargoId}/>)}
    {selectedVisible&&<SelectedOutline placement={selected!} container={container} scale={scale}/>} 
    {selectedVisible&&(()=>{const a=addresses[selectedIndex!];const p=selected!;const pos:[number,number,number]=[(p.x+p.length/2)*scale-container.length*scale/2,(p.z+p.height)*scale+.05,(p.y+p.width/2)*scale-container.width*scale/2];return <Text position={pos} fontSize={.07}>{`${p.cargoId} · R${a.row} C${a.column} L${a.layer}`}</Text>;})()}
    {result.placements.length>0&&<mesh position={[cogX,cogY,cogZ]}><sphereGeometry args={[.07,16,16]}/><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={.8}/></mesh>}
    <OrbitControls makeDefault/>
  </>;
}

function TopDownMinimap({ result,container,addresses,selectedIndex,filteredCargoId,layerLimit,onSelect }: { result:LoadingResult;container:ContainerSpec;addresses:ReturnType<typeof buildPlacementAddresses>;selectedIndex:number|null;filteredCargoId:string|null;layerLimit:LayerLimit;onSelect:(index:number)=>void }) {
  const width=260,height=110,sx=width/Math.max(container.length,.001),sy=height/Math.max(container.width,.001);
  const visible=result.placements.map((placement,index)=>({placement,index,address:addresses[index]})).filter(({placement,address})=>(!filteredCargoId||placement.cargoId===filteredCargoId)&&(layerLimit===null||(address?.layer??Infinity)<=layerLimit));
  const zones=assessZoneUtilization(container,visible.map(v=>v.placement));const flowWarning=detectZoneFlowWarning(zones);
  return <div className="topdown-minimap"><div className="topdown-minimap-head"><b>상단 평면 미니맵</b><span>안쪽 → 문쪽</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="컨테이너 상단 평면 적재 미니맵"><rect x=".5" y=".5" width={width-1} height={height-1} rx="5" fill="rgba(255,255,255,.92)" stroke="currentColor" strokeOpacity=".35"/>{visible.map(({placement:p,index})=><rect key={`${p.cargoId}-${index}`} x={p.x*sx} y={p.y*sy} width={Math.max(1.5,p.length*sx)} height={Math.max(1.5,p.width*sy)} rx="1.5" fill={cargoColor(p.cargoId)} fillOpacity={selectedIndex===index?1:.72} stroke={selectedIndex===index?'#111827':'rgba(17,24,39,.3)'} strokeWidth={selectedIndex===index?2:.4} onClick={()=>onSelect(index)} style={{cursor:'pointer'}}/>)}<text x="5" y="12" fontSize="8" fill="currentColor" opacity=".7">안쪽</text><text x={width-5} y="12" textAnchor="end" fontSize="8" fill="currentColor" opacity=".7">문</text></svg><div className="zone-utilization-grid">{zones.map(zone=><div key={zone.id} className="zone-utilization-card"><span>{zone.label}</span><strong>{zone.fillPct.toFixed(0)}%</strong><small>빈 공간 {zone.freePct.toFixed(0)}%</small><div className="zone-utilization-track"><i style={{width:`${zone.fillPct}%`}}/></div></div>)}</div>{flowWarning&&<div className="zone-flow-warning">{flowWarning}</div>}</div>;
}

export default function BoxLoadingViewerFast({ result,container }: { result:LoadingResult;container:ContainerSpec }) {
  const [selectedIndex,setSelectedIndex]=useState<number|null>(null);const [filteredCargoId,setFilteredCargoId]=useState<string|null>(null);const [layerLimit,setLayerLimit]=useState<LayerLimit>(null);
  const addresses=useMemo(()=>buildPlacementAddresses(result.placements,container.length),[result.placements,container.length]);
  const selected=selectedIndex===null?undefined:result.placements[selectedIndex];const selectedAddress=selectedIndex===null?undefined:addresses[selectedIndex];const maxLayer=addresses.reduce((m,a)=>Math.max(m,a?.layer??0),0);const visibleCount=result.placements.filter((p,i)=>(!filteredCargoId||p.cargoId===filteredCargoId)&&(layerLimit===null||(addresses[i]?.layer??Infinity)<=layerLimit)).length;
  const changeSelection=(index:number|null)=>{setSelectedIndex(index);selectPlacement(index);};
  useEffect(()=>{const onExternal=(event:Event)=>{const index=(event as CustomEvent<PlacementSelectDetail>).detail?.index??null;if(index!==null&&!result.placements[index])return;setSelectedIndex(index);};window.addEventListener(PLACEMENT_SELECT_EVENT,onExternal);return()=>window.removeEventListener(PLACEMENT_SELECT_EVENT,onExternal);},[result.placements]);
  useEffect(()=>{const onFilter=(event:Event)=>{const cargoId=(event as CustomEvent<CargoFilterDetail>).detail?.cargoId??null;setFilteredCargoId(cargoId);if(cargoId&&selectedIndex!==null&&result.placements[selectedIndex]?.cargoId!==cargoId)changeSelection(null);};window.addEventListener(CARGO_FILTER_EVENT,onFilter);return()=>window.removeEventListener(CARGO_FILTER_EVENT,onFilter);},[result.placements,selectedIndex]);
  useEffect(()=>{if(selectedIndex!==null&&!result.placements[selectedIndex])setSelectedIndex(null);},[result.placements,selectedIndex]);
  const layerLabel=layerLimit===null?`전체 ${maxLayer||0}단`:layerLimit===1?'1단만':`1~${layerLimit}단`;
  return <section className="viewer"><Canvas camera={{position:[5.5,4.2,6.5],fov:48}} dpr={[1,1.25]} gl={{antialias:true,powerPreference:'high-performance'}} onPointerMissed={()=>changeSelection(null)}><Scene result={result} container={container} selectedIndex={selectedIndex} filteredCargoId={filteredCargoId} layerLimit={layerLimit} onSelect={changeSelection} onClear={()=>changeSelection(null)}/></Canvas><div className="viewer-direction"><b>박스 적재</b><span>{filteredCargoId?`${filteredCargoId} · `:''}{visibleCount}/{result.placements.length} EA · {layerLabel}</span></div><div className="layer-slicer">{([[null,'전체'],[1,'1단'],[3,'1~3단'],[5,'1~5단']] as const).map(([value,label])=><button key={label} type="button" className={layerLimit===value?'active':''} onClick={()=>setLayerLimit(value)}>{label}</button>)}</div><TopDownMinimap result={result} container={container} addresses={addresses} selectedIndex={selectedIndex} filteredCargoId={filteredCargoId} layerLimit={layerLimit} onSelect={changeSelection}/>{selected&&selectedAddress&&<div className="cargo-inspector"><div className="cargo-inspector-head"><b><i style={{display:'inline-block',width:10,height:10,borderRadius:3,background:cargoColor(selected.cargoId),marginRight:6}}/>{selected.cargoId}</b><button type="button" onClick={()=>changeSelection(null)}>닫기</button></div><strong>{`R${selectedAddress.row} C${selectedAddress.column} L${selectedAddress.layer}`}</strong><span>{selectedAddress.zone} · {selected.rotated?'90° 회전':'기본 방향'}</span><small>{`X ${selected.x.toFixed(2)}m · Y ${selected.y.toFixed(2)}m · Z ${selected.z.toFixed(2)}m`}</small><small>{`${selected.length.toFixed(2)} × ${selected.width.toFixed(2)} × ${selected.height.toFixed(2)}m · ${selected.weightKg.toFixed(1)}kg`}</small></div>}</section>;
}
