import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NO_LOAD_RESULT_EVENT, cancelPendingCertification } from './autoCertification';
import { FINAL_LOADING_WORKFLOW_ERROR_EVENT } from './finalWorkflowEvents';
import { CONTAINERS } from './load-sim';
import { cargoColor, cargoTint, randomUniqueCargoColor } from './cargoColors';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { buildPlacementAddresses } from './engine/locationGrid';
import { containerInputError, preflightCargoInput } from './engine/inputPreflight';
import { pendingLoadingResult, publishLoadingResult, restoreLoadingResult, type LoadingStrategy } from './engine/loadingEngine';
import { readManualOverride } from './engine/manualOverride';
import { loadContainerAsync } from './engine/asyncLoading';
import { clearLoadSimAcceptance, publishLoadSimAcceptance } from './rule-engine/acceptance';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { GUIDED_LOADING_UNIT_EVENT, readGuidedLoadingUnit, useGuidedLoadingUnit } from './guidedLoadingUnitState';
import { shouldRenderGuidedViewer, useGuidedWorkflowState } from './guidedWorkflowState';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { LOADING_STRATEGY_PREFERENCE_EVENT, readLoadingStrategyPreference } from './loadingStrategyPreference';
import { createWorkflowFloorPreview, readWorkflowPreview, useWorkflowPreview, WORKFLOW_INPUT_INVALIDATED_EVENT, WORKFLOW_PREVIEW_EVENT } from './workflowPreview';
import { createLatestInputRun } from './latestInputRun';
import { resolvePalletType, usePalletTypeSelection } from './palletTypeSelection';
import type { PalletViewerScene } from './PalletModePanel';
import { openPalletLoadingReport } from './palletWorkerReport';
import PalletFooterSummary from './PalletFooterSummary';
import { clearPhysicsTarget } from './physicsTarget';
import { openLoadingReport } from './report';
import { openResultsModal } from './resultsModalEvents';
import { normalizeCargo, readStoredState, STORAGE_KEY, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';
import WorkspaceTools from './WorkspaceTools';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { useTransportEquipment } from './transportEquipment';
import { APPLY_TRANSPORT_EQUIPMENT_EVENT, containerWithEquipment, equipmentGeometryMatches, type ApplyTransportEquipmentDetail } from './transportEquipmentContainer';

const BoxLoadingViewer = lazy(() => import('./BoxLoadingViewer'));
const PalletModePanel = lazy(() => import('./PalletModePanel'));

// A's supplied representative default. Existing user-selected/stored equipment stays authoritative.
const defaultSpace = CONTAINERS['40HC'];
const defaultContainer: ContainerSpec = {
  length: defaultSpace.inner.l / 1000, width: defaultSpace.inner.w / 1000, height: defaultSpace.inner.h / 1000,
  maxPayloadKg: defaultSpace.maxPayload, tareKg: defaultSpace.tare,
  floorLineLoadKgPerM: defaultSpace.floorLineLoad,
  doorWidth: defaultSpace.door!.w / 1000, doorHeight: defaultSpace.door!.h / 1000,
};

type CargoDraft = Omit<CargoItem, 'id'> & { id: string };
type LoadingMode = 'boxes' | 'pallets' | 'mixed';
type NavSection = 'dashboard' | 'viewer';
type StatusTone = 'success' | 'warning' | 'error' | 'info';
type StatusMessage = { tone: StatusTone; text: string };

const emptyDraft: CargoDraft = {
  id: '', name: '', length: 0.5, width: 0.4, height: 0.3,
  weightKg: 10, quantity: 1, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true,
};
const strategyLabel = (_strategy: LoadingStrategy) => 'A pack';

function LoadingFallback() {
  return <section className="viewer"><div className="viewer-direction"><b>3D 모듈 불러오는 중</b><span>잠시 후 표시됩니다.</span></div></section>;
}

export default function App() {
  const stored = useMemo(() => readStoredState(), []);
  const startingCargo = useMemo(() => normalizeCargo(stored?.cargo ?? []), [stored]);
  const [container, setContainer] = useState<ContainerSpec>(stored?.container ?? defaultContainer);
  const [cargo, setCargo] = useState<CargoItem[]>(startingCargo);
  const [draft, setDraft] = useState<CargoDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<LoadingMode>('boxes');
  const [navSection, setNavSection] = useState<NavSection>('dashboard');
  const [palletRunToken, setPalletRunToken] = useState(0);
  const [result, setResult] = useState<LoadingResult>(() => pendingLoadingResult(stored?.container ?? defaultContainer, startingCargo));
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    stored ? null : { tone: 'info', text: '처음 시작합니다. 컨테이너를 확인한 뒤 본인이 사용할 화물을 등록하세요.' },
  );
  const [isRunning, setIsRunning] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState('');
  const [optimizationProgress, setOptimizationProgress] = useState(0);
  const [optimizationEtaSeconds, setOptimizationEtaSeconds] = useState<number | null>(null);
  const [physicsScore, setPhysicsScore] = useState<number | null>(null);
  const [physicsStrategy, setPhysicsStrategy] = useState<LoadingStrategy | null>(null);
  const optimizationStartedAt = useRef<number | null>(null);
  const loadingRun = useRef(createLatestInputRun());
  useEffect(() => () => loadingRun.current.cancel(), []);
  const [strategy, setStrategy] = useState(readLoadingStrategyPreference);
  const [palletScene, setPalletScene] = useState<PalletViewerScene | null>(null);
  const workflowPreview = useWorkflowPreview();
  const palletType = resolvePalletType(usePalletTypeSelection());
  const inputKey = JSON.stringify({ container, cargo, mode, strategy, preview: workflowPreview?.key, pallet: mode === 'boxes' ? null : palletType.id });
  const currentInputKey = useRef(inputKey);
  currentInputKey.current = inputKey;
  const previousInputKey = useRef<string | null>(null);
  const restoreInput = useRef<StoredState | null>(null);
  const liveInputs = useRef({ container, cargo, result });
  liveInputs.current = { container, cargo, result };
  const floorPreview = useMemo(() => createWorkflowFloorPreview(container, workflowPreview?.cargo ?? cargo), [container, workflowPreview, cargo]);
  const guidedWorkflowState = useGuidedWorkflowState();
  const guidedLoadingUnit = useGuidedLoadingUnit();
  const equipment = useTransportEquipment();
  const equipmentKey = JSON.stringify(equipment);
  const previousEquipmentKey = useRef<string | null>(null);

  const currentPalletScene = mode !== 'boxes' && palletScene?.inputKey === inputKey ? palletScene : null;
  const isPreview = mode === 'boxes' ? result.placements.length === 0 && result.remaining.length === 0 : !currentPalletScene;
  const displayResult = mode === 'boxes' && !isPreview ? result : currentPalletScene?.result ?? floorPreview.result;

  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? result.usedVolumeM3 / totalVolume * 100 : 0;
  const weightRate = container.maxPayloadKg > 0 ? result.loadedWeightKg / container.maxPayloadKg * 100 : 0;
  const waitingCount = useMemo(() => cargo.reduce((sum, item) => sum + item.quantity, 0), [cargo]);
  const quality = useMemo(() => assessWeightBalance(container, result), [container, result]);
  const floorLoad = useMemo(() => analyzeFloorLoad(container, result, 12, 4), [container, result]);
  const constraintChecks = useMemo(() => analyzeConstraints(container, cargo, result, floorLoad), [container, cargo, result, floorLoad]);
  const hasConstraintFailure = constraintChecks.some(check => check.status === 'fail');
  const hasConstraintWarning = constraintChecks.some(check => check.status === 'warn');
  const addresses = useMemo(() => buildPlacementAddresses(result.placements, container.length), [result.placements, container.length]);
  const maxLayer = useMemo(() => addresses.reduce((max, item) => Math.max(max, item?.layer ?? 0), 0), [addresses]);
  const renderViewer = shouldRenderGuidedViewer(guidedWorkflowState);

  const announce = (tone: StatusTone, text: string) => setStatusMessage({ tone, text });
  const invalidatePhysics = () => {
    loadingRun.current.cancel();
    cancelPendingCertification();
    clearLoadSimAcceptance();
    setIsRunning(false);
    setPhysicsScore(null);
    setPhysicsStrategy(null);
    setOptimizationMessage('');
    setOptimizationProgress(0);
    setOptimizationEtaSeconds(null);
    optimizationStartedAt.current = null;
    clearLatestInertiaCertification();
    clearPhysicsTarget();
    if (typeof window !== 'undefined') (window as Window & { __containerLoadingLatestPhysics?: unknown }).__containerLoadingLatestPhysics = undefined;
  };
  const switchMode = (next: LoadingMode) => {
    if (next === mode) return;
    invalidatePhysics();
    setPalletRunToken(0);
    setMode(next);
    announce('info', next === 'boxes' ? '박스 적재 모드로 전환했습니다.' : next === 'mixed' ? '박스 + 팔레트 혼합 적재 모드로 전환했습니다.' : '팔레트 적재 모드로 전환했습니다.');
  };
  const scrollToViewer = () => {
    setNavSection('viewer');
    document.querySelector('.viewer-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const scrollToDashboard = () => {
    setNavSection('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const unchanged = previousEquipmentKey.current === equipmentKey;
    const initial = previousEquipmentKey.current === null;
    previousEquipmentKey.current = equipmentKey;
    if (unchanged) return;
    const sameGeometry = equipmentGeometryMatches(container, equipment);
    if (initial && sameGeometry) return;
    const preservePhysical = sameGeometry && (initial || equipment.id.startsWith('custom-'));
    const next = containerWithEquipment(container, equipment, preservePhysical);
    if (JSON.stringify(next) === JSON.stringify(container)) return;
    invalidatePhysics();
    setContainer(next);
  }, [equipmentKey]);

  useEffect(() => {
    const onApplyEquipment = (event: Event) => {
      const detail = (event as CustomEvent<ApplyTransportEquipmentDetail>).detail;
      if (!detail?.equipment) return;
      // One atomic source change, independent of the count/order of dashboard inputs.
      invalidatePhysics();
      setContainer(current => containerWithEquipment(current, detail.equipment));
      detail.applied = true;
    };
    window.addEventListener(APPLY_TRANSPORT_EQUIPMENT_EVENT, onApplyEquipment);
    return () => window.removeEventListener(APPLY_TRANSPORT_EQUIPMENT_EVENT, onApplyEquipment);
  }, []);

  useEffect(() => {
    if (!guidedWorkflowState.active || !guidedLoadingUnit || guidedLoadingUnit === mode) return;
    invalidatePhysics();
    setPalletRunToken(0);
    setMode(guidedLoadingUnit);
    announce('info', guidedLoadingUnit === 'boxes' ? '박스 직접 적재 유형을 적용했습니다.' : '파렛트 적재 유형을 적용했습니다.');
  }, [guidedWorkflowState.active, guidedLoadingUnit, mode]);

  // Invalidate on input identity, never on workspace navigation or modal visibility.
  // Layout timing prevents a stale plan from flashing after a synchronous edit.
  useLayoutEffect(() => {
    if (previousInputKey.current === inputKey) return;
    previousInputKey.current = inputKey;
    invalidatePhysics();
    setPalletScene(null);
    const restored = restoreInput.current;
    restoreInput.current = null;
    setResult(restored ? restoreLoadingResult(container, cargo.filter(item => item.quantity > 0)) : pendingLoadingResult(container, cargo));
    window.dispatchEvent(new CustomEvent(WORKFLOW_INPUT_INVALIDATED_EVENT));
  }, [inputKey]);

  useEffect(() => {
    const onStrategy = () => {
      const next = readLoadingStrategyPreference();
      if (next === strategy) return;
      invalidatePhysics();
      setStrategy(next);
    };
    const onPreview = () => {
      // Synchronous cancellation closes the gap before React commits new inputs.
      if (readWorkflowPreview()?.key !== workflowPreview?.key) invalidatePhysics();
    };
    const onLoadingUnit = () => {
      const next = readGuidedLoadingUnit();
      if (next && next !== mode) invalidatePhysics();
    };
    window.addEventListener(GUIDED_LOADING_UNIT_EVENT, onLoadingUnit);
    window.addEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, onStrategy);
    window.addEventListener(WORKFLOW_PREVIEW_EVENT, onPreview);
    return () => {
      window.removeEventListener(GUIDED_LOADING_UNIT_EVENT, onLoadingUnit);
      window.removeEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, onStrategy);
      window.removeEventListener(WORKFLOW_PREVIEW_EVENT, onPreview);
    };
  }, [strategy, workflowPreview, mode]);

  useEffect(() => {
    const onStorageUpdated = (event: Event) => {
      const state = (event as CustomEvent<StoredState>).detail ?? readStoredState();
      if (!state) return;
      const normalized = normalizeCargo(state.cargo);
      const sameInput = JSON.stringify({ container: state.container, cargo: normalized }) === JSON.stringify({ container: liveInputs.current.container, cargo: liveInputs.current.cargo });
      if (sameInput) {
        // Report optimizers can explicitly apply a new manual layout for the
        // same cargo; ordinary repeated storage notifications are not edits.
        const manual = readManualOverride(state.container, normalized);
        if (manual && JSON.stringify(manual) !== JSON.stringify(liveInputs.current.result)) {
          invalidatePhysics();
          setResult(restoreLoadingResult(state.container, normalized));
        }
        return;
      }
      setContainer(state.container);
      setCargo(normalized);
      restoreInput.current = { container: state.container, cargo: normalized };
      invalidatePhysics();
      announce('success', '가져온 데이터가 현재 화면에 반영되었습니다.');
      setEditingId(null);
      setDraft(emptyDraft);
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
    return () => window.removeEventListener(STORAGE_UPDATED_EVENT, onStorageUpdated);
  }, []);

  const updateContainer = (field: keyof ContainerSpec, value: string) => {
    invalidatePhysics();
    const optional = ['floorLineLoadKgPerM', 'tareKg', 'doorWidth', 'doorHeight', 'heightLimitM'].includes(field);
    setContainer(current => ({ ...current, [field]: optional && value.trim() === '' ? undefined : Number(value) }));
  };
  const updateDraft = (field: keyof CargoDraft, value: string | boolean) => {
    if (field === 'maxTopLoadKg' && typeof value === 'string' && value.trim() === '') {
      setDraft(current => ({ ...current, maxTopLoadKg: undefined }));
      return;
    }
    const numeric: Array<keyof CargoDraft> = ['length', 'width', 'height', 'weightKg', 'quantity', 'maxStackLayers', 'maxTopLoadKg'];
    setDraft(current => ({ ...current, [field]: numeric.includes(field) ? Number(value) : value }));
  };
  const resetDraft = () => { setDraft(emptyDraft); setEditingId(null); };
  const saveCargo = () => {
    const id = draft.id.trim();
    const name = draft.name.trim();
    const valid = Boolean(id && name)
      && [draft.length, draft.width, draft.height, draft.weightKg].every(value => Number.isFinite(value) && value > 0)
      && Number.isInteger(draft.quantity) && draft.quantity >= 0
      && (draft.maxStackLayers == null || (Number.isInteger(draft.maxStackLayers) && draft.maxStackLayers >= 1))
      && (draft.maxTopLoadKg == null || (Number.isFinite(draft.maxTopLoadKg) && draft.maxTopLoadKg >= 0));
    if (!valid) return announce('error', '박스 코드·이름·치수·중량·수량·적층조건을 확인하세요. 수량은 0 이상의 정수이고 상부 허용중량은 0 이상이어야 합니다.');
    if (!editingId && cargo.some(item => item.id === id)) return announce('error', `이미 등록된 박스 코드입니다: ${id}`);
    const next: CargoItem = {
      ...draft,
      id,
      name,
      quantity: draft.quantity,
      maxStackLayers: draft.maxStackLayers,
      maxTopLoadKg: draft.maxTopLoadKg,
      displayColor: draft.displayColor ?? randomUniqueCargoColor(cargo.map(item => cargoColor(item.id, item.displayColor))),
      allowRotation: draft.allowRotation !== false,
    };
    invalidatePhysics();
    setCargo(items => editingId ? items.map(item => item.id === editingId ? next : item) : [...items, next]);
    announce('success', editingId ? `${id} 수정 완료 · 자동 적재를 다시 실행하세요.` : `${id} 등록 완료 · 자동 적재를 실행하세요.`);
    resetDraft();
  };
  const editCargo = (item: CargoItem) => {
    setEditingId(item.id);
    setDraft({ ...item, maxStackLayers: item.maxStackLayers ?? 7, maxTopLoadKg: item.maxTopLoadKg, allowRotation: item.allowRotation !== false });
  };
  const deleteCargo = (id: string) => {
    invalidatePhysics();
    setCargo(items => items.filter(item => item.id !== id));
    announce('success', `${id} 화물을 삭제했습니다.`);
  };
  const changeQuantity = (id: string, delta: number) => {
    invalidatePhysics();
    setCargo(items => items.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
  };

  const runLoading = async () => {
    if (isRunning) return;
    const invalidContainer = containerInputError(container);
    if (invalidContainer) return announce('error', invalidContainer);
    const preflight = preflightCargoInput(cargo);
    if (preflight.rejected.length > 0) {
      const first = preflight.rejected[0];
      return announce('error', `${first.cargoId}: ${first.reason}${preflight.rejected.length > 1 ? ` 외 ${preflight.rejected.length - 1}건` : ''}`);
    }
    const activeCargo = preflight.cargo;
    if (!activeCargo.length) return announce('warning', '적재할 화물이 없습니다. 본인의 박스 목록에서 화물을 등록하거나 선택하세요.');
    const guidedWorkflowActive = guidedWorkflowState.active;
    const preferredStrategy = guidedWorkflowActive ? readLoadingStrategyPreference() : null;
    if (guidedWorkflowActive && !preferredStrategy) return announce('warning', '적재 방식을 먼저 선택해 주세요.');
    if (mode === 'pallets' || mode === 'mixed') {
      invalidatePhysics();
      setIsRunning(true);
      setOptimizationMessage('팔레트 배치 후보 계산 중…');
      setPalletRunToken(token => token + 1);
      announce('info', mode === 'mixed'
        ? '팔레트 준비 후 A pack으로 박스와 팔레트 강체를 함께 배치합니다.'
        : '팔레트 준비 후 A 적재·정적 규칙 검증을 실행합니다. 물리·관성 검사는 별도입니다.');
      return;
    }
    clearLoadSimAcceptance();
    cancelPendingCertification();
    clearLatestInertiaCertification();
    setIsRunning(true);
    const runInputKey = inputKey;
    const controller = loadingRun.current.start();
    const ownsRun = () => loadingRun.current.owns(controller) && currentInputKey.current === runInputKey;
    setPhysicsScore(null);
    setPhysicsStrategy(null);
    setOptimizationMessage('후보 적재안 생성 중…');
    setOptimizationProgress(0);
    setOptimizationEtaSeconds(null);
    optimizationStartedAt.current = performance.now();
    announce('info', 'A pack 적재 계산 및 정적 규칙 검증 중…');
    try {
      const published = await loadContainerAsync(container, activeCargo, preferredStrategy ?? 'capacity', controller.signal);
      if (!ownsRun()) return;
      publishLoadingResult(container, activeCargo, published);
      setResult(published);
      const target = { mode: 'boxes' as const, container, cargo: activeCargo, result: published };
      const accepted = publishLoadSimAcceptance(target);
      if (!published.placements.length && published.remaining.some(row => row.quantity > 0)) {
        window.dispatchEvent(new CustomEvent(NO_LOAD_RESULT_EVENT, { detail: target }));
      }
      setOptimizationProgress(100);
      setOptimizationEtaSeconds(0);
      setPhysicsScore(null);
      setPhysicsStrategy(null);
      if (accepted.status === 'rejected') {
        announce('error', `A 정적 규칙 위반 ${accepted.validationIssues.length}건 · 위반 내용을 확인하세요. 실제 운송·물리 안전 인증이 아닙니다.`);
      } else {
        announce(published.placements.length ? 'success' : 'warning', published.placements.length
          ? `A 적재 완료 · ${published.placements.length}EA · 정적 규칙 검증 통과. 물리·관성 검사는 별도입니다.`
          : '계산 완료 · 적재 가능한 화물이 없습니다. 미적재 사유를 확인하세요.');
      }
      setOptimizationMessage('');
    } catch (error) {
      if (!ownsRun()) return;
      console.error('A loading failed', error);
      announce('error', '자동 적재 계산을 완료하지 못했습니다. 최종 적재 진행을 다시 눌러 주세요.');
      window.dispatchEvent(new CustomEvent(FINAL_LOADING_WORKFLOW_ERROR_EVENT, { detail: { mode: 'boxes', error: String(error) } }));
      setOptimizationMessage('');
    } finally {
      if (loadingRun.current.finish(controller)) {
        optimizationStartedAt.current = null;
        setIsRunning(false);
      }
    }
  };

  const showResults = () => {
    if (isPreview) { announce('info', '미리보기 단계입니다. 최종 적재를 실행한 뒤 결과를 확인하세요.'); return; }
    openResultsModal({ container, cargo: mode === 'boxes' ? preflightCargoInput(cargo).cargo : cargo, result: displayResult });
  };
  const printReport = () => {
    const opened = mode !== 'boxes'
      ? openPalletLoadingReport(container, cargo)
      : openLoadingReport(container, preflightCargoInput(cargo).cargo, result);
    if (!opened) announce('error', '팝업이 차단되어 작업지시서를 열지 못했습니다.');
  };
  const saveLocal = () => { writeStoredState({ container, cargo }); announce('success', '현재 작업을 저장했습니다.'); };
  const loadLocal = () => {
    const state = readStoredState();
    if (!state) return announce('warning', '저장된 데이터가 없습니다.');
    const normalized = normalizeCargo(state.cargo);
    const sameInput = JSON.stringify({ container: state.container, cargo: normalized }) === JSON.stringify({ container, cargo });
    setContainer(state.container);
    setCargo(normalized);
    restoreInput.current = sameInput ? null : { container: state.container, cargo: normalized };
    if (sameInput) setResult(restoreLoadingResult(state.container, normalized.filter(item => item.quantity > 0)));
    invalidatePhysics();
    announce('success', '저장된 데이터를 불러왔습니다.');
  };
  const resetAll = () => {
    if (!window.confirm('등록된 화물과 저장 데이터를 모두 초기화할까요?')) return;
    setContainer(defaultContainer);
    setCargo([]);
    setResult(pendingLoadingResult(defaultContainer, []));
    localStorage.removeItem(STORAGE_KEY);
    invalidatePhysics();
    announce('success', '현재 작업의 화물 데이터를 모두 초기화했습니다.');
    resetDraft();
  };

  useEffect(() => {
    const onAppAction = (event: Event) => {
      const action = (event as CustomEvent<AppActionDetail>).detail?.action;
      if (!action) return;
      if (action === 'run-loading') { void runLoading(); return; }
      if (action === 'show-results') { showResults(); return; }
      if (action === 'load-local') { loadLocal(); return; }
      if (action === 'save-local') { saveLocal(); return; }
      if (action === 'print-report') { printReport(); return; }
      if (action === 'reset-all') { resetAll(); return; }
      if (action === 'viewer') { scrollToViewer(); return; }
      if (action === 'dashboard') scrollToDashboard();
    };
    window.addEventListener(APP_ACTION_EVENT, onAppAction);
    return () => window.removeEventListener(APP_ACTION_EVENT, onAppAction);
  }, [container, cargo, result, mode, isRunning, navSection, guidedWorkflowState.active, guidedWorkflowState.step, isPreview]);


  const progressLabel = optimizationEtaSeconds === null
    ? '남은 시간 계산 중'
    : optimizationEtaSeconds <= 0
      ? '마무리 중'
      : `약 ${optimizationEtaSeconds}초 남음`;

  return <main className="app-shell mockup-dashboard">
    <header className="topbar mockup-topbar">
      <div className="brand-block"><span className="brand-cube" aria-hidden="true">CL</span><strong>컨테이너 적재 시뮬레이터</strong></div>
      <nav className="main-nav" aria-label="주요 메뉴">
        <button className={`nav-item ${navSection === 'dashboard' ? 'active' : ''}`} onClick={scrollToDashboard}>대시보드</button>
        <button className={`nav-item ${navSection === 'viewer' ? 'active' : ''}`} onClick={scrollToViewer}>3D 보기</button>
        <button className="nav-item" disabled={isPreview} onClick={showResults}>결과 보기</button>
      </nav>
      <WorkspaceTools />
      <div className="top-actions compact">
        <button className="secondary" onClick={loadLocal}>불러오기</button>
        <button className="secondary" onClick={saveLocal}>저장</button>
        <button className="secondary" onClick={printReport}>작업지시서</button>
      </div>
    </header>

    {!stored && cargo.length === 0 && <section className="onboarding-banner" aria-label="처음 사용 안내">
      <div><b>처음 사용하시나요?</b><span>① 컨테이너 규격 확인 → ② 로그인 후 개인 박스 등록/선택 → ③ A 규칙 자동 적재</span></div>
    </section>}

    <section className="dashboard-grid">
      <aside className="dashboard-left">
        <section className="dashboard-card" data-container-spec>
          <h2>1. 컨테이너 정보</h2>
          <div className="static-setting"><span>컨테이너 규격</span><b>40FT High Cube</b><small>현재 단일 규격 · 상세 규격은 아래에서 직접 수정</small></div>
          <div className="spec-list">
            <span>내부 길이 <b>{(container.length * 1000).toLocaleString()} mm</b></span>
            <span>내부 폭 <b>{(container.width * 1000).toLocaleString()} mm</b></span>
            <span>내부 높이 <b>{(container.height * 1000).toLocaleString()} mm</b></span>
            <span>적재 용적 <b>{totalVolume.toFixed(1)} m³</b></span>
            <span>최대 적재중량 <b>{container.maxPayloadKg.toLocaleString()} kg</b></span>
            <span>A 바닥 선하중 <b>{container.floorLineLoadKgPerM == null ? '미입력 · 검사 생략' : `${container.floorLineLoadKgPerM.toLocaleString()} kg/m`}</b></span><small>A 대표 기본값은 실제 장비 제원·규정 검증을 대신하지 않습니다</small>
          </div>
          <details><summary>상세 규격 / 직접 수정</summary><div className="form-grid compact-form">
            <label>길이(m)<input type="number" min="0.01" step="0.01" data-container-field="length" value={container.length} onChange={e => updateContainer('length', e.target.value)} /></label>
            <label>폭(m)<input type="number" min="0.01" step="0.01" data-container-field="width" value={container.width} onChange={e => updateContainer('width', e.target.value)} /></label>
            <label>높이(m)<input type="number" min="0.01" step="0.01" data-container-field="height" value={container.height} onChange={e => updateContainer('height', e.target.value)} /></label>
            <label>최대중량<input type="number" min="1" data-container-field="maxPayloadKg" value={container.maxPayloadKg} onChange={e => updateContainer('maxPayloadKg', e.target.value)} /></label>
            <label>A 바닥 선하중(kg/m)<input type="number" min="1" placeholder="미입력 시 검사 생략" data-container-field="floorLineLoadKgPerM" value={container.floorLineLoadKgPerM ?? ''} onChange={e => updateContainer('floorLineLoadKgPerM', e.target.value)} /></label>
            <label>장비 자중(kg)<input type="number" min="0" placeholder="미입력" data-container-field="tareKg" value={container.tareKg ?? ''} onChange={e => updateContainer('tareKg', e.target.value)} /></label>
            <label>도어 폭(m)<input type="number" min=".01" step=".001" placeholder="미입력" data-container-field="doorWidth" value={container.doorWidth ?? ''} onChange={e => updateContainer('doorWidth', e.target.value)} /></label>
            <label>도어 높이(m)<input type="number" min=".01" step=".001" placeholder="미입력" data-container-field="doorHeight" value={container.doorHeight ?? ''} onChange={e => updateContainer('doorHeight', e.target.value)} /></label>
          </div></details>
        </section>

        <section className="dashboard-card cargo-browser">
          <div className="card-heading-row"><h2>2. 적재할 화물</h2><span>{waitingCount} EA</span></div>
          <div className="mode-tabs">
            <button className={mode === 'boxes' ? 'active' : ''} onClick={() => switchMode('boxes')}>박스</button>
            <button className={mode === 'pallets' ? 'active' : ''} onClick={() => switchMode('pallets')}>팔레트</button>
            <button className={mode === 'mixed' ? 'active' : ''} onClick={() => switchMode('mixed')}>혼합</button>
          </div>
          {cargo.length === 0 ? <div className="empty-cargo"><b>등록된 화물이 없습니다.</b><span>로그인 후 본인의 박스 목록에서 화물을 선택하거나 새 박스를 등록하세요.</span></div> : <div className="cargo-scroll">
            {cargo.map(item => <article className="cargo-list-item" key={item.id} style={{ borderLeft: `3px solid ${cargoColor(item.id, item.displayColor)}`, paddingLeft: 8 }}>
              <div className="cargo-icon" style={{ background: cargoTint(item.id, item.displayColor), color: cargoColor(item.id, item.displayColor), border: `1px solid ${cargoColor(item.id, item.displayColor)}55` }}>■</div>
              <div><b>{item.id} {item.name}</b><span>{Math.round(item.length * 1000)} × {Math.round(item.width * 1000)} × {Math.round(item.height * 1000)} mm</span><small>{item.weightKg} kg · {item.maxTopLoadKg == null ? '상부허용 제한없음' : `상부허용 ${item.maxTopLoadKg} kg`}</small></div>
              <strong>{item.quantity}</strong>
              <div className="cargo-inline-actions">
                <button aria-label={`${item.id} 수량 1 감소`} onClick={() => changeQuantity(item.id, -1)}>−</button>
                <button aria-label={`${item.id} 수량 1 증가`} onClick={() => changeQuantity(item.id, 1)}>＋</button>
                <button onClick={() => editCargo(item)}>수정</button>
                <button onClick={() => deleteCargo(item.id)}>삭제</button>
              </div>
            </article>)}
          </div>}
          <details className="cargo-add-panel" open={Boolean(editingId)}><summary>＋ 새 화물 추가</summary><div className="cargo-form">
            <label>코드<input value={draft.id} onChange={e => updateDraft('id', e.target.value)} disabled={Boolean(editingId)} /></label>
            <label>이름<input value={draft.name} onChange={e => updateDraft('name', e.target.value)} /></label>
            <div className="form-grid">
              <label>길이(m)<input type="number" min="0.01" step="0.01" value={draft.length} onChange={e => updateDraft('length', e.target.value)} /></label>
              <label>폭(m)<input type="number" min="0.01" step="0.01" value={draft.width} onChange={e => updateDraft('width', e.target.value)} /></label>
              <label>높이(m)<input type="number" min="0.01" step="0.01" value={draft.height} onChange={e => updateDraft('height', e.target.value)} /></label>
              <label>중량(kg)<input type="number" min="0.01" step="0.01" value={draft.weightKg} onChange={e => updateDraft('weightKg', e.target.value)} /></label>
              <label>수량<input type="number" min="0" step="1" value={draft.quantity} onChange={e => updateDraft('quantity', e.target.value)} /></label>
              <label>A 최대 배치 단수<input type="number" min="1" step="1" value={draft.maxStackLayers ?? 1} onChange={e => updateDraft('maxStackLayers', e.target.value)} /></label>
              <label>상부 허용중량(kg)<input type="number" min="0" step="0.1" value={draft.maxTopLoadKg ?? ''} placeholder="제한 없음" onChange={e => updateDraft('maxTopLoadKg', e.target.value)} /></label>
              <label><input type="checkbox" checked={draft.allowRotation !== false} onChange={e => updateDraft('allowRotation', e.target.checked)} /> A 허용 방향 회전</label>
              <label><input type="checkbox" checked={draft.thisSideUp === true} onChange={e => updateDraft('thisSideUp', e.target.checked)} /> 천지무용(세워 적재)</label>
            </div>
            <button onClick={saveCargo}>{editingId ? '수정 저장' : '박스 추가'}</button>
          </div></details>
          {statusMessage && <p className={`status-message status-${statusMessage.tone}`} role={statusMessage.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{statusMessage.text}</p>}
        </section>

        <section className="dashboard-card loading-options">
          <h2>3. 적재 옵션</h2>
          <div className="fixed-option-list">
            <span><b>적재 방식</b><em>A pack 단일 적재 방식</em></span>
            <span><b>박스 회전</b><em>품목별 허용 설정 + 자동 방향 선택</em></span>
            <span><b>혼합 적재</b><em>잔량에 대해 자동 허용</em></span>
            <span><b>적재 판정</b><em>A 정적 규칙 · 물리/관성은 별도 선택 검사</em></span>
          </div>
          <small className="setting-note">변경 가능한 설정만 입력 컨트롤로 표시합니다. 고정 동작은 설명으로만 표시합니다.</small>
        </section>
      </aside>

      <section className="dashboard-center">
        {renderViewer && <section className="dashboard-card viewer-card">
          <div className="viewer-host">
            {isRunning && <div className="calculation-overlay" role="status" aria-live="polite">
              <div className="calculation-progress-ring" style={{ background: `conic-gradient(#2563eb ${optimizationProgress}%, #dbe3ee 0)` }}><span>{mode === 'boxes' ? `${Math.round(optimizationProgress)}%` : '…'}</span></div>
              <div className="calculation-progress-copy"><b>{mode === 'boxes' ? 'A 적재 계산 중' : '팔레트 배치 계산 중'}</b><span>{optimizationMessage || '후보 적재안을 만들고 있습니다.'}</span><small>{mode === 'boxes' ? progressLabel : 'A 최종 정적 규칙을 검증합니다'}</small></div>
            </div>}
            <Suspense fallback={<LoadingFallback />}>
              <BoxLoadingViewer container={container} result={displayResult}
                geometry={equipment.geometry} vehicle={equipment.category === 'truck'}
                cargo={isPreview ? workflowPreview?.cargo ?? cargo : cargo} mode={mode} isPreview={isPreview}
                supports={currentPalletScene?.supports} onSupportSelect={currentPalletScene?.onSupportSelect}
                onCargoSelect={currentPalletScene?.onCargoSelect}
                title={isPreview ? (workflowPreview?.kind === 'products' ? '선택 제품 미리보기' : '포장·화물 미리보기') : currentPalletScene?.title ?? '박스 적재 결과'} />
            </Suspense>
            <Suspense fallback={null}>
              {mode !== 'boxes' && <PalletModePanel container={container} cargo={cargo} runToken={palletRunToken} mode={mode} inputKey={inputKey} onSceneChange={setPalletScene} onRunningChange={setIsRunning} />}
            </Suspense>
          </div>
          {isPreview && <div className="workflow-preview-status" role="status" data-preview-kind={workflowPreview?.kind ?? 'cargo'}>{floorPreview.requested === 0 ? '적재공간을 확인하고 제품을 선택하세요' : `미리보기 · ${floorPreview.shown.toLocaleString()} / ${floorPreview.requested.toLocaleString()}개 표시 · 실제 크기의 바닥 배치이며 최종 적재·안전 검증 전입니다`}</div>}
          <div className={`viewer-bottom-actions ${mode !== 'boxes' ? 'pallet-summary-active' : ''}`}>
            <button className="result-open-action" disabled={isPreview} onClick={showResults}>결과 보기</button>
            <PalletFooterSummary active={mode !== 'boxes'} />
            <span>{physicsScore !== null ? `Rapier ${physicsScore}점 · ${physicsStrategy ? strategyLabel(physicsStrategy) : ''}` : 'A 정적 규칙으로 배치합니다. Rapier·관성 검사는 선택 검사이며 실제 운송 안전 인증이 아닙니다.'}</span>
          </div>
        </section>}
      </section>

      <aside className="dashboard-right">
        <section className="dashboard-card viewer-final-action-row" aria-label="주요 작업">
          <h2>주요 작업</h2>
          <button type="button" className="viewer-final-action primary" disabled={isRunning} onClick={() => void runLoading()}>
            {isRunning ? '검사 진행 중…' : '최종 적재 진행'}
          </button>
          <button type="button" className="viewer-final-action report" disabled={isRunning} onClick={printReport}>작업지시서 보기</button>
          <button type="button" className="viewer-final-action reset" disabled={isRunning} onClick={resetAll}>전체 초기화</button>
        </section>

        <section className="dashboard-card summary-card"><h2>4. 적재 요약</h2><div className="summary-metric-grid">
          <div><span>총 부피</span><b>{result.usedVolumeM3.toFixed(1)} / {totalVolume.toFixed(1)} m³</b><small>{fillRate.toFixed(1)}%</small></div>
          <div><span>총 중량</span><b>{result.loadedWeightKg.toLocaleString()} / {container.maxPayloadKg.toLocaleString()} kg</b><small>{weightRate.toFixed(1)}%</small></div>
          <div><span>사용 박스 수</span><b>{result.placements.length} EA</b></div>
          <div><span>물리 안정성</span><b>{physicsScore !== null ? `${physicsScore} 점` : '검증 전'}</b><small>{physicsStrategy ? strategyLabel(physicsStrategy) : `${maxLayer} 층`}</small></div>
        </div><button className={`constraint-ok ${hasConstraintFailure ? 'failure' : hasConstraintWarning ? 'warning' : ''}`} onClick={showResults}>{hasConstraintFailure ? '제약 조건 실패 항목 있음' : hasConstraintWarning ? '현장 확인 항목 있음' : physicsScore !== null ? '물리 최적안 선택 완료' : '제약 조건 모두 만족'}</button></section>

        <section className="dashboard-card constraint-card"><h2>5. 제약 조건 체크</h2><div className="constraint-list">
          {constraintChecks.map(check => <span key={check.id} className={check.status === 'pass' ? 'constraint-pass' : check.status === 'warn' ? 'constraint-warn' : 'constraint-fail'} title={check.detail}><span>{check.label}</span><b>{check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패'}</b></span>)}
        </div></section>

        <section className="dashboard-card quick-card"><h2>6. 빠른 작업</h2>
          <button className="primary-action" onClick={() => void runLoading()} disabled={isRunning}>{isRunning ? 'A 계산 중…' : 'A 자동 적재'}</button>
          {isRunning && mode === 'boxes' && <button type="button" onClick={() => { invalidatePhysics(); announce('info', 'A 적재 계산을 취소했습니다. 미완성 결과는 적용하지 않았습니다.'); }}>A 계산 취소</button>}
          <button className="result-open-action" onClick={showResults} disabled={isRunning || isPreview}>결과 보기</button>
          <div className="quick-row"><button onClick={printReport}>작업 지시서</button><button onClick={saveLocal}>저장</button></div>
          <button className="danger ghost" onClick={resetAll}>전체 초기화</button>
        </section>
      </aside>
    </section>
    <footer className="dashboard-footer">© Container Loading Simulator · v2.6.0 · 운영형 적재 설계 도구</footer>
  </main>;
}
