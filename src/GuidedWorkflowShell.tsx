import StudioIcon, { stepIcons } from './StudioIcon';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import {
  NO_LOAD_RESULT_EVENT,
} from './autoCertification';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { LOADING_RESULT_EVENT, type LoadingStrategy } from './engine/loadingEngine';
import { publishGuidedLoadingUnit, useGuidedLoadingUnit } from './guidedLoadingUnitState';
import { publishGuidedWorkflowState } from './guidedWorkflowState';
import { LOAD_SIM_ACCEPTANCE_EVENT, isLoadSimAcceptedTarget, type LoadSimAcceptance } from './rule-engine/acceptance';
import { readPhysicsTarget } from './physicsTarget';
import { FINAL_LOADING_WORKFLOW_ERROR_EVENT } from './finalWorkflowEvents';
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
import { randomUniqueCargoColor } from './cargoColors';
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
import WorkspaceModal from './WorkspaceModal';
import { publishWorkflowPreview, WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';
import { writeShipmentInstructionSnapshot } from './shipmentInstruction';
import { writeLoadingStrategyPreference } from './loadingStrategyPreference';
import { resolvePalletType, usePalletTypeSelection } from './palletTypeSelection';

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

// The compatibility token is internal only. A pack chooses among weight, volume,
// and footprint orderings itself; the former B objectives are no longer options.
const loadingStrategyOptions: Array<{ id: LoadingStrategy; title: string; summary: string; detail: string }> = [{
  id: 'capacity',
  title: '1번 파일 적재 방식',
  summary: '중량·부피·바닥면적 정렬을 자동 비교',
  detail: '1번 파일의 배치 탐색과 검증 규칙으로 최종 적재안을 계산합니다.',
}];

function strategyLabel(_strategy: LoadingStrategy) {
  return loadingStrategyOptions[0].title;
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
        const enabled = item.id <= 4 || item.id <= furthest;
        const meta = item.id === 1 ? '공간 확인'
          : item.id === 2 ? (selectionCount ? `${selectionCount}종 선택` : '미선택')
          : item.id === 3 ? (packagedReady ? '포장안 준비' : '대기')
          : item.id === 4 ? (strategy ? strategyLabel(strategy) : '미선택')
          : item.id === 5 ? (finalReady ? '검사 완료' : running ? '검사 중' : '대기')
          : finalReady ? '확인 가능' : '-';
        return <button key={item.id} data-workspace-step={item.id} type="button" aria-haspopup="dialog" aria-current={current ? 'step' : undefined} className={`${current ? 'current' : ''} ${complete ? 'complete' : ''}`} disabled={!enabled} onClick={() => enabled && onStep(item.id)}>
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
  const boxes = useMemo(() => state?.boxes ?? [], [state]);
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
    <div className="guided-product-search"><span>⌕</span><input data-view-only="true" aria-label="제품 검색" value={query} onChange={event => setQuery(event.target.value)} placeholder="제품명 또는 제품코드 검색" /></div>
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
  const boxes = useMemo(() => state?.boxes ?? [], [state]);
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
  const packagingColors = useRef<Record<string, string>>({});
  const cargo = useMemo(() => cargoFromProductPackaging(products, assignments).map(item => {
    // Equivalent store notifications must not create new colors/input identities.
    const key = item.productId || item.id;
    const colors = packagingColors.current;
    colors[key] ??= randomUniqueCargoColor(Object.values(colors));
    return { ...item, displayColor: colors[key] };
  }), [products, assignments]);

  useEffect(() => onBundle({ products, assignments, cargo, ready }), [products, assignments, cargo, ready, onBundle]);

  return <section className="guided-stage-panel guided-packaging-stage">
    <div className="guided-panel-title"><div><h1>제품 포장</h1><p>제품별 추천 박스를 자동 적용했습니다. 필요하면 후보를 바꾸세요. 포장 상태는 메인 3D 화면에 바로 반영됩니다.</p></div><span className={`guided-packaging-status ${ready ? 'ready' : ''}`}>{ready ? '포장안 준비 완료' : '포장안 확인 필요'}</span></div>
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
    <p className="guided-stage-help">{cargo.length > 0 ? "포장 미리보기는 메인 3D 화면에서 확인하세요. 포장 확정 후 전체 수량의 자동 적재를 계산합니다." : "제품을 선택하면 포장 상태를 메인 3D 화면에서 확인할 수 있습니다."}</p>
  </section>;
}

function LoadingStrategyStage({ strategy, onStrategy, live }: {
  live: LiveDetail;
  strategy: LoadingStrategy | null;
  onStrategy: (strategy: LoadingStrategy) => void;
}) {
  const updateStop = (id: string, stop: number) => {
    if (!Number.isInteger(stop) || stop < 0) return;
    const product = live.cargo.find(item => item.id === id)?.productId;
    writeStoredState({ container: live.container, cargo: live.cargo.map(item => item.id === id || (product && item.productId === product) ? { ...item, unloadPriority: stop > 0 ? stop : undefined } : item) }, true);
  };
  return <section className="guided-stage-panel guided-strategy-stage">
    <div className="guided-panel-title">
      <div>
        <h1>적재 방식 선택</h1>
        <p>1번 파일의 적재 방식으로 계산합니다. 적용할 방식과 하역 순서를 확인하세요.</p>
      </div>
      <span className={`guided-strategy-status ${strategy ? 'ready' : ''}`}>{strategy ? '적재 방식 확인 완료' : '적재 방식 확인 필요'}</span>
    </div>
    <div className="guided-strategy-grid" role="radiogroup" aria-label="적재 방식 확인">
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
    {strategy && <div className="guided-unload-priorities" aria-label="하역 순서 설정">
      <b>배송지별 하역 순서</b><p>작은 번호가 먼저 하역됩니다. 설정한 순서를 1번 파일의 배치·검증 규칙에 반영합니다. 순서를 지정하지 않으려면 0을 입력하세요.</p>
      <div>{live.cargo.map(item => <label key={item.id}><span>{item.productName || item.name}<small>{item.id}</small></span><input aria-label={`${item.name} 하역 순서`} type="number" min="0" step="1" value={item.unloadPriority ?? 0} onChange={event => updateStop(item.id, Number(event.target.value))}/></label>)}</div>
    </div>}
    <div className="guided-strategy-note"><b>적용 규칙</b><span>1번 파일의 회전·간격·중량·지지·적층·하역 규칙을 적용합니다. Rapier·관성 시뮬레이션은 별도 선택 검사입니다.</span></div>
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
  return <>
    <div hidden={step !== 1}><EquipmentSelectionStage /></div>
    <div hidden={step !== 2}><ProductSelectionStage container={live.container} selection={selection} onSelection={onSelection} /></div>
    <div hidden={step !== 3}><PackagingStage container={live.container} selection={selection} onBundle={onBundle} /></div>
    <div hidden={step !== 4}><LoadingStrategyStage strategy={strategy} onStrategy={onStrategy} live={live} /></div>
    <div hidden={step !== 5}><section className="guided-stage-panel"><div className="guided-panel-title"><div><h1>자동 적재</h1><p>선택한 포장과 적재 유형을 확인한 뒤 1번 파일 방식으로 최종 적재를 실행하세요. 계산과 정적 검증은 메인 3D 화면에서 진행됩니다.</p></div></div></section></div>
    <div hidden={step !== 6}><ResultStage live={live} /></div>
  </>;
}

const RetainedStagePanel = memo(StagePanel);

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
    const media = window.matchMedia('(min-width:761px)');
    const change = () => setSummaryOpen(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const equipment = useTransportEquipment();
  const palletSnapshot = usePalletSnapshot();
  const palletType = resolvePalletType(usePalletTypeSelection());
  // Name the product only while the loaded spec still matches it (results edits may override).
  const palletName = palletSnapshot && Math.abs(palletSnapshot.spec.length - palletType.length) < 1e-6 && Math.abs(palletSnapshot.spec.width - palletType.width) < 1e-6
    ? `${palletType.name} · ` : '';
  const boxResult = live.result;
  const loaded = mode === 'pallets' ? palletSnapshot?.result?.placements?.length ?? 0 : boxResult?.placements.length ?? 0;
  const remaining = mode === 'pallets' ? palletSnapshot?.result?.remaining?.reduce((sum, item) => sum + item.quantity, 0) ?? 0 : boxResult?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const selectedUnits = Object.values(selection).reduce((sum, value) => sum + value, 0);
  const weight = mode === 'pallets' ? palletSnapshot?.result?.totalPalletizedWeightKg ?? 0 : boxResult?.loadedWeightKg ?? 0;
  const maxVolume = live.container.length * live.container.width * live.container.height;
  const usedVolume = boxResult?.usedVolumeM3 ?? 0;
  const fillRate = maxVolume > 0 && usedVolume > 0 ? usedVolume / maxVolume * 100 : 0;
  const status = finalReady ? (!loaded && remaining ? '적재 불가' : '정적 검증 완료') : running ? '검사 중' : loaded ? '검증 대기' : '대기';
  const restrictedCount = live.cargo.filter(item => item.quantity > 0 && (item.maxStackLayers === 1 || item.maxTopLoadKg === 0)).length;
  return <details className="guided-job-summary" open={summaryOpen} onToggle={event => setSummaryOpen(event.currentTarget.open)}><summary className="studio-summary-toggle">현재 작업 요약</summary>
    <div className="studio-summary-heading"><h2>현재 작업</h2><span>OVERVIEW</span></div>
    <div className="studio-summary-equipment"><StudioIcon /><b>{equipment.shortName}</b><span>{live.container.length.toFixed(2)} × {live.container.width.toFixed(2)} × {live.container.height.toFixed(2)} m</span></div>
    <dl>
      <div><dt>적재공간</dt><dd>{equipment.shortName}</dd></div>
      <div><dt>선택 제품</dt><dd>{Object.keys(selection).length ? `${Object.keys(selection).length}종 / ${selectedUnits} EA` : '-'}</dd></div>
      <div><dt>포장 적재단위</dt><dd>{live.cargo.length ? `${live.cargo.length}종` : '-'}</dd></div>
      <div><dt>적재 유형</dt><dd>{mode === 'pallets' ? '파렛트 적재' : '박스 직접 적재'}</dd></div>
      <div><dt>적재 방식</dt><dd>{strategy ? strategyLabel(strategy) : '-'}</dd></div>
      {mode === 'pallets' && <div><dt>사용 파렛트</dt><dd>{palletSnapshot ? `${palletName}${palletSnapshot.result.palletCount}개` : palletType.name}</dd></div>}
      <div><dt>적재</dt><dd>{loaded ? `${loaded} EA` : '-'}</dd></div>
      <div><dt>미적재</dt><dd>{boxResult || palletSnapshot ? `${remaining} EA` : '-'}</dd></div>
      <div><dt>총 중량</dt><dd>{weight ? `${Math.round(weight).toLocaleString()} / ${live.container.maxPayloadKg.toLocaleString()} kg` : `- / ${live.container.maxPayloadKg.toLocaleString()} kg`}</dd></div>

      <div className="guided-status-row"><dt>상태</dt><dd><i className={finalReady ? 'good' : running ? 'running' : ''}/>{status}</dd></div>
    </dl>
    <div className="studio-capacity"><span>공간 사용률<b>{mode === 'boxes' ? `${fillRate.toFixed(1)}%` : '팔레트 결과 참고'}</b></span><meter aria-label="공간 사용률" min="0" max="100" value={mode === 'boxes' ? Math.min(100, fillRate) : 0}/><small>전체 공간 {maxVolume.toFixed(1)} m³</small></div>
    {step === 5 && !running && !finalReady && <div className="guided-loading-run-confirmation" aria-label="자동 적재 실행 설정 확인">
      <b>실행 설정 확인</b>
      <span>{mode === 'pallets' ? '파렛트 적재' : '박스 직접 적재'} · {strategy ? strategyLabel(strategy) : '방식 미확인'}</span>
      <small>설정을 확인한 뒤 ‘최종 적재 진행’을 눌러 1번 파일 적재·정적 검증을 시작하세요.</small>
    </div>}
    {step === 5 && mode === 'pallets' && restrictedCount > 0 && <p className="guided-pallet-stack-note">
      {restrictedCount}종은 1단 또는 상부 적재 금지로 설정되어 있습니다. 더 쌓으려면 박스 관리에 검증된 최대 적층단과 상부 허용중량을 등록하세요.
    </p>}
  </details>;
}

function BottomBar({ step, selectionCount, packagedReady, packagingConfirmed, strategy, running, finalReady, canReport, onAdvance, onApplyPackaging }: {
  step: StepId;
  selectionCount: number;
  packagedReady: boolean;
  packagingConfirmed: boolean;
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
    const updateHeight = () => { const height = bar.getBoundingClientRect().height; if (height > 0 && !bar.closest('.workspace-modal')) document.documentElement.style.setProperty('--guided-footer-height', `${height}px`); };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    return () => {
      observer.disconnect();

    };
  }, []);
  let label = '다음: 제품 선택';
  let disabled = false;
  let action = () => onAdvance(2);
  if (step === 2) { label = '다음: 제품 포장'; disabled = selectionCount < 1; action = () => onAdvance(3); }
  else if (step === 3) { label = '포장 확정 · 다음: 적재 방식 선택'; disabled = !packagedReady; action = onApplyPackaging; }
  else if (step === 4) { label = !packagingConfirmed ? '제품 포장을 먼저 확정하세요' : strategy ? '선택 완료 · 다음: 자동 적재' : '적재 방식을 선택하세요'; disabled = !strategy || !packagingConfirmed; action = () => onAdvance(5); }
  else if (step === 5) {
    if (finalReady) { label = '결과 확인'; action = () => onAdvance(6); }
    else { label = running ? '최종 적재 검사 중…' : '최종 적재 진행'; disabled = running || !strategy || !packagingConfirmed; action = () => dispatchAppAction('run-loading'); }
  } else if (step === 6) { label = canReport ? '통합 출하·적재 작업지시서 보기' : '미적재 사유 확인 · 조건을 변경해 다시 계산하세요'; disabled = !finalReady || !canReport; action = () => dispatchAppAction('print-report'); }
  return <div ref={barRef} className="guided-bottom-bar"><div className="studio-footer-left"><button type="button" className="guided-reset-link" onClick={() => dispatchAppAction('reset-all')}>↻ 전체 초기화</button><span className="studio-footer-step">STEP {String(step).padStart(2, '0')} <i>/</i> 06</span></div><div className="studio-footer-actions">{step > 1 && <button type="button" className="studio-back" onClick={() => onAdvance((step - 1) as StepId)}>이전 단계</button>}<button type="button" className="guided-primary-cta" disabled={disabled} onClick={action}>{label}{!running && step !== 6 ? '  ›' : ''}</button></div></div>;
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
  const [modalOpen, setModalOpen] = useState(false);
  const [packagingVisited, setPackagingVisited] = useState(false);
  const [packagingConfirmed, setPackagingConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [finalReady, setFinalReady] = useState(false);
  const [noLoadComplete, setNoLoadComplete] = useState(false);
  const completedEmpty = useRef<LiveDetail | null>(null);
  const previewActivated = useRef(false);
  const emptyInputsUnchanged = () => {
    const empty = completedEmpty.current, stored = readStoredState();
    const inputs = (value: LiveDetail) => JSON.stringify({ container: value.container, cargo: value.cargo.filter(item => item.quantity > 0) });
    return Boolean(empty && stored && inputs(empty) === inputs(stored) && inputs(empty) === inputs(readLive()));
  };

  const advance = (next: StepId) => { setStep(next); setModalOpen(next !== 5); if (next === 3) setPackagingVisited(true); setFurthest(previous => Math.max(previous, next) as StepId); };
  const openWorkspace = (next: StepId) => { setStep(next); setModalOpen(true); if (next === 3) setPackagingVisited(true); };
  useEffect(() => {
    if (!packaging.products.length && !previewActivated.current) return;
    previewActivated.current = true;
    const selected = packagingVisited ? packaging.cargo : packaging.products.map(product => ({ ...product, allowRotation: true }));
    publishWorkflowPreview({ cargo: selected, kind: packagingVisited ? 'packaging' : 'products' });
  }, [packaging.cargo, packaging.products, packagingVisited]);
  const applyPackaging = () => {
    if (!packaging.ready) return;
    completedEmpty.current = null;
    setPackagingConfirmed(true);
    writeShipmentInstructionSnapshot(packaging.products, packaging.assignments, packaging.cargo);
    writeStoredState({ container: live.container, cargo: packaging.cargo }, true);
    publishGuidedLoadingUnit('boxes');
    setStrategy(null);
    writeLoadingStrategyPreference(null);
    setFinalReady(false);
    advance(4);
  };
  const packagingKey = JSON.stringify({ container: live.container, cargo: packaging.cargo });
  useEffect(() => {
    setPackagingConfirmed(false);
    setStrategy(null);
    writeLoadingStrategyPreference(null);
    setFinalReady(false);
    setRunning(false);
    setNoLoadComplete(false);
    completedEmpty.current = null;
    setFurthest(previous => Math.min(previous, 3) as StepId);
  }, [packagingKey]);
  const chooseStrategy = useCallback((next: LoadingStrategy) => {
    if (next === strategy) return;
    completedEmpty.current = null;
    setNoLoadComplete(false);
    setRunning(false);
    setStrategy(next);
    writeLoadingStrategyPreference(next);
    setFinalReady(false);
    setFurthest(previous => previous > 5 ? 5 : previous);
  }, [strategy, live]);

  useEffect(() => {
    publishGuidedWorkflowState({ active: true, step });
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('root')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [step]);

  useEffect(() => () => {
    publishGuidedWorkflowState({ active: false, step: 1 });
    publishGuidedLoadingUnit(null);
    publishWorkflowPreview(null);
  }, []);

  useEffect(() => {
    writeLoadingStrategyPreference(null);
    return () => writeLoadingStrategyPreference(null);
  }, []);

  useEffect(() => {
    let frame = 0;
    let scene: HTMLElement | null = null;
    const positionFloatingBars = () => {
      const grid = document.querySelector<HTMLElement>('.dashboard-grid');
      if (!scene || !grid) return;
      const canvasBounds = scene.getBoundingClientRect(), gridBounds = grid.getBoundingClientRect();
      if (!canvasBounds.height) return;
      const controlsBottom = window.innerWidth <= 760 ? Math.max(canvasBounds.top, ...Array.from(grid.querySelectorAll<HTMLElement>('.unity-toolbar')).map(item => item.getBoundingClientRect().bottom)) : canvasBounds.top;
      const top = Math.max(8, controlsBottom - gridBounds.top + 10);
      grid.style.setProperty('--workspace-overlay-top', `${top}px`);
      grid.style.setProperty('--workspace-overlay-height', `${Math.max(44, canvasBounds.bottom - gridBounds.top - top - 130)}px`);
    };
    const resize = new ResizeObserver(positionFloatingBars);
    const syncHosts = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next: HostSet = {
          left: document.querySelector<HTMLElement>('.dashboard-left'),
          center: document.querySelector<HTMLElement>('.dashboard-center'),
          right: document.querySelector<HTMLElement>('.dashboard-right'),
        };
        setHosts(current => current.left === next.left && current.center === next.center && current.right === next.right ? current : next);
        const nextScene = document.querySelector<HTMLElement>('.viewer-host .unity-stage');
        if (nextScene !== scene) { resize.disconnect(); scene = nextScene; if (scene) resize.observe(scene); }
        positionFloatingBars();
      });
    };
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); };
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (completedEmpty.current && emptyInputsUnchanged()) { setLive(completedEmpty.current); return; }
      if (completedEmpty.current) {
        completedEmpty.current = null; setNoLoadComplete(false); setFinalReady(false);
        setFurthest(previous => Math.min(previous, 5) as StepId);
        setStep(previous => previous === 6 ? 5 : previous);
      }
      setLive(readLive());
    };
    const onAcceptanceInvalidated = (event: Event) => {
      const acceptance = (event as CustomEvent<LoadSimAcceptance | undefined>).detail;
      if (acceptance?.status === 'accepted' && isLoadSimAcceptedTarget(readPhysicsTarget())) return;
      // Empty results carry no certification. Unmounting the pallet viewer clears
      // its physics target, but must not close the completed reasons-only view.
      if (completedEmpty.current && emptyInputsUnchanged()) return;
      setFinalReady(false);
      setFurthest(previous => Math.min(previous, 5) as StepId);
      setStep(previous => previous === 6 ? 5 : previous);
    };
    const refreshSelection = () => setSelection(readProductSelection());
    const refreshIdentity = () => {
      completedEmpty.current = null;
      previewActivated.current = false;
      publishWorkflowPreview(null);
      setSelection(readProductSelection());
      setPackaging({ products: [], assignments: [], cargo: [], ready: false });
      publishGuidedLoadingUnit(null);
      setStrategy(null);
      writeLoadingStrategyPreference(null);
      setStep(1);
      setModalOpen(false);
      setPackagingVisited(false);
      setPackagingConfirmed(false);
      setFurthest(1);
      setRunning(false);
      setFinalReady(false);
    };
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
    window.addEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptanceInvalidated);
    window.addEventListener(PRODUCT_SELECTION_EVENT, refreshSelection);
    window.addEventListener(LOCAL_OPERATOR_EVENT, refreshIdentity);
    window.addEventListener(ADMIN_ACCESS_EVENT, refreshIdentity);
    window.addEventListener('container-loading:pallet-snapshot-updated', refresh);
    refresh();
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
      window.removeEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptanceInvalidated);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, refreshSelection);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, refreshIdentity);
      window.removeEventListener(ADMIN_ACCESS_EVENT, refreshIdentity);
      window.removeEventListener('container-loading:pallet-snapshot-updated', refresh);
    };
  }, []);

  useEffect(() => {
    const markRunning = () => {
      completedEmpty.current = null;
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
      if ((event as CustomEvent<AppActionDetail>).detail?.action === 'run-loading') { setModalOpen(false); markRunning(); }
    };
    const onNoLoad = (event: Event) => {
      const detail = (event as CustomEvent<LiveDetail>).detail;
      if (!detail?.result || detail.result.placements.length || !detail.result.remaining.length) return;
      completedEmpty.current = detail;
      setRunning(false); setNoLoadComplete(true); setFinalReady(true); setLive(detail);
      setFurthest(previous => Math.max(previous, 6) as StepId);
    };
    const onLoadingError = () => setRunning(false);
    const onInputInvalidated = () => {
      setRunning(false); setFinalReady(false); setNoLoadComplete(false); completedEmpty.current = null;
      setFurthest(previous => Math.min(previous, 5) as StepId);
    };
    const onAcceptance = () => {
      if (completedEmpty.current && emptyInputsUnchanged()) return;
      if (isLoadSimAcceptedTarget(readPhysicsTarget())) {
        markReady();
        return;
      }
      setRunning(false);
      setFinalReady(false);
      setFurthest(previous => Math.min(previous, 5) as StepId);
      setStep(previous => previous === 6 ? 5 : previous);
    };
    const onResultsOpened = () => {
      if (isLoadSimAcceptedTarget(readPhysicsTarget())) markReady();
    };

    window.addEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onInputInvalidated);
    window.addEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
    window.addEventListener(APP_ACTION_EVENT, onAppAction);
    window.addEventListener(FINAL_LOADING_WORKFLOW_ERROR_EVENT, onLoadingError);
    window.addEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptance);
    window.addEventListener(OPEN_RESULTS_MODAL_EVENT, onResultsOpened);
    return () => {
      window.removeEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onInputInvalidated);
      window.removeEventListener(NO_LOAD_RESULT_EVENT, onNoLoad);
      window.removeEventListener(APP_ACTION_EVENT, onAppAction);
      window.removeEventListener(FINAL_LOADING_WORKFLOW_ERROR_EVENT, onLoadingError);
      window.removeEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptance);
      window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, onResultsOpened);
    };
  }, []);

  const selectionCount = Object.keys(selection).length;
  const rail = hosts.left ? createPortal(<StepRail step={step} furthest={furthest} selectionCount={selectionCount} packagedReady={packaging.ready} strategy={strategy} running={running} finalReady={finalReady} onStep={openWorkspace}/>, hosts.left) : null;
  const summary = hosts.right ? createPortal(<JobSummary step={step} live={live} mode={mode} finalReady={finalReady} running={running} selection={selection} strategy={strategy}/>, hosts.right) : null;
  const footer = <BottomBar packagingConfirmed={packagingConfirmed} canReport={!noLoadComplete} step={step} selectionCount={selectionCount} packagedReady={packaging.ready} strategy={strategy} running={running} finalReady={finalReady} onAdvance={advance} onApplyPackaging={applyPackaging}/>;
  return <>{rail}{summary}{typeof document !== 'undefined' ? createPortal(<>
    <div hidden={modalOpen}>{footer}</div>
    <WorkspaceModal open={modalOpen} title={steps[step - 1].label} onClose={() => setModalOpen(false)} footer={footer}>
      <RetainedStagePanel step={step} live={live} selection={selection} strategy={strategy} onSelection={setSelection} onBundle={setPackaging} onStrategy={chooseStrategy}/>
    </WorkspaceModal>
  </>, document.body) : null}</>;
}
