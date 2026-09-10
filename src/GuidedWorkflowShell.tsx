import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { readStoredState, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';
import {
  OPEN_TRANSPORT_SELECTOR_EVENT,
  TRANSPORT_EQUIPMENT_EVENT,
  useTransportEquipment,
  type TransportCategory,
  type TransportEquipment,
} from './transportEquipment';
import { dispatchAppAction } from './uiEvents';
import {
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  readEnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import type { ProductPackagingAssignment } from './engine/productPackagingOptimizer';
import {
  PRODUCT_SELECTION_EVENT,
  cargoFromProductPackaging,
  formatBoxSize,
  packagingCandidates,
  readProductSelection,
  selectedProducts,
  writeProductSelection,
  type ProductSelectionMap,
} from './productWorkflow';
import ProductPackagingPreview3D from './ProductPackagingPreview3D';
import { writeShipmentInstructionSnapshot } from './shipmentInstruction';

type LiveDetail = { container: ContainerSpec; cargo: CargoItem[]; result?: LoadingResult };
type PalletSnapshotLite = {
  result?: {
    placements?: unknown[];
    remaining?: Array<{ cargoId: string; quantity: number; reason: string }>;
    totalPalletizedWeightKg?: number;
    palletCount?: number;
  };
};
type WorkflowWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
  __containerLoadingPalletSnapshot?: PalletSnapshotLite;
};

type HostSet = { left: HTMLElement | null; center: HTMLElement | null; right: HTMLElement | null };
type StepId = 1 | 2 | 3 | 4 | 5;
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
  { id: 4, label: '자동 적재' },
  { id: 5, label: '결과 확인' },
];

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

function currentMode(): 'boxes' | 'pallets' {
  const active = document.querySelector<HTMLButtonElement>('.mode-tabs button.active');
  return (active?.textContent ?? '').includes('팔레트') ? 'pallets' : 'boxes';
}

function clickMode(mode: 'boxes' | 'pallets') {
  const label = mode === 'boxes' ? '박스' : '팔레트';
  const target = [...document.querySelectorAll<HTMLButtonElement>('.mode-tabs button')]
    .find(button => (button.textContent ?? '').trim() === label);
  target?.click();
}

function openEquipment(category?: TransportCategory) {
  window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: category ? { category } : undefined }));
}

function formatDimensions(item: CargoItem) {
  return `${Math.round(item.length * 1000)} × ${Math.round(item.width * 1000)} × ${Math.round(item.height * 1000)} mm`;
}

function EquipmentIllustration({ equipment }: { equipment: TransportEquipment }) {
  const openTop = equipment.geometry === 'open-top' || equipment.geometry === 'flat-rack' || equipment.geometry === 'platform';
  const truck = equipment.category === 'truck';
  const refrigerated = equipment.temperatureControlled;
  return <button type="button" className="guided-equipment-visual" onClick={() => openEquipment(equipment.category)} aria-label={`${equipment.shortName} 적재공간 다시 선택`}>
    <svg viewBox="0 0 760 260" role="img" aria-label={`${equipment.shortName} 적재공간 그림`}>
      <defs>
        <linearGradient id="space-floor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eef3f8"/><stop offset="1" stopColor="#d9e1e9"/></linearGradient>
        <linearGradient id="space-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f9fbfd"/><stop offset="1" stopColor="#e8edf2"/></linearGradient>
      </defs>
      <rect width="760" height="260" rx="18" fill="#f7f8fa" />
      <polygon points="135,195 560,195 650,140 225,140" fill="url(#space-floor)" stroke="#9aa6b2" strokeWidth="2" />
      {equipment.geometry !== 'platform' && <polygon points="135,195 135,78 225,32 225,140" fill="url(#space-wall)" stroke="#8c99a6" strokeWidth="2" />}
      {!openTop && <polygon points="135,78 560,78 650,32 225,32" fill="#f3f6f9" stroke="#8c99a6" strokeWidth="2" />}
      {!openTop && <polygon points="560,195 560,78 650,32 650,140" fill="#e5ebf1" stroke="#8c99a6" strokeWidth="2" />}
      {(equipment.geometry === 'flat-rack') && <><line x1="135" y1="195" x2="135" y2="72" stroke="#687583" strokeWidth="8"/><line x1="225" y1="140" x2="225" y2="28" stroke="#687583" strokeWidth="8"/><line x1="560" y1="195" x2="560" y2="74" stroke="#687583" strokeWidth="8"/><line x1="650" y1="140" x2="650" y2="29" stroke="#687583" strokeWidth="8"/></>}
      {truck && <><rect x="80" y="153" width="58" height="42" rx="9" fill="#b7c0ca"/><circle cx="96" cy="202" r="14" fill="#49535e"/><circle cx="534" cy="202" r="14" fill="#49535e"/></>}
      {refrigerated && <g><rect x="245" y="52" width="72" height="26" rx="6" fill="#d8ecfb" stroke="#4e88b6"/><path d="M266 58v14M280 58v14M294 58v14" stroke="#4e88b6" strokeWidth="3"/></g>}
      <line x1="160" y1="218" x2="558" y2="218" stroke="#4779c8" strokeWidth="2"/><path d="M160 218l12-6v12zM558 218l-12-6v12z" fill="#4779c8"/><text x="359" y="238" textAnchor="middle" fontSize="13" fontWeight="700" fill="#4b5563">내부 길이 {(equipment.length * 1000).toLocaleString()} mm</text>
      <text x="28" y="30" fontSize="14" fontWeight="800" fill="#29323d">{equipment.shortName}</text>
      <text x="28" y="51" fontSize="11" fill="#7a838d">그림을 클릭하면 적재공간을 다시 선택합니다.</text>
      <text x="620" y="222" fontSize="11" fontWeight="700" fill="#c55353">문쪽 ▶</text>
    </svg>
  </button>;
}

function StepRail({ step, furthest, selectionCount, packagedReady, finalReady, onStep }: {
  step: StepId;
  furthest: StepId;
  selectionCount: number;
  packagedReady: boolean;
  finalReady: boolean;
  onStep: (step: StepId) => void;
}) {
  return <section className="guided-step-rail" aria-label="작업 준비 단계">
    <h2>작업 준비</h2>
    <div className="guided-step-list">
      {steps.map(item => {
        const complete = item.id < step || (item.id === 3 && packagedReady && step > 3) || (item.id === 5 && finalReady);
        const current = item.id === step;
        const enabled = item.id <= furthest;
        const meta = item.id === 1 ? '공간 확인'
          : item.id === 2 ? (selectionCount ? `${selectionCount}종 선택` : '미선택')
          : item.id === 3 ? (packagedReady ? '포장안 준비' : '대기')
          : item.id === 4 ? (finalReady ? '검사 완료' : '대기')
          : finalReady ? '확인 가능' : '-';
        return <button key={item.id} type="button" className={`${current ? 'current' : ''} ${complete ? 'complete' : ''}`} disabled={!enabled} onClick={() => enabled && onStep(item.id)}>
          <span className="guided-step-dot">{complete ? '✓' : item.id}</span>
          <span className="guided-step-copy"><b>{item.label}</b><small>{meta}</small></span>
        </button>;
      })}
    </div>
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
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
  }, []);
  const state = useMemo(() => readEnterprisePackagingPlannerState(), [revision]);
  const products = (state?.products ?? []) as CompanyProductItem[];
  const boxes = state?.boxes ?? [];
  const filtered = products.filter(product => `${product.id} ${product.name}`.toLowerCase().includes(query.trim().toLowerCase()));
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
    <div className="guided-product-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="제품명 또는 제품코드 검색" /></div>
    {!products.length ? <div className="guided-empty product-empty"><b>등록된 회사 제품이 없습니다.</b><span>제품 등록은 우측 상단 메뉴 → 회사 제품 관리에서 합니다.</span></div> : <div className="guided-product-table">
      <div className="guided-product-table-head"><span>제품 정보</span><span>포장</span><span>자동 추천 상자</span><span>이번 출하 수량</span></div>
      {filtered.map(product => {
        const quantity = selection[product.id] ?? 0;
        const candidate = requiresBoxPackaging(product)
          ? packagingCandidates(container, { ...product, quantity: Math.max(1, quantity || 1) }, boxes, state)[0]
          : undefined;
        return <article key={product.id} className={quantity > 0 ? 'selected' : ''}>
          <div className="guided-product-info"><b>{product.name}</b><span>{product.id} · {Math.round(product.length * 1000)}×{Math.round(product.width * 1000)}×{Math.round(product.height * 1000)} mm · {product.weightKg} kg</span></div>
          <div className="guided-product-pack-type">{requiresBoxPackaging(product) ? <><b>박스 필요</b><span>포장 단계에서 확정</span></> : <><b>직접 적재</b><span>박스 없음</span></>}</div>
          <div className="guided-product-auto-box">{requiresBoxPackaging(product) ? candidate ? <><b>{formatBoxSize(candidate)}</b><span>{candidate.source === 'catalog' ? `보유 박스 · ${candidate.boxName}` : '신규 추천 규격'} · {candidate.unitsPerBox}EA/BOX</span></> : <><b className="warn">추천 불가</b><span>제품/박스 조건 확인</span></> : <><b>해당 없음</b><span>제품 실물 규격 사용</span></>}</div>
          <div className="guided-product-qty"><button type="button" onClick={() => updateQty(product.id, Math.max(0, quantity - 1))}>−</button><input type="number" min="0" step="1" value={quantity} onChange={event => updateQty(product.id, Number(event.target.value))}/><button type="button" onClick={() => updateQty(product.id, quantity + 1)}>＋</button></div>
        </article>;
      })}
      {!filtered.length && <div className="guided-empty">검색 결과가 없습니다.</div>}
    </div>}
    <p className="guided-stage-help">제품 규격이나 제품 자체 등록정보를 수정하려면 메뉴의 <b>회사 제품 관리</b>를 사용합니다.</p>
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
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
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
          <div className="guided-package-choice">{list.length ? <><select value={choices[product.id] ?? ''} onChange={event => setChoices(current => ({ ...current, [product.id]: event.target.value }))}>{list.map((item, index) => <option key={`${item.boxId}-${index}`} value={item.boxId}>{index + 1}순위 · {Math.round(item.outerLength * 1000)}×{Math.round(item.outerWidth * 1000)}×{Math.round(item.outerHeight * 1000)} · {item.source === 'catalog' ? '보유' : '신규'}</option>)}</select>{active && <span>{active.unitsPerBox}EA/BOX · 충진율 {Math.round(active.productFillRate * 100)}% · {active.boxName}</span>}</> : <><strong className="warn">추천 가능한 박스 없음</strong><span>제품 관리 또는 박스 관리에서 조건을 확인하세요.</span></>}</div>
          <div>{active ? <><b>{active.boxesNeeded} BOX</b><span>포장 후 수량</span></> : <><b>-</b><span>포장 불가</span></>}</div>
        </article>;
      })}
    </div>
    {cargo.length > 0 ? <ProductPackagingPreview3D container={container} cargo={cargo} /> : <div className="guided-empty">포장 미리보기를 만들 수 없습니다.</div>}
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

function StagePanel({ step, live, selection, onSelection, onBundle }: {
  step: StepId;
  live: LiveDetail;
  selection: ProductSelectionMap;
  onSelection: (next: ProductSelectionMap) => void;
  onBundle: (bundle: PackagingBundle) => void;
}) {
  const equipment = useTransportEquipment();
  if (step === 1) return <section className="guided-stage-panel guided-equipment-stage">
    <div className="guided-panel-title"><h1>적재공간 선택</h1></div>
    <div className="guided-segmented"><button type="button" className={equipment.category === 'container' ? 'active' : ''} onClick={() => openEquipment('container')}>컨테이너</button><button type="button" className={equipment.category === 'truck' ? 'active' : ''} onClick={() => openEquipment('truck')}>트럭</button></div>
    <div className="guided-section-label">현재 선택 적재공간</div>
    <button type="button" className="guided-equipment-card selected" onClick={() => openEquipment(equipment.category)}><span className="guided-equipment-icon">{equipment.category === 'truck' ? '▰' : '▥'}</span><span><b>{equipment.shortName}</b><small>{equipment.name}</small><small>다시 클릭하면 적재공간 변경</small></span><i>✓</i></button>
    <EquipmentIllustration equipment={equipment} />
    <div className="guided-equipment-specs"><div><span>내부 길이</span><b>{(equipment.length * 1000).toLocaleString()} mm</b></div><div><span>내부 폭</span><b>{(equipment.width * 1000).toLocaleString()} mm</b></div><div><span>내부 높이</span><b>{(equipment.height * 1000).toLocaleString()} mm</b></div><div><span>최대 적재중량</span><b>{equipment.maxPayloadKg.toLocaleString()} kg</b></div><div><span>바닥 허용하중</span><b>{equipment.floorLoadLimitKgPerM2.toLocaleString()} kg/m²</b></div><div><span>적재 용적</span><b>{(equipment.volumeM3 ?? equipment.length * equipment.width * equipment.height).toFixed(1)} m³</b></div></div>
  </section>;
  if (step === 2) return <ProductSelectionStage container={live.container} selection={selection} onSelection={onSelection} />;
  if (step === 3) return <PackagingStage container={live.container} selection={selection} onBundle={onBundle} />;
  if (step === 5) return <ResultStage live={live} />;
  return <section className="guided-stage-panel guided-loading-placeholder" aria-hidden="true" />;
}

function JobSummary({ live, mode, finalReady, running, selection }: {
  live: LiveDetail;
  mode: 'boxes' | 'pallets';
  finalReady: boolean;
  running: boolean;
  selection: ProductSelectionMap;
}) {
  const equipment = useTransportEquipment();
  const palletSnapshot = typeof window === 'undefined' ? undefined : (window as WorkflowWindow).__containerLoadingPalletSnapshot;
  const boxResult = live.result;
  const loaded = mode === 'pallets' ? palletSnapshot?.result?.placements?.length ?? 0 : boxResult?.placements.length ?? 0;
  const remaining = mode === 'pallets' ? palletSnapshot?.result?.remaining?.reduce((sum, item) => sum + item.quantity, 0) ?? 0 : boxResult?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const selectedUnits = Object.values(selection).reduce((sum, value) => sum + value, 0);
  const weight = mode === 'pallets' ? palletSnapshot?.result?.totalPalletizedWeightKg ?? 0 : boxResult?.loadedWeightKg ?? 0;
  const maxVolume = live.container.length * live.container.width * live.container.height;
  const usedVolume = boxResult?.usedVolumeM3 ?? 0;
  const fillRate = maxVolume > 0 && usedVolume > 0 ? usedVolume / maxVolume * 100 : 0;
  const status = finalReady ? '작업 가능' : running ? '검사 중' : loaded ? '검증 대기' : '대기';
  return <section className="guided-job-summary"><h2>현재 작업</h2><dl><div><dt>적재공간</dt><dd>{equipment.shortName}</dd></div><div><dt>선택 제품</dt><dd>{Object.keys(selection).length ? `${Object.keys(selection).length}종 / ${selectedUnits} EA` : '-'}</dd></div><div><dt>포장 적재단위</dt><dd>{live.cargo.length ? `${live.cargo.length}종` : '-'}</dd></div><div><dt>적재</dt><dd>{loaded ? `${loaded} EA` : '-'}</dd></div><div><dt>미적재</dt><dd>{boxResult || palletSnapshot ? `${remaining} EA` : '-'}</dd></div><div><dt>총 중량</dt><dd>{weight ? `${Math.round(weight).toLocaleString()} / ${live.container.maxPayloadKg.toLocaleString()} kg` : `- / ${live.container.maxPayloadKg.toLocaleString()} kg`}</dd></div><div><dt>공간 사용률</dt><dd>{mode === 'boxes' && usedVolume ? `${fillRate.toFixed(1)}%` : '-'}</dd></div><div className="guided-status-row"><dt>상태</dt><dd><i className={finalReady ? 'good' : running ? 'running' : ''}/>{status}</dd></div></dl></section>;
}

function BottomBar({ step, selectionCount, packagedReady, running, finalReady, onAdvance, onApplyPackaging }: {
  step: StepId;
  selectionCount: number;
  packagedReady: boolean;
  running: boolean;
  finalReady: boolean;
  onAdvance: (step: StepId) => void;
  onApplyPackaging: () => void;
}) {
  let label = '다음: 제품 선택';
  let disabled = false;
  let action = () => onAdvance(2);
  if (step === 2) { label = '다음: 제품 포장'; disabled = selectionCount < 1; action = () => onAdvance(3); }
  else if (step === 3) { label = '포장 확정 · 다음: 자동 적재'; disabled = !packagedReady; action = onApplyPackaging; }
  else if (step === 4) {
    if (finalReady) { label = '결과 확인'; action = () => onAdvance(5); }
    else { label = running ? '최종 적재 검사 중…' : '최종 적재 진행'; disabled = running; action = () => dispatchAppAction('run-loading'); }
  } else if (step === 5) { label = '통합 출하·적재 작업지시서 보기'; disabled = !finalReady; action = () => dispatchAppAction('print-report'); }
  return <div className="guided-bottom-bar"><button type="button" className="guided-reset-link" onClick={() => dispatchAppAction('reset-all')}>↻ 전체 초기화</button><button type="button" className="guided-primary-cta" disabled={disabled} onClick={action}>{label}{!running && step !== 5 ? '  ›' : ''}</button><span className="guided-bottom-spacer"/></div>;
}

export default function GuidedWorkflowShell() {
  const initialSelection = readProductSelection();
  const [hosts, setHosts] = useState<HostSet>({ left: null, center: null, right: null });
  const [live, setLive] = useState<LiveDetail>(() => readLive());
  const [mode, setMode] = useState<'boxes' | 'pallets'>(() => typeof document === 'undefined' ? 'boxes' : currentMode());
  const [selection, setSelection] = useState<ProductSelectionMap>(initialSelection);
  const [packaging, setPackaging] = useState<PackagingBundle>({ products: [], assignments: [], cargo: [], ready: false });
  const [step, setStep] = useState<StepId>(() => Object.keys(initialSelection).length ? 2 : 1);
  const [furthest, setFurthest] = useState<StepId>(() => Object.keys(initialSelection).length ? 2 : 1);
  const [running, setRunning] = useState(false);
  const [finalReady, setFinalReady] = useState(false);

  const advance = (next: StepId) => { setStep(next); setFurthest(previous => Math.max(previous, next) as StepId); };
  const applyPackaging = () => {
    if (!packaging.ready) return;
    writeShipmentInstructionSnapshot(packaging.products, packaging.assignments, packaging.cargo);
    writeStoredState({ container: live.container, cargo: packaging.cargo }, true);
    clickMode('boxes');
    setMode('boxes');
    advance(4);
  };

  useEffect(() => {
    document.documentElement.dataset.guidedWorkflow = 'true';
    document.documentElement.dataset.guidedStep = String(step);
    return () => { delete document.documentElement.dataset.guidedWorkflow; delete document.documentElement.dataset.guidedStep; };
  }, [step]);

  useEffect(() => {
    let frame = 0;
    const syncHosts = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(() => setHosts({ left: document.querySelector<HTMLElement>('.dashboard-left'), center: document.querySelector<HTMLElement>('.dashboard-center'), right: document.querySelector<HTMLElement>('.dashboard-right') })); };
    syncHosts();
    const observer = new MutationObserver(syncHosts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  useEffect(() => {
    const refresh = () => { setLive(readLive()); setMode(currentMode()); };
    const refreshSelection = () => setSelection(readProductSelection());
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
    window.addEventListener(PRODUCT_SELECTION_EVENT, refreshSelection);
    window.addEventListener('container-loading:pallet-snapshot-updated', refresh);
    const observer = new MutationObserver(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('.inspection-status-table tbody tr')];
      const workOrderRow = rows.find(row => (row.textContent ?? '').includes('작업지시서'));
      const ready = Boolean(workOrderRow && /발급 가능|보기 가능|완료|경고 발급/.test(workOrderRow.textContent ?? ''));
      const activeRun = Boolean(document.querySelector('.calculation-overlay')) || rows.some(row => /진행/.test(row.textContent ?? ''));
      setFinalReady(ready);
      setRunning(activeRun && !ready);
      if (ready) setFurthest(previous => Math.max(previous, 5) as StepId);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
    refresh();
    return () => {
      observer.disconnect();
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, refreshSelection);
      window.removeEventListener('container-loading:pallet-snapshot-updated', refresh);
    };
  }, []);

  const selectionCount = Object.keys(selection).length;
  const rail = useMemo(() => hosts.left ? createPortal(<StepRail step={step} furthest={furthest} selectionCount={selectionCount} packagedReady={packaging.ready} finalReady={finalReady} onStep={setStep}/>, hosts.left) : null, [hosts.left, step, furthest, selectionCount, packaging.ready, finalReady]);
  const center = useMemo(() => hosts.center ? createPortal(<StagePanel step={step} live={live} selection={selection} onSelection={setSelection} onBundle={setPackaging}/>, hosts.center) : null, [hosts.center, step, live, selection]);
  const summary = useMemo(() => hosts.right ? createPortal(<JobSummary live={live} mode={mode} finalReady={finalReady} running={running} selection={selection}/>, hosts.right) : null, [hosts.right, live, mode, finalReady, running, selection]);
  return <>{rail}{center}{summary}{typeof document !== 'undefined' ? createPortal(<BottomBar step={step} selectionCount={selectionCount} packagedReady={packaging.ready} running={running} finalReady={finalReady} onAdvance={advance} onApplyPackaging={applyPackaging}/>, document.body) : null}</>;
}
