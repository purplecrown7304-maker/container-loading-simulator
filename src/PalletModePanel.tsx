import { Text } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { cargoColor } from './cargoColors';
import { CargoFaceInfoLabels } from './CargoFaceInfoLabels';
import { validatePlacements } from './engine/constraints';
import { defaultPalletSpec, packOnPallets, type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { clearPhysicsTarget, publishPhysicsTarget } from './physicsTarget';
import { PreviewCameraController, PreviewViewControls, readBoxLabelPreference, saveBoxLabelPreference, type PreviewView } from './PreviewViewControls';
import { AxisGuide, ClearanceGuide, clearanceValues } from './SceneGuides';

type Props = { container: ContainerSpec; cargo: CargoItem[]; runToken: number };

function PalletBoards({ container, result, spec, scale, onOpen }: { container: ContainerSpec; result: OptimizedPalletPackingResult; spec: PalletSpec; scale: number; onOpen: (p: PalletLoad) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    result.pallets.forEach((pallet, index) => {
      object.position.set(
        (pallet.x + pallet.length / 2) * scale - container.length * scale / 2,
        (pallet.z + spec.height / 2) * scale,
        (pallet.y + pallet.width / 2) * scale - container.width * scale / 2,
      );
      object.scale.set(pallet.length * scale, spec.height * scale, pallet.width * scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [container, result.pallets, spec.height, scale]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, result.pallets.length]}
      onContextMenu={(event) => {
        event.stopPropagation();
        event.nativeEvent.preventDefault();
        if (event.instanceId !== undefined && result.pallets[event.instanceId]) onOpen(result.pallets[event.instanceId]);
      }}
    >
      <boxGeometry />
      <meshStandardMaterial color="#d8b07a" roughness={0.85} />
    </instancedMesh>
  );
}

function CargoInstances({ container, placements, scale, onOpen }: { container: ContainerSpec; placements: Placement[]; scale: number; onOpen: (p: Placement) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const color = useMemo(() => new THREE.Color(cargoColor(placements[0]?.cargoId ?? 'cargo')), [placements]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    placements.forEach((box, index) => {
      object.position.set(
        (box.x + box.length / 2) * scale - container.length * scale / 2,
        (box.z + box.height / 2) * scale,
        (box.y + box.width / 2) * scale - container.width * scale / 2,
      );
      object.scale.set(box.length * scale * 0.985, box.height * scale * 0.985, box.width * scale * 0.985);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [container, placements, scale, color]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, placements.length]}
      onContextMenu={(event) => {
        event.stopPropagation();
        event.nativeEvent.preventDefault();
        if (event.instanceId !== undefined && placements[event.instanceId]) onOpen(placements[event.instanceId]);
      }}
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.58} metalness={0.01} />
    </instancedMesh>
  );
}

function CargoEdges({ container, placements, scale }: { container: ContainerSpec; placements: Placement[]; scale: number }) {
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
      {placements.map((box, index) => (
        <lineSegments
          key={`${box.cargoId}-edge-${index}`}
          geometry={geometry}
          material={material}
          position={[
            (box.x + box.length / 2) * scale - container.length * scale / 2,
            (box.z + box.height / 2) * scale,
            (box.y + box.width / 2) * scale - container.width * scale / 2,
          ]}
          scale={[box.length * scale * 1.006, box.height * scale * 1.006, box.width * scale * 1.006]}
          renderOrder={16}
        />
      ))}
    </group>
  );
}

function palletForPlacement(result: OptimizedPalletPackingResult, box: Placement) {
  return result.pallets.find((pallet) => pallet.cargoPlacements.includes(box) || pallet.cargoPlacements.some((candidate) =>
    Math.abs(candidate.x - box.x) < 1e-6 &&
    Math.abs(candidate.y - box.y) < 1e-6 &&
    Math.abs(candidate.z - box.z) < 1e-6 &&
    candidate.cargoId === box.cargoId,
  ));
}

function PalletScene({ container, result, spec, cargo, onOpen, view, showLabels }: { container: ContainerSpec; result: OptimizedPalletPackingResult; spec: PalletSpec; cargo: CargoItem[]; onOpen: (p: PalletLoad) => void; view: PreviewView; showLabels: boolean }) {
  const scale = 0.42;
  const groups = useMemo(() => {
    const map = new Map<string, Placement[]>();
    result.placements.forEach((placement) => {
      const list = map.get(placement.cargoId) ?? [];
      list.push(placement);
      map.set(placement.cargoId, list);
    });
    return [...map.entries()];
  }, [result.placements]);
  const cargoMap = useMemo(() => new Map(cargo.map((item) => [item.id, item])), [cargo]);

  return (
    <>
      <ambientLight intensity={1.9} />
      <directionalLight position={[5, 8, 6]} intensity={2.2} />
      <mesh position={[0, container.height * scale / 2, 0]}>
        <boxGeometry args={[container.length * scale, container.height * scale, container.width * scale]} />
        <meshBasicMaterial wireframe transparent opacity={0.18} />
      </mesh>
      <AxisGuide container={container} scale={scale} />
      <ClearanceGuide container={container} placements={result.placements} scale={scale} />
      <PalletBoards container={container} result={result} spec={spec} scale={scale} onOpen={onOpen} />
      {groups.map(([id, placements]) => (
        <group key={id}>
          <CargoInstances
            container={container}
            placements={placements}
            scale={scale}
            onOpen={(box) => {
              const pallet = palletForPlacement(result, box);
              if (pallet) onOpen(pallet);
            }}
          />
          <CargoEdges container={container} placements={placements} scale={scale} />
          {showLabels && (
            <CargoFaceInfoLabels
              container={container}
              placements={placements}
              scale={scale}
              displayName={cargoMap.get(id)?.name ?? id}
            />
          )}
        </group>
      ))}
      {result.pallets.map((pallet) => {
        const px = (pallet.x + pallet.length / 2) * scale - container.length * scale / 2;
        const pz = (pallet.y + pallet.width / 2) * scale - container.width * scale / 2;
        return (
          <Text key={pallet.palletIndex} position={[px, (pallet.z + spec.height) * scale + 0.04, pz]} fontSize={0.06} color="#475569">
            {`P${pallet.palletIndex} · ${pallet.stackLevel}단`}
          </Text>
        );
      })}
      <PreviewCameraController view={view} container={container} scale={scale} />
    </>
  );
}

function PalletContents({ pallet, cargo, onClose }: { pallet: PalletLoad; cargo: CargoItem[]; onClose: () => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    pallet.cargoPlacements.forEach((box) => map.set(box.cargoId, (map.get(box.cargoId) ?? 0) + 1));
    return [...map.entries()];
  }, [pallet]);
  const maxTop = Math.max(pallet.z, ...pallet.cargoPlacements.map((box) => box.z + box.height));

  return (
    <div className="pallet-content-popover" onContextMenu={(event) => event.preventDefault()}>
      <header>
        <div>
          <b>AUTO-PALLET-{String(pallet.palletIndex).padStart(2, '0')} 적재 정보</b>
          <small>{pallet.stackColumn}열 · {pallet.stackLevel}단</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <div className="pallet-content-metrics">
        <div><span>총 적재수량</span><strong>{pallet.cargoPlacements.length} EA</strong></div>
        <div><span>총중량</span><strong>{pallet.totalWeightKg.toFixed(0)} kg</strong></div>
        <div><span>팔레트 규격</span><strong>{Math.round(pallet.length * 1000)}×{Math.round(pallet.width * 1000)}</strong></div>
        <div><span>적재 높이</span><strong>{Math.round((maxTop - pallet.z) * 1000)} mm</strong></div>
      </div>
      <h4>팔레트 속 내용</h4>
      <div className="pallet-content-list">
        {groups.map(([id, count]) => {
          const item = cargo.find((candidate) => candidate.id === id);
          return (
            <article key={id}>
              <i style={{ background: cargoColor(id) }} />
              <div>
                <b>{id} {item?.name ?? ''}</b>
                <small>{item ? `${Math.round(item.length * 1000)}×${Math.round(item.width * 1000)}×${Math.round(item.height * 1000)} mm · ${item.weightKg}kg` : ''}</small>
              </div>
              <strong>{count} EA</strong>
            </article>
          );
        })}
      </div>
      <div className="pallet-content-foot">
        <span>화물중량 {pallet.cargoWeightKg.toFixed(0)}kg</span>
        <span>팔레트/포장 {Math.max(0, pallet.totalWeightKg - pallet.cargoWeightKg).toFixed(1)}kg</span>
      </div>
    </div>
  );
}

export default function PalletModePanel({ container, cargo, runToken }: Props) {
  const [spec, setSpec] = useState<PalletSpec>(defaultPalletSpec);
  const [result, setResult] = useState<OptimizedPalletPackingResult>(() => packOnPallets(container, cargo.filter((item) => item.quantity > 0), defaultPalletSpec));
  const [opened, setOpened] = useState<PalletLoad | null>(null);
  const [view, setView] = useState<PreviewView>('free');
  const [showLabels, setShowLabels] = useState(readBoxLabelPreference);

  useEffect(() => {
    if (runToken === 0) return;
    const safe = { ...spec, maxStackLevels: Math.max(1, Math.min(3, Math.floor(spec.maxStackLevels || 1))) };
    setSpec(safe);
    setResult(packOnPallets(container, cargo.filter((item) => item.quantity > 0), safe));
    setOpened(null);
  }, [runToken]);

  useEffect(() => {
    const loadingResult: LoadingResult = {
      placements: result.placements,
      remaining: result.remaining,
      loadedWeightKg: result.totalPalletizedWeightKg,
      usedVolumeM3: result.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
      validationIssues: validatePlacements(container, result.placements),
    };
    const supports = result.pallets.map((pallet) => ({
      id: `PALLET-${String(pallet.palletIndex).padStart(2, '0')}`,
      x: pallet.x,
      y: pallet.y,
      z: pallet.z,
      length: pallet.length,
      width: pallet.width,
      height: pallet.height,
      weightKg: Math.max(0.01, pallet.totalWeightKg - pallet.cargoWeightKg),
      dynamic: true,
    }));
    publishPhysicsTarget({ mode: 'pallets', container, cargo, result: loadingResult, supports });
    return () => clearPhysicsTarget('pallets');
  }, [container, cargo, result]);

  const clearances = useMemo(() => clearanceValues(container, result.placements), [container, result.placements]);
  const toggleLabels = () => setShowLabels((current) => {
    const next = !current;
    saveBoxLabelPreference(next);
    return next;
  });

  return (
    <div className="pallet-inline-workspace">
      <section className="pallet-mode-panel pallet-mode-panel-inline">
        <div className="pallet-panel-head">
          <div>
            <b>팔레트 적재 설정</b>
            <span>팔레트/화물 우클릭 = 팔레트 속 내용 확인</span>
          </div>
        </div>
        <div className="pallet-spec-grid">
          <label>길이(m)<input type="number" step=".01" value={spec.length} onChange={(event) => setSpec({ ...spec, length: Number(event.target.value) })} /></label>
          <label>폭(m)<input type="number" step=".01" value={spec.width} onChange={(event) => setSpec({ ...spec, width: Number(event.target.value) })} /></label>
          <label>높이(m)<input type="number" step=".01" value={spec.height} onChange={(event) => setSpec({ ...spec, height: Number(event.target.value) })} /></label>
          <label>팔레트 중량(kg)<input type="number" value={spec.tareWeightKg} onChange={(event) => setSpec({ ...spec, tareWeightKg: Number(event.target.value) })} /></label>
          <label>최대 적재중량(kg)<input type="number" value={spec.maxLoadKg} onChange={(event) => setSpec({ ...spec, maxLoadKg: Number(event.target.value) })} /></label>
          <label>최대 적층단<input type="number" min="1" max="3" value={spec.maxStackLevels} onChange={(event) => setSpec({ ...spec, maxStackLevels: Number(event.target.value) })} /></label>
        </div>
        <div className="pallet-view-stack">
          <div className="pallet-preview">
            <PreviewViewControls view={view} onViewChange={setView} showLabels={showLabels} onToggleLabels={toggleLabels} />
            <Canvas camera={{ position: [6.2, 4.8, 6.6], fov: 46 }} dpr={[1, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance' }} onContextMenu={(event) => event.nativeEvent.preventDefault()}>
              <color attach="background" args={['#edf3f9']} />
              <PalletScene container={container} result={result} spec={spec} cargo={cargo} onOpen={setOpened} view={view} showLabels={showLabels} />
            </Canvas>
            {clearances && (
              <div className="reference-clearance-strip">
                <span>안쪽 <b>{clearances.back}</b></span>
                <span>문쪽 <b>{clearances.door}</b></span>
                <span>좌측 <b>{clearances.left}</b></span>
                <span>우측 <b>{clearances.right}</b></span>
                <span>천장 <b>{clearances.top}</b></span>
              </div>
            )}
            {opened && <PalletContents pallet={opened} cargo={cargo} onClose={() => setOpened(null)} />}
          </div>
        </div>
        <div className="pallet-metrics">
          <div><span>사용 팔레트</span><strong>{result.palletCount}</strong></div>
          <div><span>적재 화물</span><strong>{result.placements.length} EA</strong></div>
          <div><span>적층 팔레트</span><strong>{result.stackedPallets}</strong></div>
          <div><span>총 팔레트화 중량</span><strong>{result.totalPalletizedWeightKg.toFixed(0)} kg</strong></div>
          <div><span>전역 최적화</span><strong>{result.optimization.selectedStackTarget}단 후보 · 바닥 {result.optimization.floorPositions}열</strong></div>
          <div><span>재배치 / 병합</span><strong>{result.optimization.redistributedForLowUtilization ? '균등분산' : '기본배치'} · {result.optimization.consolidationPasses}회</strong></div>
        </div>
      </section>
    </div>
  );
}