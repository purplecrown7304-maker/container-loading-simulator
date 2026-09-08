import { lazy, Suspense, useMemo, useRef, useState, type FormEvent } from 'react';
import { isAdminSession, loginAdmin, logoutAdmin } from './adminAccess';
import { cargoColor, cargoTint } from './cargoColors';
import { centerPalletCargo } from './engine/palletCentering';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { validatePlacements } from './engine/constraints';
import { analyzeFloorLoad } from './engine/floorLoad';
import { containerInputError, preflightCargoInput } from './engine/inputPreflight';
import { loadContainer, type LoadingStrategy } from './engine/loadingEngine';
import { defaultPalletSpec, packOnPallets, type OptimizedPalletPackingResult } from './engine/palletOptimization';
import { optimizeLoadingWithPhysics } from './engine/physicsOptimizer';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import EditableEquipmentCard from './EditableEquipmentCard';
import { downloadCargoTemplate, parseCargoWorkbook, type ImportIssue } from './excel';
import { createRandomSampleCargo } from './sampleCargo';
import { normalizeCargo, readStoredState, STORAGE_KEY, writeStoredState } from './storage';
import {
  CONTAINER_EQUIPMENT,
  TRUCK_EQUIPMENT,
  createCustomEquipment,
  findMatchingEquipment,
  selectTransportEquipment,
  useTransportEquipment,
  type TransportCategory,
  type TransportEquipment,
} from './transportEquipment';
import { openBoxWorkOrderV3, openPalletWorkOrderV3, type PalletWorkOrderSnapshot } from './workOrderV3';

const BoxLoadingViewerEquipment = lazy(() => import('./BoxLoadingViewerEquipment'));
const PalletModePanel = lazy(() => import('./PalletModePanel'));

type LoadingMode = 'boxes' | 'pallets';
type ResultTab = 'result' | 'remaining' | 'weight' | 'safety';
type StatusTone = 'info' | 'success' | 'warning' | 'error';
type StatusMessage = { tone: StatusTone; text: string };
type CargoDraft = Omit<CargoItem, 'id'> & { id: string };

const defaultContainer: ContainerSpec = {
  length: 12.032,
  width: 2.35,
  height: 2.7,
  maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
};

const emptyDraft: CargoDraft = {
  id: '',
  name: '',
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
  quantity: 0,
  maxStackLayers: 7,
  maxTopLoadKg: 100,
  allowRotation: true,
};

const STEPS = [
  { id: 1, label: '장비 선택', hint: '컨테이너 또는 트럭' },
  { id: 2, label: '화물 선택', hint: '박스 마스터에서 수량 지정' },
  { id: 3, label: '자동 적재', hint: '3D 적재 계산' },
  { id: 4, label: '결과 확인', hint: '잔량·무게·안전' },
] as const;

const strategyLabel = (strategy: LoadingStrategy) => strategy === 'stability'
  ? '안정성 우선'
  : strategy === 'capacity'
    ? '적재율 우선'
    : '하역 우선';

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

function loadingResultFromPallet(container: ContainerSpec, result: OptimizedPalletPackingResult | null): LoadingResult {
  if (!result) return loadContainer(container, []);
  return {
    placements: result.placements,
    remaining: result.remaining,
    loadedWeightKg: result.totalPalletizedWeightKg,
    usedVolumeM3: result.placements.reduce((sum, item) => sum + item.length * item.width * item.height, 0),
    validationIssues: validatePlacements(container, result.placements),
  };
}

function UxModal({
  open,
  title,
  size = 'sm',
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  size?: 'sm' | 'md';
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return <div className="ux3-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`ux3-modal ux3-modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="ux3-ghost-button" onClick={onClose}>닫기</button></header>
      <div className="ux3-modal-body">{children}</div>
    </section>
  </div>;
}

function ViewerFallback() {
  return <div className="ux3-viewer-fallback"><b>3D 뷰어 준비 중</b><span>적재 결과를 불러오고 있습니다.</span></div>;
}

export default function AppV3() {
  const stored = useMemo(() => readStoredState(), []);
  const startingCargo = useMemo(() => normalizeCargo(stored?.cargo ?? []), [stored]);
  const equipment = useTransportEquipment();

  const [step, setStep] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);
  const [equipmentCategory, setEquipmentCategory] = useState<TransportCategory>(equipment.category);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [container, setContainer] = useState<ContainerSpec>(stored?.container ?? containerFromEquipment(equipment, defaultContainer));
  const [cargo, setCargo] = useState<CargoItem[]>(startingCargo);
  const [cargoSearch, setCargoSearch] = useState('');
  const [mode, setMode] = useState<LoadingMode>('boxes');
  const [boxResult, setBoxResult] = useState<LoadingResult>(() => loadContainer(stored?.container ?? defaultContainer, startingCargo.filter(item => item.quantity > 0)));
  const [palletResult, setPalletResult] = useState<OptimizedPalletPackingResult | null>(null);
  const [palletRunToken, setPalletRunToken] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState('');
  const [physicsScore, setPhysicsScore] = useState<number | null>(null);
  const [physicsStrategy, setPhysicsStrategy] = useState<LoadingStrategy | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('result');
  const [status, setStatus] = useState<StatusMessage | null>(stored ? null : { tone: 'info', text: '장비를 확인하고 화물을 선택한 뒤 자동 적재를 실행하세요.' });

  const [adminMode, setAdminMode] = useState(() => isAdminSession());
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminId, setAdminId] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState('');

  const [cargoEditorOpen, setCargoEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CargoDraft>(emptyDraft);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [importReportOpen, setImportReportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeResult = useMemo(
    () => mode === 'boxes' ? boxResult : loadingResultFromPallet(container, palletResult),
    [mode, boxResult, container, palletResult],
  );
  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? activeResult.usedVolumeM3 / totalVolume * 100 : 0;
  const weightRate = container.maxPayloadKg > 0 ? activeResult.loadedWeightKg / container.maxPayloadKg * 100 : 0;
  const totalQty = useMemo(() => cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0), [cargo]);
  const selectedCargo = useMemo(() => cargo.filter(item => item.quantity > 0), [cargo]);
  const remainingQty = activeResult.remaining.reduce((sum, item) => sum + item.quantity, 0);
  const quality = useMemo(() => assessWeightBalance(container, activeResult), [container, activeResult]);
  const floorLoad = useMemo(() => analyzeFloorLoad(container, activeResult, 12, 4), [container, activeResult]);
  const checks = useMemo(() => analyzeConstraints(container, cargo, activeResult, floorLoad), [container, cargo, activeResult, floorLoad]);
  const hasPhysicalFailure = checks.some(check => check.status === 'fail');
  const hasSafetyWarning = checks.some(check => check.status === 'warn');
  const centerOfGravityWarning = quality.longitudinalDeviationPct > 15
    || quality.lateralDeviationPct > 10
    || quality.verticalCenterPct > 40;

  const equipmentList = useMemo(() => {
    const source = equipmentCategory === 'container' ? CONTAINER_EQUIPMENT : TRUCK_EQUIPMENT;
    const query = equipmentSearch.trim().toLowerCase();
    if (!query) return source;
    return source.filter(item => `${item.name} ${item.shortName}`.toLowerCase().includes(query));
  }, [equipmentCategory, equipmentSearch]);

  const filteredCargo = useMemo(() => {
    const query = cargoSearch.trim().toLowerCase();
    if (!query) return cargo;
    return cargo.filter(item => `${item.id} ${item.name}`.toLowerCase().includes(query));
  }, [cargo, cargoSearch]);

  const goStep = (next: number) => {
    if (next <= furthestStep) setStep(next);
  };
  const advance = (next: number) => {
    setStep(next);
    setFurthestStep(current => Math.max(current, next));
  };
  const announce = (tone: StatusTone, text: string) => setStatus({ tone, text });

  const chooseEquipment = (item: TransportEquipment) => {
    selectTransportEquipment(item);
    setEquipmentCategory(item.category);
    setContainer(current => containerFromEquipment(item, current));
    setPhysicsScore(null);
    setPhysicsStrategy(null);
    setPalletResult(null);
    announce('success', `${item.shortName} 규격을 적용했습니다.`);
  };

  const applyCustomEquipment = () => {
    const invalid = containerInputError(container);
    if (invalid) return announce('error', invalid);
    const item = createCustomEquipment(equipmentCategory, {
      length: container.length,
      width: container.width,
      height: container.height,
      maxPayloadKg: container.maxPayloadKg,
      floorLoadLimitKgPerM2: container.floorLoadLimitKgPerM2 ?? 1500,
    });
    selectTransportEquipment(item);
    announce('success', '사용자 장비 규격을 적용했습니다.');
  };

  const updateContainer = (field: keyof ContainerSpec, value: string) => {
    setContainer(current => ({ ...current, [field]: Number(value) }));
    setPhysicsScore(null);
    setPalletResult(null);
  };

  const changeQuantity = (id: string, delta: number) => {
    setCargo(items => items.map(item => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item));
    setPhysicsScore(null);
    setPalletResult(null);
  };

  const setQuantity = (id: string, value: number) => {
    const next = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    setCargo(items => items.map(item => item.id === id ? { ...item, quantity: next } : item));
    setPhysicsScore(null);
    setPalletResult(null);
  };

  const openNewCargo = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setCargoEditorOpen(true);
  };

  const openEditCargo = (item: CargoItem) => {
    setEditingId(item.id);
    setDraft({ ...item, maxStackLayers: item.maxStackLayers ?? 7, allowRotation: item.allowRotation !== false });
    setCargoEditorOpen(true);
  };

  const updateDraft = (field: keyof CargoDraft, value: string | boolean) => {
    if (field === 'maxTopLoadKg' && typeof value === 'string' && value.trim() === '') {
      setDraft(current => ({ ...current, maxTopLoadKg: undefined }));
      return;
    }
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
    const next: CargoItem = {
      ...draft,
      id,
      name,
      quantity: Math.max(0, Math.floor(draft.quantity)),
      allowRotation: draft.allowRotation !== false,
    };
    setCargo(items => editingId ? items.map(item => item.id === editingId ? next : item) : [...items, next]);
    setCargoEditorOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setPalletResult(null);
    announce('success', editingId ? `${id} 마스터 정보를 수정했습니다.` : `${id} 마스터를 추가했습니다.`);
  };

  const deleteCargoMaster = (id: string) => {
    setCargo(items => items.filter(item => item.id !== id));
    setPalletResult(null);
    announce('success', `${id} 마스터를 삭제했습니다.`);
  };

  const handleExcelFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = await parseCargoWorkbook(file);
      if (!parsed.items.length) {
        setImportIssues(parsed.issues);
        setImportReportOpen(true);
        return announce('error', `등록 가능한 행이 없습니다. 오류 ${parsed.issues.length}건`);
      }
      if (importMode === 'replace') {
        setCargo(normalizeCargo(parsed.items));
      } else {
        setCargo(current => {
          const map = new Map(current.map(item => [item.id, item]));
          parsed.items.forEach(item => map.set(item.id, { ...item, allowRotation: item.allowRotation !== false }));
          return [...map.values()];
        });
      }
      setImportIssues(parsed.issues);
      setImportReportOpen(parsed.issues.length > 0);
      setPalletResult(null);
      announce(parsed.issues.length ? 'warning' : 'success', `Excel ${parsed.items.length}건 반영 · 오류 ${parsed.issues.length}건`);
    } catch {
      setImportIssues([{ row: 0, message: '엑셀 파일을 읽지 못했습니다. 파일 형식 또는 시트를 확인하세요.' }]);
      setImportReportOpen(true);
      announce('error', 'Excel 업로드에 실패했습니다.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveLocal = () => {
    writeStoredState({ container, cargo });
    announce('success', '현재 장비 규격과 박스 마스터/수량을 저장했습니다.');
  };

  const loadLocal = () => {
    const state = readStoredState();
    if (!state) return announce('warning', '저장된 작업이 없습니다.');
    const normalized = normalizeCargo(state.cargo);
    setContainer(state.container);
    setCargo(normalized);
    setBoxResult(loadContainer(state.container, normalized.filter(item => item.quantity > 0)));
    setPalletResult(null);
    setPhysicsScore(null);
    const match = findMatchingEquipment(state.container.length, state.container.width, state.container.height, state.container.maxPayloadKg);
    if (match) {
      selectTransportEquipment(match);
      setEquipmentCategory(match.category);
    }
    setStep(1);
    setFurthestStep(1);
    announce('success', '저장된 작업을 불러왔습니다.');
  };

  const loadSampleData = () => {
    const sample = normalizeCargo(createRandomSampleCargo());
    const nextContainer = containerFromEquipment(CONTAINER_EQUIPMENT.find(item => item.id === '40-high-cube') ?? equipment, defaultContainer);
    setCargo(sample);
    setContainer(nextContainer);
    setBoxResult(loadContainer(nextContainer, sample.filter(item => item.quantity > 0)));
    setPalletResult(null);
    setMode('boxes');
    setPhysicsScore(null);
    announce('info', `샘플 화물 ${sample.length}종을 불러왔습니다.`);
  };

  const resetAll = () => {
    setCargo([]);
    setBoxResult(loadContainer(container, []));
    setPalletResult(null);
    setPhysicsScore(null);
    setPhysicsStrategy(null);
    setStep(1);
    setFurthestStep(1);
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    announce('success', '화물과 저장 작업을 초기화했습니다.');
  };

  const runLoading = async () => {
    if (isRunning) return;
    const invalidContainer = containerInputError(container);
    if (invalidContainer) return announce('error', invalidContainer);
    const preflight = preflightCargoInput(cargo);
    if (preflight.rejected.length) {
      const first = preflight.rejected[0];
      return announce('error', `${first.cargoId}: ${first.reason}${preflight.rejected.length > 1 ? ` 외 ${preflight.rejected.length - 1}건` : ''}`);
    }
    const activeCargo = preflight.cargo;
    if (!activeCargo.length) return announce('warning', '적재 수량이 1개 이상인 화물이 없습니다.');

    setIsRunning(true);
    setOptimizationMessage(mode === 'boxes' ? '후보 적재안을 비교하고 있습니다.' : '팔레트 배치안을 계산하고 있습니다.');
    try {
      if (mode === 'pallets') {
        const packed = centerPalletCargo(packOnPallets(container, activeCargo, defaultPalletSpec), container);
        setPalletResult(packed);
        setPalletRunToken(token => token + 1);
        setPhysicsScore(null);
        setPhysicsStrategy(null);
        announce(packed.remaining.length ? 'warning' : 'success', `팔레트 적재 완료 · ${packed.placements.length}EA 적재 · ${packed.remaining.reduce((sum, item) => sum + item.quantity, 0)}EA 미적재`);
        setResultTab('result');
        advance(4);
        return;
      }

      const optimized = await optimizeLoadingWithPhysics(container, activeCargo, progress => {
        setOptimizationMessage(`후보 ${progress.candidateIndex}/${progress.candidateCount} · ${strategyLabel(progress.strategy)} · 비교 ${Math.round(progress.physicsProgress * 100)}%`);
      });
      const published = loadContainer(container, activeCargo, { strategy: optimized.strategy });
      setBoxResult(published);
      setPhysicsScore(optimized.physics.score);
      setPhysicsStrategy(optimized.strategy);
      announce(published.remaining.length ? 'warning' : 'success', `자동 적재 완료 · ${published.placements.length}EA 적재 · ${published.remaining.reduce((sum, item) => sum + item.quantity, 0)}EA 미적재`);
      setResultTab('result');
      advance(4);
    } catch (error) {
      console.error('UX v3 loading optimization failed', error);
      const fallback = loadContainer(container, activeCargo, { strategy: 'stability' });
      setBoxResult(fallback);
      setPhysicsScore(null);
      setPhysicsStrategy('stability');
      announce('warning', '물리 비교 과정에 오류가 있어 기본 안정성 적재안을 사용했습니다. 무게중심 평가는 경고로 표시하며 적재 결과는 유지합니다.');
      setResultTab('safety');
      advance(4);
    } finally {
      setOptimizationMessage('');
      setIsRunning(false);
    }
  };

  const openWorkOrder = () => {
    const opened = mode === 'boxes'
      ? openBoxWorkOrderV3(container, cargo, boxResult)
      : openPalletWorkOrderV3(container, cargo, palletResult ? { spec: defaultPalletSpec, result: palletResult } satisfies PalletWorkOrderSnapshot : null);
    if (!opened) announce('error', '팝업이 차단되어 작업지시서를 열지 못했습니다.');
  };

  const submitAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (adminBusy) return;
    setAdminBusy(true);
    setAdminError('');
    try {
      const ok = await loginAdmin(adminId, adminPassword);
      if (!ok) {
        setAdminError('관리자 ID 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      setAdminMode(true);
      setAdminPassword('');
      setAdminLoginOpen(false);
      announce('success', '관리자 모드를 켰습니다.');
    } finally {
      setAdminBusy(false);
    }
  };

  const signOutAdmin = () => {
    logoutAdmin();
    setAdminMode(false);
    setCargoEditorOpen(false);
    announce('info', '관리자 모드를 종료했습니다.');
  };

  const stepPrimary = () => {
    if (step === 1) return <button className="ux3-primary-button" type="button" onClick={() => advance(2)}>화물 선택으로</button>;
    if (step === 2) return <button className="ux3-primary-button" type="button" disabled={totalQty <= 0} onClick={() => advance(3)}>자동 적재로</button>;
    if (step === 3) return <button className="ux3-primary-button" type="button" disabled={isRunning || totalQty <= 0} onClick={() => void runLoading()}>{isRunning ? '적재 계산 중…' : '자동 적재 실행'}</button>;
    return <button className="ux3-primary-button" type="button" onClick={openWorkOrder}>작업지시서 열기</button>;
  };

  return <main className="ux3-app-shell">
    <header className="ux3-header">
      <div className="ux3-brand"><span className="ux3-brand-mark">CL</span><div><strong>컨테이너 적재 시뮬레이터</strong><small>UX v3 · 장비 → 화물 → 자동 적재 → 결과</small></div></div>
      <div className="ux3-header-actions">
        <button type="button" className="ux3-secondary-button" onClick={loadLocal}>불러오기</button>
        <button type="button" className="ux3-secondary-button" onClick={saveLocal}>저장</button>
        {adminMode
          ? <button type="button" className="ux3-secondary-button" onClick={signOutAdmin}>관리자 로그아웃</button>
          : <button type="button" className="ux3-secondary-button" onClick={() => { setAdminError(''); setAdminLoginOpen(true); }}>관리자</button>}
      </div>
    </header>

    <div className="ux3-workspace">
      <aside className="ux3-sidebar" aria-label="작업 단계">
        <div className="ux3-step-list">
          {STEPS.map(item => {
            const active = step === item.id;
            const enabled = item.id <= furthestStep;
            return <button key={item.id} type="button" className={`ux3-step ${active ? 'active' : ''} ${enabled ? '' : 'locked'}`} disabled={!enabled} onClick={() => goStep(item.id)}>
              <span className="ux3-step-number">{item.id}</span><span><b>{item.label}</b><small>{item.hint}</small></span>{item.id < step || item.id < furthestStep ? <em>✓</em> : null}
            </button>;
          })}
        </div>
        <section className="ux3-current-job">
          <h2>현재 작업</h2>
          <dl>
            <div><dt>장비</dt><dd>{equipment.shortName}</dd></div>
            <div><dt>적재 방식</dt><dd>{mode === 'boxes' ? '박스 직접 적재' : '팔레트 적재'}</dd></div>
            <div><dt>품목</dt><dd>{selectedCargo.length}종</dd></div>
            <div><dt>요청</dt><dd>{totalQty} EA</dd></div>
            <div><dt>현재 적재</dt><dd>{activeResult.placements.length} EA</dd></div>
          </dl>
          <button className="ux3-ghost-button ux3-danger-text" type="button" onClick={resetAll}>전체 초기화</button>
        </section>
      </aside>

      <section className="ux3-content">
        {status && <div className={`ux3-status ux3-status-${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</div>}

        {step === 1 && <section className="ux3-step-page">
          <div className="ux3-page-heading"><div><span>STEP 1</span><h1>운송 장비를 선택하세요</h1><p>장비를 바꿔도 박스 마스터와 적재수량은 그대로 유지됩니다.</p></div><div className="ux3-segmented"><button type="button" className={equipmentCategory === 'container' ? 'active' : ''} onClick={() => setEquipmentCategory('container')}>컨테이너</button><button type="button" className={equipmentCategory === 'truck' ? 'active' : ''} onClick={() => setEquipmentCategory('truck')}>트럭</button></div></div>
          <div className="ux3-search-row"><input aria-label="장비 검색" placeholder="장비 이름 검색" value={equipmentSearch} onChange={event => setEquipmentSearch(event.target.value)} /></div>
          <div className="ux3-equipment-grid">
            {equipmentList.map(item => <EditableEquipmentCard key={item.id} item={item} active={equipment.id === item.id} onSelect={chooseEquipment} onMessage={message => announce('info', message)} />)}
          </div>
          <details className="ux3-details"><summary>사용자 규격 직접 입력</summary><div className="ux3-form-grid">
            <label>내부 길이(m)<input type="number" min="0.1" step="0.01" value={container.length} onChange={event => updateContainer('length', event.target.value)} /></label>
            <label>내부 폭(m)<input type="number" min="0.1" step="0.01" value={container.width} onChange={event => updateContainer('width', event.target.value)} /></label>
            <label>내부 높이(m)<input type="number" min="0.1" step="0.01" value={container.height} onChange={event => updateContainer('height', event.target.value)} /></label>
            <label>최대 적재중량(kg)<input type="number" min="1" step="100" value={container.maxPayloadKg} onChange={event => updateContainer('maxPayloadKg', event.target.value)} /></label>
            <label>바닥 허용하중(kg/m²)<input type="number" min="1" step="100" value={container.floorLoadLimitKgPerM2 ?? 1500} onChange={event => updateContainer('floorLoadLimitKgPerM2', event.target.value)} /></label>
            <label>국부하중 경고배수<input type="number" min="0.1" step="0.1" value={container.floorLoadWarningMultiplier ?? 3} onChange={event => updateContainer('floorLoadWarningMultiplier', event.target.value)} /></label>
          </div><button type="button" className="ux3-secondary-button" onClick={applyCustomEquipment}>사용자 규격 적용</button></details>
        </section>}

        {step === 2 && <section className="ux3-step-page ux3-cargo-page">
          <div className="ux3-page-heading"><div><span>STEP 2</span><h1>화물을 선택하세요</h1><p>왼쪽은 박스 마스터, 오른쪽은 이번 적재 목록입니다. 이제 둘을 한 덩어리로 섞어놓는 고대 유물식 UI는 끝이다.</p></div><div className="ux3-segmented"><button type="button" className={mode === 'boxes' ? 'active' : ''} onClick={() => { setMode('boxes'); setPalletResult(null); }}>박스 직접</button><button type="button" className={mode === 'pallets' ? 'active' : ''} onClick={() => { setMode('pallets'); setPalletResult(null); }}>팔레트</button></div></div>
          <div className="ux3-cargo-columns">
            <section className="ux3-card ux3-master-panel">
              <div className="ux3-card-head"><div><h2>박스 마스터</h2><span>{cargo.length}종 등록</span></div>{adminMode && <div className="ux3-inline-actions"><button type="button" className="ux3-secondary-button" onClick={openNewCargo}>신규 등록</button><button type="button" className="ux3-secondary-button" onClick={() => fileInputRef.current?.click()}>Excel 등록</button></div>}</div>
              {adminMode && <div className="ux3-import-tools"><select aria-label="Excel 반영 방식" value={importMode} onChange={event => setImportMode(event.target.value as 'replace' | 'merge')}><option value="merge">기존 마스터와 병합</option><option value="replace">전체 교체</option></select><button type="button" className="ux3-ghost-button" onClick={downloadCargoTemplate}>Excel 양식</button><input ref={fileInputRef} className="ux3-hidden-input" type="file" accept=".xlsx,.xls" onChange={event => void handleExcelFile(event.target.files?.[0])} /></div>}
              <input className="ux3-search-input" aria-label="박스 마스터 검색" placeholder="코드 또는 이름 검색" value={cargoSearch} onChange={event => setCargoSearch(event.target.value)} />
              {filteredCargo.length ? <div className="ux3-master-list">{filteredCargo.map(item => <article className="ux3-master-item" key={item.id}>
                <i style={{ background: cargoColor(item.id) }} /><div className="ux3-master-copy"><b>{item.id} · {item.name}</b><span>{Math.round(item.length * 1000)} × {Math.round(item.width * 1000)} × {Math.round(item.height * 1000)} mm</span><small>{item.weightKg}kg · 최대 {item.maxStackLayers ?? '-'}단 · 상부 {item.maxTopLoadKg == null ? '제한없음' : `${item.maxTopLoadKg}kg`}</small></div><button type="button" className="ux3-add-qty" aria-label={`${item.id} 적재 수량 추가`} onClick={() => changeQuantity(item.id, 1)}>＋</button>{adminMode && <div className="ux3-admin-item-actions"><button type="button" onClick={() => openEditCargo(item)}>수정</button><button type="button" onClick={() => deleteCargoMaster(item.id)}>삭제</button></div>}
              </article>)}</div> : <div className="ux3-empty"><b>등록된 마스터가 없습니다.</b><span>{adminMode ? '신규 등록 또는 Excel 등록을 사용하세요.' : '관리자가 박스 마스터를 등록해야 합니다.'}</span>{adminMode && <button type="button" className="ux3-secondary-button" onClick={loadSampleData}>샘플 마스터 만들기</button>}</div>}
            </section>

            <section className="ux3-card ux3-selected-panel">
              <div className="ux3-card-head"><div><h2>이번 적재 목록</h2><span>{selectedCargo.length}종 · {totalQty}EA</span></div></div>
              {selectedCargo.length ? <div className="ux3-selected-list">{selectedCargo.map(item => <article className="ux3-selected-item" key={item.id} style={{ borderLeftColor: cargoColor(item.id), background: cargoTint(item.id) }}><div><b>{item.id} · {item.name}</b><span>{item.weightKg}kg/EA · 합계 {(item.weightKg * item.quantity).toLocaleString()}kg</span></div><div className="ux3-qty-control"><button type="button" onClick={() => changeQuantity(item.id, -1)}>−</button><input aria-label={`${item.id} 적재 수량`} type="number" min="0" step="1" value={item.quantity} onChange={event => setQuantity(item.id, Number(event.target.value))} /><button type="button" onClick={() => changeQuantity(item.id, 1)}>＋</button></div><button type="button" className="ux3-ghost-button ux3-danger-text" onClick={() => setQuantity(item.id, 0)}>제외</button></article>)}</div> : <div className="ux3-empty"><b>이번 적재 목록이 비어 있습니다.</b><span>왼쪽 마스터에서 ＋ 버튼으로 수량을 추가하세요.</span>{cargo.length === 0 && <button type="button" className="ux3-secondary-button" onClick={loadSampleData}>샘플 복원</button>}</div>}
              <div className="ux3-selected-summary"><span>요청수량 <b>{totalQty} EA</b></span><span>예상 중량 <b>{selectedCargo.reduce((sum, item) => sum + item.weightKg * item.quantity, 0).toLocaleString()} kg</b></span></div>
            </section>
          </div>
        </section>}

        {step === 3 && <section className="ux3-step-page ux3-loading-page">
          <div className="ux3-page-heading"><div><span>STEP 3</span><h1>자동 적재</h1><p>무게중심은 적재 차단 조건이 아니라 품질 경고입니다. 물리 안전 한도 안에서 가능한 화물은 계속 채웁니다.</p></div><div className="ux3-loading-meta"><span>{mode === 'boxes' ? 'DIRECT BOX' : 'PALLET'}</span><b>{totalQty} EA 요청</b></div></div>
          <section className="ux3-viewer-card">
            {isRunning && <div className="ux3-progress-overlay"><span className="ux3-spinner" /><b>최적 적재 계산 중</b><p>{optimizationMessage || '적재 후보를 비교하고 있습니다.'}</p></div>}
            <div className="ux3-viewer-host">
              <Suspense fallback={<ViewerFallback />}>
                {mode === 'boxes'
                  ? <BoxLoadingViewerEquipment result={boxResult} container={container} />
                  : <PalletModePanel container={container} cargo={cargo} runToken={palletRunToken} />}
              </Suspense>
            </div>
          </section>
          <div className="ux3-loading-note"><b>3D 조작</b><span>뷰어 상단의 전체/상단/측면/문 방향, 박스 정보, 무게 분포 컨트롤을 사용하세요.</span></div>
        </section>}

        {step === 4 && <section className="ux3-step-page ux3-result-page">
          <div className="ux3-page-heading"><div><span>STEP 4</span><h1>적재 결과</h1><p>경고는 숨기지 않되 작업지시서 발급 자체는 막지 않습니다. 안전 실패가 있으면 작업 전 반드시 현장 검토하세요.</p></div><div className={`ux3-result-grade ${hasPhysicalFailure ? 'danger' : centerOfGravityWarning || hasSafetyWarning ? 'warning' : 'success'}`}><span>적재 품질</span><b>{quality.grade}</b></div></div>
          <div className="ux3-result-tabs" role="tablist">
            <button type="button" className={resultTab === 'result' ? 'active' : ''} onClick={() => setResultTab('result')}>적재 결과</button>
            <button type="button" className={resultTab === 'remaining' ? 'active' : ''} onClick={() => setResultTab('remaining')}>미적재 <span>{remainingQty}</span></button>
            <button type="button" className={resultTab === 'weight' ? 'active' : ''} onClick={() => setResultTab('weight')}>무게 분포</button>
            <button type="button" className={resultTab === 'safety' ? 'active' : ''} onClick={() => setResultTab('safety')}>안전 검사</button>
          </div>

          {resultTab === 'result' && <div className="ux3-result-grid">
            <section className="ux3-card ux3-metric-card"><span>요청</span><b>{totalQty} EA</b><small>{selectedCargo.length}종</small></section>
            <section className="ux3-card ux3-metric-card"><span>적재</span><b>{activeResult.placements.length} EA</b><small>{totalQty > 0 ? (activeResult.placements.length / totalQty * 100).toFixed(1) : '0.0'}%</small></section>
            <section className="ux3-card ux3-metric-card"><span>미적재</span><b>{remainingQty} EA</b><small>{activeResult.remaining.length ? '사유 탭 확인' : '잔량 없음'}</small></section>
            <section className="ux3-card ux3-metric-card"><span>적재 중량</span><b>{activeResult.loadedWeightKg.toLocaleString()} kg</b><small>{weightRate.toFixed(1)}% / 최대중량</small></section>
            <section className="ux3-card ux3-metric-card"><span>사용 용적</span><b>{activeResult.usedVolumeM3.toFixed(1)} m³</b><small>{fillRate.toFixed(1)}% / {totalVolume.toFixed(1)}m³</small></section>
            <section className="ux3-card ux3-metric-card"><span>무게중심 품질</span><b>{quality.loadingQualityScore.toFixed(0)} 점</b><small>등급 {quality.grade} · 차단 조건 아님</small></section>
            <section className="ux3-card ux3-result-wide"><h2>현재 판정</h2><div className="ux3-result-callouts">{hasPhysicalFailure && <div className="danger"><b>안전 실패 항목 있음</b><span>작업지시서는 생성되지만 실제 적재 전에 안전 검사 탭의 실패 항목을 해결해야 합니다.</span></div>}{!hasPhysicalFailure && (centerOfGravityWarning || hasSafetyWarning) && <div className="warning"><b>경고 항목 있음</b><span>무게중심·분포·현장 확인 항목은 경고로 표시되며 적재 결과와 작업지시서를 차단하지 않습니다.</span></div>}{!hasPhysicalFailure && !centerOfGravityWarning && !hasSafetyWarning && <div className="success"><b>주요 검사 양호</b><span>현재 계산 결과에서 즉시 확인할 실패/경고 항목이 없습니다.</span></div>}</div></section>
          </div>}

          {resultTab === 'remaining' && <section className="ux3-card ux3-result-panel"><div className="ux3-card-head"><div><h2>미적재 화물</h2><span>엔진이 반환한 사유를 그대로 표시합니다.</span></div></div>{activeResult.remaining.length ? <div className="ux3-remaining-list">{activeResult.remaining.map((item, index) => <article key={`${item.cargoId}-${index}`}><div><b>{item.cargoId}</b><span>{cargo.find(c => c.id === item.cargoId)?.name ?? ''}</span></div><strong>{item.quantity} EA</strong><p>{item.reason}</p></article>)}</div> : <div className="ux3-empty ux3-empty-success"><b>미적재 화물이 없습니다.</b><span>요청 수량이 모두 적재되었습니다.</span></div>}</section>}

          {resultTab === 'weight' && <div className="ux3-weight-layout"><section className="ux3-card ux3-weight-score"><div><span>무게중심</span><b>X {quality.centerOfGravity.x.toFixed(2)}m · Y {quality.centerOfGravity.y.toFixed(2)}m · Z {quality.centerOfGravity.z.toFixed(2)}m</b></div><div className="ux3-weight-bars"><label>앞뒤 중앙 편차 <b>{quality.longitudinalDeviationPct.toFixed(1)}%</b><span><i style={{ width: `${Math.min(100, quality.longitudinalDeviationPct)}%` }} /></span></label><label>좌우 중앙 편차 <b>{quality.lateralDeviationPct.toFixed(1)}%</b><span><i style={{ width: `${Math.min(100, quality.lateralDeviationPct)}%` }} /></span></label><label>무게중심 높이 <b>{quality.verticalCenterPct.toFixed(1)}%</b><span><i style={{ width: `${Math.min(100, quality.verticalCenterPct)}%` }} /></span></label></div></section><section className="ux3-card ux3-weight-messages"><h2>평가 메모</h2>{quality.messages.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}<div className={`ux3-advisory ${centerOfGravityWarning ? 'warning' : 'success'}`}><b>{centerOfGravityWarning ? '무게중심 경고' : '무게중심 양호'}</b><span>이 평가는 품질/경고 항목이며 적재 중단 또는 작업지시서 발급 차단 조건이 아닙니다.</span></div></section></div>}

          {resultTab === 'safety' && <section className="ux3-card ux3-result-panel"><div className="ux3-card-head"><div><h2>안전 검사</h2><span>물리 한도 위반은 별도 표시하고, 무게중심·관성 평가는 경고로 분리합니다.</span></div></div><div className="ux3-safety-list">{checks.map(check => <article key={check.id} className={`ux3-safety-${check.status}`}><span className="ux3-safety-icon">{check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '×'}</span><div><b>{check.label}</b><p>{check.detail}</p></div><strong>{check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패'}</strong></article>)}<article className={centerOfGravityWarning ? 'ux3-safety-warn' : 'ux3-safety-pass'}><span className="ux3-safety-icon">{centerOfGravityWarning ? '!' : '✓'}</span><div><b>컨테이너 무게중심</b><p>앞뒤 {quality.longitudinalDeviationPct.toFixed(1)}% · 좌우 {quality.lateralDeviationPct.toFixed(1)}% · 높이 {quality.verticalCenterPct.toFixed(1)}% · 경고여도 적재/지시서 차단 없음</p></div><strong>{centerOfGravityWarning ? '경고' : '양호'}</strong></article><article className="ux3-safety-warn"><span className="ux3-safety-icon">i</span><div><b>관성 평가</b><p>{mode === 'boxes' && physicsScore !== null ? `후보 비교 점수 ${physicsScore}점 · ${physicsStrategy ? strategyLabel(physicsStrategy) : '전략 정보 없음'}` : '별도 현장 확인 항목 · 작업지시서 생성 자체를 차단하지 않음'}</p></div><strong>참고</strong></article></div></section>}
        </section>}
      </section>

      <aside className="ux3-summary-panel">
        <section><span>장비</span><b>{equipment.shortName}</b><small>{container.length.toFixed(2)} × {container.width.toFixed(2)} × {container.height.toFixed(2)} m</small></section>
        <section><span>화물</span><b>{totalQty} EA</b><small>{selectedCargo.length}종 선택</small></section>
        <section><span>현재 결과</span><b>{activeResult.placements.length} EA 적재</b><small>{remainingQty} EA 미적재</small></section>
        <section><span>용적 / 중량</span><b>{fillRate.toFixed(1)}% / {weightRate.toFixed(1)}%</b><small>{activeResult.loadedWeightKg.toLocaleString()} kg</small></section>
        <section className={`ux3-summary-status ${hasPhysicalFailure ? 'danger' : centerOfGravityWarning || hasSafetyWarning ? 'warning' : 'success'}`}><span>판정</span><b>{hasPhysicalFailure ? '안전 실패 확인' : centerOfGravityWarning || hasSafetyWarning ? '경고 확인' : '양호'}</b><small>작업지시서 생성은 항상 가능</small></section>
      </aside>
    </div>

    <footer className="ux3-bottom-bar"><div><span>STEP {step} / 4</span><b>{STEPS[step - 1]?.label}</b></div><div className="ux3-bottom-actions">{step > 1 && <button type="button" className="ux3-secondary-button" onClick={() => setStep(step - 1)}>이전</button>}{step === 4 && <button type="button" className="ux3-secondary-button" onClick={() => advance(3)}>3D 다시 보기</button>}{stepPrimary()}</div></footer>

    <UxModal open={adminLoginOpen} title="관리자 로그인" onClose={() => setAdminLoginOpen(false)}>
      <form className="ux3-admin-form" onSubmit={submitAdmin}><p>장비 이미지 수정, 박스 마스터 신규/수정/삭제, Excel 등록 기능을 사용합니다.</p><label>관리자 ID<input autoComplete="username" value={adminId} onChange={event => setAdminId(event.target.value)} /></label><label>비밀번호<input type="password" autoComplete="current-password" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} /></label>{adminError && <div className="ux3-form-error">{adminError}</div>}<button type="submit" className="ux3-primary-button" disabled={adminBusy}>{adminBusy ? '확인 중…' : '로그인'}</button></form>
    </UxModal>

    <UxModal open={cargoEditorOpen && adminMode} title={editingId ? '박스 마스터 수정' : '박스 마스터 신규 등록'} size="md" onClose={() => setCargoEditorOpen(false)}>
      <div className="ux3-cargo-editor"><label>코드<input value={draft.id} disabled={Boolean(editingId)} onChange={event => updateDraft('id', event.target.value)} /></label><label>이름<input value={draft.name} onChange={event => updateDraft('name', event.target.value)} /></label><div className="ux3-form-grid"><label>길이(m)<input type="number" min="0.01" step="0.01" value={draft.length} onChange={event => updateDraft('length', event.target.value)} /></label><label>폭(m)<input type="number" min="0.01" step="0.01" value={draft.width} onChange={event => updateDraft('width', event.target.value)} /></label><label>높이(m)<input type="number" min="0.01" step="0.01" value={draft.height} onChange={event => updateDraft('height', event.target.value)} /></label><label>중량(kg)<input type="number" min="0.01" step="0.01" value={draft.weightKg} onChange={event => updateDraft('weightKg', event.target.value)} /></label><label>기본 수량<input type="number" min="0" step="1" value={draft.quantity} onChange={event => updateDraft('quantity', event.target.value)} /></label><label>최대 적층단<input type="number" min="1" step="1" value={draft.maxStackLayers ?? 1} onChange={event => updateDraft('maxStackLayers', event.target.value)} /></label><label>상부 허용중량(kg)<input type="number" min="0" step="0.1" value={draft.maxTopLoadKg ?? ''} placeholder="제한 없음" onChange={event => updateDraft('maxTopLoadKg', event.target.value)} /></label><label className="ux3-checkbox"><input type="checkbox" checked={draft.allowRotation !== false} onChange={event => updateDraft('allowRotation', event.target.checked)} /> 회전 허용</label></div><div className="ux3-modal-actions"><button type="button" className="ux3-secondary-button" onClick={() => setCargoEditorOpen(false)}>취소</button><button type="button" className="ux3-primary-button" onClick={saveCargoMaster}>{editingId ? '수정 저장' : '등록'}</button></div></div>
    </UxModal>

    <UxModal open={importReportOpen} title="Excel 등록 결과" size="md" onClose={() => setImportReportOpen(false)}>
      {importIssues.length ? <div className="ux3-import-issues">{importIssues.map((issue, index) => <article key={`${issue.row}-${index}`}><b>{issue.row > 0 ? `${issue.row}행` : '파일 오류'}</b><span>{issue.code ? `[${issue.code}] ` : ''}{issue.message}</span></article>)}</div> : <div className="ux3-empty ux3-empty-success"><b>오류 없이 반영했습니다.</b></div>}
    </UxModal>
  </main>;
}
