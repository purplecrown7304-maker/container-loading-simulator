import StudioIcon, { stepIcons } from './StudioIcon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import {
  FINAL_PHYSICS_VALIDATION_ERROR_EVENT,
  NO_LOAD_RESULT_EVENT,
  FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT,
} from './autoCertification';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { LOADING_RESULT_EVENT, type LoadingStrategy } from './engine/loadingEngine';
import { publishGuidedLoadingUnit, useGuidedLoadingUnit } from './guidedLoadingUnitState';
import { publishGuidedWorkflowState } from './guidedWorkflowState';
import { INERTIA_CERTIFICATION_EVENT, type InertiaCertification } from './inertiaCertification';
import { usePalletSnapshot } from './palletSnapshotStore';
import { OPEN_RESULTS_MODAL_EVENT } from './resultsModalEvents';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';
import {
  OPEN_TRANSPORT_SELECTOR_EVENT,
  TRANSPORT_EQUIPMENT_EVENT,
  useTransportEquipment,
  type TransportCategory,
  CONTAINER_EQUIPMENT, TRUCK_EQUIPMENT, selectTransportEquipment,
} from './transportEquipment';
import { APP_ACTION_EVENT, dispatchAppAction, type AppActionDetail } from './uiEvents';
import {
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  readEnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import type { ProductPackagingAssignment } from './engine/productPackagingOptimizer';
import { LOCAL_OPERATOR_EVENT } from './localOperator';
import { PERSONAL_BOX_CATALOG_EVENT } from './personalBoxCatalog';
import {
  PRODUCT_SELECTION_EVENT,
  cargoFromProductPackaging,
  formatBoxSize,
  packagingCandidates,
  previewPackagingCandidate,
  readProductSelection,
  selectedProducts,
  writeProductSelection,
  type ProductSelectionMap,
} from './productWorkflow';
import { applyToDashboard } from './TransportEquipmentSelector';
import EditableEquipmentCard from './EditableEquipmentCard';
import ProductPackagingPreview3D from './ProductPackagingPreview3D';
import { writeShipmentInstructionSnapshot } from './shipmentInstruction';
import { writeLoadingStrategyPreference } from './loadingStrategyPreference';

type LiveDetail = { container: ContainerSpec; cargo: CargoItem[]; result?: LoadingResult };
type WorkflowWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

type HostSet = { left: HTMLElement | null; center: HTMLElement | null; right: HTMLElement | null };
type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PackagingBundle = {
  products: CompanyProductItem[];
  assignments: ProductPackagingAssignment[];
  cargo: CargoItem[];
  ready: boolean;
};

const steps: Array<{ id: StepId; label: string }> = [
  { id: 1, label: '적재공간 선택' },
  { id: 2, label: '제품 선택' },
  { id: 3, label: '제품 포장' },
  { id: 4, label: '적재 방식 선택' },
  { id: 5, label: '자동 적재' },
  { id: 6, label: '결과 확인' },
];

const loadingStrategyOptions: Array<{
  id: LoadingStrategy;
  title: string;
  summary: string;
  detail: string;
}> = [
  {
    id: 'stability',
    title: '무게중심·안정성 우선형',
    summary: '낮은 무게중심과 좌우·전후 균형을 우선',
    detail: '무거운 화물을 낮게 두고 중량 편중과 불안정한 접촉을 줄이는 방향으로 배치합니다.',
  },
  {
    id: 'capacity',
    title: '공간효율·적재량 우선형',
    summary: '안전 조건 안에서 빈 공간과 미적재를 최소화',
    detail: '물리 안전 조건은 그대로 지키면서 컨테이너 공간 사용률과 적재 수량을 더 강하게 평가합니다.',
  },
  {
    id: 'unloading',
    title: '하역 순서 우선형',
    summary: '현장 하역 동선과 출고 순서를 우선',
    detail: '문쪽 접근성과 하역 순서를 더 크게 반영하되 중량·지지·충돌 같은 안전 조건은 유지합니다.',
  },
];

function strategyLabel(strategy: LoadingStrategy) {
  return loadingStrategyOptions.find(item => item.id === strategy)?.title ?? strategy;
}

function readLive(): LiveDetail {
  if (typeof window !== 'undefined') {
    const latest = (window as WorkflowWindow).__containerLoadingLatestResult;
    if (latest) return latest;
  }
  const stored = readStoredState();
  return {
    container: stored?.container ?? { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
    cargo: stored?.cargo ?? [],
  };
}

function openEquipment(category?: TransportCategory) {
  window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: category ? { category } : undefined }));
}

function formatDimensions(item: CargoItem) {
  return `${Math.round(item.length * 1000)} × ${Math.round(item.width * 1000)} × ${Math.round(item.height * 1000)} mm`;
}

function EquipmentSelectionStage() {
  const equipment = useTransportEquipment();
  const [category, setCategory] = useState<TransportCategory>(equipment.category);
  useEffect(() => setCategory(equipment.category), [equipment.category]);
  const [error, setError] = useState('');
  const items = category === 'container' ? CONTAINER_EQUIPMENT : TRUCK_EQUIPMENT;
  const choose = (item: typeof equipment) => {
    if (item.id.startsWith('custom-')) { openEquipment(category); return; }
    if (!applyToDashboard(item)) { setError('장비 규격을 적용하지 못했습니다. 다시 선택해 주세요.'); return; }
    selectTransportEquipment(item); setError('');
  };
  return <section className="guided-stage-panel guided-equipment-stage">
    <div className="guided-panel-title studio-main-title"><div><span className="studio-eyebrow">01 / SPACE</span><h1>적재공간 선택</h1><p>장비 이미지와 규격을 확인하고 선택하세요.</p></div><button aria-label="선택한 장비 변경" className="guided-secondary-button" onClick={() => openEquipment(category)}>{equipment.shortName} · 규격 편집</button></div>
    <div className="guided-segmented" aria-label="운송 장비 종류">{(['container', 'truck'] as const).map(value => <button key={value} type="button" aria-pressed={category === value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value === 'container' ? '컨테이너' : '트럭'}</button>)}</div>
    <div className="equipment-icon-grid" aria-label="적재공간 장비 선택">{items.map(item => <EditableEquipmentCard key={item.id} item={item} active={equipment.id === item.id} onSelect={choose} variant="guided" />)}</div>
    {error && <p role="alert">{error}</p>}
    <div className="equipment-selected-strip"><span>내부 규격 <b>{(equipment.length * 1000).toLocaleString()} mm × {(equipment.width * 1000).toLocaleString()} mm × {(equipment.height * 1000).toLocaleString()} mm</b></span><span>선택한 장비 <b>{equipment.shortName}</b></span><span>적재중량 <b>{equipment.maxPayloadKg.toLocaleString()} kg</b></span><span>바닥하중 <b>{equipment.floorLoadLimitKgPerM2.toLocaleString()} kg/m²</b></span><span>용적 <b>{(equipment.volumeM3 ?? equipment.length * equipment.width * equipment.height).toFixed(1)} m³</b></span></div>
    {equipment.specializedCargo && <p className="guided-stage-help">{equipment.note}</p>}
  </section>;
}

function StepRail({ step, furthest, selectionCount, packagedReady, strategy, running, finalReady, onStep }: {
  step: StepId;
  furthest: StepId;
  selectionCount: number;
  packagedReady: boolean;
  strategy: LoadingStrategy | null;
  running: boolean;
  finalReady: boolean;
  onStep: (step: StepId) => void;
}) {
  return <section className="guided-step-rail" aria-label="작업 준비 단계">
    <div className="studio-rail-heading"><span>WORKSPACE</span><h2>적재 계획</h2><p>공간 선택부터 출하까지</p></div>
    <div className="guided-step-list">
      {steps.map(item => {
        const complete = item.id < step
          || (item.id === 3 && packagedReady && step > 3)
          || (item.id === 4 && Boolean(strategy) && step > 4)
          || (item.id === 6 && finalReady);
        const current = item.id === step;
        const enabled = item.id <= furthest;
        const meta = item.id === 1 ? '공간 확인'
          : item.id === 2 ? (selectionCount ? `${selectionCount}종 선택` : '미선택')
          : item.id === 3 ? (packagedReady ? '포장안 준비' : '대기')
          : item.id === 4 ? (strategy ? strategyLabel(strategy) : '미선택')
          : item.id === 5 ? (finalReady ? '검사 완료' : running ? '검사 중' : '대기')
          : finalReady ? '확인 가능' : '-';
        return <button key={item.id} type="button" aria-current={current ? 'step' : undefined} className={`${current ? 'current' : ''} ${complete ? 'complete' : ''}`} disabled={!enabled} onClick={() => enabled && onStep(item.id)}>
          <span className="guided-step-dot">{complete ? '✓' : <StudioIcon name={stepIcons[item.id - 1]}/>}</span>
          <span className="guided-step-copy"><b>{item.label}</b><small>{String(item.id).padStart(2, '0')} · {meta}</small></span>
        </button>;
      })}
    </div>
    <div className="studio-rail-progress"><span>현재 단계 <b>{step} / 6</b></span><progress max="6" value={step} aria-label="현재 작업 단계"/></div>
  </section>;
}

function ProductSelectionStage({ container, selection, onSelection }: {
  container: ContainerSpec;
  selection: ProductSelectionMap;
  onSelection: (next: ProductSelectionMap) => void;
}) {
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    window.addEventListener(PERSONAL_BOX_CATALOG_EVENT, refresh);
    window.addEventListener(LOCAL_OPERATOR_EVENT, refresh);
    window.addEventListener(ADMIN_ACCESS_EVENT, refresh);
    return () => {
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
      window.removeEventListener(PERSONAL_BOX_CATALOG_EVENT, refresh);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, refresh);
      window.removeEventListener(ADMIN_ACCESS_EVENT, refresh);
    };
  }, []);
  const state = useMemo(() => readEnterprisePackagingPlannerState(), [revision]);
  const products = (state?.products ?? []) as CompanyProductItem[];
  const boxes = state?.boxes ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return products.filter(product => (selection[product.id] ?? 0) > 0);
    return products
      .filter(product => `${product.id} ${product.name}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 50);
  }, [products, normalizedQuery, selection]);
  const total = Object.values(selection).reduce((sum, value) => sum + value, 0);

  const updateQty = (id: string, quantity: number) => {
    const next = { ...selection };
    if (!Number.isInteger(quantity) || quantity <= 0) delete next[id];
    else next[id] = quantity;
    writeProductSelection(next);
    onSelection(next);
  };

  return <section className="guided-stage-panel guided-product-stage">
    <div className="guided-panel-title"><div><h1>제품 선택</h1><p>등록된 회사 제품에서 이름 또는 제품코드를 찾고 이번 출하 수량만 입력합니다.</p></div><span className="guided-selected-total">{Object.keys(selection).length}종 · {total.toLocaleString()} EA</span></div>
    <div className="guided-product-search"><span>⌕</span><input aria-label="제품 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="제품명 또는 제품코드 검색" /></div>
    {!products.length ? <div className="guided-empty product-empty"><b>등록된 회사 제품이 없습니다.</b><span>제품 등록은 우측 상단 메뉴 → 회사 제품 관리에서 합니다.</span></div> : !normalizedQuery && !filtered.length ? <div className="guided-empty product-empty"><b>제품을 검색하세요.</b><span>제품명 또는 제품코드를 입력하면 일치하는 제품만 표시합니다.</span></div> : <div className="guided-product-table">
      <div className="guided-product-table-head"><span>제품 정보</span><span>포장</span><span>자동 추천 상자</span><span>이번 출하 수량</span></div>
      {filtered.map(product => {
        const quantity = selection[product.id] ?? 0;
        const candidate = requiresBoxPackaging(product)
          ? previewPackagingCandidate(container, { ...product, quantity: Math.max(1, quantity || 1) }, boxes, state)
          : undefined;
        return <article key={product.id} className={quantity > 0 ? 'selected' : ''}>
          <div className="guided-product-info"><b>{product.name}</b><span>{product.id} · {Math.round(product.length * 1000)}×{Math.round(product.width * 1000)}×{Math.round(product.height * 1000)} mm · {product.weightKg} kg</span></div>
          <div className="guided-product-pack-type">{requiresBoxPackaging(product) ? <><b>박스 필요</b><span>포장 단계에서 확정</span></> : <><b>직접 적재</b><span>박스 없음</span></>}</div>
          <div className="guided-product-auto-box">{requiresBoxPackaging(product) ? candidate ? <><b>{formatBoxSize(candidate)}</b><span>{candidate.source === 'catalog' ? `보유 박스 · ${candidate.boxName}` : '신규 추천 규격'} · {candidate.unitsPerBox}EA/BOX</span></> : <><b className="warn">추천 불가</b><span>제품/박스 조건 확인</span></> : <><b>해당 없음</b><span>제품 실물 규격 사용</span></>}</div>
          <div className="guided-product-qty"><button type="button" aria-label={`${product.name} 수량 줄이기`} onClick={() => updateQty(product.id, Math.max(0, quantity - 1))}>−</button><input aria-label={`${product.name} 출하 수량`} type="number" min="0" step="1" value={quantity} onChange={event => updateQty(product.id, Number(event.target.value))}/><button type="button" aria-label={`${product.name} 수량 늘리기`} onClick={() => updateQty(product.id, quantity + 1)}>＋</button></div>
        </article>;
      })}
      {!filtered.length && <div className="guided-empty">검색 결과가 없습니다.</div>}
      {normalizedQuery && filtered.length === 50 && <div className="guided-empty">검색 결과가 많습니다. 제품명 또는 제품코드를 더 입력해 범위를 줄이세요.</div>}
    </div>}
    <p className="guided-stage-help">검색 결과의 박스는 빠른 미리보기이며, 실제 포장 규격은 다음 제품 포장 단계에서 정밀 계산합니다.</p>
  </section>;
}

function PackagingStage({ container, selection, onBundle }: {
  container: ContainerSpec;
  selection: ProductSelectionMap;
  onBundle: (bundle: PackagingBundle) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [choices, setChoices] = useState<Record<string, string>>({});
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    window.addEventListener(PERSONAL_BOX_CATALOG_EVENT, refresh);
    window.addEventListener(LOCAL_OPERATOR_EVENT, refresh);
    window.addEventListener(ADMIN_ACCESS_EVENT, refresh);
    return () => {
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
      window.removeEventListener(PERSONAL_BOX_CATALOG_EVENT, refresh);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, refresh);
      window.removeEventListener(ADMIN_ACCESS_EVENT, refresh);
    };
  }, []);
  const state = useMemo(() => readEnterprisePackagingPlannerState(), [revision]);
  const products = useMemo(() => selectedProducts((state?.products ?? []) as CompanyProductItem[], selection), [state, selection]);
  const boxes = state?.boxes ?? [];
  const candidates = useMemo(() => Object.fromEntries(products.map(product => [product.id, packagingCandidates(container, product, boxes, state)])), [products, boxes, container, state]);

  useEffect(() => {
    setChoices(current => {
      const next = { ...current };
      for (const product of products) {
        if (!requiresBoxPackaging(product)) continue;
        const list = candidates[product.id] ?? [];
        if (!list.some(item => item.boxId === next[product.id])) next[product.id] = list[0]?.boxId ?? '';
      }
      return next;
    });
  }, [products, candidates]);

  const assignments = useMemo(() => products.flatMap(product => {
    if (!requiresBoxPackaging(product)) return [];
    const choice = choices[product.id];
    const list = candidates[product.id] ?? [];
    return list.filter(item => item.boxId === choice).slice(0, 1);
  }), [products, candidates, choices]);
  const requiredBoxed = products.filter(requiresBoxPackaging).length;
  const ready = products.length > 0 && assignments.length === requiredBoxed;
  const cargo = useMemo(() => cargoFromProductPackaging(products, assignments), [products, assignments]);

  useEffect(() => onBundle({ products, assignments, cargo, ready }), [products, assignments, cargo, ready, onBundle]);

  return <section className="guided-stage-panel guided-packaging-stage">
    <div className="guided-panel-title"><div><h1>제품 포장</h1><p>제품별 추천 박스를 자동 적용했습니다. 필요하면 후보를 바꾸고 3D 바닥 미리보기로 포장 결과를 확인합니다.</p></div><span className={`guided-packaging-status ${ready ? 'ready' : ''}`}>{ready ? '포장안 준비 완료' : '포장안 확인 필요'}</span></div>
    <div className="guided-packaging-list">
      {products.map(product => {
        if (!requiresBoxPackaging(product)) return <article key={product.id} className="direct"><div><b>{product.name}</b><span>{product.id} · {product.quantity}EA</span></div><div className="guided-package-choice"><strong>박스 불필요 · 직접 적재</strong><span>{Math.round(product.length * 1000)}×{Math.round(product.width * 1000)}×{Math.round(product.height * 1000)} mm</span></div><div><b>{product.quantity} EA</b><span>적재단위</span></div></article>;
        const list = candidates[product.id] ?? [];
        const active = list.find(item => item.boxId === choices[product.id]);
        return <article key={product.id} className={!active ? 'warning' : ''}>
          <div><b>{product.name}</b><span>{product.id} · 제품 {product.quantity}EA</span></div>
          <div className="guided-package-choice">{list.length ? <><select value={choices[product.id] ?? ''} onChange={event => setChoices(current => ({ ...current, [product.id]: event.target.value }))}>{list.map((item, index) => <option key={`${item.boxId}-${index}`} value={item.boxId}>{index + 1}순위 · {Math.round(item.outerLength * 1000)}×{Math.round(item.outerWidth * 1000)}×{Math.round(item.outerHeight * 1000)} · {item.source === 'catalog' ? '보유' : '신규'}</option>)}</select>{active && <span>{active.unitsPerBox}EA/BOX · 충진율 {Math.round(active.productFillRate * 100)}% · {active.boxName}</span>}{active && <span>자동 적재 최대 {active.maxStackLayers}단{active.strengthStatus === 'design-target' ? ' · 신규 박스 강도 미확인' : ' · 높이·상부하중 반영'}</span>}</> : <><strong className="warn">추천 가능한 박스 없음</strong><span>제품 관리 또는 박스 관리에서 조건을 확인하세요.</span></>}</div>
          <div>{active ? <><b>{active.boxesNeeded} BOX</b><span>포장 후 수량</span></> : <><b>-</b><span>포장 불가</span></>}</div>
        </article>;
      })}
    </div>
    {cargo.length > 0 ? <ProductPackagingPreview3D container={container} cargo={cargo} /> : <div className="guided-empty">포장 미리보기를 만들 수 없습니다.</div>}
  </section>;
}

function LoadingStrategyStage({ strategy, onStrategy, live }: {
  live: LiveDetail;
  strategy: LoadingStrategy | null;
  onStrategy: (strategy: LoadingStrategy) => void;
}) {
  const updateStop = (id: string, stop: number) => {
    if (!Number.isInteger(stop) || stop < 1) return;
    const product = live.cargo.find(item => item.id === id)?.productId;
    writeStoredState({ container: live.container, cargo: live.cargo.map(item => item.id === id || (product && item.productId === product) ? { ...item, unloadPriority: stop } : item) }, true);
  };
  return <section className="guided-stage-panel guided-strategy-stage">
    <div className="guided-panel-title">
      <div>
        <h1>적재 방식 선택</h1>
        <p>이번 작업에서 가장 중요한 목표를 선택합니다. 안전 제약은 어떤 전략에서도 동일하게 유지됩니다.</p>
      </div>
      <span className={`guided-strategy-status ${strategy ? 'ready' : ''}`}>{strategy ? '전략 선택 완료' : '전략 선택 필요'}</span>
    </div>
    <div className="guided-strategy-grid" role="radiogroup" aria-label="적재 전략 선택">
      {loadingStrategyOptions.map(option => {
        const selected = strategy === option.id;
        return <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={selected}
          className={`guided-strategy-card ${selected ? 'selected' : ''}`}
          onClick={() => onStrategy(option.id)}
        >
          <span className="guided-strategy-check">{selected ? '✓' : ''}</span>
          <strong>{option.title}</strong>
          <b>{option.summary}</b>
          <small>{option.detail}</small>
        </button>;
      })}
    </div>
    {strategy === 'unloading' && <div className="guided-unload-priorities" aria-label="하역 순서 설정">
      <b>배송지별 하역 순서</b><p>1번이 가장 먼저 문쪽에서 하역됩니다. 기본값은 제품 목록 순서이며, 같은 배송지는 같은 번호로 지정하세요.</p>
      <div>{live.cargo.map(item => <label key={item.id}><span>{item.productName || item.name}<small>{item.id}</small></span><input aria-label={`${item.name} 하역 순서`} type="number" min="1" step="1" value={item.unloadPriority ?? 1} onChange={event => updateStop(item.id, Number(event.target.value))}/></label>)}</div>
    </div>}
    <div className="guided-strategy-note"><b>선택 전략 적용 범위</b><span>박스 위치 · 방향 · 공간 사용률 · 무게중심 · 하역 우선순위의 평가 가중치가 바뀝니다. 충돌, 지지율, 적층, 최대중량 같은 안전 제한은 완화하지 않습니다.</span></div>
  </section>;
}

function ResultStage({ live }: { live: LiveDetail }) {
  const result = live.result;
  const total = live.cargo.reduce((sum, item) => sum + item.quantity, 0);
  const remaining = result?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const containerVolume = live.container.length * live.container.width * live.container.height;
  const fillRate = result && containerVolume > 0 ? result.usedVolumeM3 / containerVolume * 100 : 0;
  const weightRate = result && live.container.maxPayloadKg > 0 ? result.loadedWeightKg / live.container.maxPayloadKg * 100 : 0;
  return <section className="guided-stage-panel guided-result-stage">
    <div className="guided-panel-title"><h1>결과 확인</h1><button type="button" className="guided-secondary-button" onClick={() => dispatchAppAction('show-results')}>상세 결과 보기</button></div>
    <div className="guided-result-tabs"><b>적재 결과</b><span>미적재</span><span>무게 분포</span><span>안전 검사</span></div>
    <div className="guided-result-grid">
      <div><span>요청</span><b>{total.toLocaleString()} EA</b></div>
      <div className="good"><span>적재</span><b>{(result?.placements.length ?? 0).toLocaleString()} EA</b></div>
      <div className={remaining ? 'warn' : 'good'}><span>미적재</span><b>{remaining.toLocaleString()} EA</b></div>
      <div><span>CBM 사용률</span><b>{fillRate.toFixed(1)}%</b></div>
      <div><span>중량 사용률</span><b>{weightRate.toFixed(1)}%</b></div>
      <div className="good"><span>작업 판정</span><b>결과 확인</b></div>
    </div>
    {result?.remaining.length ? <div className="guided-unloaded-list"><div className="guided-section-label">미적재 화물</div>{result.remaining.map(item => <article key={item.cargoId}><span><b>{item.cargoId}</b><small>{item.reason}</small></span><strong>{item.quantity} EA</strong></article>)}</div> : null}
  </section>;
}

function StagePanel({ step, live, selection, strategy, onSelection, onBundle, onStrategy }: {
  step: StepId;
  live: LiveDetail;
  selection: ProductSelectionMap;
  strategy: LoadingStrategy | null;
  onSelection: (next: ProductSelectionMap) => void;
  onBundle: (bundle: PackagingBundle) => void;
  onStrategy: (strategy: LoadingStrategy) => void;
}) {
  if (step === 1) return <EquipmentSelectionStage />;
  if (step === 2) return <ProductSelectionStage container={live.container} selection={selection} onSelection={onSelection} />;
  if (step === 3) return <PackagingStage container={live.container} selection={selection} onBundle={onBundle} />;
  if (step === 4) return <LoadingStrategyStage strategy={strategy} onStrategy={onStrategy} live={live} />;
  if (step === 6) return <ResultStage live={live} />;
  return <section className="guided-stage-panel guided-loading-placeholder" aria-hidden="true" />;
}

function JobSummary({ step, live, mode, finalReady, running, selection, strategy }: {
  step: StepId;
  live: LiveDetail;
  mode: 'boxes' | 'pallets';
  finalReady: boolean;
  running: boolean;
  selection: ProductSelectionMap;
  strategy: LoadingStrategy | null;
}) {
  const [summaryOpen, setSummaryOpen] = useState(() => window.innerWidth > 760);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)');
    const update = () => setSummaryOpen(desktop.matches);
    desktop.addEventListener('change', update);
    return () => desktop.removeEventListener('change', update);
  }, []);
  const equipment = useTransportEquipment();
  const palletSnapshot = usePalletSnapshot();
  const boxResult = live.result;
  const loaded = mode === 'pallets' ? palletSnapshot?.result?.placements?.length ?? 0 : boxResult?.placements.length ?? 0;
  const remaining = mode === 'pallets' ? palletSnapshot?.result?.remaining?.reduce((sum, item) => sum + item.quantity, 0) ?? 0 : boxResult?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const selectedUnits = Object.values(selection).reduce((sum, value) => sum + value, 0);
  const weight = mode === 'pallets' ? palletSnapshot?.result?.totalPalletizedWeightKg ?? 0 : boxResult?.loadedWeightKg ?? 0;
  const maxVolume = live.container.length * live.container.width * live.container.height;
  const usedVolume = boxResult?.usedVolumeM3 ?? 0;
  const fillRate = maxVolume > 0 && usedVolume > 0 ? usedVolume / maxVolume * 100 : 0;
  const status = finalReady ? (!loaded && remaining ? '적재 불가' : '작업 가능') : running ? '검사 중' : loaded ? '검증 대기' : '대기';
  const restrictedCount = live.cargo.filter(item => item.quantity > 0 && (item.maxStackLayers === 1 || item.maxTopLoadKg === 0)).length;
  return <details className="guided-job-summary" open={summaryOpen} onToggle={event => setSummaryOpen(event.currentTarget.open)}><summary className="studio-summary-toggle">현재 작업 요약</summary>
    <div className="studio-summary-heading"><h2>현재 작업</h2><span>OVERVIEW</span></div>
    <div className="studio-summary-equipment"><StudioIcon /><b>{equipment.shortName}</b><span>{live.container.length.toFixed(2)} × {live.container.width.toFixed(2)} × {live.container.height.toFixed(2)} m</span></div>
    <dl>
      <div><dt>적재공간</dt><dd>{equipment.shortName}</dd></div>
      <div><dt>선택 제품</dt><dd>{Object.keys(selection).length ? `${Object.keys(selection).length}종 / ${selectedUnits} EA` : '-'}</dd></div>
      <div><dt>포장 적재단위</dt><dd>{live.cargo.length ? `${live.cargo.length}종` : '-'}</dd></div>
      <div><dt>적재 유형</dt><dd>{mode === 'pallets' ? '파렛트 적재' : '박스 직접 적재'}</dd></div>
      <div><dt>적재 전략</dt><dd>{strategy ? strategyLabel(strategy) : '-'}</dd></div>
      {mode === 'pallets' && <div><dt>사용 파렛트</dt><dd>{palletSnapshot ? `${palletSnapshot.result.palletCount}개` : '-'}</dd></div>}
      <div><dt>적재</dt><dd>{loaded ? `${loaded} EA` : '-'}</dd></div>
      <div><dt>미적재</dt><dd>{boxResult || palletSnapshot ? `${remaining} EA` : '-'}</dd></div>
      <div><dt>총 중량</dt><dd>{weight ? `${Math.round(weight).toLocaleString()} / ${live.container.maxPayloadKg.toLocaleString()} kg` : `- / ${live.container.maxPayloadKg.toLocaleString()} kg`}</dd></div>

      <div className="guided-status-row"><dt>상태</dt><dd><i className={finalReady ? 'good' : running ? 'running' : ''}/>{status}</dd></div>
    </dl>
    <div className="studio-capacity"><span>공간 사용률<b>{mode === 'boxes' ? `${fillRate.toFixed(1)}%` : '팔레트 결과 참고'}</b></span><meter aria-label="공간 사용률" min="0" max="100" value={mode === 'boxes' ? Math.min(100, fillRate) : 0}/><small>전체 공간 {maxVolume.toFixed(1)} m³</small></div>
    {step === 5 && !running && !finalReady && <div className="guided-loading-run-confirmation" aria-label="자동 적재 실행 설정 확인">
      <b>실행 설정 확인</b>
      <span>{mode === 'pallets' ? '파렛트 적재' : '박스 직접 적재'} · {strategy ? strategyLabel(strategy) : '전략 미선택'}</span>
      <small>설정을 확인한 뒤 ‘최종 적재 진행’을 눌러 관성·물리 검증을 시작하세요.</small>
    </div>}
    {step === 5 && mode === 'pallets' && restrictedCount > 0 && <p className="guided-pallet-stack-note">
      {restrictedCount}종은 1단 또는 상부 적재 금지로 설정되어 있습니다. 더 쌓으려면 박스 관리에 검증된 최대 적층단과 상부 허용중량을 등록하세요.
    </p>}
  </details>;
}

function BottomBar({ step, selectionCount, packagedReady, strategy, running, finalReady, canReport, onAdvance, onApplyPackaging }: {
  step: StepId;
  selectionCount: number;
  packagedReady: boolean;
  strategy: LoadingStrategy | null;
  running: boolean;
  finalReady: boolean;
  canReport: boolean;
  onAdvance: (step: StepId) => void;
  onApplyPackaging: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // Reserve the real footer height, including wrapped labels and mobile safe areas.
    // Scrolling and keyboard focus must never put canvas controls behind the fixed bar.
    const updateHeight = () => document.documentElement.style.setProperty('--guided-footer-height', `${bar.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--guided-footer-height');
    };
  }, []);
  let label = '다음: 제품 선택';
  let disabled = false;
  let action = () => onAdvance(2);
  if (step === 2) { label = '다음: 제품 포장'; disabled = selectionCount < 1; action = () => onAdvance(3); }
  else if (step === 3) { label = '포장 확정 · 다음: 적재 방식 선택'; disabled = !packagedReady; action = onApplyPackaging; }
  else if (step === 4) { label = strategy ? '선택 완료 · 다음: 자동 적재' : '적재 방식을 선택하세요'; disabled = !strategy; action = () => onAdvance(5); }
  else if (step === 5) {
    if (finalReady) { label = '결과 확인'; action = () => onAdvance(6); }
    else { label = running ? '최종 적재 검사 중…' : '최종 적재 진행'; disabled = running || !strategy; action = () => dispatchAppAction('run-loading'); }
  } else if (step === 6) { label = canReport ? '통합 출하·적재 작업지시서 보기' : '미적재 사유 확인 · 조건을 변경해 다시 계산하세요'; disabled = !finalReady || !canReport; action = () => dispatchAppAction('print-report'); }
  return <div ref={barRef} className="guided-bottom-bar"><div className="studio-footer-left"><button type="button" className="guided-reset-link" onClick={() => dispatchAppAction('reset-all')}>↻ 전체 초기화</button><span className="studio-footer-step">STEP {String(step).padStart(2, '0')} <i>/</i> 06</span></div><div className="studio-footer-actions">{step > 1 && <button type="button" className="studio-back" disabled={running} onClick={() => onAdvance((step - 1) as StepId)}>이전 단계</button>}<button type="button" className="guided-primary-cta" disabled={disabled} onClick={action}>{label}{!running && step !== 6 ? '  ›' : ''}</button></div></div>;
}

export default function GuidedWorkflowShell() {
  const initialSelection = readProductSelection();
  const guidedLoadingUnit = useGuidedLoadingUnit();
  const mode = guidedLoadingUnit ?? 'boxes';
  const [hosts, setHosts] = useState<HostSet>({ left: null, center: null, right: null });
  const [live, setLive] = useState<LiveDetail>(() => readLive());
  const [selection, setSelection] = useState<ProductSelectionMap>(initialSelection);
  const [packaging, setPackaging] = useState<PackagingBundle>({ products: [], assignments: [], cargo: [], ready: false });
  const [strategy, setStrategy] = useState<LoadingStrategy | null>(null);
  const [step, setStep] = useState<StepId>(1);
  const [furthest, setFurthest] = useState<StepId>(1);
  const [running, setRunning] = useState(false);
  const [finalReady, setFinalReady] = useState(false);
  const [noLoadComplete, setNoLoadComplete] = useState(false);

  const advance = (next: StepId) => { setStep(next); setFurthest(previous => Math.max(previous, next) as StepId); };
  const applyPackaging = () => {
    if (!packaging.ready) return;
    writeShipmentInstructionSnapshot(packaging.products, packaging.assignments, packaging.cargo);
    writeStoredState({ container: live.container, cargo: packaging.cargo }, true);
    publishGuidedLoadingUnit('boxes');
    setStrategy(null);
    writeLoadingStrategyPreference(null);
    setFinalReady(false);
    advance(4);
  };
  const chooseStrategy = (next: LoadingStrategy) => {
    setNoLoadComplete(false);
    if (next === 'unloading') {
      const source = readStoredState() ?? live;
      const stops = new Map<string, number>();
      source.cargo.forEach(item => { const key = item.productId || item.id; if (!stops.has(key)) stops.set(key, stops.size + 1); });
      if (source.cargo.some(item => item.unloadPriority == null)) writeStoredState({ container: source.container, cargo: source.cargo.map(item => ({ ...item, unloadPriority: item.unloadPriority ?? stops.get(item.productId || item.id) })) }, true);
    }
    setStrategy(next);
    writeLoadingStrategyPreference(next);
    setFinalReady(false);
    setFurthest(previous => previous > 5 ? 5 : previous);
  };

  useEffect(() => {
    publishGuidedWorkflowState({ active: true, step });
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('root')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

  useEffect(() => () => {
    publishGuidedWorkflowState({ active: false, step: 1 });
    publishGuidedLoadingUnit(null);
  }, []);

  useEffect(() => {
    writeLoadingStrategyPreference(null);
    return () => writeLoadingStrategyPreference(null);
  }, []);

  useEffect(() => {
    let frame = 0;
    const syncHosts = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next: HostSet = {
          left: document.querySelector<HTMLElement>('.dashboard-left'),
          center: document.querySelector<HTMLElement>('.dashboard-center'),
          right: document.querySelector<HTMLElement>('.dashboard-right'),
        };
        setHosts(current => current.left === next.left && current.center === next.center && current.right === next.right ? current : next);
      });
    };
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const refresh = () => setLive(readLive());
    const onCertificationInvalidated = (event: Event) => {
      if ((event as CustomEvent<InertiaCertification | undefined>).detail) return;
      setFinalReady(false);
      setFurthest(previous => Math.min(previous, 5) as StepId);
      setStep(previous => previous === 6 ? 5 : previous);
    };
    const refreshSelection = () => setSelection(readProductSelection());
    const refreshIdentity = () => {
      setSelection(readProductSelection());
      setPackaging({ products: [], assignments: [], cargo: [], ready: false });
      publishGuidedLoadingUnit(null);
      setStrategy(null);
      writeLoadingStrategyPreference(null);
      setStep(1);
      setFurthest(1);
      setRunning(false);
      setFinalReady(false);
    };
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertificationInvalidated);
    window.addEventListener(PRODUCT_SELECTION_EVENT, refreshSelection);
    window.addEventListener(LOCAL_OPERATOR_EVENT, refreshIdentity);
    window.addEventListener(ADMIN_ACCESS_EVENT, refreshIdentity);
    window.addEventListener('container-loading:pallet-snapshot-updated', refresh);
    refresh();
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertificationInvalidated);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, refreshSelection);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, refreshIdentity);
      window.removeEventListener(ADMIN_ACCESS_EVENT, refreshIdentity);
      window.removeEventListener('container-loading:pallet-snapshot-updated', refresh);
    };
  }, []);

  useEffect(() => {
    if (step !== 5) return;

    const markRunning = () => {
      setNoLoadComplete(false);
      setRunning(true);
      setFinalReady(false);
    };
    const markReady = () => {
      setRunning(false);
      setFinalReady(true);
      setFurthest(previous => Math.max(previous, 6) as StepId);
      setLive(readLive());
    };
    const onAppAction = (event: Event) => {
      if ((event as CustomEvent<AppActionDetail>).detail?.action === 'run-loading') markRunning();
    };
    const onNoLoad = (event: Event) => {
      const detail = (event as CustomEvent<LiveDetail>).detail;
      if (!detail?.result || detail.result.placements.length || !detail.result.remaining.length) return;
      setRunning(false); setNoLoadComplete(true); setFinalReady(true); setLive(detail);
      setFurthest(previous => Math.max(previous, 6) as StepId);
    };
    const onPhysicsError = () => setRunning(false);
    const onCertification = (event: Event) => {
      const certification = (event as CustomEvent<InertiaCertification | undefined>).detail;
      if (certification) markReady();
      else setFinalReady(false);
    };

    window.addEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
    window.addEventListener(APP_ACTION_EVENT, onAppAction);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, markRunning);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onPhysicsError);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    window.addEventListener(OPEN_RESULTS_MODAL_EVENT, markReady);
    return () => {
      window.removeEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
      window.removeEventListener(APP_ACTION_EVENT, onAppAction);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, markRunning);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onPhysicsError);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
      window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, markReady);
    };
  }, [step]);

  const selectionCount = Object.keys(selection).length;
  const rail = useMemo(() => hosts.left ? createPortal(<StepRail step={step} furthest={furthest} selectionCount={selectionCount} packagedReady={packaging.ready} strategy={strategy} running={running} finalReady={finalReady} onStep={setStep}/>, hosts.left) : null, [hosts.left, step, furthest, selectionCount, packaging.ready, strategy, running, finalReady]);
  const center = useMemo(() => hosts.center ? createPortal(<StagePanel step={step} live={live} selection={selection} strategy={strategy} onSelection={setSelection} onBundle={setPackaging} onStrategy={chooseStrategy}/>, hosts.center) : null, [hosts.center, step, live, selection, strategy]);
  const summary = useMemo(() => hosts.right ? createPortal(<JobSummary step={step} live={live} mode={mode} finalReady={finalReady} running={running} selection={selection} strategy={strategy}/>, hosts.right) : null, [hosts.right, step, live, mode, finalReady, running, selection, strategy]);
  return <>{rail}{center}{summary}{typeof document !== 'undefined' ? createPortal(<BottomBar canReport={!noLoadComplete} step={step} selectionCount={selectionCount} packagedReady={packaging.ready} strategy={strategy} running={running} finalReady={finalReady} onAdvance={advance} onApplyPackaging={applyPackaging}/>, document.body) : null}</>;
}
