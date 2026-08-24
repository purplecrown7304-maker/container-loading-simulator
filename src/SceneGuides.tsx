import { Line, Text } from '@react-three/drei';
import type { ContainerSpec, Placement } from './engine/types';

type GuideProps={container:ContainerSpec;placements:Placement[];scale:number};
const mm=(m:number)=>`${Math.max(0,Math.round(m*1000)).toLocaleString()} mm`;

export function AxisGuide({container,scale}:{container:ContainerSpec;scale:number}){
  const L=container.length*scale,W=container.width*scale,H=container.height*scale;
  const o:[number,number,number]=[-L/2-.28,.03,-W/2-.28];
  return <group>
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
