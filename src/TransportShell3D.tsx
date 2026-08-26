import { Edges } from '@react-three/drei';
import { useMemo } from 'react';
import type { ContainerSpec } from './engine/types';
import { buildTransportShell } from './engine/transportShell';

function sceneX(container: ContainerSpec, x: number, scale: number) {
  return x * scale - container.length * scale / 2;
}

function rigidPanel(
  key: string,
  position: [number, number, number],
  size: [number, number, number],
  opacity = 0.08,
) {
  return <mesh key={key} position={position}>
    <boxGeometry args={size} />
    <meshBasicMaterial color="#dbeafe" transparent opacity={opacity} depthWrite={false} />
    <Edges color="#5f7792" />
  </mesh>;
}

export default function TransportShell3D({ container, scale }: { container: ContainerSpec; scale: number }) {
  const shell = useMemo(() => buildTransportShell(container), [container]);
  const length = container.length * scale;
  const width = container.width * scale;
  const height = container.height * scale;
  const thickness = Math.max(0.015, 0.035 * scale);
  const posts = container.transportKind === 'truck' && container.sideWallModel === 'curtain'
    ? Math.max(3, Math.ceil(container.length / 2.2) + 1)
    : 0;

  return <group>
    <mesh position={[0, -thickness / 2, 0]} receiveShadow>
      <boxGeometry args={[length, thickness, width]} />
      <meshStandardMaterial color={container.transportKind === 'truck' ? '#d7dee8' : '#e7eef6'} roughness={0.9} />
      <Edges color="#526f90" />
    </mesh>

    {shell.frontWall && rigidPanel('front', [-length / 2, height / 2, 0], [thickness, height, width], 0.12)}
    {shell.rearWall && rigidPanel('rear', [length / 2, height / 2, 0], [thickness, height, width], 0.05)}
    {shell.leftWall && rigidPanel('left', [0, height / 2, -width / 2], [length, height, thickness], 0.09)}
    {shell.rightWall && rigidPanel('right', [0, height / 2, width / 2], [length, height, thickness], 0.04)}
    {shell.roof && rigidPanel('roof', [0, height, 0], [length, thickness, width], 0.05)}

    {posts > 0 && Array.from({ length: posts }, (_, index) => {
      const ratio = posts === 1 ? 0.5 : index / (posts - 1);
      const x = -length / 2 + ratio * length;
      return <group key={`curtain-post-${index}`}>
        <mesh position={[x, height / 2, -width / 2]}>
          <boxGeometry args={[thickness * 1.2, height, thickness * 1.2]} />
          <meshStandardMaterial color="#64748b" metalness={0.2} roughness={0.55} />
        </mesh>
        <mesh position={[x, height / 2, width / 2]}>
          <boxGeometry args={[thickness * 1.2, height, thickness * 1.2]} />
          <meshStandardMaterial color="#64748b" metalness={0.2} roughness={0.55} />
        </mesh>
      </group>;
    })}

    {posts > 0 && <>
      <mesh position={[0, height, -width / 2]}><boxGeometry args={[length, thickness * 1.25, thickness * 1.25]} /><meshStandardMaterial color="#64748b" /></mesh>
      <mesh position={[0, height, width / 2]}><boxGeometry args={[length, thickness * 1.25, thickness * 1.25]} /><meshStandardMaterial color="#64748b" /></mesh>
      <mesh position={[0, height * 0.52, -width / 2]}>
        <planeGeometry args={[length, height * 0.9]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.025} depthWrite={false} />
      </mesh>
      <mesh position={[0, height * 0.52, width / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[length, height * 0.9]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.025} depthWrite={false} />
      </mesh>
    </>}

    {container.temperatureControlled && <mesh position={[-length / 2 + 0.06 * scale, height * 0.62, 0]}>
      <boxGeometry args={[0.12 * scale, Math.min(0.9, container.height * 0.42) * scale, Math.min(1.7, container.width * 0.72) * scale]} />
      <meshStandardMaterial color="#dbeafe" roughness={0.65} />
      <Edges color="#38bdf8" />
    </mesh>}

    {container.truckAxles && <>
      {[container.truckAxles.frontSupportX, container.truckAxles.rearSupportX].map((x, index) => (
        <group key={`axle-${index}`} position={[sceneX(container, x, scale), -0.12 * scale, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.12 * scale, 0.12 * scale, width * 1.04, 18]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh position={[0, 0, -width * 0.53]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.19 * scale, 0.19 * scale, 0.12 * scale, 18]} /><meshStandardMaterial color="#111827" /></mesh>
          <mesh position={[0, 0, width * 0.53]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.19 * scale, 0.19 * scale, 0.12 * scale, 18]} /><meshStandardMaterial color="#111827" /></mesh>
        </group>
      ))}
    </>}
  </group>;
}
