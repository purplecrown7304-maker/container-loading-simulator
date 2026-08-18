import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CARGO_FILTER_EVENT } from './CargoFilterBar';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { ContainerSpec, LoadingResult, Placement } from './engine/types';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';

function cargoColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

type IndexedPlacement = { placement: Placement; index: number };

type CargoFilterDetail = { cargoId: string | null };

function CargoInstances({ items, container, scale, onSelect, selectedCargoId, filteredCargoId }: {
  items: IndexedPlacement[];
  container: ContainerSpec;
  scale: number;
  onSelect: (index: number) => void;
  selectedCargoId: string | null;
  filteredCargoId: string | null;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cargoId = items[0]?.placement.cargoId ?? 'cargo';
  const color = useMemo(() => new THREE.Color(cargoColor(cargoId)), [cargoId]);
  const hiddenByFilter = filteredCargoId !== null && filteredCargoId !== cargoId;
  const isRelated = selectedCargoId === null || selectedCargoId === cargoId;

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

  if (hiddenByFilter) return null;

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
    <meshStandardMaterial roughness={0.65} transparent opacity={isRelated ? 1 : 0.18} />
  </instancedMesh>;
}

function SelectedCargo({ placement, container, scale }: { placement: Placement; container: ContainerSpec; scale: number }) {
  const position: [number, number, number] = [
    (placement.x + placement.length / 2) * scale - container.length * scale / 2,
    (placement.z + placement.height / 2) * scale,
    (placement.y + placement.width / 2) * scale - container.width * scale / 2,
  ];
  return <mesh position={position} scale={[placement.length * scale * 1.045, placement.height * scale * 1.045, placement.width * scale * 1.045]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial wireframe transparent opacity={1} />
  </mesh>;
}

function Scene({ result, container, selectedIndex, filteredCargoId, onSelect, onClear }: {
  result: LoadingResult;
  container: ContainerSpec;
  selectedIndex: number | null;
  filteredCargoId: string | null;
  onSelect: (index: number) => void;
  onClear: () => void;
}) {
  const scale = 0.45;
  const quality = assessWeightBalance(container, result);
  const addresses = buildPlacementAddresses(result.placements, container.length);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const selectedCargoId = selected?.cargoId ?? null;
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

  return <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[5, 8, 6]} intensity={2} />
    <gridHelper args={[8, 20]} position={[0, -0.01, 0]} onClick={onClear} />
    <mesh position={[0, cy, 0]} onClick={(event) => { event.stopPropagation(); onClear(); }}>
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

    {grouped.map(([cargoId, items]) => <CargoInstances key={cargoId} items={items} container={container} scale={scale} onSelect={onSelect} selectedCargoId={selectedCargoId} filteredCargoId={filteredCargoId} />)}
    {selected && (!filteredCargoId || selected.cargoId === filteredCargoId) && <SelectedCargo placement={selected} container={container} scale={scale} />}

    {result.placements.slice(0, 80).map((p, index) => {
      if (filteredCargoId && p.cargoId !== filteredCargoId) return null;
      const a = addresses[index];
      const pos: [number, number, number] = [
        (p.x + p.length / 2) * scale - container.length * scale / 2,
        (p.z + p.height) * scale + 0.035,
        (p.y + p.width / 2) * scale - container.width * scale / 2,
      ];
      const visible = selectedCargoId === null || selectedCargoId === p.cargoId;
      return <Text key={`label-${p.cargoId}-${index}`} position={pos} fontSize={0.055} fillOpacity={visible ? 1 : 0.12}>
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
  const [filteredCargoId, setFilteredCargoId] = useState<string | null>(null);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result.placements, container.length]);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const selectedAddress = selectedIndex === null ? undefined : addresses[selectedIndex];
  const filteredCount = filteredCargoId ? result.placements.filter(p => p.cargoId === filteredCargoId).length : result.placements.length;

  const changeSelection = (index: number | null) => {
    setSelectedIndex(index);
    selectPlacement(index);
  };

  useEffect(() => {
    if (selectedIndex !== null && !result.placements[selectedIndex]) changeSelection(null);
  }, [result.placements, selectedIndex]);

  useEffect(() => {
    const onExternalSelection = (event: Event) => {
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      if (index !== null && !result.placements[index]) return;
      setSelectedIndex(index);
    };
    window.addEventListener(PLACEMENT_SELECT_EVENT, onExternalSelection);
    return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, onExternalSelection);
  }, [result.placements]);

  useEffect(() => {
    const onFilter = (event: Event) => {
      const cargoId = (event as CustomEvent<CargoFilterDetail>).detail?.cargoId ?? null;
      setFilteredCargoId(cargoId);
      if (cargoId && selectedIndex !== null && result.placements[selectedIndex]?.cargoId !== cargoId) changeSelection(null);
    };
    window.addEventListener(CARGO_FILTER_EVENT, onFilter);
    return () => window.removeEventListener(CARGO_FILTER_EVENT, onFilter);
  }, [result.placements, selectedIndex]);

  return <section className="viewer">
    <Canvas
      camera={{ position:[5.5,4.2,6.5], fov:48 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => changeSelection(null)}
    >
      <Scene result={result} container={container} selectedIndex={selectedIndex} filteredCargoId={filteredCargoId} onSelect={changeSelection} onClear={() => changeSelection(null)} />
    </Canvas>
    <div className="viewer-direction"><b>박스 적재</b><span>{filteredCargoId ? `${filteredCargoId}만 보기 · ${filteredCount} EA` : '박스 또는 우측 위치 목록을 눌러 상세 확인'}</span></div>
    {selected && selectedAddress && (!filteredCargoId || selected.cargoId === filteredCargoId) && <div className="cargo-inspector">
      <div className="cargo-inspector-head"><b>{selected.cargoId}</b><button type="button" onClick={() => changeSelection(null)}>닫기</button></div>
      <strong>{`R${selectedAddress.row} C${selectedAddress.column} L${selectedAddress.layer}`}</strong>
      <span>{selectedAddress.zone} · {selected.rotated ? '90° 회전' : '기본 방향'} · 같은 품목 전체 강조</span>
      <small>{`X ${selected.x.toFixed(2)}m · Y ${selected.y.toFixed(2)}m · Z ${selected.z.toFixed(2)}m`}</small>
      <small>{`${selected.length.toFixed(2)} × ${selected.width.toFixed(2)} × ${selected.height.toFixed(2)}m · ${selected.weightKg.toFixed(1)}kg`}</small>
    </div>}
  </section>;
}
