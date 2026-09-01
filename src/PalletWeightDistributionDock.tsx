import { Edges, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cargoColor } from './cargoColors';
import type { LoadingResult, Placement } from './engine/types';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import { usePhysicsTarget } from './physicsTarget';
import WeightDistribution3D from './WeightDistribution3D';

const PALLET_WEIGHT_GRAPH_KEY = 'container-loading-show-pallet-weight-graph-v1';
const PALLET_WEIGHT_CG_KEY = 'container-loading-show-pallet-weight-cg-v1';

function readPreference(key: string, defaultValue: boolean) {
  if (typeof window === 'undefined') return defaultValue;
  const value = window.localStorage.getItem(key);
  if (value == null) return defaultValue;
  return value === 'true';
}

function savePreference(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function supportPlacements(target: NonNullable<ReturnType<typeof usePhysicsTarget>>): Placement[] {
  return (target.supports ?? []).map((support) => ({
    cargoId: support.id,
    x: support.x,
    y: support.y,
    z: support.z,
    length: support.length,
    width: support.width,
    height: support.height,
    weightKg: support.weightKg,
  }));
}

function combinedResult(target: NonNullable<ReturnType<typeof usePhysicsTarget>>): LoadingResult {
  const supports = supportPlacements(target);
  const placements = [...target.result.placements, ...supports];
  return {
    ...target.result,
    placements,
    loadedWeightKg: placements.reduce((sum, placement) => sum + placement.weightKg, 0),
    usedVolumeM3: placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
  };
}

function PalletAnalysisScene({
  target,
  showCenterOfGravity,
}: {
  target: NonNullable<ReturnType<typeof usePhysicsTarget>>;
  showCenterOfGravity: boolean;
}) {
  const scale = 0.48;
  const result = useMemo(() => combinedResult(target), [target]);
  const analysis = useMemo(() => analyzeWeightDistribution(target.container, result, 20, 8), [result, target.container]);
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
    >
      <boxGeometry />
      <meshStandardMaterial color="#d8b07a" roughness={0.85} transparent opacity={0.9} />
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
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial color={cargoColor(box.cargoId)} roughness={0.58} transparent opacity={0.2} depthWrite={false} />
      <Edges color="#16324f" />
    </mesh>)}

    <WeightDistribution3D
      container={target.container}
      analysis={analysis}
      scale={scale}
      showCenterOfGravity={showCenterOfGravity}
    />
    <OrbitControls
      makeDefault
      target={[0, Math.max(0.35, target.container.height * scale * 0.25), 0]}
      enablePan={false}
      minDistance={3.4}
      maxDistance={16}
    />
  </>;
}

export default function PalletWeightDistributionDock() {
  const target = usePhysicsTarget();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [showGraph, setShowGraph] = useState(() => readPreference(PALLET_WEIGHT_GRAPH_KEY, true));
  const [showCg, setShowCg] = useState(() => readPreference(PALLET_WEIGHT_CG_KEY, true));

  useEffect(() => {
    const locate = () => setPortalTarget(document.querySelector('.pallet-viewer'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const result = useMemo(() => {
    if (!target || target.mode !== 'pallets') return null;
    return combinedResult(target);
  }, [target]);
  const analysis = useMemo(() => {
    if (!target || target.mode !== 'pallets' || !result) return null;
    return analyzeWeightDistribution(target.container, result, 20, 8);
  }, [result, target]);

  if (!portalTarget || !target || target.mode !== 'pallets') return null;

  const toggleGraph = () => setShowGraph((current) => {
    const next = !current;
    savePreference(PALLET_WEIGHT_GRAPH_KEY, next);
    return next;
  });
  const toggleCg = () => setShowCg((current) => {
    const next = !current;
    savePreference(PALLET_WEIGHT_CG_KEY, next);
    return next;
  });

  return createPortal(
    <div className={`pallet-weight-dock ${showGraph ? 'open' : ''}`}>
      <div className="pallet-weight-toolbar">
        <button type="button" className={showGraph ? 'active' : ''} onClick={toggleGraph}>
          팔레트 3D 무게분포 {showGraph ? 'ON' : 'OFF'}
        </button>
        {showGraph && <button type="button" className={showCg ? 'active' : ''} onClick={toggleCg}>CG {showCg ? 'ON' : 'OFF'}</button>}
      </div>

      {showGraph && <section className="pallet-weight-card" aria-label="팔레트 3D 무게 분포">
        {analysis && analysis.totalWeightKg > 0 ? <>
          <div className="pallet-weight-canvas">
            <Canvas camera={{ position: [6.2, 4.8, 6.4], fov: 44 }} dpr={[1, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}>
              <color attach="background" args={['#edf3f9']} />
              <PalletAnalysisScene target={target} showCenterOfGravity={showCg} />
            </Canvas>
          </div>
          <div className="pallet-weight-summary">
            <div><span>총 팔레트화 중량</span><b>{analysis.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</b></div>
            <div><span>안쪽 / 문쪽</span><b>{pct(analysis.innerRatio)} / {pct(analysis.doorRatio)}</b></div>
            <div><span>좌측 / 우측</span><b>{pct(analysis.leftRatio)} / {pct(analysis.rightRatio)}</b></div>
            <div><span>최대 국부하중</span><b>{(analysis.maxCell?.kgPerM2 ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} kg/m²</b></div>
          </div>
          <p className={`pallet-weight-status ${analysis.status}`}>{analysis.status === 'balanced' ? '팔레트 포함 무게 분포가 양호합니다.' : '팔레트 포함 무게 분포를 확인하세요.'}</p>
        </> : <div className="pallet-weight-empty"><b>팔레트 적재 결과가 없습니다.</b><span>화물을 등록한 뒤 ‘물리 최적 자동 적재’를 실행하면 팔레트와 무게분포가 함께 표시됩니다.</span></div>}
      </section>}
    </div>,
    portalTarget,
  );
}
