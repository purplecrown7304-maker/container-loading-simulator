import { Edges } from '@react-three/drei';
import { useMemo } from 'react';
import type { ContainerSpec, Placement } from './engine/types';
import type { SecuringUsage } from './inertiaCertification';

type Props = {
  container: ContainerSpec;
  placements: Placement[];
  usage: SecuringUsage | null;
  scale: number;
};

function sceneX(container: ContainerSpec, x: number, scale: number) {
  return x * scale - container.length * scale / 2;
}

function sceneZ(container: ContainerSpec, y: number, scale: number) {
  return y * scale - container.width * scale / 2;
}

export default function BoxSecuringAids3D({ container, placements, usage, scale }: Props) {
  const bounds = useMemo(() => {
    if (!placements.length) return null;
    return {
      minX: Math.min(...placements.map(p => p.x)),
      maxX: Math.max(...placements.map(p => p.x + p.length)),
      minY: Math.min(...placements.map(p => p.y)),
      maxY: Math.max(...placements.map(p => p.y + p.width)),
      maxTop: Math.max(...placements.map(p => p.z + p.height)),
    };
  }, [placements]);

  if (!usage || usage.level === 0 || !bounds) return null;
  const occupiedLength = Math.max(0.1, bounds.maxX - bounds.minX);
  const occupiedWidth = Math.max(0.1, bounds.maxY - bounds.minY);
  const matCount = Math.max(0, usage.antiSlipMats);
  const blockCount = Math.max(0, usage.dunnageBlocks);
  const barCount = Math.max(0, usage.loadBars);

  return <group>
    {Array.from({ length: matCount }, (_, index) => {
      const ratio = (index + 1) / (matCount + 1);
      const x = bounds.minX + occupiedLength * ratio;
      return <mesh key={`box-mat-${index}`} position={[
        sceneX(container, x, scale),
        0.006 * scale,
        sceneZ(container, (bounds.minY + bounds.maxY) / 2, scale),
      ]}>
        <boxGeometry args={[Math.min(0.42, occupiedLength / Math.max(2, matCount)) * scale, 0.012 * scale, occupiedWidth * 0.92 * scale]} />
        <meshStandardMaterial color="#334155" roughness={0.96} />
      </mesh>;
    })}

    {Array.from({ length: blockCount }, (_, index) => {
      const pairIndex = Math.floor(index / 2);
      const pairCount = Math.ceil(blockCount / 2);
      const ratio = (pairIndex + 1) / (pairCount + 1);
      const x = bounds.minX + occupiedLength * ratio;
      const left = index % 2 === 0;
      const y = left ? Math.max(0.04, bounds.minY - 0.055) : Math.min(container.width - 0.04, bounds.maxY + 0.055);
      return <mesh key={`blocking-${index}`} position={[
        sceneX(container, x, scale),
        0.11 * scale,
        sceneZ(container, y, scale),
      ]}>
        <boxGeometry args={[0.22 * scale, 0.22 * scale, 0.09 * scale]} />
        <meshStandardMaterial color="#b78650" roughness={0.88} />
        <Edges color="#704728" />
      </mesh>;
    })}

    {Array.from({ length: barCount }, (_, index) => {
      const x = barCount === 1
        ? Math.min(container.length - 0.04, bounds.maxX + 0.04)
        : index === 0
          ? Math.max(0.04, bounds.minX - 0.04)
          : Math.min(container.length - 0.04, bounds.maxX + 0.04);
      const height = Math.min(container.height * 0.72, Math.max(0.55, bounds.maxTop * 0.62));
      return <mesh key={`box-load-bar-${index}`} position={[
        sceneX(container, x, scale),
        height * scale,
        0,
      ]}>
        <boxGeometry args={[0.06 * scale, 0.08 * scale, container.width * 0.96 * scale]} />
        <meshStandardMaterial color="#e87924" metalness={0.18} roughness={0.52} />
        <Edges color="#9a4b12" />
      </mesh>;
    })}
  </group>;
}
