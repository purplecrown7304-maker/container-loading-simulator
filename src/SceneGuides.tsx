import { Edges, Line, Text } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ContainerSpec, Placement } from './engine/types';

type GuideProps={container:ContainerSpec;placements:Placement[];scale:number};
const mm=(m:number)=>`${Math.max(0,Math.round(m*1000)).toLocaleString()} mm`;

function doorTexture(){
  const c=document.createElement('canvas');c.width=900;c.height=700;
  const x=c.getContext('2d')!;x.clearRect(0,0,c.width,c.height);
  x.strokeStyle='#1769d2';x.lineWidth=18;x.setLineDash([34,22]);x.strokeRect(85,105,730,465);x.setLineDash([]);
  x.fillStyle='#165dcc';x.textAlign='center';x.font='800 72px sans-serif';x.fillText('CONTAINER DOOR',450,300);
  x.font='800 58px sans-serif';x.fillText('문',450,385);x.font='800 72px sans-serif';x.fillText('←        →',450,500);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.needsUpdate=true;return t;
}

function UnifiedPalletContainerShell({container,scale}:{container:ContainerSpec;scale:number}){
  const L=container.length*scale,W=container.width*scale,H=container.height*scale,doorX=L/2;
  const texture=useMemo(()=>doorTexture(),[]);useEffect(()=>()=>texture.dispose(),[texture]);
  if(scale>=.45)return null;
  return <group>
    <mesh position={[0,-.025,0]} receiveShadow><boxGeometry args={[L,.05,W]}/><meshStandardMaterial color="#e7eef6" roughness={.9}/><Edges color="#526f90"/></mesh>
    <mesh position={[0,H/2,-W/2]}><boxGeometry args={[L,H,.025]}/><meshBasicMaterial color="#e8f0f8" transparent opacity={.13}/><Edges color="#66819f" linewidth={1.2}/></mesh>
    <mesh position={[0,H/2,W/2]}><boxGeometry args={[L,H,.025]}/><meshBasicMaterial color="#e8f0f8" transparent opacity={.05}/><Edges color="#7e94ad"/></mesh>
    <mesh position={[0,H,0]}><boxGeometry args={[L,.025,W]}/><meshBasicMaterial color="#f8fbff" transparent opacity={.10}/><Edges color="#7e94ad"/></mesh>
    <mesh position={[-L/2,H/2,0]}><boxGeometry args={[.03,H,W]}/><meshBasicMaterial color="#f4f8fc" transparent opacity={.16}/><Edges color="#526f90" linewidth={1.4}/></mesh>
    <group position={[doorX+.022,H/2,0]} rotation={[0,Math.PI/2,0]}>
      <mesh><planeGeometry args={[W*.96,H*.96]}/><meshBasicMaterial map={texture} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false}/></mesh>
      <mesh position={[0,0,-.018]}><boxGeometry args={[W,H,.035]}/><meshBasicMaterial color="#e8f2ff" transparent opacity={.08}/><Edges color="#2573d9" linewidth={2}/></mesh>
    </group>
  </group>;
}

export function AxisGuide({container,scale}:{container:ContainerSpec;scale:number}){
  const L=container.length*scale,W=container.width*scale,H=container.height*scale;
  const o:[number,number,number]=[-L/2-.28,.03,-W/2-.28];
  return <group>
    <UnifiedPalletContainerShell container={container} scale={scale}/>
    <Line points={[o,[L/2+.35,.03,o[2]]]} color="#ef4444" lineWidth={2}/><Text position={[L/2+.45,.03,o[2]]} fontSize={.12} color="#b91c1c">X · 길이</Text>
    <Line points={[o,[o[0],.03,W/2+.35]]} color="#22c55e" lineWidth={2}/><Text position={[o[0],.03,W/2+.46]} fontSize={.12} color="#15803d">Y · 폭</Text>
    <Line points={[o,[o[0],H+.35,o[2]]]} color="#2563eb" lineWidth={2}/><Text position={[o[0],H+.47,o[2]]} fontSize={.12} color="#1d4ed8">Z · 높이</Text>
  </group>;
}

export function ClearanceGuide({container,placements,scale}:GuideProps){
  if(!placements.length)return null;
  const minX=Math.min(...placements.map(p=>p.x)),maxX=Math.max(...placements.map(p=>p.x+p.length));
  const minY=Math.min(...placements.map(p=>p.y)),maxY=Math.max(...placements.map(p=>p.y+p.width));
  const maxZ=Math.max(...placements.map(p=>p.z+p.height));
  const L=container.length*scale,W=container.width*scale,H=container.height*scale;
  const wx=(x:number)=>x*scale-L/2,wz=(y:number)=>y*scale-W/2;
  const sideZ=W/2+.12,sideX=-L/2-.12;
  const text=(a:[number,number,number],b:[number,number,number],label:string,key:string)=><group key={key}><Line points={[a,b]} color="#d97706" lineWidth={1.5} dashed dashSize={.06} gapSize={.04}/><Text position={[(a[0]+b[0])/2,(a[1]+b[1])/2+.07,(a[2]+b[2])/2]} fontSize={.095} color="#92400e" anchorX="center">{label}</Text></group>;
  return <group>
    {text([-L/2,.08,sideZ],[wx(minX),.08,sideZ],`안쪽 ${mm(minX)}`,'back')}
    {text([wx(maxX),.08,sideZ],[L/2,.08,sideZ],`문쪽 ${mm(container.length-maxX)}`,'door')}
    {text([sideX,.08,-W/2],[sideX,.08,wz(minY)],`좌측 ${mm(minY)}`,'left')}
    {text([sideX,.08,wz(maxY)],[sideX,.08,W/2],`우측 ${mm(container.width-maxY)}`,'right')}
    {text([wx((minX+maxX)/2),maxZ*scale,sideZ],[wx((minX+maxX)/2),H,sideZ],`천장 ${mm(container.height-maxZ)}`,'top')}
  </group>;
}

export function clearanceValues(container:ContainerSpec,placements:Placement[]){
  if(!placements.length)return null;
  const minX=Math.min(...placements.map(p=>p.x)),maxX=Math.max(...placements.map(p=>p.x+p.length));
  const minY=Math.min(...placements.map(p=>p.y)),maxY=Math.max(...placements.map(p=>p.y+p.width));
  const maxZ=Math.max(...placements.map(p=>p.z+p.height));
  return {back:mm(minX),door:mm(container.length-maxX),left:mm(minY),right:mm(container.width-maxY),top:mm(container.height-maxZ)};
}
