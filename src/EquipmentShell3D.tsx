import { Edges } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { ContainerSpec } from './engine/types';
import { useTransportEquipment } from './transportEquipment';

function Panel({ position, args, color = '#e8f0f8', opacity = 0.12 }: { position: [number, number, number]; args: [number, number, number]; color?: string; opacity?: number }) {
  return <mesh position={position}>
    <boxGeometry args={args} />
    <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    <Edges color="#6f88a2" />
  </mesh>;
}

function Floor({ length, width }: { length: number; width: number }) {
  return <mesh position={[0, -0.025, 0]} receiveShadow>
    <boxGeometry args={[length, 0.05, width]} />
    <meshStandardMaterial color="#e2eaf2" roughness={0.9} />
    <Edges color="#4f6d8a" />
  </mesh>;
}

function RearFrame({ x, height, width }: { x: number; height: number; width: number }) {
  return <group position={[x, height / 2, 0]}>
    <Panel position={[0, 0, -width / 2]} args={[0.035, height, 0.04]} opacity={0.2} />
    <Panel position={[0, 0, width / 2]} args={[0.035, height, 0.04]} opacity={0.2} />
    <Panel position={[0, height / 2, 0]} args={[0.035, 0.05, width]} opacity={0.2} />
  </group>;
}

function ClosedShell({ length, width, height, reefer = false, curtain = false, roof = true }: { length: number; width: number; height: number; reefer?: boolean; curtain?: boolean; roof?: boolean }) {
  const wallColor = curtain ? '#d7e8f6' : '#e8f0f8';
  const wallOpacity = curtain ? 0.2 : 0.11;
  return <group>
    <Floor length={length} width={width} />
    <Panel position={[0, height / 2, -width / 2]} args={[length, height, 0.025]} color={wallColor} opacity={wallOpacity} />
    <Panel position={[0, height / 2, width / 2]} args={[length, height, 0.025]} color={wallColor} opacity={curtain ? 0.13 : 0.05} />
    {roof && <Panel position={[0, height, 0]} args={[length, 0.025, width]} color="#f8fbff" opacity={0.1} />}
    <Panel position={[-length / 2, height / 2, 0]} args={[0.03, height, width]} color={reefer ? '#d7edf9' : '#f4f8fc'} opacity={0.16} />
    <RearFrame x={length / 2} height={height} width={width} />
    {reefer && <group position={[-length / 2 + 0.04, height * 0.55, 0]}>
      <mesh><boxGeometry args={[0.09, Math.min(0.75, height * 0.34), Math.min(1.35, width * 0.62)]}/><meshStandardMaterial color="#c9e7f7" roughness={0.68}/><Edges color="#4e86a6"/></mesh>
      <mesh position={[0.052, 0, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[Math.min(0.18, width * 0.09), 0.025, 8, 24]}/><meshStandardMaterial color="#5aa8d3"/></mesh>
    </group>}
    {curtain && Array.from({ length: 9 }, (_, i) => {
      const x = -length / 2 + (i + 1) * length / 10;
      return <group key={i}><Panel position={[x, height / 2, -width / 2 - 0.012]} args={[0.012, height * 0.94, 0.012]} color="#7d94aa" opacity={0.35}/><Panel position={[x, height / 2, width / 2 + 0.012]} args={[0.012, height * 0.94, 0.012]} color="#7d94aa" opacity={0.25}/></group>;
    })}
  </group>;
}

function FlatRackShell({ length, width, height, platform = false }: { length: number; width: number; height: number; platform?: boolean }) {
  return <group>
    <Floor length={length} width={width} />
    {!platform && <><RearFrame x={-length / 2} height={height} width={width}/><RearFrame x={length / 2} height={height} width={width}/></>}
    {Array.from({ length: 5 }, (_, i) => <mesh key={i} position={[-length / 2 + (i + .5) * length / 5, 0.035, 0]}><boxGeometry args={[Math.max(.025, length / 180), .07, width * .96]}/><meshStandardMaterial color="#91a6ba" roughness={.75}/></mesh>)}
  </group>;
}

function TankShell({ length, width, height }: { length: number; width: number; height: number }) {
  const radius = Math.min(width, height) * 0.38;
  return <group>
    <Floor length={length} width={width} />
    <RearFrame x={-length / 2} height={height} width={width}/><RearFrame x={length / 2} height={height} width={width}/>
    <mesh rotation={[0, 0, Math.PI / 2]} position={[0, height * .52, 0]}>
      <cylinderGeometry args={[radius, radius, length * .88, 28]} />
      <meshStandardMaterial color="#dde6ef" roughness={.48} metalness={.08}/>
      <Edges color="#6e8499" />
    </mesh>
  </group>;
}

function BulkShell({ length, width, height }: { length: number; width: number; height: number }) {
  return <group>
    <ClosedShell length={length} width={width} height={height}/>
    {[-.22,.22].map((ratio, i) => <mesh key={i} position={[length * ratio, height + .015, 0]} rotation={[Math.PI / 2,0,0]}><cylinderGeometry args={[Math.min(.18,width*.08),Math.min(.18,width*.08),.035,20]}/><meshStandardMaterial color="#8ba3b8"/></mesh>)}
  </group>;
}

export default function EquipmentShell3D({ container, scale }: { container: ContainerSpec; scale: number }) {
  const equipment = useTransportEquipment();
  const length = container.length * scale;
  const width = container.width * scale;
  const height = container.height * scale;
  const geometry = equipment.geometry;
  const shell = useMemo(() => geometry, [geometry]);

  if (shell === 'open-top') return <ClosedShell length={length} width={width} height={height} roof={false}/>;
  if (shell === 'flat-rack') return <FlatRackShell length={length} width={width} height={height}/>;
  if (shell === 'platform') return <FlatRackShell length={length} width={width} height={height} platform/>;
  if (shell === 'reefer') return <ClosedShell length={length} width={width} height={height} reefer/>;
  if (shell === 'bulk') return <BulkShell length={length} width={width} height={height}/>;
  if (shell === 'tank') return <TankShell length={length} width={width} height={height}/>;
  if (shell === 'curtain' || shell === 'mega-truck' || shell === 'jumbo-truck') return <ClosedShell length={length} width={width} height={height} curtain roof/>;
  if (shell === 'reefer-truck' || shell === 'isotherm-truck') return <ClosedShell length={length} width={width} height={height} reefer={shell === 'reefer-truck'}/>;
  return <ClosedShell length={length} width={width} height={height}/>;
}
