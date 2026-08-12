import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { ContainerSpec, LoadingResult } from './engine/types';

function cargoColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

function Scene({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const scale = 0.45;
  const quality = assessWeightBalance(container, result);
  const addresses = buildPlacementAddresses(result.placements, container.length);
  const cy = (container.height * scale) / 2;
  const insideX = -(container.length * scale) / 2;
  const doorX = (container.length * scale) / 2;
  const markerY = container.height * scale + 0.18;
  const cogX = quality.centerOfGravity.x * scale - (container.length * scale) / 2;
  const cogY = quality.centerOfGravity.z * scale;
  const cogZ = quality.centerOfGravity.y * scale - (container.width * scale) / 2;
  const zoneBoundaries = [container.length / 3, (container.length * 2) / 3];

  return <>
    <ambientLight intensity={1.5} /><directionalLight position={[5, 8, 6]} intensity={2} /><gridHelper args={[8, 20]} position={[0, -0.01, 0]} />
    <mesh position={[0, cy, 0]}><boxGeometry args={[container.length * scale, container.height * scale, container.width * scale]} /><meshBasicMaterial wireframe transparent opacity={0.22} /></mesh>
    {zoneBoundaries.map((x) => { const sx = x * scale - (container.length * scale) / 2; return <mesh key={x} position={[sx, cy, 0]}><boxGeometry args={[0.012, container.height * scale, container.width * scale]} /><meshBasicMaterial transparent opacity={0.18} /></mesh>; })}
    <Text position={[insideX + container.length * scale / 6, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>안쪽 구역</Text><Text position={[0, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>중앙 구역</Text><Text position={[doorX - container.length * scale / 6, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>문쪽 구역</Text>
    <Text position={[insideX + 0.28, markerY, 0]} fontSize={0.13} anchorX="left">안쪽</Text><Text position={[doorX - 0.22, markerY, 0]} fontSize={0.13} anchorX="right">문</Text>
    {result.placements.map((p, index) => { const a = addresses[index]; const pos: [number, number, number] = [(p.x + p.length / 2) * scale - container.length * scale / 2, (p.z + p.height / 2) * scale, (p.y + p.width / 2) * scale - container.width * scale / 2]; return <group key={`${p.cargoId}-${index}`}><mesh position={pos}><boxGeometry args={[p.length * scale, p.height * scale, p.width * scale]} /><meshStandardMaterial color={cargoColor(p.cargoId)} roughness={0.65} /></mesh>{index < 80 && <Text position={[pos[0], pos[1] + p.height * scale / 2 + 0.035, pos[2]]} fontSize={0.055}>{`R${a.row} C${a.column} L${a.layer}${p.rotated ? ' ↻' : ''}`}</Text>}</group>; })}
    {result.placements.length > 0 && <mesh position={[cogX, cogY, cogZ]}><sphereGeometry args={[0.075, 24, 24]} /><meshStandardMaterial emissiveIntensity={1.2} /></mesh>}
    <OrbitControls makeDefault />
  </>;
}

export default function BoxLoadingViewer({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  return <section className="viewer">
    <Canvas camera={{ position:[5.5,4.2,6.5], fov:48 }}><Scene result={result} container={container} /></Canvas>
    <div className="viewer-direction"><b>박스 적재</b><span>안쪽 → 문쪽</span></div>
  </section>;
}
