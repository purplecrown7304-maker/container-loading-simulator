import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CARGO_FILTER_EVENT } from './CargoFilterBar';
import { assessWeightBalance } from './engine/weightBalance';
import { buildPlacementAddresses } from './engine/locationGrid';
import { assessZoneUtilization, detectZoneFlowWarning } from './engine/zoneUtilization';
import type { ContainerSpec, LoadingResult, Placement } from './engine/types';
import {
  MANUAL_DRAG_FEEDBACK_EVENT,
  publishManualDragApply,
  publishManualDragCancel,
  publishManualDragCandidate,
  type ManualDragFeedbackDetail,
} from './manualDragEvents';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';

function cargoColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 68% 54%)`;
}

const snap05 = (value: number) => Math.round(value / 0.05) * 0.05;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type IndexedPlacement = { placement: Placement; index: number };
type CargoFilterDetail = { cargoId: string | null };
type LayerLimit = null | 1 | 3 | 5;
type DragState = {
  index: number;
  origin: Placement;
  candidate: Placement;
  moved: boolean;
  valid: boolean | null;
  reasons: string[];
};

function CargoInstances({ items, container, scale, onSelect, onDragStart, selectedCargoId, filteredCargoId }: {
  items: IndexedPlacement[];
  container: ContainerSpec;
  scale: number;
  onSelect: (index: number) => void;
  onDragStart: (index: number) => void;
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

  if (hiddenByFilter || !items.length) return null;

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
    onPointerDown={(event) => {
      event.stopPropagation();
      if (event.instanceId === undefined) return;
      const selected = items[event.instanceId];
      if (!selected) return;
      onSelect(selected.index);
      onDragStart(selected.index);
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

function DragGhost({ drag, container, scale }: { drag: DragState; container: ContainerSpec; scale: number }) {
  const p = drag.candidate;
  const position: [number, number, number] = [
    (p.x + p.length / 2) * scale - container.length * scale / 2,
    (p.z + p.height / 2) * scale,
    (p.y + p.width / 2) * scale - container.width * scale / 2,
  ];
  const statusColor = drag.valid === false ? '#ef4444' : drag.valid === true ? '#22c55e' : '#f59e0b';
  return <mesh position={position} scale={[p.length * scale * 1.035, p.height * scale * 1.035, p.width * scale * 1.035]} renderOrder={20}>
    <boxGeometry args={[1,1,1]} />
    <meshBasicMaterial color={statusColor} transparent opacity={0.32} depthWrite={false} />
  </mesh>;
}

function Scene({ result, container, selectedIndex, filteredCargoId, layerLimit, drag, onSelect, onClear, onDragStart, onDragCandidate, onDragEnd }: {
  result: LoadingResult;
  container: ContainerSpec;
  selectedIndex: number | null;
  filteredCargoId: string | null;
  layerLimit: LayerLimit;
  drag: DragState | null;
  onSelect: (index: number) => void;
  onClear: () => void;
  onDragStart: (index: number) => void;
  onDragCandidate: (position: { x:number; y:number; z:number }) => void;
  onDragEnd: () => void;
}) {
  const scale = 0.45;
  const quality = assessWeightBalance(container, result);
  const addresses = buildPlacementAddresses(result.placements, container.length);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const selectedCargoId = selected?.cargoId ?? null;
  const grouped = useMemo(() => {
    const map = new Map<string, IndexedPlacement[]>();
    result.placements.forEach((placement, index) => {
      if (layerLimit !== null && (addresses[index]?.layer ?? Infinity) > layerLimit) return;
      const group = map.get(placement.cargoId) ?? [];
      group.push({ placement, index });
      map.set(placement.cargoId, group);
    });
    return [...map.entries()];
  }, [result.placements, addresses, layerLimit]);
  const cy = (container.height * scale) / 2;
  const insideX = -(container.length * scale) / 2;
  const doorX = (container.length * scale) / 2;
  const markerY = container.height * scale + 0.18;
  const cogX = quality.centerOfGravity.x * scale - (container.length * scale) / 2;
  const cogY = quality.centerOfGravity.z * scale;
  const cogZ = quality.centerOfGravity.y * scale - (container.width * scale) / 2;
  const zoneBoundaries = [container.length / 3, (container.length * 2) / 3];
  const selectedVisible = selected && (layerLimit === null || (addresses[selectedIndex ?? -1]?.layer ?? Infinity) <= layerLimit);

  return <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[5, 8, 6]} intensity={2} />
    <gridHelper args={[8, 20]} position={[0, -0.01, 0]} onClick={onClear} />
    <mesh position={[0, cy, 0]} onClick={(event) => { event.stopPropagation(); if (!drag) onClear(); }}>
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

    {grouped.map(([cargoId, items]) => <CargoInstances key={cargoId} items={items} container={container} scale={scale} onSelect={onSelect} onDragStart={onDragStart} selectedCargoId={selectedCargoId} filteredCargoId={filteredCargoId} />)}
    {selectedVisible && (!filteredCargoId || selected.cargoId === filteredCargoId) && <SelectedCargo placement={selected} container={container} scale={scale} />}
    {drag && <DragGhost drag={drag} container={container} scale={scale} />}

    {drag && <mesh
      position={[0, (drag.origin.z + drag.origin.height / 2) * scale, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(event) => {
        event.stopPropagation();
        const xCenter = event.point.x / scale + container.length / 2;
        const yCenter = event.point.z / scale + container.width / 2;
        onDragCandidate({
          x: clamp(snap05(xCenter - drag.origin.length / 2), 0, Math.max(0, container.length - drag.origin.length)),
          y: clamp(snap05(yCenter - drag.origin.width / 2), 0, Math.max(0, container.width - drag.origin.width)),
          z: drag.origin.z,
        });
      }}
      onPointerUp={(event) => { event.stopPropagation(); onDragEnd(); }}
      onPointerCancel={(event) => { event.stopPropagation(); onDragEnd(); }}
    >
      <planeGeometry args={[container.length * scale, container.width * scale]} />
      <meshBasicMaterial transparent opacity={0.001} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>}

    {result.placements.slice(0, 80).map((p, index) => {
      const a = addresses[index];
      if (filteredCargoId && p.cargoId !== filteredCargoId) return null;
      if (layerLimit !== null && (a?.layer ?? Infinity) > layerLimit) return null;
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
    <OrbitControls makeDefault enabled={!drag} />
  </>;
}

function TopDownMinimap({ result, container, addresses, selectedIndex, filteredCargoId, layerLimit, onSelect }: {
  result: LoadingResult;
  container: ContainerSpec;
  addresses: ReturnType<typeof buildPlacementAddresses>;
  selectedIndex: number | null;
  filteredCargoId: string | null;
  layerLimit: LayerLimit;
  onSelect: (index: number) => void;
}) {
  const width = 260;
  const height = 110;
  const sx = width / Math.max(container.length, 0.001);
  const sy = height / Math.max(container.width, 0.001);
  const visible = result.placements
    .map((placement, index) => ({ placement, index, address: addresses[index] }))
    .filter(({ placement, address }) => (!filteredCargoId || placement.cargoId === filteredCargoId) && (layerLimit === null || (address?.layer ?? Infinity) <= layerLimit));
  const visiblePlacements = visible.map(item => item.placement);
  const zones = assessZoneUtilization(container, visiblePlacements);
  const flowWarning = detectZoneFlowWarning(zones);
  const filteredView = Boolean(filteredCargoId || layerLimit !== null);

  return <div className="topdown-minimap">
    <div className="topdown-minimap-head"><b>상단 평면 미니맵</b><span>안쪽 → 문쪽</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="컨테이너 상단 평면 적재 미니맵">
      <rect x="0.5" y="0.5" width={width - 1} height={height - 1} rx="5" fill="rgba(255,255,255,.92)" stroke="currentColor" strokeOpacity=".35" />
      <line x1={width / 3} y1="0" x2={width / 3} y2={height} stroke="currentColor" strokeOpacity=".14" strokeDasharray="4 3" />
      <line x1={width * 2 / 3} y1="0" x2={width * 2 / 3} y2={height} stroke="currentColor" strokeOpacity=".14" strokeDasharray="4 3" />
      {visible.map(({ placement: p, index }) => {
        const selected = selectedIndex === index;
        return <rect
          key={`${p.cargoId}-${index}`}
          x={p.x * sx}
          y={p.y * sy}
          width={Math.max(1.5, p.length * sx)}
          height={Math.max(1.5, p.width * sy)}
          rx="1.5"
          fill={cargoColor(p.cargoId)}
          fillOpacity={selected ? 1 : 0.68}
          stroke={selected ? '#111827' : 'rgba(17,24,39,.35)'}
          strokeWidth={selected ? 2 : 0.5}
          onClick={() => onSelect(index)}
          style={{ cursor: 'pointer' }}
        />;
      })}
      <text x="5" y="12" fontSize="8" fill="currentColor" opacity=".7">안쪽</text>
      <text x={width - 5} y="12" textAnchor="end" fontSize="8" fill="currentColor" opacity=".7">문</text>
    </svg>
    <div className="zone-utilization-grid" aria-label="구역별 CBM 적재율">
      {zones.map(zone => <div key={zone.id} className="zone-utilization-card">
        <span>{zone.label}</span><strong>{zone.fillPct.toFixed(0)}%</strong><small>빈 공간 {zone.freePct.toFixed(0)}%</small>
        <div className="zone-utilization-track"><i style={{ width: `${zone.fillPct}%` }} /></div>
      </div>)}
    </div>
    {filteredView && <div className="zone-utilization-note">현재 품목/층 필터에 보이는 박스 기준 CBM입니다.</div>}
    {flowWarning && <div className="zone-flow-warning">{flowWarning}</div>}
  </div>;
}

export default function BoxLoadingViewer({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filteredCargoId, setFilteredCargoId] = useState<string | null>(null);
  const [layerLimit, setLayerLimit] = useState<LayerLimit>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result.placements, container.length]);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const selectedAddress = selectedIndex === null ? undefined : addresses[selectedIndex];
  const filteredCount = filteredCargoId ? result.placements.filter(p => p.cargoId === filteredCargoId).length : result.placements.length;
  const visibleCount = result.placements.filter((p, i) => (!filteredCargoId || p.cargoId === filteredCargoId) && (layerLimit === null || (addresses[i]?.layer ?? Infinity) <= layerLimit)).length;
  const maxLayer = addresses.reduce((max, address) => Math.max(max, address?.layer ?? 0), 0);

  const changeSelection = (index: number | null) => {
    if (drag) return;
    setSelectedIndex(index);
    selectPlacement(index);
  };

  const startDrag = (index: number) => {
    const origin = result.placements[index];
    if (!origin) return;
    const candidate = { ...origin };
    setDrag({ index, origin: { ...origin }, candidate, moved: false, valid: null, reasons: [] });
    publishManualDragCandidate({ index, position: { x: origin.x, y: origin.y, z: origin.z } });
  };

  const updateDragCandidate = (position: { x:number; y:number; z:number }) => {
    setDrag(current => {
      if (!current) return current;
      const moved = Math.abs(position.x - current.origin.x) >= 0.049 || Math.abs(position.y - current.origin.y) >= 0.049 || Math.abs(position.z - current.origin.z) >= 0.049;
      const candidate = { ...current.candidate, ...position };
      publishManualDragCandidate({ index: current.index, position });
      return { ...current, candidate, moved };
    });
  };

  const endDrag = () => {
    setDrag(current => {
      if (!current) return null;
      if (current.moved && current.valid === true) {
        publishManualDragApply({ index: current.index, position: { x: current.candidate.x, y: current.candidate.y, z: current.candidate.z } });
      } else {
        publishManualDragCancel();
      }
      return null;
    });
  };

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const feedback = (event as CustomEvent<ManualDragFeedbackDetail>).detail;
      if (!feedback) return;
      setDrag(current => current && current.index === feedback.index ? { ...current, valid: feedback.valid, reasons: feedback.reasons } : current);
    };
    window.addEventListener(MANUAL_DRAG_FEEDBACK_EVENT,onFeedback);
    return () => window.removeEventListener(MANUAL_DRAG_FEEDBACK_EVENT,onFeedback);
  },[]);

  useEffect(() => {
    if (selectedIndex !== null && !result.placements[selectedIndex]) changeSelection(null);
    if (drag && !result.placements[drag.index]) setDrag(null);
  }, [result.placements, selectedIndex, drag]);

  useEffect(() => {
    if (selectedIndex !== null && layerLimit !== null && (addresses[selectedIndex]?.layer ?? Infinity) > layerLimit) changeSelection(null);
  }, [layerLimit, addresses, selectedIndex]);

  useEffect(() => {
    const onExternalSelection = (event: Event) => {
      if (drag) return;
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      if (index !== null && !result.placements[index]) return;
      if (index !== null && layerLimit !== null && (addresses[index]?.layer ?? Infinity) > layerLimit) setLayerLimit(null);
      setSelectedIndex(index);
    };
    window.addEventListener(PLACEMENT_SELECT_EVENT, onExternalSelection);
    return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, onExternalSelection);
  }, [result.placements, addresses, layerLimit, drag]);

  useEffect(() => {
    const onFilter = (event: Event) => {
      const cargoId = (event as CustomEvent<CargoFilterDetail>).detail?.cargoId ?? null;
      setFilteredCargoId(cargoId);
      if (cargoId && selectedIndex !== null && result.placements[selectedIndex]?.cargoId !== cargoId) changeSelection(null);
    };
    window.addEventListener(CARGO_FILTER_EVENT, onFilter);
    return () => window.removeEventListener(CARGO_FILTER_EVENT, onFilter);
  }, [result.placements, selectedIndex, drag]);

  const layerLabel = layerLimit === null ? `전체 ${maxLayer || 0}단` : layerLimit === 1 ? '1단만' : `1~${layerLimit}단`;

  return <section className={`viewer ${drag ? 'viewer-dragging' : ''}`}>
    <Canvas
      camera={{ position:[5.5,4.2,6.5], fov:48 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => { if (!drag) changeSelection(null); }}
    >
      <Scene result={result} container={container} selectedIndex={selectedIndex} filteredCargoId={filteredCargoId} layerLimit={layerLimit} drag={drag} onSelect={changeSelection} onClear={() => changeSelection(null)} onDragStart={startDrag} onDragCandidate={updateDragCandidate} onDragEnd={endDrag} />
    </Canvas>
    <div className="viewer-direction"><b>{drag ? '드래그 편집 중' : '박스 적재'}</b><span>{drag ? `${drag.candidate.x.toFixed(2)}, ${drag.candidate.y.toFixed(2)}, ${drag.candidate.z.toFixed(2)}m · ${drag.valid === false ? '이동 불가' : drag.valid === true ? '놓기 가능' : '검사 중'}` : filteredCargoId ? `${filteredCargoId} · ${visibleCount}/${filteredCount} EA · ${layerLabel}` : `${visibleCount}/${result.placements.length} EA · ${layerLabel}`}</span></div>
    <div className="layer-slicer" aria-label="3D 층별 보기">
      <button type="button" className={layerLimit === null ? 'active' : ''} onClick={() => setLayerLimit(null)} disabled={Boolean(drag)}>전체</button>
      <button type="button" className={layerLimit === 1 ? 'active' : ''} onClick={() => setLayerLimit(1)} disabled={Boolean(drag)}>1단</button>
      <button type="button" className={layerLimit === 3 ? 'active' : ''} onClick={() => setLayerLimit(3)} disabled={Boolean(drag)}>1~3단</button>
      <button type="button" className={layerLimit === 5 ? 'active' : ''} onClick={() => setLayerLimit(5)} disabled={Boolean(drag)}>1~5단</button>
    </div>
    <TopDownMinimap result={result} container={container} addresses={addresses} selectedIndex={selectedIndex} filteredCargoId={filteredCargoId} layerLimit={layerLimit} onSelect={changeSelection} />
    {drag && <div className={`drag-status ${drag.valid === false ? 'invalid' : drag.valid === true ? 'valid' : 'pending'}`}><b>{drag.valid === false ? '놓을 수 없음' : drag.valid === true ? '놓기 가능' : '안전검사 중'}</b><span>{drag.valid === false ? (drag.reasons[0] ?? '안전조건을 확인하세요.') : '마우스/손가락을 놓으면 적용됩니다.'}</span></div>}
    {selected && selectedAddress && (!filteredCargoId || selected.cargoId === filteredCargoId) && (layerLimit === null || selectedAddress.layer <= layerLimit) && <div className="cargo-inspector">
      <div className="cargo-inspector-head"><b>{selected.cargoId}</b><button type="button" onClick={() => changeSelection(null)} disabled={Boolean(drag)}>닫기</button></div>
      <strong>{`R${selectedAddress.row} C${selectedAddress.column} L${selectedAddress.layer}`}</strong>
      <span>{selectedAddress.zone} · {selected.rotated ? '90° 회전' : '기본 방향'} · 같은 품목 전체 강조</span>
      <small>{`X ${selected.x.toFixed(2)}m · Y ${selected.y.toFixed(2)}m · Z ${selected.z.toFixed(2)}m`}</small>
      <small>{`${selected.length.toFixed(2)} × ${selected.width.toFixed(2)} × ${selected.height.toFixed(2)}m · ${selected.weightKg.toFixed(1)}kg`}</small>
      <small>박스를 누른 채 끌면 X/Y 평면에서 5cm 단위로 이동합니다. 높이는 수동 편집 패널의 Z 버튼으로 조정하세요.</small>
    </div>}
  </section>;
}
