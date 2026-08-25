import { Edges } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import BoxSecuringAids3D from './BoxSecuringAids3D';
import { cargoColor } from './cargoColors';
import { CargoFaceInfoLabels } from './CargoFaceInfoLabels';
import { buildPlacementAddresses } from './engine/locationGrid';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { PreviewCameraController, PreviewViewControls, readBoxLabelPreference, saveBoxLabelPreference, type PreviewView } from './PreviewViewControls';
import { AxisGuide, ClearanceGuide, clearanceValues } from './SceneGuides';
import { PLACEMENT_SELECT_EVENT, selectPlacement, type PlacementSelectDetail } from './selectionEvents';
import { readStoredState } from './storage';

type IndexedPlacement = { placement: Placement; index: number };

function doorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 700;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1769d2';
  ctx.lineWidth = 18;
  ctx.setLineDash([34, 22]);
  ctx.strokeRect(85, 105, 730, 465);
  ctx.setLineDash([]);
  ctx.fillStyle = '#165dcc';
  ctx.textAlign = 'center';
  ctx.font = '800 72px sans-serif';
  ctx.fillText('CONTAINER DOOR', 450, 300);
  ctx.font = '800 58px sans-serif';
  ctx.fillText('문', 450, 385);
  ctx.font = '800 72px sans-serif';
  ctx.fillText('←        →', 450, 500);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function CargoGroup({
  items,
  container,
  scale,
  selectedIndex,
  onSelect,
}: {
  items: IndexedPlacement[];
  container: ContainerSpec;
  scale: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cargoId = items[0]?.placement.cargoId ?? '';
  const base = useMemo(() => new THREE.Color(cargoColor(cargoId)), [cargoId]);

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
      object.scale.set(placement.length * scale * 0.985, placement.height * scale * 0.985, placement.width * scale * 0.985);
      object.updateMatrix();
      mesh.setMatrixAt(instanceIndex, object.matrix);
      const color = base.clone();
      if (selectedIndex !== null && selectedIndex !== index) color.multiplyScalar(0.86);
      if (selectedIndex === index) color.lerp(new THREE.Color('#ffffff'), 0.22);
      mesh.setColorAt(instanceIndex, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, container, scale, base, selectedIndex]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, items.length]}
      onClick={(event) => {
        event.stopPropagation();
        if (event.instanceId === undefined) return;
        const value = items[event.instanceId];
        if (value) onSelect(value.index);
      }}
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.58} metalness={0.01} />
    </instancedMesh>
  );
}

function CargoEdges({ items, container, scale }: { items: IndexedPlacement[]; container: ContainerSpec; scale: number }) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box, 15);
    box.dispose();
    return edges;
  }, []);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: '#16324f', transparent: false, depthTest: true, depthWrite: false }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <group>
      {items.map(({ placement, index }) => (
        <lineSegments
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
        />
      ))}
    </group>
  );
}

function BoxOutline({ p, container, scale }: { p: Placement; container: ContainerSpec; scale: number }) {
  const position: [number, number, number] = [
    (p.x + p.length / 2) * scale - container.length * scale / 2,
    (p.z + p.height / 2) * scale + 0.03,
    (p.y + p.width / 2) * scale - container.width * scale / 2,
  ];
  return (
    <mesh position={position} scale={[p.length * scale * 1.025, p.height * scale * 1.025, p.width * scale * 1.025]} renderOrder={18}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color="#0f62fe" linewidth={1.8} />
    </mesh>
  );
}

function ContainerShell({ container, scale }: { container: ContainerSpec; scale: number }) {
  const length = container.length * scale;
  const width = container.width * scale;
  const height = container.height * scale;
  const doorX = length / 2;
  const texture = useMemo(() => doorTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group>
      <mesh position={[0, -0.025, 0]} receiveShadow>
        <boxGeometry args={[length, 0.05, width]} />
        <meshStandardMaterial color="#e7eef6" roughness={0.9} />
        <Edges color="#526f90" />
      </mesh>
      <mesh position={[0, height / 2, -width / 2]}>
        <boxGeometry args={[length, height, 0.025]} />
        <meshBasicMaterial color="#e8f0f8" transparent opacity={0.13} />
        <Edges color="#66819f" linewidth={1.2} />
      </mesh>
      <mesh position={[0, height / 2, width / 2]}>
        <boxGeometry args={[length, height, 0.025]} />
        <meshBasicMaterial color="#e8f0f8" transparent opacity={0.05} />
        <Edges color="#7e94ad" />
      </mesh>
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[length, 0.025, width]} />
        <meshBasicMaterial color="#f8fbff" transparent opacity={0.1} />
        <Edges color="#7e94ad" />
      </mesh>
      <mesh position={[-length / 2, height / 2, 0]}>
        <boxGeometry args={[0.03, height, width]} />
        <meshBasicMaterial color="#f4f8fc" transparent opacity={0.16} />
        <Edges color="#526f90" linewidth={1.4} />
      </mesh>
      <group position={[doorX + 0.022, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[width * 0.96, height * 0.96]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.018]}>
          <boxGeometry args={[width, height, 0.035]} />
          <meshBasicMaterial color="#e8f2ff" transparent opacity={0.08} />
          <Edges color="#2573d9" linewidth={2} />
        </mesh>
      </group>
    </group>
  );
}

export default function BoxLoadingViewerReference({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [view, setView] = useState<PreviewView>('free');
  const [showLabels, setShowLabels] = useState(readBoxLabelPreference);
  const [certification, setCertification] = useState<InertiaCertification | null>(() => {
    const latest = readLatestInertiaCertification();
    return latest?.mode === 'boxes' && latest.status === 'passed' ? latest : null;
  });
  const scale = 0.5;
  const cargoMap = useMemo(() => new Map((readStoredState()?.cargo ?? []).map((item) => [item.id, item] as [string, CargoItem])), [result.placements]);
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result.placements, container.length]);
  const groups = useMemo(() => {
    const map = new Map<string, IndexedPlacement[]>();
    result.placements.forEach((placement, index) => {
      const list = map.get(placement.cargoId) ?? [];
      list.push({ placement, index });
      map.set(placement.cargoId, list);
    });
    return [...map.entries()];
  }, [result.placements]);
  const selected = selectedIndex === null ? undefined : result.placements[selectedIndex];
  const clearances = useMemo(() => clearanceValues(container, result.placements), [container, result.placements]);
  const securingUsage = certification?.securing ?? null;

  const change = (index: number | null) => {
    setSelectedIndex(index);
    selectPlacement(index);
  };
  const toggleLabels = () => setShowLabels((current) => {
    const next = !current;
    saveBoxLabelPreference(next);
    return next;
  });

  useEffect(() => {
    setCertification(null);
  }, [result, container]);

  useEffect(() => {
    const onCertification = (event: Event) => {
      const next = (event as CustomEvent<InertiaCertification>).detail;
      setCertification(next?.mode === 'boxes' && next.status === 'passed' ? next : null);
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

  return (
    <section className="viewer reference-viewer">
      <div className="reference-3d">
        <PreviewViewControls view={view} onViewChange={setView} showLabels={showLabels} onToggleLabels={toggleLabels} />
        <Canvas shadows camera={{ position: [7.6, 4.8, 7.2], fov: 46 }} dpr={[1, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance' }} onPointerMissed={() => change(null)}>
          <color attach="background" args={['#edf3f9']} />
          <ambientLight intensity={2.1} />
          <directionalLight castShadow position={[3, 7, 5]} intensity={2.5} />
          <ContainerShell container={container} scale={scale} />
          <AxisGuide container={container} scale={scale} />
          <ClearanceGuide container={container} placements={result.placements} scale={scale} />
          {groups.map(([id, items]) => (
            <group key={id}>
              <CargoGroup items={items} container={container} scale={scale} selectedIndex={selectedIndex} onSelect={(index) => change(index)} />
              <CargoEdges items={items} container={container} scale={scale} />
              {showLabels && (
                <CargoFaceInfoLabels
                  placements={items.map(({ placement }) => placement)}
                  container={container}
                  scale={scale}
                  displayName={cargoMap.get(id)?.name ?? id}
                  verticalOffset={0.03}
                />
              )}
            </group>
          ))}
          <BoxSecuringAids3D container={container} placements={result.placements} usage={securingUsage} scale={scale} />
          {selected && <BoxOutline p={selected} container={container} scale={scale} />}
          <PreviewCameraController view={view} container={container} scale={scale} />
        </Canvas>
        {securingUsage && securingUsage.level > 0 && <div className="pallet-securing-strip">
          <b>관성 보강 적용</b>
          <span>미끄럼방지 {securingUsage.antiSlipMats}EA</span>
          <span>블로킹재 {securingUsage.dunnageBlocks}EA</span>
          {securingUsage.loadBars > 0 && <span>고정바 {securingUsage.loadBars}EA</span>}
        </div>}
        {clearances && (
          <div className="reference-clearance-strip">
            <span>안쪽 <b>{clearances.back}</b></span>
            <span>문쪽 <b>{clearances.door}</b></span>
            <span>좌측 <b>{clearances.left}</b></span>
            <span>우측 <b>{clearances.right}</b></span>
            <span>천장 <b>{clearances.top}</b></span>
          </div>
        )}
        {selected && (
          <div className="reference-selected">
            <i style={{ background: cargoColor(selected.cargoId) }} />
            <b>{cargoMap.get(selected.cargoId)?.name || selected.cargoId}</b>
            <span>{selected.weightKg}kg · {(selected.length * selected.width * selected.height).toFixed(3)} CBM · R{addresses[selectedIndex!]?.row} C{addresses[selectedIndex!]?.column} L{addresses[selectedIndex!]?.layer}</span>
          </div>
        )}
      </div>
    </section>
  );
}