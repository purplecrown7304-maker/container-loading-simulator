import { clearanceFaceLabel, clearanceNumber, equipmentRearAccess, selectedCargoClearance, type ClearanceAxis } from './cargoClearance';
import { uiText as uiT, useUiLanguage } from './uiLanguage';
import { Component, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LoadingViewerProps } from './LoadingViewer';
import { viewerPlan } from './viewerSceneProtocol';
import { readStoredState } from './storage';
import { useTransportEquipment } from './transportEquipment';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import { selectPlacement, PLACEMENT_SELECT_EVENT, type PlacementSelectDetail } from './selectionEvents';
import { vehicleRigForEquipment } from './threeVehicleLayout';
import type { ThreeComparisonPlan } from './threeComparisonSceneState';
import ThreeComparisonScene, { type ThreeComparisonSceneStats, type VehicleStatus } from './ThreeComparisonScene';
import WeightDistributionPanel from './WeightDistributionPanel';
import { useViewerEnvironment } from './viewerEnvironment';
import type { EnvironmentStatus } from './ThreeViewerEnvironment';
import { useStagingScene } from './stagingSceneContext';
import { stagingPreviewConflicts } from './stagingDragCues';
import { stagingVehicleSelection } from './threeComparisonSceneState';
import { useViewerQuality } from './viewerQuality';
import type { RenderPipelineStatus } from './ThreeRenderPipeline';
import ViewerQualityControls from './ViewerQualityControls';
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
export default function ThreeLoadingViewer({ container, result, cargo, preview = false, compact = false, title = '적재 시뮬레이터', syncSelection = false, supports, securing, geometry, vehicle, frameData, onCargoSelect, onSupportSelect, weightView, showCg = true, view, showDiagnostics = false }: LoadingViewerProps) {
  useUiLanguage();
  const quality = useViewerQuality();
  const [pipelineStatus, setPipelineStatus] = useState<RenderPipelineStatus | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [weight, setWeight] = useState(false), [cg, setCg] = useState(true), [cell, setCell] = useState<number | null>(null);
  const [activeView, setActiveView] = useState('free'), [cut, setCut] = useState(100), [shell, setShell] = useState(true);
  const [playing, setPlaying] = useState(false), [step, setStep] = useState(result.placements.length), [localSelected, setSelected] = useState<number | null>(null), [labels, setLabels] = useState(true);
  const [localSelectedSupport, setSelectedSupport] = useState<number | null>(null);
  const staging = useStagingScene();
  const stagingRef = useRef(staging); stagingRef.current = staging;
  const ownSelectionEvent = useRef(false);
  const lastLegacySelection = useRef<number | null | undefined>(undefined);
  const [legacyViewOverride, setLegacyViewOverride] = useState<{ view: string; request: number } | null>(null);
  const [viewRequest, setViewRequest] = useState(0);
  const [stagingClearanceUnit, setStagingClearanceUnit] = useState<string | null>(null);
  const stagingClearanceOpen = Boolean(staging?.selectedUnitId && staging.selectedUnitId === stagingClearanceUnit);
  const clearancePanelId = useId(), bottomInfo = useRef<HTMLDivElement>(null);
  const [bottomInfoHeight, setBottomInfoHeight] = useState(48);
  const [clearanceAxis, setClearanceAxis] = useState<ClearanceAxis>('width');
  const [stats, setStats] = useState<ThreeComparisonSceneStats | null>(null), [readyMs, setReadyMs] = useState<number | null>(null);
  const [benchmark, setBenchmark] = useState(false), [measurement, setMeasurement] = useState<Benchmark | null>(null);
  const measurementOwner = useRef<string | null>(null), liveMeasurementContext = useRef('');
  const environment = useViewerEnvironment();
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
    return { ...viewerPlan(container, result, ++revision.current, cargo ?? readStoredState()?.cargo, { supports, securing, geometry: geometry ?? equipment.geometry, vehicle: vehicle ?? (geometry ? false : equipment.category === 'truck') }), vehicleRig, rearAccess: matchesEquipment && (geometry === undefined || geometry === equipment.geometry) ? equipmentRearAccess(equipment) : geometry === undefined ? 'rear' : undefined, equipmentId: geometry === undefined || geometry === equipment.geometry ? equipment.id : undefined };
  }, [container, result, cargo, supports, securing, geometry, vehicle, equipment]);
  const measurementContext = `${plan.revision}:${quality.quality}:${quality.ambientOcclusion}`;
  liveMeasurementContext.current = measurementContext;
  const completedMeasurement = measurementOwner.current === measurementContext ? measurement : null;
  useEffect(() => { measurementOwner.current = null; setMeasurement(null); setBenchmark(false); }, [measurementContext]);
  const stagedSelection = staging ? stagingVehicleSelection(plan, staging.inventory.vehicleUnits, staging.selectedUnitId) : null;
  const selected = staging ? stagedSelection?.cargoIndex ?? null : localSelected;
  const selectedSupport = staging ? stagedSelection?.supportIndex ?? null : localSelectedSupport;
  const sceneView = view === 'rear' ? 'door' : view ?? (staging
    ? legacyViewOverride?.request === staging.viewRequest ? legacyViewOverride.view : staging.view
    : activeView);
  const frameActive = Boolean(frameData);
  const weightOn = frameActive ? false : weightView ?? weight;
  const visibleCut = frameActive ? 100 : cut, visibleStep = frameActive ? result.placements.length : step;
  const analysis = useMemo(() => analyzeWeightDistribution(container, result, 20, 8), [container, result]);
  useEffect(() => {
    setReady(false); setStats(null); setReadyMs(null); started.current = performance.now();
    setStep(result.placements.length); setPlaying(false); setSelected(null); setSelectedSupport(null); setCell(null); setBenchmark(false); setMeasurement(null);
  }, [plan, result.placements.length, attempt]);
  const onReady = useCallback((value: ThreeComparisonSceneStats) => { setStats(value); setReady(true); setError(''); setReadyMs(performance.now() - started.current); }, []);
  const onError = useCallback((message: string) => {
    setReady(false); setError(message);
    const current = stagingRef.current;
    if (current?.flight) current.completeFlight?.(current.flight.id);
  }, []);
  useEffect(() => {
    if (ready || error) return;
    const timer = window.setTimeout(() => setError('모델 준비가 지연되고 있습니다. 연결을 확인한 뒤 다시 시도하세요.'), 120000);
    return () => window.clearTimeout(timer);
  }, [ready, error, plan, attempt]);
  const onBenchmark = useCallback((value: Benchmark) => {
    if (measurementOwner.current !== liveMeasurementContext.current) return;
    setMeasurement(value); setBenchmark(false);
  }, []);
  const syncCargoSelection = useCallback((index: number | null) => {
    setSelected(index); setSelectedSupport(null);
    if (index === null) stagingRef.current?.selectUnit(null); else stagingRef.current?.selectVehicleUnit('cargo', index);
    if (syncSelection) { lastLegacySelection.current = index; ownSelectionEvent.current = true; try { selectPlacement(index); } finally { ownSelectionEvent.current = false; } }
  }, [syncSelection]);
  const onSelect = useCallback((index: number | null) => {
    syncCargoSelection(index);
    if (index !== null && !plan.supports.length) onCargoSelect?.(index);
  }, [syncCargoSelection, onCargoSelect, plan.supports.length]);
  const onSelectSupport = useCallback((index: number) => {
    if (!plan.supports[index]) return;
    if (syncSelection) { lastLegacySelection.current = null; ownSelectionEvent.current = true; try { selectPlacement(null); } finally { ownSelectionEvent.current = false; } }
    setSelected(null); setSelectedSupport(index);
    stagingRef.current?.selectVehicleUnit('support', index);
  }, [plan.supports, syncSelection]);
  const onInspect = useCallback((kind: 'cargo' | 'support', index: number) => {
    if (kind === 'cargo') {
      if (!plan.placements[index]) return;
      syncCargoSelection(index);
    } else {
      if (!plan.supports[index]) return;
      onSelectSupport(index);
    }
    const current = stagingRef.current;
    if (current?.inspectVehicleUnit) current.inspectVehicleUnit(kind, index);
    else if (kind === 'support') onSupportSelect?.(index);
    else onCargoSelect?.(index);
  }, [plan.placements, plan.supports, syncCargoSelection, onSelectSupport, onCargoSelect, onSupportSelect]);
  useEffect(() => {
    const clear = (event: KeyboardEvent) => { if (event.key === 'Escape') onSelect(null); };
    window.addEventListener('keydown', clear);
    return () => window.removeEventListener('keydown', clear);
  }, [onSelect]);
  useEffect(() => {
    if (!syncSelection) return;
    const receive = (event: Event) => { const index = (event as CustomEvent<PlacementSelectDetail>).detail?.index ?? null; if (index === null || result.placements[index]) { lastLegacySelection.current = index; setSelected(index); setSelectedSupport(null);
      if (!ownSelectionEvent.current) { if (index === null) stagingRef.current?.selectUnit(null); else stagingRef.current?.selectVehicleUnit('cargo', index); }
    } };
    window.addEventListener(PLACEMENT_SELECT_EVENT, receive);
    return () => window.removeEventListener(PLACEMENT_SELECT_EVENT, receive);
  }, [syncSelection, result.placements]);
  useEffect(() => {
    if (!staging || !syncSelection) return;
    const index = stagedSelection?.cargoIndex ?? null;
    if (lastLegacySelection.current === index) return;
    lastLegacySelection.current = index; ownSelectionEvent.current = true;
    try { selectPlacement(index); } finally { ownSelectionEvent.current = false; }
    // Yard/pallet selection clears a legacy individual-box editor without
    // feeding that null event back into the stable root-unit selection.
  }, [Boolean(staging), staging?.selectedUnitId, stagedSelection?.cargoIndex, syncSelection]);
  useEffect(() => {
    if (!playing || frameActive) return;
    const timer = window.setInterval(() => setStep(current => { const next = Math.min(current + 1, result.placements.length); if (next === result.placements.length) setPlaying(false); return next; }), 250);
    return () => window.clearInterval(timer);
  }, [playing, frameActive, result.placements.length]);
  useEffect(() => { if (frameActive) { setPlaying(false); setBenchmark(false); } }, [frameActive]);
  const selectedBox = selected === null || selected >= visibleStep || !result.placements[selected] || result.placements[selected].z >= container.height * visibleCut / 100 ? undefined : result.placements[selected];
  const selectedPallet = selectedSupport === null ? undefined : plan.supports[selectedSupport];
  const flightActive = Boolean(staging?.flight);
  const clearanceSelection = selectedPallet ? { kind: 'support' as const, index: selectedSupport! } : selectedBox ? { kind: 'cargo' as const, index: selected! } : null;
  const clearance = frameActive ? stats?.revision === plan.revision && stats.clearance?.selection.kind === clearanceSelection?.kind && stats.clearance?.selection.index === clearanceSelection?.index ? stats.clearance : null
    : selectedCargoClearance(plan, clearanceSelection);
  const selectedCell = cell === null ? undefined : analysis.floor.cells[cell];
  const count = result.placements.length;
  useEffect(() => { if (stagingClearanceUnit && stagingClearanceUnit !== staging?.selectedUnitId) setStagingClearanceUnit(null); }, [staging?.selectedUnitId, stagingClearanceUnit]);
  useEffect(() => {
    if (!staging || !bottomInfo.current) return;
    const node = bottomInfo.current;
    const measure = () => { const height = node.getBoundingClientRect().height; if (height > 0) setBottomInfoHeight(current => Math.abs(current - height) > .5 ? height : current); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure); observer?.observe(node);
    return () => observer?.disconnect();
  }, [Boolean(staging)]);
  const inspector = !weightOn && !flightActive && (!staging || stagingClearanceOpen) && (selectedBox || selectedPallet) ? <div id={staging ? clearancePanelId : undefined} className={`unity-inspector three-clearance-inspector${staging ? ' staging-clearance-inspector' : ''}`} aria-label={uiT('선택 적재물 경계 거리')} style={staging ? { '--staging-controls-height': `${bottomInfoHeight}px` } as CSSProperties : undefined}>
    <div className="three-clearance-heading"><b>{selectedPallet ? `${uiT('팔레트 받침')} · ${selectedPallet.id}` : (cargo ?? readStoredState()?.cargo)?.find(item => item.id === selectedBox!.cargoId)?.name ?? selectedBox!.cargoId}</b><button type="button" data-view-only="true" aria-label={uiT(staging ? '경계 거리 닫기' : '선택 해제')} onClick={() => staging ? setStagingClearanceUnit(null) : onSelect(null)}>×</button></div>
    {selectedBox && <span>{selectedBox.cargoId} · {selectedBox.weightKg.toFixed(1)} kg · {selectedBox.rotated ? uiT('90° 회전') : uiT('기본 방향')}</span>}
    <span>{(selectedBox ?? selectedPallet)!.length.toFixed(2)} × {(selectedBox ?? selectedPallet)!.width.toFixed(2)} × {(selectedBox ?? selectedPallet)!.height.toFixed(2)} m</span>
    <b>{uiT('적재 공간 경계까지 거리')}</b>
    <div className="three-clearance-axis" role="group" aria-label={uiT('치수선 표시 방향')}>
      {([['length', '길이'], ['width', '폭'], ['height', '높이']] as const).map(([key, label]) => <button type="button" data-view-only="true" key={key} aria-pressed={clearanceAxis === key} onClick={() => setClearanceAxis(key)}>{uiT(label)}</button>)}
    </div>
    {clearance && <dl className="three-clearance-values">{clearance.measurements.map(value => <div key={value.face} data-clearance-face={value.face} data-overflow={value.distanceM < 0} data-active={value.axis === clearanceAxis}><dt>{uiT(clearanceFaceLabel(value.face, plan.rearAccess))}</dt><dd>{clearanceNumber(value.distanceM)}{value.distanceM < 0 && <small>{uiT('경계 초과')}</small>}</dd></div>)}</dl>}
    <small>{uiT('좌우는 후면에서 안쪽을 보는 기준입니다.')}</small>
    <small>{uiT('선택물 외곽부터 공간 경계까지의 직선 거리입니다. 사이에 다른 화물·지지대가 있을 수 있으며, 통로 폭이나 안전 판정이 아닙니다.')}</small>
    {selectedPallet && <small>{uiT('팔레트 받침 자체 기준 · 위에 실린 상자는 별도 선택')}</small>}
    {(selectedPallet && onSupportSelect || selectedBox && plan.supports.length > 0 && onCargoSelect) && <button type="button" data-view-only="true" onClick={() => { if (selectedPallet && selectedSupport !== null) onSupportSelect?.(selectedSupport); else if (selectedBox && selected !== null) onCargoSelect?.(selected); }}>{uiT('팔레트 상세 보기')}</button>}
  </div> : null;
  return <section {...{ "data-three-quality": quality.quality, "data-three-flight-request": staging?.flight?.id, "data-three-flight-active": stats?.flightActive ?? false, "data-three-flight-count": stats?.flightCount ?? 0, "data-three-camera-moving": stats?.cameraMoving ?? false, "data-three-camera-request": stats?.cameraRequest, "data-three-triangles": stats?.triangles, "data-three-benchmark": completedMeasurement ? JSON.stringify(completedMeasurement) : undefined, "data-three-render-path": pipelineStatus?.path, "data-three-render-width": pipelineStatus?.width, "data-three-render-height": pipelineStatus?.height, "data-three-msaa-samples": pipelineStatus?.msaaSamples, "data-three-ao-width": pipelineStatus?.aoWidth, "data-three-ao-height": pipelineStatus?.aoHeight }} className={`unity-viewer three-comparison-viewer ${preview ? 'unity-preview' : ''} ${compact ? 'unity-compact' : ''}`} aria-label={`Three.js ${uiT(title)}`} data-three-vehicle-rig={plan.vehicleRig} data-three-vehicle-status={vehicleStatus.status} data-three-plan-revision={plan.revision} data-three-camera-pose={stats?.cameraPose} data-three-environment={environment} data-three-environment-applied={environmentStatus?.id === environment && environmentStatus.status === 'ready'} data-three-geometries={stats?.geometries ?? 0} data-three-textures={stats?.textures ?? 0} data-three-render-calls={stats?.renderCalls ?? 0} data-three-count={count} data-three-supports={plan.supports.length} data-three-ready={ready} data-three-applied={ready && stats?.revision === plan.revision} data-three-model-count={stats?.modelCount ?? 0} data-three-label-faces={labels && !weightOn ? stats?.labelFaces ?? 0 : 0} data-three-step={visibleStep} data-three-cut={visibleCut} data-three-selected={selected ?? -1} data-three-selected-support={selectedSupport ?? -1} data-three-ready-ms={readyMs?.toFixed(1)} data-three-cg-visible={ready && stats?.revision === plan.revision && Boolean(stats.cgVisible)} data-three-frame-step={ready && stats?.revision === plan.revision ? stats.acceptedFrameStep ?? '' : ''} data-three-frame-rejected={ready && stats?.revision === plan.revision && stats.rejectedFrame} data-three-cg-position={ready && stats?.revision === plan.revision ? stats.cgPosition?.map(value => value.toFixed(5)).join(',') : undefined}>
    {staging && <span hidden data-three-staging-yard={staging.inventory.yardUnits.length} data-three-staging-vehicle={staging.inventory.vehicleUnits.length} data-three-staging-visible-zones={staging.visibleZoneIds.join(',')} data-three-staging-view={sceneView} data-three-staging-selected={staging.selectedUnitId ?? undefined} data-three-staging-preview={staging.preview ? String(staging.preview.valid) : undefined} data-three-staging-conflicts={staging.preview ? stagingPreviewConflicts(staging.inventory.vehicleUnits, staging.preview, plan.container).length : undefined} />}
    {(container.limitReview || result.limitReview) && <div className="limit-review-viewer-label" role="status">{uiT("WHAT-IF REVIEW · 검토 전용 · 출고 승인 불가 · 원 기준 초과 경고 유지")}</div>}
    <div className="unity-toolbar"><div><b>{uiT(title)}</b><span className="studio-live-badge"><i/>THREE.JS</span></div><div className="unity-view-buttons">
      {[['free',uiT("입체")],['top',uiT("상단")],['door',uiT(plan.rearAccess === 'rear' ? '후면' : '문쪽')],['side',uiT("측면")]].map(([key,label]) => <button key={key} data-view-only="true" aria-pressed={sceneView === key} disabled={!ready} onClick={() => { setActiveView(key); setViewRequest(value => value + 1); if (staging) { setLegacyViewOverride({ view: key, request: staging.viewRequest + 1 }); staging.setView('vehicle'); } }}>{label}</button>)}
      <button data-view-only="true" disabled={!ready} aria-pressed={shell} onClick={() => setShell(!shell)}>{shell ? uiT("외벽 숨기기") : uiT("외벽 표시")}</button>
      {(!preview || staging) && !weightOn && <button data-view-only="true" disabled={!ready || (!count && !staging?.inventory.yardUnits.length)} aria-pressed={labels} onClick={() => setLabels(!labels)}>{uiT("박스 정보")} {labels ? 'ON' : 'OFF'}</button>}
      {!preview && weightView === undefined && <button data-view-only="true" disabled={!ready || !count || frameActive} aria-pressed={weightOn} onClick={() => setWeight(!weight)}>{uiT("3D 무게분포")}</button>}
      {showCg && <button data-view-only="true" disabled={!ready || (!count && !plan.supports.length)} aria-pressed={cg} onClick={() => setCg(!cg)}>{uiT("무게중심")} {cg ? 'ON' : 'OFF'}</button>}
    </div></div>
    <div className="unity-stage three-comparison-stage">
      <SceneErrorBoundary key={attempt} onError={onError}><ThreeComparisonScene onPipelineStatus={setPipelineStatus} vehicleAttempt={vehicleAttempt} onVehicleStatus={setVehicleStatus} environment={environment} environmentAttempt={environmentAttempt} onEnvironmentStatus={setEnvironmentStatus} plan={plan} cut={visibleCut} shell={shell} step={visibleStep} labels={labels} weight={weightOn} showCg={showCg && cg} view={sceneView} viewRequest={viewRequest} staging={staging} selected={selected} selectedSupport={selectedSupport} clearanceVisible={!staging || stagingClearanceOpen} clearanceAxis={clearanceAxis} frameData={frameData} onSelect={onSelect} onSupportSelect={onSelectSupport} onInspect={onInspect} onCellSelect={setCell} onReady={onReady} onStats={setStats} onError={onError} benchmark={benchmark} onBenchmark={onBenchmark} /></SceneErrorBoundary>
      {ready && stats?.revision === plan.revision && stats.cgVisible && <div className="three-cg-legend"><i aria-hidden="true"/>{uiT("전체 적재 무게중심 · 상자 + 파렛트 자체중량")}</div>}
      {environmentStatus?.id === environment && environmentStatus.status === 'fallback' && <div className="three-environment-error" role="status">{uiT("배경 표시 실패 · 기본 배경 사용 중")} <button type="button" data-view-only="true" onClick={() => setEnvironmentAttempt(value => value + 1)}>{uiT("배경 다시 시도")}</button></div>}
      {vehicleStatus.status === 'fallback' && <div className="three-environment-error" role="status">{uiT("차량 모델 표시 실패 · 화물 보기는 계속 사용할 수 있습니다")} <button type="button" data-view-only="true" onClick={() => setVehicleAttempt(value => value + 1)}>{uiT("차량 다시 시도")}</button></div>}
      {!ready && !error && <div className="unity-loading" role="status"><b>{uiT("3D 모델 준비 중")}</b><span>{uiT("원본 화물 모델 · 차량 GLB · 텍스처 불러오는 중")}</span></div>}
      {error && <div className="unity-loading three-comparison-error" role="alert"><b>{uiT("3D 모델을 불러오지 못했습니다")}</b><span>{uiT(error)}</span><span>{uiT("연결과 브라우저의 3D 그래픽 지원을 확인한 뒤 다시 시도하세요")}</span><button onClick={() => { setError(''); setAttempt(value => value + 1); }}>{uiT("다시 시도")}</button></div>}
      {ready && <div className="unity-hint">{uiT(staging ? "빈 공간 드래그: 회전 · 휠: 확대 · 우드래그: 화면 이동 · 화물 좌드래그: 위치 이동 · 우클릭: 적재 정보" : "드래그 회전 · 휠 확대 · 우클릭 이동")}{weightOn ? uiT(" · 격자 클릭: 하중 확인") : uiT(" · 화물 클릭: 정보 확인")}</div>}
      {!staging && inspector}
      {weightOn && selectedCell && <div className="unity-inspector"><b>R{selectedCell.row + 1} · C{selectedCell.column + 1}</b><span>{selectedCell.loadKg.toFixed(1)} kg · {selectedCell.kgPerM2.toFixed(0)} kg/m²</span></div>}
      {weightOn && <details className="unity-weight-details"><summary>{uiT("무게분포 수치 · 박스 중량 기준")}</summary><WeightDistributionPanel analysis={analysis}/></details>}
    </div>
    {staging && inspector}
    <div ref={bottomInfo} className="viewer-bottom-info" role="group" aria-label={uiT("3D 보기 조작 및 적재 요약")}>
    {!preview && !frameData && !weightOn && <div className="unity-controls"><label>{uiT("높이 단면")}<input data-view-only="true" aria-label={uiT("Three.js 높이 단면")} type="range" min="1" max="100" value={cut} disabled={!ready} onChange={e => setCut(Number(e.target.value))}/><output>{cut}%</output></label><button data-view-only="true" disabled={!ready || !count} onClick={() => { if (!playing && step >= count) setStep(0); setPlaying(!playing); }}>{playing ? uiT("일시정지") : uiT("적재 순서 재생")}</button><label>{uiT("순서")}<input data-view-only="true" aria-label={uiT("Three.js 적재 순서")} type="range" min="0" max={count} value={step} disabled={!ready || !count} onChange={e => { setStep(Number(e.target.value)); setPlaying(false); }}/><output>{step} / {count}</output></label></div>}
    <div className="unity-summary"><span>{container.length.toFixed(2)} × {container.width.toFixed(2)} × {container.height.toFixed(2)} m</span><span>{count} EA · {result.loadedWeightKg.toLocaleString()} kg{plan.supports.length ? uiT(" · 팔레트 {0}개", [plan.supports.length]) : ''}</span>{!preview && <span>{container.limitReview || result.limitReview ? uiT("검토 전용 · 원 기준 위반 {0}건 · 출고 승인 불가", [result.validationIssues.length]) : result.validationIssues.length ? uiT("규칙 위반 {0}건 · 빨간 박스 확인", [result.validationIssues.length]) : count ? uiT("배치 규칙 검사 통과") : uiT("자동 적재 실행 대기")}</span>}</div>
    {staging && !weightOn && !flightActive && (selectedBox || selectedPallet) && <button type="button" data-view-only="true" aria-expanded={stagingClearanceOpen} aria-controls={stagingClearanceOpen ? clearancePanelId : undefined} onClick={() => setStagingClearanceUnit(stagingClearanceOpen ? null : staging.selectedUnitId)}>{uiT('경계 거리')}</button>}
    </div>
    {showDiagnostics && <div className="three-comparison-metrics"><ViewerQualityControls /><span>{readyMs === null ? uiT("화면 준비 측정 중") : uiT("모델 준비 {0} ms (캐시·기기 영향)", [readyMs.toFixed(0)])}</span><button data-view-only="true" disabled={!ready || benchmark || !!frameData || flightActive} onClick={() => { measurementOwner.current = liveMeasurementContext.current; setMeasurement(null); setBenchmark(true); }}>{benchmark ? uiT("회전 측정 중…") : uiT("5초 회전 측정")}</button>{completedMeasurement && <span role="status">{uiT("평균")} {completedMeasurement.fps.toFixed(1)} FPS · p95 {completedMeasurement.p95FrameMs.toFixed(1)} ms · {completedMeasurement.sampleCount} {uiT("프레임 · 렌더링만 측정")}</span>}</div>}
    {!preview && !frameData && <small className="unity-sequence-note">{uiT("배치 순서 시각화 · 현장 작업 순서와 안전 판정은 검증표를 확인하세요.")}</small>}
  </section>;
}
