import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LoadingViewerProps } from './LoadingViewer';
import { unityPlan } from './unityProtocol';
import { readStoredState } from './storage';
import { useTransportEquipment } from './transportEquipment';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import { selectPlacement, PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { vehicleRigForEquipment } from './threeVehicleLayout';
import type { ThreeComparisonPlan } from './threeComparisonSceneState';
import ThreeComparisonScene, { type ThreeComparisonSceneStats, type VehicleStatus } from './ThreeComparisonScene';
import WeightDistributionPanel from './WeightDistributionPanel';
import { normalizeViewerEnvironment, readViewerEnvironment, saveViewerEnvironment, VIEWER_ENVIRONMENTS } from './viewerEnvironment';
import type { EnvironmentStatus } from './ThreeViewerEnvironment';
import './unity-viewer.css';
import './weight-distribution.css';
import './three-comparison.css';

class SceneErrorBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.error ? null : this.props.children; }
}
type Benchmark = { durationMs: number; sampleCount: number; meanFrameMs: number; p95FrameMs: number; fps: number; renderCalls: number; triangles: number };
export default function ThreeLoadingViewer({ container, result, cargo, preview = false, title = '적재 시뮬레이터', syncSelection = false, supports, securing, geometry, vehicle, frameData, onCargoSelect, onSupportSelect, weightView, showCg = true, view }: LoadingViewerProps) {
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [weight, setWeight] = useState(false), [cg, setCg] = useState(true), [cell, setCell] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('free'), [cut, setCut] = useState(100), [shell, setShell] = useState(true);
  const [playing, setPlaying] = useState(false), [step, setStep] = useState(result.placements.length), [selected, setSelected] = useState<number | null>(null), [labels, setLabels] = useState(true);
  const [stats, setStats] = useState<ThreeComparisonSceneStats | null>(null), [readyMs, setReadyMs] = useState<number | null>(null);
  const [benchmark, setBenchmark] = useState(false), [measurement, setMeasurement] = useState<Benchmark | null>(null);
  const [environment, setEnvironment] = useState(readViewerEnvironment);
  const [environmentStatus, setEnvironmentStatus] = useState<EnvironmentStatus | null>(null);
  const [environmentAttempt, setEnvironmentAttempt] = useState(0);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus>({ status: 'none' });
  const [vehicleAttempt, setVehicleAttempt] = useState(0);
  const equipment = useTransportEquipment();
  const started = useRef(performance.now()), revision = useRef(0);
  const plan = useMemo<ThreeComparisonPlan>(() => {
    const matchesEquipment = Math.abs(container.length - equipment.length) < .02 && Math.abs(container.width - equipment.width) < .02 && Math.abs(container.height - equipment.height) < .02;
    const showRig = geometry === undefined || vehicle === true || (vehicle !== undefined && matchesEquipment);
    const vehicleRig = showRig ? vehicleRigForEquipment(equipment) : 'none';
    return { ...unityPlan(container, result, ++revision.current, cargo ?? readStoredState()?.cargo, { supports, securing, geometry: geometry ?? equipment.geometry, vehicle: vehicle ?? (geometry ? false : equipment.category === 'truck') }), vehicleRig };
  }, [container, result, cargo, supports, securing, geometry, vehicle, equipment]);
  const frameActive = Boolean(frameData);
  const weightOn = frameActive ? false : weightView ?? weight;
  const visibleCut = frameActive ? 100 : cut, visibleStep = frameActive ? result.placements.length : step;
  const analysis = useMemo(() => analyzeWeightDistribution(container, result, 20, 8), [container, result]);
  useEffect(() => {
    setReady(false); setStats(null); setReadyMs(null); started.current = performance.now();
    setStep(result.placements.length); setPlaying(false); setSelected(null); setCell(null); setBenchmark(false); setMeasurement(null);
  }, [plan, result.placements.length, attempt]);
  const onReady = useCallback((value: ThreeComparisonSceneStats) => { setStats(value); setReady(true); setError(''); setReadyMs(performance.now() - started.current); }, []);
  const onError = useCallback((message: string) => { setReady(false); setError(message); }, []);
  useEffect(() => {
    if (ready || error) return;
    const timer = window.setTimeout(() => setError('모델 준비가 지연되고 있습니다. 연결을 확인한 뒤 다시 시도하거나 Unity로 전환하세요.'), 120000);
    return () => window.clearTimeout(timer);
  }, [ready, error, plan, attempt]);
  const onBenchmark = useCallback((value: Benchmark) => { setMeasurement(value); setBenchmark(false); }, []);
  const onSelect = useCallback((index: number | null) => {
    setSelected(index); if (syncSelection) selectPlacement(index); if (index !== null) onCargoSelect?.(index);
  }, [syncSelection, onCargoSelect]);
  useEffect(() => {
    if (!syncSelection) return;
    const receive = (event: Event) => { const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null; if (index === null || result.placements[index]) setSelected(index); };
    window.addEventListener(PLACEMENT_SELECT_EVENT, receive);
    return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, receive);
  }, [syncSelection, result.placements]);
  useEffect(() => {
    if (!playing || frameActive) return;
    const timer = window.setInterval(() => setStep(current => { const next = Math.min(current + 1, result.placements.length); if (next === result.placements.length) setPlaying(false); return next; }), 250);
    return () => window.clearInterval(timer);
  }, [playing, frameActive, result.placements.length]);
  useEffect(() => { if (frameActive) { setPlaying(false); setBenchmark(false); } }, [frameActive]);
  const selectedBox = selected === null ? undefined : result.placements[selected];
  const selectedCell = cell === null ? undefined : analysis.floor.cells[cell];
  const count = result.placements.length;
  return <section className={`unity-viewer three-comparison-viewer ${preview ? 'unity-preview' : ''}`} aria-label={`Three.js ${title}`} data-three-vehicle-rig={plan.vehicleRig} data-three-vehicle-status={vehicleStatus.status} data-three-plan-revision={plan.revision} data-three-camera-pose={stats?.cameraPose} data-three-environment={environment} data-three-environment-applied={environmentStatus?.id === environment && environmentStatus.status === 'ready'} data-three-geometries={stats?.geometries ?? 0} data-three-textures={stats?.textures ?? 0} data-three-render-calls={stats?.renderCalls ?? 0} data-three-count={count} data-three-supports={plan.supports.length} data-three-ready={ready} data-three-applied={ready && stats?.revision === plan.revision} data-three-model-count={stats?.modelCount ?? 0} data-three-label-faces={labels && !weightOn ? stats?.labelFaces ?? 0 : 0} data-three-step={visibleStep} data-three-cut={visibleCut} data-three-selected={selected ?? -1} data-three-ready-ms={readyMs?.toFixed(1)} data-three-cg-visible={ready && stats?.revision === plan.revision && Boolean(stats.cgVisible)} data-three-frame-step={ready && stats?.revision === plan.revision ? stats.acceptedFrameStep ?? '' : ''} data-three-frame-rejected={ready && stats?.revision === plan.revision && stats.rejectedFrame} data-three-cg-position={ready && stats?.revision === plan.revision ? stats.cgPosition?.map(value => value.toFixed(5)).join(',') : undefined}>
    <div className="unity-toolbar"><div><b>{title}</b><span className="studio-live-badge"><i/>THREE.JS</span></div><div className="unity-view-buttons">
      {[['free','입체'],['top','상단'],['door','문쪽'],['side','측면']].map(([key,label]) => <button key={key} data-view-only="true" aria-pressed={(view ?? activeView) === key} disabled={!ready} onClick={() => setActiveView(key)}>{label}</button>)}
      <button data-view-only="true" disabled={!ready} aria-pressed={shell} onClick={() => setShell(!shell)}>{shell ? '외벽 숨기기' : '외벽 표시'}</button>
      {!preview && !weightOn && <button data-view-only="true" disabled={!ready || !count} aria-pressed={labels} onClick={() => setLabels(!labels)}>박스 정보 {labels ? 'ON' : 'OFF'}</button>}
      {!preview && weightView === undefined && <button data-view-only="true" disabled={!ready || !count || frameActive} aria-pressed={weightOn} onClick={() => setWeight(!weight)}>3D 무게분포</button>}
      {showCg && <button data-view-only="true" disabled={!ready || (!count && !plan.supports.length)} aria-pressed={cg} onClick={() => setCg(!cg)}>무게중심 {cg ? 'ON' : 'OFF'}</button>}
    </div></div>
    <div className="three-environment-controls">
      <label>배경<select data-view-only="true" aria-label="3D 배경" value={environment} onChange={event => {
        const next = normalizeViewerEnvironment(event.target.value); setEnvironment(next); saveViewerEnvironment(next);
      }}>{VIEWER_ENVIRONMENTS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <span>보기 전용 · 적재 계산과 무관</span>
    </div>
    <div className="unity-stage three-comparison-stage">
      <SceneErrorBoundary key={attempt} onError={onError}><ThreeComparisonScene vehicleAttempt={vehicleAttempt} onVehicleStatus={setVehicleStatus} environment={environment} environmentAttempt={environmentAttempt} onEnvironmentStatus={setEnvironmentStatus} plan={plan} cut={visibleCut} shell={shell} step={visibleStep} labels={labels} weight={weightOn} showCg={showCg && cg} view={view === 'rear' ? 'door' : view ?? activeView} selected={selected} frameData={frameData} onSelect={onSelect} onSupportSelect={onSupportSelect} onCellSelect={setCell} onReady={onReady} onStats={setStats} onError={onError} benchmark={benchmark} onBenchmark={onBenchmark} /></SceneErrorBoundary>
      {ready && stats?.revision === plan.revision && stats.cgVisible && <div className="three-cg-legend"><i aria-hidden="true"/>전체 적재 무게중심 · 상자 + 파렛트 자체중량</div>}
      {environmentStatus?.id === environment && environmentStatus.status === 'fallback' && <div className="three-environment-error" role="status">배경 표시 실패 · 기본 배경 사용 중 <button type="button" data-view-only="true" onClick={() => setEnvironmentAttempt(value => value + 1)}>배경 다시 시도</button></div>}
      {vehicleStatus.status === 'fallback' && <div className="three-environment-error" role="status">차량 모델 표시 실패 · 화물 보기는 계속 사용할 수 있습니다 <button type="button" data-view-only="true" onClick={() => setVehicleAttempt(value => value + 1)}>차량 다시 시도</button></div>}
      {!ready && !error && <div className="unity-loading" role="status"><b>3D 모델 준비 중</b><span>원본 화물 모델 · 차량 GLB · 텍스처 불러오는 중</span></div>}
      {error && <div className="unity-loading three-comparison-error" role="alert"><b>3D 모델을 불러오지 못했습니다</b><span>{error}</span><span>상단에서 Unity로 돌아가거나 다시 시도할 수 있습니다</span><button onClick={() => { setError(''); setAttempt(value => value + 1); }}>다시 시도</button></div>}
      {ready && <div className="unity-hint">드래그 회전 · 휠 확대 · 우클릭 이동{weightOn ? ' · 격자 클릭: 하중 확인' : ' · 화물 클릭: 정보 확인'}</div>}
      {!weightOn && selectedBox && <div className="unity-inspector"><b>{(cargo ?? readStoredState()?.cargo)?.find(item => item.id === selectedBox.cargoId)?.name ?? selectedBox.cargoId}</b><span>{selectedBox.cargoId}</span><span>{selectedBox.length.toFixed(2)} × {selectedBox.width.toFixed(2)} × {selectedBox.height.toFixed(2)} m</span><span>{selectedBox.weightKg.toFixed(1)} kg · {selectedBox.rotated ? '90° 회전' : '기본 방향'}</span></div>}
      {weightOn && selectedCell && <div className="unity-inspector"><b>R{selectedCell.row + 1} · C{selectedCell.column + 1}</b><span>{selectedCell.loadKg.toFixed(1)} kg · {selectedCell.kgPerM2.toFixed(0)} kg/m²</span></div>}
      {weightOn && <details className="unity-weight-details"><summary>무게분포 수치 · 박스 중량 기준</summary><WeightDistributionPanel analysis={analysis}/></details>}
    </div>
    {!preview && !frameData && !weightOn && <div className="unity-controls"><label>높이 단면<input data-view-only="true" aria-label="Three.js 높이 단면" type="range" min="1" max="100" value={cut} disabled={!ready} onChange={e => setCut(Number(e.target.value))}/><output>{cut}%</output></label><button data-view-only="true" disabled={!ready || !count} onClick={() => { if (!playing && step >= count) setStep(0); setPlaying(!playing); }}>{playing ? '일시정지' : '적재 순서 재생'}</button><label>순서<input data-view-only="true" aria-label="Three.js 적재 순서" type="range" min="0" max={count} value={step} disabled={!ready || !count} onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }}/><output>{step} / {count}</output></label></div>}
    <div className="unity-summary"><span>{container.length.toFixed(2)} × {container.width.toFixed(2)} × {container.height.toFixed(2)} m</span><span>{count} EA · {result.loadedWeightKg.toLocaleString()} kg{plan.supports.length ? ` · 팔레트 ${plan.supports.length}개` : ''}</span>{!preview && <span>{result.validationIssues.length ? `규칙 위반 ${result.validationIssues.length}건 · 빨간 박스 확인` : count ? '배치 규칙 검사 통과' : '자동 적재 실행 대기'}</span>}</div>
    <div className="three-comparison-metrics"><span>{readyMs === null ? '화면 준비 측정 중' : `모델 준비 ${readyMs.toFixed(0)} ms (캐시·기기 영향)`}</span><button data-view-only="true" disabled={!ready || benchmark || !!frameData} onClick={() => { setMeasurement(null); setBenchmark(true); }}>{benchmark ? '회전 측정 중…' : '5초 회전 측정'}</button>{measurement && <span role="status">평균 {measurement.fps.toFixed(1)} FPS · p95 {measurement.p95FrameMs.toFixed(1)} ms · {measurement.sampleCount} 프레임 · 렌더링만 측정</span>}</div>
    {!preview && !frameData && <small className="unity-sequence-note">배치 순서 시각화 · 현장 작업 순서와 안전 판정은 검증표를 확인하세요.</small>}
  </section>;
}
