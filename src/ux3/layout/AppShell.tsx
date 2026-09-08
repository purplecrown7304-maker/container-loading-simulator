import { useMemo, useState, type FormEvent } from 'react';
import { isAdminSession, loginAdmin, logoutAdmin } from '../../adminAccess';
import { analyzeConstraints } from '../../engine/constraintAnalysis';
import { validatePlacements } from '../../engine/constraints';
import { analyzeFloorLoad } from '../../engine/floorLoad';
import { containerInputError, preflightCargoInput } from '../../engine/inputPreflight';
import { loadContainer } from '../../engine/loadingEngine';
import { centerPalletCargo } from '../../engine/palletCentering';
import { defaultPalletSpec, packOnPallets, type OptimizedPalletPackingResult } from '../../engine/palletOptimization';
import { optimizeLoadingWithPhysics } from '../../engine/physicsOptimizer';
import type { CargoItem, ContainerSpec, LoadingResult } from '../../engine/types';
import { assessWeightBalance } from '../../engine/weightBalance';
import { downloadCargoTemplate, parseCargoWorkbook, type ImportIssue } from '../../excel';
import { createRandomSampleCargo } from '../../sampleCargo';
import { normalizeCargo, readStoredState, STORAGE_KEY, writeStoredState } from '../../storage';
import {
  CONTAINER_EQUIPMENT,
  TRUCK_EQUIPMENT,
  createCustomEquipment,
  findMatchingEquipment,
  selectTransportEquipment,
  useTransportEquipment,
  type TransportCategory,
  type TransportEquipment,
} from '../../transportEquipment';
import { openBoxWorkOrderV3, openPalletWorkOrderV3 } from '../../workOrderV3';
import AdminLoginModal from '../admin/AdminLoginModal';
import CargoEditorModal, { EMPTY_CARGO_DRAFT, type CargoDraft } from '../cargo/CargoEditorModal';
import CargoStep from '../cargo/CargoStep';
import EquipmentStep from '../equipment/EquipmentStep';
import LoadingStep from '../loading/LoadingStep';
import ResultStep from '../results/ResultStep';
import Modal from '../shared/Modal';
import type { LoadingMode, PalletResult, PhysicsSummary, ResultTab, StatusMessage, WorkflowStep } from '../types';
import AppHeader from './AppHeader';
import BottomActionBar from './BottomActionBar';
import JobSummaryPanel from './JobSummaryPanel';
import WorkflowSidebar from './WorkflowSidebar';

const defaultContainer: ContainerSpec = {
  length: 12.032,
  width: 2.35,
  height: 2.7,
  maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
};

function containerFromEquipment(item: TransportEquipment, previous?: ContainerSpec): ContainerSpec {
  return {
    length: item.length,
    width: item.width,
    height: item.height,
    maxPayloadKg: item.maxPayloadKg,
    floorLoadLimitKgPerM2: item.floorLoadLimitKgPerM2,
    floorLoadWarningMultiplier: previous?.floorLoadWarningMultiplier ?? 3,
  };
}

function emptyResult(container: ContainerSpec): LoadingResult {
  return loadContainer(container, [], { strategy: 'capacity', publish: false });
}

function palletAsLoadingResult(container: ContainerSpec, result: OptimizedPalletPackingResult | null): LoadingResult {
  if (!result) return emptyResult(container);
  return {
    placements: result.placements,
    remaining: result.remaining,
    loadedWeightKg: result.totalPalletizedWeightKg,
    usedVolumeM3: result.placements.reduce((sum, item) => sum + item.length * item.width * item.height, 0),
    validationIssues: validatePlacements(container, result.placements),
  };
}

export default function AppShell() {
  const stored = useMemo(() => readStoredState(), []);
  const equipment = useTransportEquipment();
  const initialContainer = stored?.container ?? containerFromEquipment(equipment, defaultContainer);
  const initialCargo = useMemo(() => normalizeCargo(stored?.cargo ?? []), [stored]);

  const [step, setStep] = useState<WorkflowStep>(1);
  const [furthestStep, setFurthestStep] = useState<WorkflowStep>(1);
  const [category, setCategory] = useState<TransportCategory>(equipment.category);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [container, setContainer] = useState<ContainerSpec>(initialContainer);
  const [cargo, setCargo] = useState<CargoItem[]>(initialCargo);
  const [cargoSearch, setCargoSearch] = useState('');
  const [mode, setMode] = useState<LoadingMode>('boxes');
  const [boxResult, setBoxResult] = useState<LoadingResult>(() => emptyResult(initialContainer));
  const [palletResult, setPalletResult] = useState<PalletResult>(null);
  const [palletRunToken, setPalletRunToken] = useState(0);
  const [physics, setPhysics] = useState<PhysicsSummary>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('result');
  const [running, setRunning] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [status, setStatus] = useState<StatusMessage | null>(stored ? null : { tone: 'info', text: '장비를 확인하고 화물을 선택한 뒤 자동 적재를 실행하세요.' });

  const [adminMode, setAdminMode] = useState(() => isAdminSession());
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminId, setAdminId] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState('');

  const [cargoEditorOpen, setCargoEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CargoDraft>(EMPTY_CARGO_DRAFT);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [importReportOpen, setImportReportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const selectedCargo = useMemo(() => cargo.filter(item => item.quantity > 0), [cargo]);
  const totalQty = useMemo(() => selectedCargo.reduce((sum, item) => sum + item.quantity, 0), [selectedCargo]);
  const activeResult = useMemo(() => mode === 'boxes' ? boxResult : palletAsLoadingResult(container, palletResult), [mode, boxResult, container, palletResult]);
  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? activeResult.usedVolumeM3 / totalVolume * 100 : 0;
  const weightRate = container.maxPayloadKg > 0 ? activeResult.loadedWeightKg / container.maxPayloadKg * 100 : 0;
  const remainingQty = activeResult.remaining.reduce((sum, item) => sum + item.quantity, 0);
  const quality = useMemo(() => assessWeightBalance(container, activeResult), [container, activeResult]);
  const floorLoad = useMemo(() => analyzeFloorLoad(container, activeResult, 12, 4), [container, activeResult]);
  const checks = useMemo(() => analyzeConstraints(container, cargo, activeResult, floorLoad), [container, cargo, activeResult, floorLoad]);
  const hardFailure = checks.some(check => check.status === 'fail');
  const safetyWarning = checks.some(check => check.status === 'warn');
  const centerOfGravityWarning = quality.longitudinalDeviationPct > 15 || quality.lateralDeviationPct > 10 || quality.verticalCenterPct > 40;
  const hasCompletedResult = furthestStep >= 4;

  const equipmentItems = useMemo(() => {
    const source = category === 'container' ? CONTAINER_EQUIPMENT : TRUCK_EQUIPMENT;
    const query = equipmentSearch.trim().toLowerCase();
    return query ? source.filter(item => `${item.name} ${item.shortName}`.toLowerCase().includes(query)) : source;
  }, [category, equipmentSearch]);
  const filteredCargo = useMemo(() => {
    const query = cargoSearch.trim().toLowerCase();
    return query ? cargo.filter(item => `${item.id} ${item.name}`.toLowerCase().includes(query)) : cargo;
  }, [cargo, cargoSearch]);

  const announce = (tone: StatusMessage['tone'], text: string) => setStatus({ tone, text });
  const goStep = (next: WorkflowStep) => { if (next <= furthestStep) setStep(next); };
  const advance = (next: WorkflowStep) => { setStep(next); setFurthestStep(current => Math.max(current, next) as WorkflowStep); };

  const invalidateEquipmentPlan = (nextContainer: ContainerSpec) => {
    setBoxResult(emptyResult(nextContainer));
    setPalletResult(null);
    setPhysics(null);
    setFurthestStep(1);
  };
  const invalidateCargoPlan = () => {
    setBoxResult(emptyResult(container));
    setPalletResult(null);
    setPhysics(null);
    setFurthestStep(current => Math.min(current, 2) as WorkflowStep);
    if (step > 2) setStep(2);
  };

  const chooseEquipment = (item: TransportEquipment) => {
    const nextContainer = containerFromEquipment(item, container);
    selectTransportEquipment(item);
    setCategory(item.category);
    setContainer(nextContainer);
    invalidateEquipmentPlan(nextContainer);
    announce('success', `${item.shortName} 규격을 적용했습니다.`);
  };

  const updateContainer = (field: keyof ContainerSpec, value: string) => {
    const next = { ...container, [field]: Number(value) };
    setContainer(next);
    invalidateEquipmentPlan(next);
  };

  const applyCustomEquipment = () => {
    const invalid = containerInputError(container);
    if (invalid) return announce('error', invalid);
    const item = createCustomEquipment(category, {
      length: container.length,
      width: container.width,
      height: container.height,
      maxPayloadKg: container.maxPayloadKg,
      floorLoadLimitKgPerM2: container.floorLoadLimitKgPerM2 ?? 1500,
    });
    selectTransportEquipment(item);
    announce('success', '사용자 장비 규격을 적용했습니다.');
  };

  const changeMode = (next: LoadingMode) => {
    if (next === mode) return;
    setMode(next);
    invalidateCargoPlan();
  };
  const changeQuantity = (id: string, delta: number) => {
    setCargo(items => items.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
    invalidateCargoPlan();
  };
  const setQuantity = (id: string, value: number) => {
    const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    setCargo(items => items.map(item => item.id === id ? { ...item, quantity: next } : item));
    invalidateCargoPlan();
  };

  const openNewCargo = () => { setEditingId(null); setDraft(EMPTY_CARGO_DRAFT); setCargoEditorOpen(true); };
  const openEditCargo = (item: CargoItem) => { setEditingId(item.id); setDraft({ ...item, maxStackLayers: item.maxStackLayers ?? 7, allowRotation: item.allowRotation !== false }); setCargoEditorOpen(true); };
  const updateDraft = (field: keyof CargoDraft, value: string | boolean) => {
    if (field === 'maxTopLoadKg' && typeof value === 'string' && value.trim() === '') return setDraft(current => ({ ...current, maxTopLoadKg: undefined }));
    const numeric: Array<keyof CargoDraft> = ['length', 'width', 'height', 'weightKg', 'quantity', 'maxStackLayers', 'maxTopLoadKg'];
    setDraft(current => ({ ...current, [field]: numeric.includes(field) ? Number(value) : value }));
  };
  const saveCargoMaster = () => {
    const id = draft.id.trim();
    const name = draft.name.trim();
    const valid = Boolean(id && name)
      && [draft.length, draft.width, draft.height, draft.weightKg].every(value => Number.isFinite(value) && value > 0)
      && Number.isInteger(draft.quantity) && draft.quantity >= 0
      && (draft.maxStackLayers == null || (Number.isInteger(draft.maxStackLayers) && draft.maxStackLayers >= 1))
      && (draft.maxTopLoadKg == null || (Number.isFinite(draft.maxTopLoadKg) && draft.maxTopLoadKg >= 0));
    if (!valid) return announce('error', '박스 코드·이름·치수·중량·수량·적층조건을 확인하세요.');
    if (!editingId && cargo.some(item => item.id === id)) return announce('error', `이미 등록된 박스 코드입니다: ${id}`);
    const next: CargoItem = { ...draft, id, name, quantity: Math.max(0, Math.floor(draft.quantity)), allowRotation: draft.allowRotation !== false };
    setCargo(items => editingId ? items.map(item => item.id === editingId ? next : item) : [...items, next]);
    setCargoEditorOpen(false);
    setEditingId(null);
    setDraft(EMPTY_CARGO_DRAFT);
    invalidateCargoPlan();
    announce('success', editingId ? `${id} 마스터 정보를 수정했습니다.` : `${id} 마스터를 추가했습니다.`);
  };
  const deleteCargoMaster = (id: string) => { setCargo(items => items.filter(item => item.id !== id)); invalidateCargoPlan(); announce('success', `${id} 마스터를 삭제했습니다.`); };

  const handleExcelFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await parseCargoWorkbook(file);
      if (!parsed.items.length) {
        setImportIssues(parsed.issues);
        setImportReportOpen(true);
        return announce('error', `등록 가능한 행이 없습니다. 오류 ${parsed.issues.length}건`);
      }
      setCargo(current => {
        if (importMode === 'replace') return normalizeCargo(parsed.items);
        const map = new Map(current.map(item => [item.id, item]));
        parsed.items.forEach(item => map.set(item.id, { ...item, allowRotation: item.allowRotation !== false }));
        return [...map.values()];
      });
      setImportIssues(parsed.issues);
      setImportReportOpen(parsed.issues.length > 0);
      invalidateCargoPlan();
      announce(parsed.issues.length ? 'warning' : 'success', `Excel ${parsed.items.length}건 반영 · 오류 ${parsed.issues.length}건`);
    } catch {
      setImportIssues([{ row: 0, message: '엑셀 파일을 읽지 못했습니다. 파일 형식 또는 시트를 확인하세요.' }]);
      setImportReportOpen(true);
      announce('error', 'Excel 업로드에 실패했습니다.');
    }
  };

  const saveLocal = () => { writeStoredState({ container, cargo }); announce('success', '현재 장비 규격과 박스 마스터/적재수량을 저장했습니다.'); };
  const loadLocal = () => {
    const state = readStoredState();
    if (!state) return announce('warning', '저장된 작업이 없습니다.');
    const normalized = normalizeCargo(state.cargo);
    setContainer(state.container);
    setCargo(normalized);
    setBoxResult(emptyResult(state.container));
    setPalletResult(null);
    setPhysics(null);
    const match = findMatchingEquipment(state.container.length, state.container.width, state.container.height, state.container.maxPayloadKg);
    if (match) { selectTransportEquipment(match); setCategory(match.category); }
    setStep(1); setFurthestStep(1);
    announce('success', '저장된 작업을 불러왔습니다. 자동 적재는 다시 실행하세요.');
  };
  const loadSample = () => {
    const sample = normalizeCargo(createRandomSampleCargo());
    const item = CONTAINER_EQUIPMENT.find(candidate => candidate.id === '40-high-cube') ?? equipment;
    const nextContainer = containerFromEquipment(item, defaultContainer);
    selectTransportEquipment(item);
    setCategory(item.category);
    setContainer(nextContainer);
    setCargo(sample);
    setBoxResult(emptyResult(nextContainer));
    setPalletResult(null);
    setPhysics(null);
    setMode('boxes');
    setFurthestStep(current => Math.max(current, 2) as WorkflowStep);
    announce('info', `샘플 화물 ${sample.length}종을 불러왔습니다.`);
  };

  const confirmReset = () => {
    setCargo([]);
    setBoxResult(emptyResult(container));
    setPalletResult(null);
    setPhysics(null);
    setStep(1); setFurthestStep(1);
    localStorage.removeItem(STORAGE_KEY);
    setResetOpen(false);
    announce('success', '화물과 저장 작업을 초기화했습니다.');
  };

  const runLoading = async () => {
    if (running) return;
    const invalidContainer = containerInputError(container);
    if (invalidContainer) return announce('error', invalidContainer);
    const preflight = preflightCargoInput(cargo);
    if (preflight.rejected.length) {
      const first = preflight.rejected[0];
      return announce('error', `${first.cargoId}: ${first.reason}${preflight.rejected.length > 1 ? ` 외 ${preflight.rejected.length - 1}건` : ''}`);
    }
    if (!preflight.cargo.length) return announce('warning', '적재 수량이 1개 이상인 화물이 없습니다.');

    setRunning(true);
    setProgressMessage(mode === 'boxes' ? '후보 적재안을 비교하고 있습니다.' : '팔레트 배치안을 계산하고 있습니다.');
    try {
      if (mode === 'pallets') {
        const packed = centerPalletCargo(packOnPallets(container, preflight.cargo, defaultPalletSpec), container);
        setPalletResult(packed);
        setPalletRunToken(token => token + 1);
        setPhysics(null);
        setResultTab('result');
        announce(packed.remaining.length ? 'warning' : 'success', `팔레트 적재 완료 · ${packed.placements.length}EA 적재 · ${packed.remaining.reduce((sum, item) => sum + item.quantity, 0)}EA 미적재`);
        advance(4);
        return;
      }

      const optimized = await optimizeLoadingWithPhysics(container, preflight.cargo, progress => {
        setProgressMessage(`후보 ${progress.candidateIndex}/${progress.candidateCount} · 물리 비교 ${Math.round(progress.physicsProgress * 100)}%`);
      });
      setBoxResult(optimized.result);
      setPhysics({ score: optimized.physics.score, strategy: optimized.strategy, settled: optimized.physics.settled, unstableCount: optimized.physics.unstableCount, supportUnstableCount: optimized.physics.supportUnstableCount });
      setResultTab('result');
      announce(optimized.result.remaining.length ? 'warning' : 'success', `자동 적재 완료 · ${optimized.result.placements.length}EA 적재 · ${optimized.result.remaining.reduce((sum, item) => sum + item.quantity, 0)}EA 미적재`);
      advance(4);
    } catch (error) {
      console.error('UX v3 loading optimization failed', error);
      const fallback = loadContainer(container, preflight.cargo, { strategy: 'stability', publish: false });
      setBoxResult(fallback);
      setPhysics(null);
      setResultTab('safety');
      announce('warning', '물리 비교 과정에 오류가 있어 안정성 우선 기본 적재안을 유지했습니다. 무게중심은 경고 항목이며 적재 결과는 차단하지 않습니다.');
      advance(4);
    } finally {
      setProgressMessage('');
      setRunning(false);
    }
  };

  const openWorkOrder = () => {
    const opened = mode === 'boxes'
      ? openBoxWorkOrderV3(container, cargo, boxResult)
      : openPalletWorkOrderV3(container, cargo, palletResult ? { spec: defaultPalletSpec, result: palletResult } : null);
    if (!opened) announce('error', '팝업이 차단되어 작업지시서를 열지 못했습니다.');
  };

  const submitAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (adminBusy) return;
    setAdminBusy(true); setAdminError('');
    try {
      const ok = await loginAdmin(adminId, adminPassword);
      if (!ok) return setAdminError('관리자 ID 또는 비밀번호가 올바르지 않습니다.');
      setAdminMode(true); setAdminPassword(''); setAdminLoginOpen(false); announce('success', '관리자 모드를 켰습니다.');
    } finally { setAdminBusy(false); }
  };
  const adminLogout = () => { logoutAdmin(); setAdminMode(false); setCargoEditorOpen(false); announce('info', '관리자 모드를 종료했습니다.'); };

  return <main className="ux3-app-shell">
    <AppHeader adminMode={adminMode} onLoad={loadLocal} onSave={saveLocal} onAdminLogin={() => { setAdminError(''); setAdminLoginOpen(true); }} onAdminLogout={adminLogout} />
    <div className="ux3-workspace">
      <WorkflowSidebar step={step} furthestStep={furthestStep} equipmentName={equipment.shortName} loadingModeLabel={mode === 'boxes' ? '박스 직접 적재' : '팔레트 적재'} selectedKinds={selectedCargo.length} requestedQty={totalQty} loadedQty={activeResult.placements.length} onStep={goStep} onReset={() => setResetOpen(true)} />
      <section className="ux3-content">
        {status && <div className={`ux3-status ux3-status-${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</div>}
        {step === 1 && <EquipmentStep category={category} equipment={equipment} items={equipmentItems} container={container} search={equipmentSearch} onCategory={setCategory} onSearch={setEquipmentSearch} onSelect={chooseEquipment} onContainerField={updateContainer} onApplyCustom={applyCustomEquipment} onMessage={message => announce('info', message)} />}
        {step === 2 && <CargoStep adminMode={adminMode} mode={mode} cargo={cargo} filteredCargo={filteredCargo} selectedCargo={selectedCargo} search={cargoSearch} importMode={importMode} totalQty={totalQty} onMode={changeMode} onSearch={setCargoSearch} onQuantityDelta={changeQuantity} onQuantity={setQuantity} onNewCargo={openNewCargo} onEditCargo={openEditCargo} onDeleteCargo={deleteCargoMaster} onSample={loadSample} onImportMode={setImportMode} onExcelFile={file => void handleExcelFile(file)} onTemplate={downloadCargoTemplate} />}
        {step === 3 && <LoadingStep mode={mode} container={container} cargo={cargo} boxResult={boxResult} palletRunToken={palletRunToken} requestedQty={totalQty} running={running} progressMessage={progressMessage} />}
        {step === 4 && <ResultStep tab={resultTab} result={activeResult} cargo={cargo} requestedQty={totalQty} totalVolume={totalVolume} maxPayloadKg={container.maxPayloadKg} fillRate={fillRate} weightRate={weightRate} quality={quality} checks={checks} hardFailure={hardFailure} safetyWarning={safetyWarning} centerOfGravityWarning={centerOfGravityWarning} physics={physics} onTab={setResultTab} />}
      </section>
      <JobSummaryPanel equipmentName={equipment.shortName} dimensions={`${container.length.toFixed(2)} × ${container.width.toFixed(2)} × ${container.height.toFixed(2)} m`} requestedQty={totalQty} selectedKinds={selectedCargo.length} loadedQty={activeResult.placements.length} remainingQty={remainingQty} fillRate={fillRate} weightRate={weightRate} loadedWeightKg={activeResult.loadedWeightKg} hardFailure={hasCompletedResult && hardFailure} warning={hasCompletedResult && (centerOfGravityWarning || safetyWarning || !physics)} />
    </div>

    <BottomActionBar step={step} requestedQty={totalQty} running={running} onBack={() => setStep((step - 1) as WorkflowStep)} onNext={() => advance((step + 1) as WorkflowStep)} onRun={() => void runLoading()} onWorkOrder={openWorkOrder} onViewer={() => setStep(3)} />
    <AdminLoginModal open={adminLoginOpen} userId={adminId} password={adminPassword} busy={adminBusy} error={adminError} onUserId={setAdminId} onPassword={setAdminPassword} onClose={() => setAdminLoginOpen(false)} onSubmit={submitAdmin} />
    <CargoEditorModal open={cargoEditorOpen && adminMode} editingId={editingId} draft={draft} onClose={() => setCargoEditorOpen(false)} onDraft={updateDraft} onSave={saveCargoMaster} />

    <Modal open={importReportOpen} title="Excel 등록 결과" size="md" onClose={() => setImportReportOpen(false)}>
      {importIssues.length ? <div className="ux3-import-issues">{importIssues.map((issue, index) => <article key={`${issue.row}-${index}`}><b>{issue.row > 0 ? `${issue.row}행` : '파일 오류'}</b><span>{issue.code ? `[${issue.code}] ` : ''}{issue.message}</span></article>)}</div> : <div className="ux3-empty ux3-empty-success"><b>오류 없이 반영했습니다.</b></div>}
    </Modal>
    <Modal open={resetOpen} title="전체 초기화" onClose={() => setResetOpen(false)}>
      <div className="ux3-confirm"><p>등록된 화물 수량과 현재 브라우저 저장 작업을 초기화합니다. 박스 마스터 목록도 비워집니다.</p><div className="ux3-modal-actions"><button type="button" className="ux3-secondary-button" onClick={() => setResetOpen(false)}>취소</button><button type="button" className="ux3-danger-button" onClick={confirmReset}>초기화</button></div></div>
    </Modal>
  </main>;
}
