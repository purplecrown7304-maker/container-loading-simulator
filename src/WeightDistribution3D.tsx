import { Html } from '@react-three/drei';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import type { ContainerSpec } from './engine/types';
import type { WeightDistributionAnalysis } from './engine/weightDistribution';

const BLUE = new THREE.Color('#2563eb');
const GREEN = new THREE.Color('#22c55e');
const YELLOW = new THREE.Color('#f59e0b');
const RED = new THREE.Color('#ef4444');

function weightColor(ratio: number) {
  const t = Math.max(0, Math.min(1, ratio));
  if (t <= 0.34) return BLUE.clone().lerp(GREEN, t / 0.34);
  if (t <= 0.67) return GREEN.clone().lerp(YELLOW, (t - 0.34) / 0.33);
  return YELLOW.clone().lerp(RED, (t - 0.67) / 0.33);
}

export default function WeightDistribution3D({
  container,
  analysis,
  scale,
  showCenterOfGravity,
}: {
  container: ContainerSpec;
  analysis: WeightDistributionAnalysis;
  scale: number;
  showCenterOfGravity: boolean;
}) {
  const [hoveredCellIndex, setHoveredCellIndex] = useState<number | null>(null);
  const maxLoadKg = Math.max(0, ...analysis.floor.cells.map(cell => cell.loadKg));
  const maxGraphHeight = Math.max(0.22, container.height * scale * 0.72);
  const cog = analysis.centerOfGravity;
  const hovered = hoveredCellIndex === null ? null : analysis.floor.cells[hoveredCellIndex] ?? null;

  const barData = useMemo(() => analysis.floor.cells.map((cell, index) => {
    if (cell.loadKg <= 0 || maxLoadKg <= 0) return null;
    const intensity = Math.max(0.025, cell.loadKg / maxLoadKg);
    const height = Math.max(0.035, intensity * maxGraphHeight);
    return {
      cell,
      index,
      intensity,
      height,
      color: weightColor(intensity),
      position: [
        (cell.x + cell.length / 2) * scale - container.length * scale / 2,
        0.035 + height / 2,
        (cell.y + cell.width / 2) * scale - container.width * scale / 2,
      ] as [number, number, number],
    };
  }).filter(Boolean), [analysis.floor.cells, container.length, container.width, maxGraphHeight, maxLoadKg, scale]);

  return <group>
    {barData.map(data => data && <mesh
      key={`weight-cell-${data.index}`}
      position={data.position}
      renderOrder={30}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHoveredCellIndex(data.index);
        document.body.style.cursor = 'help';
      }}
      onPointerOut={() => {
        setHoveredCellIndex(current => current === data.index ? null : current);
        document.body.style.cursor = '';
      }}
    >
      <boxGeometry args={[
        data.cell.length * scale * 0.88,
        data.height,
        data.cell.width * scale * 0.82,
      ]} />
      <meshStandardMaterial
        color={data.color}
        transparent
        opacity={0.68}
        roughness={0.42}
        metalness={0.02}
        depthWrite={false}
        emissive={data.color}
        emissiveIntensity={data.intensity > 0.82 ? 0.14 : 0.03}
      />
    </mesh>)}

    {hovered && <Html
      center
      zIndexRange={[50, 0]}
      position={[
        (hovered.x + hovered.length / 2) * scale - container.length * scale / 2,
        Math.min(container.height * scale * 0.92, maxGraphHeight + 0.24),
        (hovered.y + hovered.width / 2) * scale - container.width * scale / 2,
      ]}
    >
      <div className="weight-cell-tooltip">
        <b>R{hovered.row + 1} · C{hovered.column + 1}</b>
        <span>{hovered.loadKg.toFixed(1)} kg</span>
        <small>{hovered.kgPerM2.toFixed(0)} kg/m²</small>
      </div>
    </Html>}

    {showCenterOfGravity && <group>
      {/* Fixed horizontal reference. In scene coordinates L/2,W/2 is exactly (0,0). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.047, 0]} renderOrder={34}>
        <ringGeometry args={[0.21, 0.245, 32]} />
        <meshBasicMaterial color="#0f766e" transparent opacity={0.96} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.09, 0]} renderOrder={34}>
        <boxGeometry args={[0.035, 0.18, 0.035]} />
        <meshBasicMaterial color="#0f766e" depthWrite={false} />
      </mesh>
      <Html center position={[0, 0.28, 0]} zIndexRange={[46, 0]}>
        <span className="weight-cog-label">컨테이너 중심 · L/2, W/2</span>
      </Html>
    </group>}

    {showCenterOfGravity && analysis.totalWeightKg > 0 && <group>
      <mesh position={[
        cog.x * scale - container.length * scale / 2,
        Math.max(0.03, cog.z * scale / 2 + 0.03),
        cog.y * scale - container.width * scale / 2,
      ]} renderOrder={32}>
        <cylinderGeometry args={[0.018, 0.018, Math.max(0.04, cog.z * scale), 16]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <mesh position={[
        cog.x * scale - container.length * scale / 2,
        cog.z * scale + 0.03,
        cog.y * scale - container.width * scale / 2,
      ]} renderOrder={33}>
        <sphereGeometry args={[0.105, 24, 16]} />
        <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.25} depthWrite={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[
          cog.x * scale - container.length * scale / 2,
          0.042,
          cog.y * scale - container.width * scale / 2,
        ]}
        renderOrder={33}
      >
        <ringGeometry args={[0.12, 0.17, 32]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.92} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Html
        center
        position={[
          cog.x * scale - container.length * scale / 2,
          cog.z * scale + 0.25,
          cog.y * scale - container.width * scale / 2,
        ]}
        zIndexRange={[45, 0]}
      >
        <span className="weight-cog-label">화물 CG · 컨테이너 중심 대비</span>
      </Html>
    </group>}
  </group>;
}
