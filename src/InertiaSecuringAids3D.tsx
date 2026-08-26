import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import BoxSecuringAids3D from './BoxSecuringAids3D';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import type { PhysicsSupport } from './engine/physicsValidation';
import type { Placement } from './engine/types';
import type { SecuringUsage } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

const EPS = 1e-6;
const STRAP_M = 0.022;
const GUARD_M = 0.035;
const MAT_M = 0.008;

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function isAboveSupport(placement: Placement, support: PhysicsSupport) {
  const overlapX = overlap1d(placement.x, placement.x + placement.length, support.x, support.x + support.length);
  const overlapY = overlap1d(placement.y, placement.y + placement.width, support.y, support.y + support.width);
  const footprint = Math.max(EPS, placement.length * placement.width);
  return overlapX * overlapY / footprint >= 0.55 && placement.z + EPS >= support.z + support.height;
}

function supportLoadHeight(target: PhysicsTarget, support: PhysicsSupport) {
  const supports = target.supports ?? [];
  const upperSupportZ = supports
    .filter(candidate => candidate !== support && candidate.z > support.z + EPS)
    .filter(candidate => {
      const overlapX = overlap1d(candidate.x, candidate.x + candidate.length, support.x, support.x + support.length);
      const overlapY = overlap1d(candidate.y, candidate.y + candidate.width, support.y, support.y + support.width);
      return overlapX >= Math.min(candidate.length, support.length) * 0.8
        && overlapY >= Math.min(candidate.width, support.width) * 0.8;
    })
    .reduce((min, candidate) => Math.min(min, candidate.z), Number.POSITIVE_INFINITY);

  const supportTop = support.z + support.height;
  const top = target.result.placements
    .filter(placement => isAboveSupport(placement, support))
    .filter(placement => !Number.isFinite(upperSupportZ) || placement.z < upperSupportZ - EPS)
    .reduce((max, placement) => Math.max(max, placement.z + placement.height), supportTop);
  return Math.max(0, top - supportTop);
}

function pose(transforms: Float32Array, index: number) {
  const offset = index * 7;
  return {
    position: [transforms[offset], transforms[offset + 1], transforms[offset + 2]] as [number, number, number],
    quaternion: new THREE.Quaternion(
      transforms[offset + 3],
      transforms[offset + 4],
      transforms[offset + 5],
      transforms[offset + 6],
    ),
  };
}

function PalletSecuringUnit({
  target,
  support,
  supportIndex,
  frame,
  usage,
}: {
  target: PhysicsTarget;
  support: PhysicsSupport;
  supportIndex: number;
  frame: InertiaAnimationFrame;
  usage: SecuringUsage;
}) {
  const loadHeight = Math.max(0.02, supportLoadHeight(target, support));
  const current = pose(frame.supports, supportIndex);
  const centerY = support.height / 2 + loadHeight / 2;
  const topY = support.height / 2 + loadHeight;
  const supportCount = Math.max(1, (target.supports ?? []).length);
  const straps = Math.max(0, Math.round(usage.bandingStraps / supportCount));
  const mats = Math.max(0, Math.round(usage.antiSlipMats / supportCount));
  const showWrap = usage.wrappingLengthM > 0;
  const showGuards = usage.cornerGuards > 0;
  const corners = [
    [-support.length / 2, -support.width / 2],
    [support.length / 2, -support.width / 2],
    [-support.length / 2, support.width / 2],
    [support.length / 2, support.width / 2],
  ] as const;

  return <group position={current.position} quaternion={current.quaternion}>
    {showWrap && <mesh position={[0, centerY, 0]} renderOrder={30}>
      <boxGeometry args={[support.length * 1.025, loadHeight * 1.025, support.width * 1.025]} />
      <meshStandardMaterial color="#8fd3f4" transparent opacity={0.16} depthWrite={false} roughness={0.18} />
      <Edges color="#55aeda" />
    </mesh>}

    {Array.from({ length: straps }, (_, index) => {
      const x = -support.length / 2 + support.length * ((index + 1) / (straps + 1));
      return <group key={`inertia-strap-${supportIndex}-${index}`}>
        <mesh position={[x, topY + STRAP_M / 2, 0]}>
          <boxGeometry args={[STRAP_M, STRAP_M, support.width + STRAP_M * 2]} />
          <meshStandardMaterial color="#111827" roughness={0.45} />
        </mesh>
        <mesh position={[x, centerY, -support.width / 2 - STRAP_M / 2]}>
          <boxGeometry args={[STRAP_M, loadHeight, STRAP_M]} />
          <meshStandardMaterial color="#111827" roughness={0.45} />
        </mesh>
        <mesh position={[x, centerY, support.width / 2 + STRAP_M / 2]}>
          <boxGeometry args={[STRAP_M, loadHeight, STRAP_M]} />
          <meshStandardMaterial color="#111827" roughness={0.45} />
        </mesh>
      </group>;
    })}

    {showGuards && corners.map(([x, z], index) => <mesh key={`inertia-guard-${supportIndex}-${index}`} position={[x, centerY, z]}>
      <boxGeometry args={[GUARD_M, loadHeight, GUARD_M]} />
      <meshStandardMaterial color="#d6b276" roughness={0.82} />
    </mesh>)}

    {Array.from({ length: mats }, (_, index) => {
      const x = mats === 1 ? 0 : -support.length / 2 + support.length * ((index + 1) / (mats + 1));
      return <mesh key={`inertia-mat-${supportIndex}-${index}`} position={[x, support.height / 2 + MAT_M / 2, 0]}>
        <boxGeometry args={[Math.min(0.32, support.length * 0.28), MAT_M, support.width * 0.88]} />
        <meshStandardMaterial color="#334155" roughness={0.95} />
      </mesh>;
    })}
  </group>;
}

function LoadBars({ target, usage }: { target: PhysicsTarget; usage: SecuringUsage }) {
  const supports = target.supports ?? [];
  if (!supports.length || usage.loadBars <= 0) return null;
  const minX = Math.min(...supports.map(support => support.x));
  const maxX = Math.max(...supports.map(support => support.x + support.length));
  const maxTop = Math.max(...supports.map(support => support.z + support.height + supportLoadHeight(target, support)));
  const count = usage.loadBars;
  const xs = Array.from({ length: count }, (_, index) => {
    if (count === 1) return Math.min(target.container.length - 0.04, maxX + 0.035);
    return index === 0
      ? Math.max(0.04, minX - 0.035)
      : Math.min(target.container.length - 0.04, maxX + 0.035);
  });
  const height = Math.min(target.container.height * 0.72, Math.max(0.6, maxTop * 0.65));

  return <>
    {xs.map((x, index) => <mesh key={`inertia-loadbar-${index}`} position={[x - target.container.length / 2, height, 0]}>
      <boxGeometry args={[0.06, 0.08, target.container.width * 0.96]} />
      <meshStandardMaterial color="#e87924" metalness={0.18} roughness={0.52} />
      <Edges color="#9a4b12" />
    </mesh>)}
  </>;
}

export default function InertiaSecuringAids3D({
  target,
  frame,
  usage,
}: {
  target: PhysicsTarget;
  frame: InertiaAnimationFrame;
  usage: SecuringUsage | null;
}) {
  if (!usage || usage.level === 0) return null;
  if (target.mode === 'boxes') {
    return <BoxSecuringAids3D container={target.container} placements={target.result.placements} usage={usage} scale={1} />;
  }

  const supports = target.supports ?? [];
  return <group>
    {supports.map((support, index) => <PalletSecuringUnit
      key={`inertia-securing-${support.id}`}
      target={target}
      support={support}
      supportIndex={index}
      frame={frame}
      usage={usage}
    />)}
    <LoadBars target={target} usage={usage} />
  </group>;
}
