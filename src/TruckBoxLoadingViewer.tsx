import { Edges } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import BoxSecuringAids3D from './BoxSecuringAids3D';
import { cargoColor } from './cargoColors';
import { CargoFaceInfoLabels } from './CargoFaceInfoLabels';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { assessTruckAxleLoad } from './engine/truckAxleLoad';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { PreviewCameraController, PreviewViewControls, readBoxLabelPreference, saveBoxLabelPreference, type PreviewView } from './PreviewViewControls';
import { AxisGuide, ClearanceGuide, clearanceValues } from './SceneGuides';
import { readStoredState } from './storage';
import TransportShell3D from './TransportShell3D';

function CargoBox({ placement, container, scale }: { placement: Placement; container: ContainerSpec; scale: number }) {
  return <mesh
    position={[
      (placement.x + placement.length / 2) * scale - container.length * scale / 2,
      (placement.z + placement.height / 2) * scale + 0.03,
      (placement.y + placement.width / 2) * scale - container.width * scale / 2,
    ]}
    castShadow
    receiveShadow
  >
    <boxGeometry args={[placement.length * scale * 0.985, placement.height * scale * 0.985, placement.width * scale * 0.985]} />
    <meshStandardMaterial color={cargoColor(placement.cargoId)} roughness={0.58} metalness={0.01} />
    <Edges color="#16324f" />
  </mesh>;
}

export default function TruckBoxLoadingViewer({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  const [view, setView] = useState<PreviewView>('free');
  const [showLabels, setShowLabels] = useState(readBoxLabelPreference);
  const [certification, setCertification] = useState<InertiaCertification | null>(() => {
    const latest = readLatestInertiaCertification();
    return latest?.mode === 'boxes' ? latest : null;
  });
  const scale = 0.45;
  const cargoMap = useMemo(() => new Map((readStoredState()?.cargo ?? []).map(item => [item.id, item] as [string, CargoItem])), [result.placements]);
  const groups = useMemo(() => {
    const map = new Map<string, Placement[]>();
    result.placements.forEach(placement => {
      const list = map.get(placement.cargoId) ?? [];
      list.push(placement);
      map.set(placement.cargoId, list);
    });
    return [...map.entries()];
  }, [result.placements]);
  const clearances = useMemo(() => clearanceValues(container, result.placements), [container, result.placements]);
  const axle = useMemo(() => assessTruckAxleLoad(container, result), [container, result]);
  const securingUsage = certification?.securing ?? null;

  useEffect(() => setCertification(null), [result, container]);
  useEffect(() => {
    const onCertification = (event: Event) => {
      const next = (event as CustomEvent<InertiaCertification | undefined>).detail;
      setCertification(next?.mode === 'boxes' ? next : null);
    };
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
  }, []);

  const toggleLabels = () => setShowLabels(current => {
    const next = !current;
    saveBoxLabelPreference(next);
    return next;
  });

  const modelName = container.transportType === 'tautliner' ? 'TAUTLINER · CURTAINSIDER'
    : container.transportType === 'mega-trailer' ? 'MEGA-TRAILER'
      : container.transportType === 'refrigerated-truck' ? 'REFRIGERATED TRUCK'
        : container.transportType === 'isotherm-truck' ? 'ISOTHERM TRUCK'
          : 'CUSTOM TRUCK';

  return <section className="viewer reference-viewer truck-reference-viewer">
    <div className="reference-3d">
      <PreviewViewControls view={view} onViewChange={setView} showLabels={showLabels} onToggleLabels={toggleLabels} />
      <div className="truck-viewer-badge"><b>{modelName}</b><span>{container.sideWallModel === 'curtain' ? '측면 커튼 비지지' : '강체 측벽'} · {container.roofModel === 'rigid' ? '강체 지붕' : container.roofModel === 'open' ? '개방 지붕' : '연성 지붕 비지지'}</span></div>
      <Canvas shadows camera={{ position: [7.8, 4.8, 7.4], fov: 46 }} dpr={[1, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#edf3f9']} />
        <ambientLight intensity={2.1} />
        <directionalLight castShadow position={[3, 7, 5]} intensity={2.5} />
        <TransportShell3D container={container} scale={scale} />
        <AxisGuide container={container} scale={scale} />
        <ClearanceGuide container={container} placements={result.placements} scale={scale} />
        {result.placements.map((placement, index) => <CargoBox key={`${placement.cargoId}-${index}`} placement={placement} container={container} scale={scale} />)}
        {groups.map(([id, placements]) => showLabels ? <CargoFaceInfoLabels
          key={`labels-${id}`}
          placements={placements}
          container={container}
          scale={scale}
          displayName={cargoMap.get(id)?.name ?? id}
          verticalOffset={0.03}
        /> : null)}
        <BoxSecuringAids3D container={container} placements={result.placements} usage={securingUsage} scale={scale} />
        <PreviewCameraController view={view} container={container} scale={scale} />
      </Canvas>

      <div className="truck-engineering-strip">
        <span>차량 <b>{modelName}</b></span>
        <span>화물 <b>{result.placements.length} EA</b></span>
        <span>중량 <b>{result.loadedWeightKg.toFixed(0)} kg</b></span>
        {axle?.validGeometry && <><span>앞축 추정 <b>{axle.frontTotalKg.toFixed(0)} kg</b></span><span>뒤축 추정 <b>{axle.rearTotalKg.toFixed(0)} kg</b></span></>}
      </div>
      {securingUsage && securingUsage.level > 0 && <div className="pallet-securing-strip">
        <b>관성 보강 적용</b><span>미끄럼방지 {securingUsage.antiSlipMats}EA</span><span>블로킹재 {securingUsage.dunnageBlocks}EA</span>{securingUsage.loadBars > 0 && <span>고정바 {securingUsage.loadBars}EA</span>}
      </div>}
      {clearances && <div className="reference-clearance-strip">
        <span>전방 <b>{clearances.back}</b></span><span>후방/하역 <b>{clearances.door}</b></span><span>좌측 <b>{clearances.left}</b></span><span>우측 <b>{clearances.right}</b></span><span>상부 <b>{clearances.top}</b></span>
      </div>}
      {axle && axle.severity !== 'ok' && <div className={`truck-axle-warning ${axle.severity}`}><b>축하중 {axle.severity === 'over' ? '위험' : axle.severity === 'warning' ? '주의' : '설정 확인'}</b><span>{axle.messages.join(' · ')}</span></div>}
    </div>
  </section>;
}
