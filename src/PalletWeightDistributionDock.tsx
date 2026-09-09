import { Edges } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargoColor } from './cargoColors';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import { usePalletSnapshot } from './palletSnapshotStore';
import {
  PreviewCameraController,
  readWeightCgPreference,
  readWeightGraphPreference,
  saveWeightCgPreference,
  saveWeightGraphPreference,
  type PreviewView,
} from './PreviewViewControls';
import { usePhysicsTarget } from './physicsTarget';
import WeightDistribution3D from './WeightDistribution3D';
import WeightDistributionPanel from './WeightDistributionPanel';
import './weight-distribution.css';

type PalletTarget = NonNullable<ReturnType<typeof usePhysicsTarget>>;

function PalletAnalysisScene({
  target,
  analysis,
  view,
  showCenterOfGravity,
}: {
  target: PalletTarget;
  analysis: ReturnType<typeof analyzeWeightDistribution>;
  view: PreviewView;
  showCenterOfGravity: boolean;
}) {
  const scale = 0.48;
  const cargoPlacements = target.result.placements;
  const supports = target.supports ?? [];

  return <>
    <ambientLight intensity={2.15} />
    <directionalLight position={[4, 7, 5]} intensity={2.35} />

    <mesh position={[0, -0.012, 0]} receiveShadow>
      <boxGeometry args={[target.container.length * scale, 0.025, target.container.width * scale]} />
      <meshStandardMaterial color="#e7edf4" roughness={0.95} />
      <Edges color="#64748b" />
    </mesh>

    {supports.map((support) => <mesh
      key={support.id}
      position={[
        (support.x + support.length / 2) * scale - target.container.length * scale / 2,
        (support.z + support.height / 2) * scale + 0.01,
        (support.y + support.width / 2) * scale - target.container.width * scale / 2,
      ]}
      scale={[support.length * scale, support.height * scale, support.width * scale]}
      receiveShadow
      renderOrder={8}
    >
      <boxGeometry />
      <meshStandardMaterial color="#d8b07a" roughness={0.85} transparent opacity={0.78} />
      <Edges color="#7a5a33" />
    </mesh>)}

    {cargoPlacements.map((box, index) => <mesh
      key={`${box.cargoId}-${index}`}
      position={[
        (box.x + box.length / 2) * scale - target.container.length * scale / 2,
        (box.z + box.height / 2) * scale + 0.01,
        (box.y + box.width / 2) * scale - target.container.width * scale / 2,
      ]}
      scale={[box.length * scale, box.height * scale, box.width * scale]}
      castShadow={false}
      receiveShadow
      renderOrder={10}
    >
      <boxGeometry />
      <meshStandardMaterial
        color={cargoColor(box.cargoId)}
        roughness={0.58}
        transparent
        opacity={0.2}
        depthWrite={false}
      />
      <Edges color="#16324f" />
    </mesh>)}

    <WeightDistribution3D
      container={target.container}
      analysis={analysis}
      scale={scale}
      showCenterOfGravity={showCenterOfGravity}
    />
    <PreviewCameraController view={view} container={target.container} scale={scale} />
  </>;
}

export default function PalletWeightDistributionDock() {
  const target = usePhysicsTarget();
  const snapshot = usePalletSnapshot();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [view, setView] = useState<PreviewView>('free');
  const [showGraph, setShowGraph] = useState(readWeightGraphPreference);
  const [showCg, setShowCg] = useState(readWeightCgPreference);

  useEffect(() => {
    const locate = () => setPortalTarget(document.querySelector('.pallet-viewer'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const analysis = useMemo(() => {
    if (!target || target.mode !== 'pallets') return null;
    const snapshotMatchesTarget = Boolean(snapshot
      && snapshot.result.placements.length === target.result.placements.length
      && Math.abs(snapshot.result.totalPalletizedWeightKg - target.result.loadedWeightKg) <= 1e-6);
    if (!snapshotMatchesTarget || !snapshot) return analyzeWeightDistribution(target.container, target.result, 20, 8);

    const columns = new Map<number, typeof snapshot.result.pallets>();
    snapshot.result.pallets.forEach((pallet) => {
      const loads = columns.get(pallet.stackColumn) ?? [];
      loads.push(pallet);
      columns.set(pallet.stackColumn, loads);
    });
    const floorFootprints = [...columns.values()].flatMap((loads) => {
      const sorted = [...loads].sort((a, b) => a.stackLevel - b.stackLevel);
      const base = sorted[0];
      if (!base) return [];
      return [{
        x: base.x,
        y: base.y,
        length: base.length,
        width: base.width,
        weightKg: sorted.reduce((sum, pallet) => sum + pallet.totalWeightKg, 0),
      }];
    });
    const massBodies = snapshot.result.pallets.map((pallet) => ({
      weightKg: pallet.totalWeightKg,
      x: pallet.centerOfGravity.x,
      y: pallet.centerOfGravity.y,
      z: pallet.centerOfGravity.z,
    }));

    return analyzeWeightDistribution(target.container, target.result, 20, 8, { floorFootprints, massBodies });
  }, [target, snapshot]);

  if (!portalTarget || !target || target.mode !== 'pallets') return null;

  const toggleGraph = () => setShowGraph((current) => {
    const next = !current;
    saveWeightGraphPreference(next);
    if (!next) setView('free');
    return next;
  });
  const toggleCg = () => setShowCg((current) => {
    const next = !current;
    saveWeightCgPreference(next);
    return next;
  });

  const viewButton = (nextView: Exclude<PreviewView, 'free'>, label: string) => (
    <button
      type="button"
      className={view === nextView ? 'active view-active' : ''}
      onClick={() => setView(nextView)}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className={`pallet-weight-dock ${showGraph ? 'open' : ''}`}>
      <div className="pallet-weight-toolbar">
        {showGraph && <div className="pallet-weight-view-buttons">
          {viewButton('rear', '후면')}
          {viewButton('top', '상단')}
          {viewButton('side', '옆면')}
        </div>}
        <button type="button" className={showGraph ? 'active' : ''} onClick={toggleGraph}>
          3D 무게분포 {showGraph ? 'ON' : 'OFF'}
        </button>
        {showGraph && <button type="button" className={showCg ? 'active cg-active' : ''} onClick={toggleCg}>
          CG {showCg ? 'ON' : 'OFF'}
        </button>}
      </div>

      {showGraph && <section className="pallet-weight-card" aria-label="팔레트 포함 3D 무게 분포">
        {analysis && analysis.totalWeightKg > 0 ? <>
          <div className="pallet-weight-canvas">
            <Canvas
              camera={{ position: [6.2, 4.8, 6.4], fov: 44 }}
              dpr={[1, 1.25]}
              gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
            >
              <color attach="background" args={['#edf3f9']} />
              <PalletAnalysisScene
                target={target}
                analysis={analysis}
                view={view}
                showCenterOfGravity={showCg}
              />
            </Canvas>
          </div>
          <WeightDistributionPanel analysis={analysis} />
          <div className="pallet-weight-basis">
            <b>팔레트 포함 무게분포</b>
            <span>박스 + 팔레트 + 포장재 중량 · 바닥 팔레트 접촉면으로 하중 전달 · 20×8 격자</span>
          </div>
        </> : <div className="pallet-weight-empty">
          <b>팔레트 적재 결과가 없습니다.</b>
          <span>화물을 등록한 뒤 자동 적재를 실행하면 팔레트 포함 무게분포가 표시됩니다.</span>
        </div>}
      </section>}
    </div>,
    portalTarget,
  );
}
