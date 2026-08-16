import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { ContainerSpec, LoadingResult, Placement } from './engine/types';

function cargoColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

type IndexedPlacement = { placement: Placement; index: number };

function CargoInstances({ items, container, scale, onSelect }: {
  items: IndexedPlacement[];
  container: ContainerSpec;
  scale: number;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const color = useMemo(() => new THREE.Color(cargoColor(items[0]?.placement.cargoId ?? 'cargo')), [items]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach(({ placement: p }, i) => {
      object.position.set(
        (p.x + p.length / 2) * scale - container.length * scale / 2,
        (p.z + p.height / 2) * scale,
        (p.y + p.width / 2) * scale - container.width * scale / 2,
      );
      object.scale.set(p.length * scale, p.height * scale, p.width * scale);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, container.length, container.width, scale, color]);

  return <instancedMesh
    ref={ref}
    args={[undefined, undefined, items.length]}
    frustumCulled
    onClick={(event) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      const selected = items[event.instanceId];
      if (selected) onSelect(selected.index);
    }}
  >
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial roughness={0.65} />
  </instancedMesh>;
}

function SelectedCargo({ placement, container, scale }: { placement: Placement; container: ContainerSpec; scale: number }) {
  const position: [number, number, number] = [
    (placement.x + placement.length / 2) * scale - container.length * scale / 2,
    (placement.z + placement.height / 2) * scale,
    (placement.y + placement.width / 2) * scale - container.width * scale / 2,
  ];
  return <mesh position={position} scale={[placement.length * scale * 1.035, placement.height * scale * 1.035, placement.width * scale * 1.035]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial wireframe transparent opacity={0.95} />
  </mesh>;
}

function Scene({ result, container, selectedIndex, onSelect }: {
  result: LoadingResult;
  container: ContainerSpec;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const scale = 0.45;
  const quality = assessWeightBalance(container, result);
  const addresses = buildPlacementAddresses(result.placements, container.length);
  const grouped = useMemo(() => {
    const map = new Map<string, IndexedPlacement[]>();
    result.placements.forEach((placement, index) => {
      const group = map.get(placement.cargoId) ?? [];
      group.push({ placement, index });
      map.set(placement.cargoId, group);
    });
    return [...map.entries()];
  }, [result.placements]);
  const cy = (container.height * scale) / 2;
  const insideX = -(container.length * scale) / 2;
  const doorX = (container.length * scale) / 2;
  const markerY = container.height * scale + 0.18;
  const cogX = quality.centerOfGravity.x * scale - (container.length * scale) / 2;
  const cogY = quality.centerOfGravity.z * scale;
  const cogZ = quality.centerOfGravity.y * scale - (container.width * scale) / 2;
  const zoneBoundaries = [container.length / 3, (container.length * 2) / 3];
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];

  return <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[5, 8, 6]} intensity={2} />
    <gridHelper args={[8, 20]} position={[0, -0.01, 0]} />
    <mesh position={[0, cy, 0]} onClick={(event) => event.stopPropagation()}>
      <boxGeometry args={[container.length * scale, container.height * scale, container.width * scale]} />
      <meshBasicMaterial wireframe transparent opacity={0.22} />
    </mesh>
    {zoneBoundaries.map((x) => {
      const sx = x * scale - (container.length * scale) / 2;
      return <mesh key={x} position={[sx, cy, 0]}>
        <boxGeometry args={[0.012, container.height * scale, container.width * scale]} />
        <meshBasicMaterial transparent opacity={0.18} />
      </mesh>;
    })}
    <Text position={[insideX + container.length * scale / 6, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>안쪽 구역</Text>
    <Text position={[0, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>중앙 구역</Text>
    <Text position={[doorX - container.length * scale / 6, 0.04, -(container.width * scale) / 2 - 0.12]} fontSize={0.1}>문쪽 구역</Text>
    <Text position={[insideX + 0.28, markerY, 0]} fontSize={0.13} anchorX="left">안쪽</Text>
    <Text position={[doorX - 0.22, markerY, 0]} fontSize={0.13} anchorX="right">문</Text>

    {grouped.map(([cargoId, items]) => <CargoInstances key={cargoId} items={items} container={container} scale={scale} onSelect={onSelect} />)}
    {selected && <SelectedCargo placement={selected} container={container} scale={scale} />}

    {result.placements.slice(0, 80).map((p, index) => {
      const a = addresses[index];
      const pos: [number, number, number] = [
        (p.x + p.length / 2) * scale - container.length * scale / 2,
        (p.z + p.height) * scale + 0.035,
        (p.y + p.width / 2) * scale - container.width * scale / 2,
      ];
      return <Text key={`label-${p.cargoId}-${index}`} position={pos} fontSize={0.055}>
        {`R${a.row} C${a.column} L${a.layer}${p.rotated ? ' ↻' : ''}`}
      </Text>;
    })}

    {result.placements.length > 0 && <mesh position={[cogX, cogY, cogZ]}>
      <sphereGeometry args={[0.075, 24, 24]} />
      <meshStandardMaterial emissiveIntensity={1.2} />
    </mesh>}
    <OrbitControls makeDefault />
  </>;
}

export default function BoxLoadingViewer({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result.placements, container.length]);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const selectedAddress = selectedIndex === null ? undefined : addresses[selectedIndex];

  return <section className="viewer">
    <Canvas
      camera={{ position:[5.5,4.2,6.5], fov:48 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => setSelectedIndex(null)}
    >
      <Scene result={result} container={container} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
    </Canvas>
    <div className="viewer-direction"><b>박스 적재</b><span>박스를 눌러 상세 위치 확인</span></div>
    {selected && selectedAddress && <div className="cargo-inspector">
      <div className="cargo-inspector-head"><b>{selected.cargoId}</b><button type="button" onClick={() => setSelectedIndex(null)}>닫기</button></div>
      <strong>{`R${selectedAddress.row} C${selectedAddress.column} L${selectedAddress.layer}`}</strong>
      <span>{selectedAddress.zone} · {selected.rotated ? '90° 회전' : '기본 방향'}</span>
      <small>{`X ${selected.x.toFixed(2)}m · Y ${selected.y.toFixed(2)}m · Z ${selected.z.toFixed(2)}m`}</small>
      <small>{`${selected.length.toFixed(2)} × ${selected.width.toFixed(2)} × ${selected.height.toFixed(2)}m · ${selected.weightKg.toFixed(1)}kg`}</small>
    </div>}
  </section>;
}
