import { Edges } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import BoxSecuringAids3D from './BoxSecuringAids3D';
import { cargoColor } from './cargoColors';
import { CargoFaceInfoLabels } from './CargoFaceInfoLabels';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import EquipmentShell3D from './EquipmentShell3D';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import {
  PreviewCameraController,
  PreviewViewControls,
  readBoxLabelPreference,
  readWeightCgPreference,
  readWeightGraphPreference,
  saveBoxLabelPreference,
  saveWeightCgPreference,
  saveWeightGraphPreference,
  type PreviewView,
} from './PreviewViewControls';
import { AxisGuide, ClearanceGuide, clearanceValues } from './SceneGuides';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';
import { readStoredState } from './storage';
import { useTransportEquipment } from './transportEquipment';
import WeightDistribution3D from './WeightDistribution3D';
import WeightDistributionPanel from './WeightDistributionPanel';
import './weight-distribution.css';
import './loading-space.css';

type IndexedPlacement = { placement: Placement; index: number };

function CargoGroup({
  items,
  container,
  scale,
  selectedIndex,
  onSelect,
  dimmed,
  assignedColor,
}: {
  items: IndexedPlacement[];
  container: ContainerSpec;
  scale: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  dimmed: boolean;
  assignedColor?: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cargoId = items[0]?.placement.cargoId ?? '';
  const base = useMemo(() => new THREE.Color(cargoColor(cargoId, assignedColor)), [cargoId, assignedColor]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach(({ placement, index }, instanceIndex) => {
      object.position.set(
        (placement.x + placement.length / 2) * scale - container.length * scale / 2,
        (placement.z + placement.height / 2) * scale + 0.03,
        (placement.y + placement.width / 2) * scale - container.width * scale / 2,
      );
      object.scale.set(placement.length * scale, placement.height * scale, placement.width * scale);
      object.updateMatrix();
      mesh.setMatrixAt(instanceIndex, object.matrix);
      const color = base.clone();
      if (selectedIndex !== null && selectedIndex !== index) color.multiplyScalar(0.86);
      if (selectedIndex === index) color.lerp(new THREE.Color('#ffffff'), 0.22);
      mesh.setColorAt(instanceIndex, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, container, scale, base, selectedIndex]);

  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={!dimmed} receiveShadow onClick={(event) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    const value = items[event.instanceId];
    if (value) onSelect(value.index);
  }}>
    <boxGeometry />
    <meshStandardMaterial
      roughness={0.58}
      metalness={0.01}
      transparent={dimmed}
      opacity={dimmed ? 0.2 : 1}
      depthWrite={!dimmed}
    />
  </instancedMesh>;
}

function CargoEdges({ items, container, scale, dimmed }: { items: IndexedPlacement[]; container: ContainerSpec; scale: number; dimmed: boolean }) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box, 15);
    box.dispose();
    return edges;
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: '#16324f', transparent: dimmed, opacity: dimmed ? 0.3 : 1, depthTest: true, depthWrite: false }), [dimmed]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  return <group>{items.map(({ placement, index }) => <lineSegments
    key={`${placement.cargoId}-edge-${index}`}
    geometry={geometry}
    material={material}
    position={[
      (placement.x + placement.length / 2) * scale - container.length * scale / 2,
      (placement.z + placement.height / 2) * scale + 0.03,
      (placement.y + placement.width / 2) * scale - container.width * scale / 2,
    ]}
    scale={[placement.length * scale * 1.006, placement.height * scale * 1.006, placement.width * scale * 1.006]}
    renderOrder={16}
  />)}</group>;
}

function BoxOutline({ p, container, scale }: { p: Placement; container: ContainerSpec; scale: number }) {
  const position: [number, number, number] = [
    (p.x + p.length / 2) * scale - container.length * scale / 2,
    (p.z + p.height / 2) * scale + 0.03,
    (p.y + p.width / 2) * scale - container.width * scale / 2,
  ];
  return <mesh position={position} scale={[p.length * scale * 1.025, p.height * scale * 1.025, p.width * scale * 1.025]} renderOrder={18}>
    <boxGeometry /><meshBasicMaterial transparent opacity={0} depthWrite={false} /><Edges color="#0f62fe" linewidth={1.8} />
  </mesh>;
}

export default function BoxLoadingViewerEquipment({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [view, setView] = useState<PreviewView>('free');
  const [cutHeight, setCutHeight] = useState(100);
  const [showShell, setShowShell] = useState(true);
  const visiblePlacements = useMemo(() => result.placements.filter(p => p.z < container.height * cutHeight / 100), [result.placements, container.height, cutHeight]);
  const [showLabels, setShowLabels] = useState(readBoxLabelPreference);
  const [showWeightGraph, setShowWeightGraph] = useState(readWeightGraphPreference);
  const [showWeightCenter, setShowWeightCenter] = useState(readWeightCgPreference);
  const [certification, setCertification] = useState<InertiaCertification | null>(() => {
    const latest = readLatestInertiaCertification();
    return latest?.mode === 'boxes' ? latest : null;
  });
  const equipment = useTransportEquipment();
  const scale = 0.5;
  const cargoMap = useMemo(() => new Map((readStoredState()?.cargo ?? []).map((item) => [item.id, item] as [string, CargoItem])), [result.placements]);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result.placements, container.length]);
  const groups = useMemo(() => {
    const map = new Map<string, IndexedPlacement[]>();
    result.placements.forEach((placement, index) => {
      if (placement.z >= container.height * cutHeight / 100) return;
      const list = map.get(placement.cargoId) ?? [];
      list.push({ placement, index });
      map.set(placement.cargoId, list);
    });
    return [...map.entries()];
  }, [result.placements, container.height, cutHeight]);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const clearances = useMemo(() => clearanceValues(container, result.placements), [container, result.placements]);
  const weightDistribution = useMemo(() => analyzeWeightDistribution(container, result, 20, 8), [container, result]);
  const securingUsage = certification?.securing ?? null;

  const change = (index: number | null) => { setSelectedIndex(index); selectPlacement(index); };
  const toggleLabels = () => setShowLabels(current => { const next = !current; saveBoxLabelPreference(next); return next; });
  const toggleWeightGraph = () => setShowWeightGraph(current => { const next = !current; saveWeightGraphPreference(next); return next; });
  const toggleWeightCenter = () => setShowWeightCenter(current => { const next = !current; saveWeightCgPreference(next); return next; });

  useEffect(() => setCertification(null), [result, container]);
  useEffect(() => {
    const onCertification = (event: Event) => {
      const next = (event as CustomEvent<InertiaCertification | undefined>).detail;
      setCertification(next?.mode === 'boxes' ? next : null);
    };
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
  }, []);
  useEffect(() => {
    const onSelect = (event: Event) => {
      const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null;
      if (index !== null && !result.placements[index]) return;
      setSelectedIndex(index);
    };
    window.addEventListener(PLACEMENT_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, onSelect);
  }, [result.placements]);

  return <section className="viewer reference-viewer">
    <div className="loading-space-toolbar" aria-label="3D 적재 공간 도구">
      <div><b>3D 적재 공간</b><small>{container.length.toFixed(2)} × {container.width.toFixed(2)} × {container.height.toFixed(2)} m</small></div>
      <label>높이 단면 <input data-view-only="true" aria-label="높이 단면" type="range" min="1" max="100" value={cutHeight} onChange={e => setCutHeight(Number(e.target.value))}/><output>{cutHeight === 100 ? '전체' : `${(container.height * cutHeight / 100).toFixed(2)} m 아래`}</output></label>
      <button type="button" aria-pressed={showShell} onClick={() => setShowShell(value => !value)}>{showShell ? '외벽 숨기기' : '외벽 표시'}</button>
      <span>표시 {visiblePlacements.length} / {result.placements.length} EA</span>
    </div>
    <div className="reference-3d">
      <PreviewViewControls
        view={view}
        onViewChange={setView}
        showLabels={showLabels}
        onToggleLabels={toggleLabels}
        showWeightGraph={showWeightGraph}
        onToggleWeightGraph={toggleWeightGraph}
        showWeightCenter={showWeightCenter}
        onToggleWeightCenter={toggleWeightCenter}
      />
      <Canvas shadows camera={{ position: [7.6, 4.8, 7.2], fov: 46 }} dpr={[1, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }} onPointerMissed={() => change(null)}>
        <color attach="background" args={['#edf3f9']} />
        <ambientLight intensity={2.1} />
        <directionalLight castShadow position={[3, 7, 5]} intensity={2.5} />
        {showShell && <EquipmentShell3D container={container} scale={scale} />}
        <mesh position={[0, container.height * scale / 2 + 0.03, 0]} raycast={() => {}}>
          <boxGeometry args={[container.length * scale, container.height * scale, container.width * scale]}/>
          <meshBasicMaterial transparent opacity={0} depthWrite={false}/><Edges color="#9cb6cb"/>
        </mesh>
        <Suspense fallback={null}><AxisGuide container={container} scale={scale} /></Suspense>
        <Suspense fallback={null}><ClearanceGuide container={container} placements={result.placements} scale={scale} /></Suspense>
        {groups.map(([id, items]) => <group key={id}>
          <CargoGroup items={items} container={container} scale={scale} selectedIndex={selectedIndex} onSelect={(index) => change(index)} dimmed={showWeightGraph} assignedColor={cargoMap.get(id)?.displayColor} />
          <CargoEdges items={items} container={container} scale={scale} dimmed={showWeightGraph} />
          {showLabels && !showWeightGraph && <CargoFaceInfoLabels placements={items.map(({ placement }) => placement)} container={container} scale={scale} displayName={cargoMap.get(id)?.name ?? id} verticalOffset={0.03} />}
        </group>)}
        <BoxSecuringAids3D container={container} placements={result.placements} usage={securingUsage} scale={scale} />
        {showWeightGraph && <WeightDistribution3D container={container} analysis={weightDistribution} scale={scale} showCenterOfGravity={showWeightCenter} />}
        {selected && selected.z < container.height * cutHeight / 100 && !showWeightGraph && <BoxOutline p={selected} container={container} scale={scale} />}
        <PreviewCameraController view={view} container={container} scale={scale} />
      </Canvas>
      {showWeightGraph && <WeightDistributionPanel analysis={weightDistribution} />}
      <div className="equipment-view-badge"><b>{equipment.shortName}</b><span>{equipment.category === 'truck' ? 'TRUCK' : 'CONTAINER'} · {equipment.sourceLabel}</span></div>
      {equipment.specializedCargo && <div className="equipment-special-warning">특수화물 전용 장비 · 박스 적재 결과는 참고용</div>}
      {securingUsage && securingUsage.level > 0 && <div className="pallet-securing-strip"><b>관성 보강 적용</b><span>미끄럼방지 {securingUsage.antiSlipMats}EA</span><span>블로킹재 {securingUsage.dunnageBlocks}EA</span>{securingUsage.loadBars > 0 && <span>고정바 {securingUsage.loadBars}EA</span>}</div>}
      {clearances && !showWeightGraph && <div className="reference-clearance-strip"><span>안쪽 <b>{clearances.back}</b></span><span>문쪽 <b>{clearances.door}</b></span><span>좌측 <b>{clearances.left}</b></span><span>우측 <b>{clearances.right}</b></span><span>천장 <b>{clearances.top}</b></span></div>}
      {selected && !showWeightGraph && <div className="reference-selected"><i style={{ background: cargoColor(selected.cargoId, cargoMap.get(selected.cargoId)?.displayColor) }} /><b>{cargoMap.get(selected.cargoId)?.name || selected.cargoId}</b><span>{selected.weightKg}kg · {(selected.length * selected.width * selected.height).toFixed(3)} CBM · R{addresses[selectedIndex!]?.row} C{addresses[selectedIndex!]?.column} L{addresses[selectedIndex!]?.layer}</span></div>}
    </div>
    <div className="loading-space-summary" aria-live="polite">
      <span>공간 사용 <b>{(result.usedVolumeM3 / Math.max(0.001, container.length * container.width * container.height) * 100).toFixed(1)}%</b></span>
      <span>잔여 체적 <b>{Math.max(0, container.length * container.width * container.height - result.usedVolumeM3).toFixed(2)} m³</b></span>
      <span>적재 중량 <b>{result.loadedWeightKg.toLocaleString()} / {container.maxPayloadKg.toLocaleString()} kg</b></span>
      <span className={result.validationIssues.length ? 'space-rule-error' : ''}>{result.validationIssues.length ? `규칙 위반 ${result.validationIssues.length}건` : result.placements.length ? '적재 규칙 검사 통과' : '화물을 등록하고 자동 적재를 실행하세요'}</span>
    </div>
    {result.validationIssues.length > 0 && <details className="loading-space-issues"><summary>규칙 위반 상세</summary><ul>{result.validationIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></details>}
  </section>;
}
