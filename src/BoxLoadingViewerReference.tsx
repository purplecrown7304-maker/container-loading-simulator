import { Canvas } from '@react-three/fiber';
import { Edges, OrbitControls, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { cargoColor } from './cargoColors';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { ContainerSpec, LoadingResult, Placement } from './engine/types';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';

type IndexedPlacement={placement:Placement;index:number};

function CargoGroup({items,container,scale,selectedIndex,onSelect}:{items:IndexedPlacement[];container:ContainerSpec;scale:number;selectedIndex:number|null;onSelect:(index:number)=>void}){
 const ref=useRef<THREE.InstancedMesh>(null); const cargoId=items[0]?.placement.cargoId??''; const base=useMemo(()=>new THREE.Color(cargoColor(cargoId)),[cargoId]);
 useLayoutEffect(()=>{const mesh=ref.current;if(!mesh)return;const obj=new THREE.Object3D();items.forEach(({placement:p,index},i)=>{obj.position.set((p.x+p.length/2)*scale-container.length*scale/2,(p.z+p.height/2)*scale+.03,(p.y+p.width/2)*scale-container.width*scale/2);obj.scale.set(p.length*scale*.985,p.height*scale*.985,p.width*scale*.985);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);const c=base.clone();if(selectedIndex!==null&&selectedIndex!==index)c.multiplyScalar(.78);if(selectedIndex===index)c.lerp(new THREE.Color('#ffffff'),.2);mesh.setColorAt(i,c)});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;},[items,container,scale,base,selectedIndex]);
 return <instancedMesh ref={ref} args={[undefined,undefined,items.length]} onClick={e=>{e.stopPropagation();if(e.instanceId===undefined)return;const item=items[e.instanceId];if(item)onSelect(item.index)}} castShadow receiveShadow><boxGeometry/><meshStandardMaterial roughness={.48} metalness={.03}/></instancedMesh>
}

function BoxOutline({p,container,scale}:{p:Placement;container:ContainerSpec;scale:number}){const pos:[number,number,number]=[(p.x+p.length/2)*scale-container.length*scale/2,(p.z+p.height/2)*scale+.03,(p.y+p.width/2)*scale-container.width*scale/2];return <mesh position={pos} scale={[p.length*scale*1.02,p.height*scale*1.02,p.width*scale*1.02]}><boxGeometry/><meshBasicMaterial transparent opacity={0}/><Edges color="#1e3a5f" linewidth={1.2}/></mesh>}

function ContainerShell({container,scale}:{container:ContainerSpec;scale:number}){
 const L=container.length*scale,W=container.width*scale,H=container.height*scale,doorX=L/2;
 return <group>
  <mesh position={[0,-.025,0]} receiveShadow><boxGeometry args={[L,.05,W]}/><meshStandardMaterial color="#eef4fb" roughness={.9}/><Edges color="#6b7f99"/></mesh>
  <mesh position={[0,H/2,-W/2]}><boxGeometry args={[L,H,.025]}/><meshBasicMaterial color="#e8f0f8" transparent opacity={.17}/><Edges color="#7f93ac" linewidth={1.2}/></mesh>
  <mesh position={[0,H/2,W/2]}><boxGeometry args={[L,H,.025]}/><meshBasicMaterial color="#e8f0f8" transparent opacity={.08}/><Edges color="#8da0b7" linewidth={1}/></mesh>
  <mesh position={[0,H,.0]}><boxGeometry args={[L,.025,W]}/><meshBasicMaterial color="#f8fbff" transparent opacity={.16}/><Edges color="#8da0b7" linewidth={1}/></mesh>
  <mesh position={[-L/2,H/2,0]}><boxGeometry args={[.03,H,W]}/><meshBasicMaterial color="#f4f8fc" transparent opacity={.2}/><Edges color="#72869f" linewidth={1.4}/></mesh>
  <group position={[doorX,H/2,0]} rotation={[0,Math.PI/2,0]}>
   <mesh><boxGeometry args={[W,H,.035]}/><meshBasicMaterial color="#e8f2ff" transparent opacity={.16}/><Edges color="#2f7de1" linewidth={2}/></mesh>
   <mesh position={[0,0,.025]}><boxGeometry args={[.025,H*.96,.02]}/><meshBasicMaterial color="#2f7de1"/></mesh>
   <Text position={[0,.22,.055]} fontSize={.24} color="#165dcc" anchorX="center" anchorY="middle">CONTAINER DOOR</Text>
   <Text position={[0,-.12,.055]} fontSize={.18} color="#165dcc" anchorX="center">문</Text>
   <Text position={[-.38,-.37,.055]} fontSize={.18} color="#165dcc">←</Text><Text position={[.38,-.37,.055]} fontSize={.18} color="#165dcc">→</Text>
  </group>
  <Text position={[-L/2+.25,H+.17,-W/2-.06]} fontSize={.12} color="#334155" anchorX="left">안쪽</Text>
  <Text position={[L/2-.2,H+.17,-W/2-.06]} fontSize={.12} color="#165dcc" anchorX="right">문 방향</Text>
 </group>
}

export default function BoxLoadingViewerReference({result,container}:{result:LoadingResult;container:ContainerSpec}){
 const [selectedIndex,setSelectedIndex]=useState<number|null>(null); const scale=.5; const addresses=useMemo(()=>buildPlacementAddresses(result.placements,container.length),[result.placements,container.length]);
 const groups=useMemo(()=>{const m=new Map<string,IndexedPlacement[]>();result.placements.forEach((p,index)=>{const a=m.get(p.cargoId)??[];a.push({placement:p,index});m.set(p.cargoId,a)});return [...m.entries()]},[result.placements]); const selected=selectedIndex===null?undefined:result.placements[selectedIndex];
 const change=(i:number|null)=>{setSelectedIndex(i);selectPlacement(i)};
 useEffect(()=>{const fn=(e:Event)=>{const i=(e as CustomEvent<PlacementSelectDetail>).detail?.index??null;if(i!==null&&!result.placements[i])return;setSelectedIndex(i)};window.addEventListener(PLACEMENT_SELECT_EVENT,fn);return()=>window.removeEventListener(PLACEMENT_SELECT_EVENT,fn)},[result.placements]);
 return <section className="viewer reference-viewer"><Canvas shadows camera={{position:[6.8,4.1,6.2],fov:46}} dpr={[1,1.35]} gl={{antialias:true,powerPreference:'high-performance'}} onPointerMissed={()=>change(null)}><color attach="background" args={['#edf3f9']}/><ambientLight intensity={2.1}/><directionalLight castShadow position={[3,7,5]} intensity={2.5}/><ContainerShell container={container} scale={scale}/>{groups.map(([id,items])=><CargoGroup key={id} items={items} container={container} scale={scale} selectedIndex={selectedIndex} onSelect={change}/>)}{selected&&<BoxOutline p={selected} container={container} scale={scale}/>}<OrbitControls makeDefault target={[0,.65,0]} minDistance={3.5} maxDistance={14}/></Canvas><div className="reference-viewer-legend"><span><i className="center-dot"/>컨테이너 중심</span><span><i className="cog-dot"/>실제 무게중심</span><span><i className="target-dot"/>목표 무게중심</span><b>CONTAINER DOOR = 문 방향</b></div>{selected&&<div className="reference-selected"><i style={{background:cargoColor(selected.cargoId)}}/><b>{selected.cargoId}</b><span>R{addresses[selectedIndex!]?.row} C{addresses[selectedIndex!]?.column} L{addresses[selectedIndex!]?.layer}</span></div>}</section>
}