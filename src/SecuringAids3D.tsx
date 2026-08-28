import { Edges } from '@react-three/drei';
import { useMemo } from 'react';
import type { PalletLoad } from './engine/palletOptimization';
import type { ContainerSpec } from './engine/types';
import EquipmentShell3D from './EquipmentShell3D';
import type { SecuringUsage } from './inertiaCertification';

type Props = {
  container: ContainerSpec;
  pallets: PalletLoad[];
  usage: SecuringUsage | null;
  scale: number;
};

const STRAP_THICKNESS_M = 0.022;
const GUARD_THICKNESS_M = 0.035;
const MAT_THICKNESS_M = 0.008;
const LOAD_BAR_LENGTH_M = 0.06;

function cargoTop(pallet: PalletLoad) {
  return Math.max(pallet.z + pallet.height, ...pallet.cargoPlacements.map(box => box.z + box.height));
}

function sceneX(container: ContainerSpec, x: number, scale: number) {
  return x * scale - container.length * scale / 2;
}

function sceneZ(container: ContainerSpec, y: number, scale: number) {
  return y * scale - container.width * scale / 2;
}

function PalletSecuring({ container, pallet, usage, scale }: { container: ContainerSpec; pallet: PalletLoad; usage: SecuringUsage; scale: number }) {
  if (!pallet.cargoPlacements.length || usage.level === 0) return null;
  const top = cargoTop(pallet);
  const base = pallet.z + pallet.height;
  const loadHeight = Math.max(0.02, top - base);
  const centerY = base + loadHeight / 2;
  const strapsPerPallet = usage.palletCount > 0 ? Math.max(0, Math.round(usage.bandingStraps / usage.palletCount)) : 0;
  const matsPerPallet = usage.palletCount > 0 ? Math.max(0, Math.round(usage.antiSlipMats / usage.palletCount)) : 0;
  const corners = [
    [pallet.x, pallet.y],
    [pallet.x + pallet.length, pallet.y],
    [pallet.x, pallet.y + pallet.width],
    [pallet.x + pallet.length, pallet.y + pallet.width],
  ] as const;

  return <group>
    {usage.wrappingLengthM > 0 && <mesh
      position={[
        sceneX(container, pallet.x + pallet.length / 2, scale),
        centerY * scale,
        sceneZ(container, pallet.y + pallet.width / 2, scale),
      ]}
      renderOrder={21}
    >
      <boxGeometry args={[pallet.length * scale * 1.018, loadHeight * scale * 1.018, pallet.width * scale * 1.018]} />
      <meshStandardMaterial color="#9bd7f5" transparent opacity={0.11} depthWrite={false} roughness={0.2} />
      <Edges color="#68b9e7" />
    </mesh>}

    {Array.from({ length: strapsPerPallet }, (_, index) => {
      const ratio = (index + 1) / (strapsPerPallet + 1);
      const x = pallet.x + pallet.length * ratio;
      const zLeft = pallet.y - STRAP_THICKNESS_M / 2;
      const zRight = pallet.y + pallet.width + STRAP_THICKNESS_M / 2;
      return <group key={`strap-${pallet.palletIndex}-${index}`}>
        <mesh position={[sceneX(container, x, scale), (top + STRAP_THICKNESS_M / 2) * scale, sceneZ(container, pallet.y + pallet.width / 2, scale)]}>
          <boxGeometry args={[STRAP_THICKNESS_M * scale, STRAP_THICKNESS_M * scale, (pallet.width + STRAP_THICKNESS_M * 2) * scale]} />
          <meshStandardMaterial color="#1f2937" roughness={0.48} />
        </mesh>
        <mesh position={[sceneX(container, x, scale), centerY * scale, sceneZ(container, zLeft, scale)]}>
          <boxGeometry args={[STRAP_THICKNESS_M * scale, loadHeight * scale, STRAP_THICKNESS_M * scale]} />
          <meshStandardMaterial color="#1f2937" roughness={0.48} />
        </mesh>
        <mesh position={[sceneX(container, x, scale), centerY * scale, sceneZ(container, zRight, scale)]}>
          <boxGeometry args={[STRAP_THICKNESS_M * scale, loadHeight * scale, STRAP_THICKNESS_M * scale]} />
          <meshStandardMaterial color="#1f2937" roughness={0.48} />
        </mesh>
      </group>;
    })}

    {usage.cornerGuards > 0 && corners.map(([x, y], index) => <group key={`guard-${pallet.palletIndex}-${index}`}>
      <mesh position={[sceneX(container, x, scale), centerY * scale, sceneZ(container, y, scale)]}>
        <boxGeometry args={[GUARD_THICKNESS_M * scale, loadHeight * scale, GUARD_THICKNESS_M * scale]} />
        <meshStandardMaterial color="#d6b276" roughness={0.82} />
      </mesh>
    </group>)}

    {Array.from({ length: matsPerPallet }, (_, index) => {
      const ratio = matsPerPallet === 1 ? 0.5 : (index + 1) / (matsPerPallet + 1);
      return <mesh
        key={`mat-${pallet.palletIndex}-${index}`}
        position={[
          sceneX(container, pallet.x + pallet.length * ratio, scale),
          (pallet.z + pallet.height + MAT_THICKNESS_M / 2) * scale,
          sceneZ(container, pallet.y + pallet.width / 2, scale),
        ]}
      >
        <boxGeometry args={[Math.min(0.32, pallet.length * 0.28) * scale, MAT_THICKNESS_M * scale, pallet.width * 0.88 * scale]} />
        <meshStandardMaterial color="#334155" roughness={0.95} />
      </mesh>;
    })}
  </group>;
}

export default function SecuringAids3D({ container, pallets, usage, scale }: Props) {
  const occupied = useMemo(() => {
    const active = pallets.filter(pallet => pallet.cargoPlacements.length > 0);
    if (!active.length) return null;
    return {
      minX: Math.min(...active.map(pallet => pallet.x)),
      maxX: Math.max(...active.map(pallet => pallet.x + pallet.length)),
      maxTop: Math.max(...active.map(cargoTop)),
    };
  }, [pallets]);

  const activeUsage = usage && usage.level > 0 ? usage : null;
  const barCount = Math.max(0, activeUsage?.loadBars ?? 0);
  const barXs = occupied && barCount > 0
    ? Array.from({ length: barCount }, (_, index) => {
      if (barCount === 1) return Math.min(container.length - 0.04, occupied.maxX + 0.035);
      return index === 0
        ? Math.max(0.04, occupied.minX - 0.035)
        : Math.min(container.length - 0.04, occupied.maxX + 0.035);
    })
    : [];
  const barHeight = occupied ? Math.min(container.height * 0.72, Math.max(0.6, occupied.maxTop * 0.65)) : container.height * 0.5;

  return <group>
    <EquipmentShell3D container={container} scale={scale} />
    {activeUsage && pallets.map(pallet => <PalletSecuring key={`securing-${pallet.palletIndex}`} container={container} pallet={pallet} usage={activeUsage} scale={scale} />)}
    {activeUsage && barXs.map((x, index) => <mesh
      key={`load-bar-${index}`}
      position={[sceneX(container, x, scale), barHeight * scale, 0]}
    >
      <boxGeometry args={[LOAD_BAR_LENGTH_M * scale, 0.08 * scale, container.width * 0.96 * scale]} />
      <meshStandardMaterial color="#e87924" metalness={0.18} roughness={0.52} />
      <Edges color="#9a4b12" />
    </mesh>)}
  </group>;
}
