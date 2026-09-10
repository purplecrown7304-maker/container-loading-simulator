import { useEffect, useMemo, useState } from 'react';
import { randomUniqueCargoColor } from './cargoColors';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import {
  defaultProductPackagingOptions,
  optimizeProductPackaging,
  type BoxCatalogItem,
  type ProductItem,
  type ProductPackagingAssignment,
} from './engine/productPackagingOptimizer';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  enterprisePackagingOptionsFromPlanner,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { writeStoredState } from './storage';
import { useTransportEquipment } from './transportEquipment';
import { dispatchAppAction } from './uiEvents';
import './company-product-flow.css';

type ProductDraft = {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightKg: number;
  quantity: number;
};

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };

const emptyDraft: ProductDraft = {
  id: '',
  name: '',
  lengthMm: 200,
  widthMm: 150,
  heightMm: 100,
  weightKg: 1,
  quantity: 100,
};

const mm = (value: number) => Math.round(value * 1000);
const pct = (value: number) => `${Math.round(value * 100)}%`;

function equipmentContainer(equipment: ReturnType<typeof useTransportEquipment>): ContainerSpec {
  return {
    length: equipment.length,
    width: equipment.width,
    height: equipment.height,
    maxPayloadKg: equipment.maxPayloadKg,
    floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
    floorLoadWarningMultiplier: 3,
  };
}

function plannerState(container: ContainerSpec, products: ProductItem[], boxes: BoxCatalogItem[]): EnterprisePackagingPlannerState {
  const stored = readEnterprisePackagingPlannerState();
  return {
    container,
    products,
    boxes,
    settings: stored?.settings,
  };
}

function productCandidateList(
  container: ContainerSpec,
  product: ProductItem,
  boxes: BoxCatalogItem[],
  state: EnterprisePackagingPlannerState,
): ProductPackagingAssignment[] {
  const enterpriseOptions = enterprisePackagingOptionsFromPlanner(state);
  const packagingOptions = enterpriseOptions.packaging ?? defaultProductPackagingOptions;
  const candidates: ProductPackagingAssignment[] = [];

  for (const box of boxes) {
    const plan = optimizeProductPackaging(container, [product], [box], {
      ...packagingOptions,
      allowCustomBoxDesign: false,
    });
    if (plan.assignments[0]) candidates.push(plan.assignments[0]);
  }

  const generated = optimizeProductPackaging(container, [product], [], {
    ...packagingOptions,
    allowCustomBoxDesign: true,
  }).assignments[0];
  if (generated) candidates.push(generated);

  const unique = new Map<string, ProductPackagingAssignment>();
  for (const candidate of candidates) {
    const key = `${candidate.boxId}:${candidate.outerLength.toFixed(4)}:${candidate.outerWidth.toFixed(4)}:${candidate.outerHeight.toFixed(4)}`;
    const previous = unique.get(key);
    if (!previous || candidate.score > previous.score) unique.set(key, candidate);
  }

  return [...unique.values()]
    .sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || b.productFillRate - a.productFillRate)
    .slice(0, 3);
}

function cargoFromAssignments(assignments: ProductPackagingAssignment[]): CargoItem[] {
  const usedColors: string[] = [];
  return assignments.map((item) => {
    const displayColor = randomUniqueCargoColor(usedColors);
    usedColors.push(displayColor);
    return {
      id: `PKG-${item.productId}`,
      name: `${item.productName} · ${item.boxName}`,
      length: item.outerLength,
      width: item.outerWidth,
      height: item.outerHeight,
      weightKg: item.grossWeightKg,
      quantity: item.boxesNeeded,
      maxStackLayers: item.maxStackLayers,
      maxTopLoadKg: item.maxTopLoadKg,
      allowRotation: true,
      displayColor,
    } satisfies CargoItem;
  });
}

export default function CompanyProductLoadingFlow() {
  const equipment = useTransportEquipment();
  const container = useMemo(() => equipmentContainer(equipment), [equipment]);
  const stored = useMemo(() => readEnterprisePackagingPlannerState(), []);
  const [products, setProducts] = useState<ProductItem[]>(stored?.products ?? []);
  const [boxes, setBoxes] = useState<BoxCatalogItem[]>(stored?.boxes ?? []);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, ProductPackagingAssignment[]>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('회사 제품을 등록하고 출하 수량을 정한 뒤 박스를 추천받으세요.');
  const [runningFinal, setRunningFinal] = useState(false);

  useEffect(() => {
    const latest = readEnterprisePackagingPlannerState();
    if (latest) setBoxes(latest.boxes ?? []);
  }, []);

  useEffect(() => {
    if (!runningFinal) return;
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<LoadingDetail>).detail;
      if (!detail?.result?.placements?.length) return;
      setRunningFinal(false);
      setMessage(`최종 적재 완료 · ${detail.result.placements.length}박스 적재 · 미적재 ${detail.result.remaining.reduce((sum, item) => sum + item.quantity, 0)}박스`);
      window.setTimeout(() => dispatchAppAction('show-results'), 0);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    };
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, [runningFinal]);

  const persist = (nextProducts: ProductItem[], nextBoxes = boxes) => {
    writeEnterprisePackagingPlannerState(plannerState(container, nextProducts, nextBoxes));
  };

  const invalidateRecommendations = (text?: string) => {
    setRecommendations({});
    setSelected({});
    if (text) setMessage(text);
  };

  const saveProduct = () => {
    const id = draft.id.trim();
    const name = draft.name.trim();
    if (!id || !name) return setMessage('제품 코드와 제품명을 입력하세요.');
    if (!editingId && products.some((item) => item.id === id)) return setMessage(`이미 등록된 제품 코드입니다: ${id}`);
    if ([draft.lengthMm, draft.widthMm, draft.heightMm, draft.weightKg].some((value) => !Number.isFinite(value) || value <= 0)) return setMessage('제품 크기와 중량은 0보다 커야 합니다.');
    if (!Number.isInteger(draft.quantity) || draft.quantity < 1) return setMessage('출하 수량은 1 이상의 정수여야 합니다.');

    const nextItem: ProductItem = {
      id,
      name,
      length: draft.lengthMm / 1000,
      width: draft.widthMm / 1000,
      height: draft.heightMm / 1000,
      weightKg: draft.weightKg,
      quantity: draft.quantity,
      maxUnitsPerBox: 24,
      orientationPolicy: 'base-rotation',
      allowRotation: true,
      cushioningM: 0.005,
      allowMixedCarton: true,
    };
    const next = editingId
      ? products.map((item) => item.id === editingId ? nextItem : item)
      : [...products, nextItem];
    setProducts(next);
    persist(next);
    setDraft(emptyDraft);
    setEditingId(null);
    invalidateRecommendations(`${id} 제품을 저장했습니다. 출하 제품이 모두 준비되면 박스 추천을 실행하세요.`);
  };

  const editProduct = (item: ProductItem) => {
    setEditingId(item.id);
    setDraft({
      id: item.id,
      name: item.name,
      lengthMm: mm(item.length),
      widthMm: mm(item.width),
      heightMm: mm(item.height),
      weightKg: item.weightKg,
      quantity: item.quantity,
    });
  };

  const removeProduct = (id: string) => {
    const next = products.filter((item) => item.id !== id);
    setProducts(next);
    persist(next);
    if (editingId === id) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
    invalidateRecommendations(`${id} 제품을 삭제했습니다.`);
  };

  const changeQuantity = (id: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const next = products.map((item) => item.id === id ? { ...item, quantity } : item);
    setProducts(next);
    persist(next);
    invalidateRecommendations('출하 수량이 변경되어 박스 추천을 다시 계산해야 합니다.');
  };

  const refreshBoxes = () => {
    const latest = readEnterprisePackagingPlannerState();
    const nextBoxes = latest?.boxes ?? [];
    setBoxes(nextBoxes);
    invalidateRecommendations(`회사 보유 박스 ${nextBoxes.length}종을 다시 불러왔습니다.`);
  };

  const recommend = () => {
    if (!products.length) return setMessage('먼저 회사 제품을 1개 이상 등록하세요.');
    const state = plannerState(container, products, boxes);
    const next: Record<string, ProductPackagingAssignment[]> = {};
    const nextSelected: Record<string, string> = {};
    const failed: string[] = [];

    for (const product of products) {
      const list = productCandidateList(container, product, boxes, state);
      next[product.id] = list;
      if (list[0]) nextSelected[product.id] = list[0].boxId;
      else failed.push(product.id);
    }

    setRecommendations(next);
    setSelected(nextSelected);
    const totalCandidates = Object.values(next).reduce((sum, list) => sum + list.length, 0);
    setMessage(failed.length
      ? `박스 추천 완료 · 후보 ${totalCandidates}개 · 추천 불가 제품 ${failed.join(', ')}`
      : `박스 추천 완료 · 제품별 최대 3개 후보 · 현재 1순위가 자동 선택되어 있습니다.`);
  };

  const selectedAssignments = useMemo(() => products.flatMap((product) => {
    const choice = selected[product.id];
    return (recommendations[product.id] ?? []).filter((item) => item.boxId === choice).slice(0, 1);
  }), [products, recommendations, selected]);

  const canExecute = products.length > 0 && selectedAssignments.length === products.length && !runningFinal;

  const executeFinal = () => {
    if (!canExecute) return setMessage('모든 제품의 추천 박스를 하나씩 선택하세요.');
    const cargo = cargoFromAssignments(selectedAssignments);
    const totalBoxes = cargo.reduce((sum, item) => sum + item.quantity, 0);
    writeStoredState({ container, cargo }, true);
    setMessage(`선택 완료 · ${products.length}개 제품을 ${totalBoxes}박스로 변환했습니다. 최종 적재 계산을 시작합니다.`);
    window.setTimeout(() => {
      setRunningFinal(true);
      dispatchAppAction('run-loading');
    }, 120);
  };

  return <section className="company-product-flow" aria-label="회사 제품 박스 추천 및 최종 적재">
    <header className="company-product-flow-head">
      <div>
        <span>COMPANY PRODUCT LOADING</span>
        <h2>회사 제품 → 박스 추천 → 선택 → 최종 적재</h2>
        <p>제품 실물 규격과 출하 수량을 기준으로 회사 보유 박스와 자동설계 박스를 비교한 뒤 선택한 포장안으로 바로 적재 결과를 계산합니다.</p>
      </div>
      <div className="company-equipment-badge"><small>현재 장비</small><b>{equipment.shortName}</b><span>{mm(container.length)}×{mm(container.width)}×{mm(container.height)} mm</span></div>
    </header>

    <div className="company-flow-steps" aria-label="진행 단계">
      <span className={products.length ? 'done' : 'active'}><b>1</b> 제품 등록</span>
      <span className={products.length && !Object.keys(recommendations).length ? 'active' : Object.keys(recommendations).length ? 'done' : ''}><b>2</b> 수량 확정</span>
      <span className={Object.keys(recommendations).length ? 'active' : ''}><b>3</b> 박스 추천·선택</span>
      <span className={canExecute || runningFinal ? 'active' : ''}><b>4</b> 최종 적재</span>
    </div>

    <div className="company-product-layout">
      <article className="company-product-card">
        <div className="company-card-title"><div><h3>1. 회사 제품 등록</h3><p>한 번 등록한 제품은 다음 출하에서도 수량만 바꿔 재사용합니다.</p></div><strong>{products.length}종</strong></div>
        <div className="company-product-form">
          <label>제품코드<input value={draft.id} disabled={Boolean(editingId)} onChange={(e) => setDraft((value) => ({ ...value, id: e.target.value }))} placeholder="PRD-001" /></label>
          <label>제품명<input value={draft.name} onChange={(e) => setDraft((value) => ({ ...value, name: e.target.value }))} placeholder="회사 제품명" /></label>
          <label>길이 mm<input type="number" min="1" value={draft.lengthMm} onChange={(e) => setDraft((value) => ({ ...value, lengthMm: Number(e.target.value) }))} /></label>
          <label>폭 mm<input type="number" min="1" value={draft.widthMm} onChange={(e) => setDraft((value) => ({ ...value, widthMm: Number(e.target.value) }))} /></label>
          <label>높이 mm<input type="number" min="1" value={draft.heightMm} onChange={(e) => setDraft((value) => ({ ...value, heightMm: Number(e.target.value) }))} /></label>
          <label>제품중량 kg<input type="number" min="0.001" step="0.1" value={draft.weightKg} onChange={(e) => setDraft((value) => ({ ...value, weightKg: Number(e.target.value) }))} /></label>
          <label className="quantity-field">출하 수량 EA<input type="number" min="1" step="1" value={draft.quantity} onChange={(e) => setDraft((value) => ({ ...value, quantity: Number(e.target.value) }))} /></label>
        </div>
        <div className="company-inline-actions">
          <button className="primary" onClick={saveProduct}>{editingId ? '제품 수정 저장' : '제품 등록'}</button>
          {editingId && <button onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>취소</button>}
        </div>

        <div className="company-product-list">
          {products.length ? products.map((item) => <div key={item.id} className="company-product-row">
            <div><b>{item.id} · {item.name}</b><span>{mm(item.length)}×{mm(item.width)}×{mm(item.height)} mm · {item.weightKg}kg</span></div>
            <label>출하수량<input type="number" min="1" step="1" value={item.quantity} onChange={(e) => changeQuantity(item.id, Number(e.target.value))} /></label>
            <button onClick={() => editProduct(item)}>수정</button>
            <button onClick={() => removeProduct(item.id)}>삭제</button>
          </div>) : <div className="company-empty">등록된 회사 제품이 없습니다.</div>}
        </div>
      </article>

      <article className="company-product-card recommendation-card">
        <div className="company-card-title"><div><h3>2. 제품별 박스 추천</h3><p>제품 크기·수량·중량·컨테이너 효율을 함께 비교합니다.</p></div><strong>보유 박스 {boxes.length}종</strong></div>
        <div className="company-inline-actions split">
          <button onClick={refreshBoxes}>회사 박스 목록 새로고침</button>
          <button className="primary" onClick={recommend}>박스 추천 실행</button>
        </div>
        {!boxes.length && <p className="company-note">회사 보유 박스가 아직 없으면 자동설계 박스를 추천합니다. 보유 박스의 내·외경과 허용중량은 아래 ‘고급 포장 설정 / 회사 박스 관리’에서 등록할 수 있습니다.</p>}

        <div className="company-recommendations">
          {products.map((product) => {
            const list = recommendations[product.id] ?? [];
            return <section key={product.id} className="company-recommend-product">
              <header><div><b>{product.id} · {product.name}</b><span>{product.quantity} EA 출하</span></div>{list.length > 0 && <small>{list.length}개 후보</small>}</header>
              {list.length ? <div className="company-box-options">{list.map((item, index) => {
                const checked = selected[product.id] === item.boxId;
                return <label key={`${product.id}-${item.boxId}`} className={`company-box-option ${checked ? 'selected' : ''}`}>
                  <input type="radio" name={`box-${product.id}`} checked={checked} onChange={() => setSelected((value) => ({ ...value, [product.id]: item.boxId }))} />
                  <div className="rank"><b>{index + 1}</b><span>{index === 0 ? '추천' : '대안'}</span></div>
                  <div className="box-copy"><b>{item.boxName}</b><span>{mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)} mm</span><small>{item.source === 'catalog' ? '회사 보유 박스' : '자동설계 박스'} · 박스당 {item.unitsPerBox}EA · 총 {item.boxesNeeded}박스</small></div>
                  <div className="box-score"><b>{pct(item.productFillRate)}</b><span>제품 충진</span><small>적재 예상 {item.simulatedLoadedBoxes}/{item.boxesNeeded}</small></div>
                </label>;
              })}</div> : Object.keys(recommendations).length ? <div className="company-empty danger">이 제품에 맞는 박스를 찾지 못했습니다.</div> : <div className="company-empty">박스 추천 실행 후 후보가 표시됩니다.</div>}
            </section>;
          })}
        </div>
      </article>
    </div>

    <div className="company-final-bar">
      <div><b>3. 선택 완료 → 최종 적재 실행</b><span>{selectedAssignments.length}/{products.length}개 제품 박스 선택 · 선택 박스 총 {selectedAssignments.reduce((sum, item) => sum + item.boxesNeeded, 0)}EA</span></div>
      <button className="primary" disabled={!canExecute} onClick={executeFinal}>{runningFinal ? '최종 적재 계산 중…' : '선택 완료 · 최종 적재 실행'}</button>
    </div>
    <p className={`company-flow-message ${runningFinal ? 'running' : ''}`} aria-live="polite">{message}</p>
  </section>;
}
