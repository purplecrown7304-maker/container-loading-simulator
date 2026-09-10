import { useEffect, useMemo, useRef, useState } from 'react';
import CommonCartonRecommendations from './CommonCartonRecommendations';
import { randomUniqueCargoColor } from './cargoColors';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import {
  defaultProductPackagingOptions,
  optimizeProductPackaging,
  type BoxCatalogItem,
  type ProductPackagingAssignment,
} from './engine/productPackagingOptimizer';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  enterprisePackagingOptionsFromPlanner,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { getProductBoxCompatibility } from './productBoxCompatibility';
import { downloadProductTemplate, parseProductWorkbook } from './productExcel';
import { writeShipmentInstructionSnapshot } from './shipmentInstruction';
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
  requiresBoxPackaging: boolean;
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
  requiresBoxPackaging: true,
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

function plannerState(container: ContainerSpec, products: CompanyProductItem[], boxes: BoxCatalogItem[]): EnterprisePackagingPlannerState {
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
  product: CompanyProductItem,
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

function cargoFromProducts(products: CompanyProductItem[], assignments: ProductPackagingAssignment[]): CargoItem[] {
  const assignmentByProduct = new Map(assignments.map(item => [item.productId, item]));
  const usedColors: string[] = [];
  const cargo: CargoItem[] = [];

  for (const product of products) {
    const displayColor = randomUniqueCargoColor(usedColors);
    usedColors.push(displayColor);
    if (!requiresBoxPackaging(product)) {
      cargo.push({
        id: `DIRECT-${product.id}`,
        name: `${product.name} · 직접 적재`,
        length: product.length,
        width: product.width,
        height: product.height,
        weightKg: product.weightKg,
        quantity: product.quantity,
        maxStackLayers: 1,
        maxTopLoadKg: 0,
        allowRotation: product.allowRotation !== false,
        displayColor,
      });
      continue;
    }

    const item = assignmentByProduct.get(product.id);
    if (!item) continue;
    cargo.push({
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
    });
  }
  return cargo;
}

export default function CompanyProductLoadingFlow() {
  const productInputRef = useRef<HTMLInputElement>(null);
  const equipment = useTransportEquipment();
  const container = useMemo(() => equipmentContainer(equipment), [equipment]);
  const stored = useMemo(() => readEnterprisePackagingPlannerState(), []);
  const [products, setProducts] = useState<CompanyProductItem[]>(() => (stored?.products ?? []) as CompanyProductItem[]);
  const [boxes, setBoxes] = useState<BoxCatalogItem[]>(stored?.boxes ?? []);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, ProductPackagingAssignment[]>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('회사 제품을 등록하고 출하 수량을 정한 뒤 박스를 추천받으세요.');
  const [runningFinal, setRunningFinal] = useState(false);

  const boxedProducts = useMemo(() => products.filter(requiresBoxPackaging), [products]);
  const directProducts = useMemo(() => products.filter(product => !requiresBoxPackaging(product)), [products]);

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
      setMessage(`최종 적재 완료 · ${detail.result.placements.length}개 적재단위 · 미적재 ${detail.result.remaining.reduce((sum, item) => sum + item.quantity, 0)}개 · 통합 출하·적재 작업지시서에 결과가 연결됩니다.`);
      window.setTimeout(() => dispatchAppAction('show-results'), 0);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    };
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, [runningFinal]);

  const persist = (nextProducts: CompanyProductItem[], nextBoxes = boxes) => {
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

    const previous = editingId ? products.find(item => item.id === editingId) : undefined;
    const nextItem: CompanyProductItem = {
      id,
      name,
      length: draft.lengthMm / 1000,
      width: draft.widthMm / 1000,
      height: draft.heightMm / 1000,
      weightKg: draft.weightKg,
      quantity: draft.quantity,
      requiresBoxPackaging: draft.requiresBoxPackaging,
      maxUnitsPerBox: previous?.maxUnitsPerBox ?? 24,
      orientationPolicy: previous?.orientationPolicy ?? 'base-rotation',
      allowRotation: previous?.allowRotation ?? true,
      cushioningM: previous?.cushioningM ?? 0.005,
      maxInternalLayers: previous?.maxInternalLayers,
      fragile: previous?.fragile,
      allowMixedCarton: previous?.allowMixedCarton ?? true,
    };
    const next = editingId
      ? products.map((item) => item.id === editingId ? nextItem : item)
      : [...products, nextItem];
    setProducts(next);
    persist(next);
    setDraft(emptyDraft);
    setEditingId(null);
    invalidateRecommendations(`${id} 제품을 저장했습니다. ${draft.requiresBoxPackaging ? '등록 박스 적합성을 확인한 뒤 박스 추천을 실행하세요.' : '박스 없이 제품 자체 규격으로 직접 적재됩니다.'}`);
  };

  const importProductWorkbook = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await parseProductWorkbook(file);
      if (!result.items.length) {
        const firstIssue = result.issues[0]?.message;
        setMessage(`등록 가능한 제품이 없습니다.${firstIssue ? ` ${firstIssue}` : ''}`);
        return;
      }

      const map = new Map(products.map(item => [item.id, item]));
      let newCount = 0;
      let updatedCount = 0;
      for (const imported of result.items) {
        const previous = map.get(imported.id);
        if (previous) updatedCount += 1;
        else newCount += 1;
        map.set(imported.id, {
          ...previous,
          ...imported,
          orientationPolicy: previous?.orientationPolicy ?? imported.orientationPolicy,
          allowRotation: previous?.allowRotation ?? imported.allowRotation,
          cushioningM: previous?.cushioningM ?? imported.cushioningM,
          maxInternalLayers: previous?.maxInternalLayers,
          fragile: previous?.fragile,
          allowMixedCarton: previous?.allowMixedCarton ?? imported.allowMixedCarton,
        });
      }

      const next = [...map.values()];
      setProducts(next);
      persist(next);
      setDraft(emptyDraft);
      setEditingId(null);
      const issueText = result.issues.length ? ` · 확인 ${result.issues.length}건` : '';
      invalidateRecommendations(`제품 엑셀 반영 완료 · 신규 ${newCount}종 · 기존 갱신 ${updatedCount}종${issueText}`);
    } catch {
      setMessage('제품 엑셀 파일을 읽지 못했습니다. 기초 엑셀 양식의 열 이름과 파일 형식을 확인하세요.');
    } finally {
      if (productInputRef.current) productInputRef.current.value = '';
    }
  };

  const editProduct = (item: CompanyProductItem) => {
    setEditingId(item.id);
    setDraft({
      id: item.id,
      name: item.name,
      lengthMm: mm(item.length),
      widthMm: mm(item.width),
      heightMm: mm(item.height),
      weightKg: item.weightKg,
      quantity: item.quantity,
      requiresBoxPackaging: requiresBoxPackaging(item),
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
    invalidateRecommendations(`회사 보유 박스 ${nextBoxes.length}종을 다시 불러왔습니다. 제품 비고의 적재 가능 여부도 갱신했습니다.`);
  };

  const recommend = () => {
    if (!products.length) return setMessage('먼저 회사 제품을 1개 이상 등록하세요.');
    if (!boxedProducts.length) {
      setRecommendations({});
      setSelected({});
      return setMessage('모든 제품이 박스 불필요로 설정되어 있습니다. 박스 추천 없이 바로 최종 적재를 실행할 수 있습니다.');
    }
    const state = plannerState(container, products, boxes);
    const next: Record<string, ProductPackagingAssignment[]> = {};
    const nextSelected: Record<string, string> = {};
    const failed: string[] = [];

    for (const product of boxedProducts) {
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
      : `박스 추천 완료 · 박스 필요 제품별 최대 3개 후보 · 현재 1순위가 자동 선택되어 있습니다.`);
  };

  const selectedAssignments = useMemo(() => boxedProducts.flatMap((product) => {
    const choice = selected[product.id];
    return (recommendations[product.id] ?? []).filter((item) => item.boxId === choice).slice(0, 1);
  }), [boxedProducts, recommendations, selected]);

  const canExecute = products.length > 0 && selectedAssignments.length === boxedProducts.length && !runningFinal;

  const executeFinal = () => {
    if (!canExecute) return setMessage('박스 적재가 필요한 모든 제품의 추천 박스를 하나씩 선택하세요.');
    const cargo = cargoFromProducts(products, selectedAssignments);
    const totalUnits = cargo.reduce((sum, item) => sum + item.quantity, 0);
    writeShipmentInstructionSnapshot(products, selectedAssignments, cargo);
    writeStoredState({ container, cargo }, true);
    setMessage(`선택 완료 · 박스 포장 ${selectedAssignments.reduce((sum, item) => sum + item.boxesNeeded, 0)}BOX + 직접 적재 ${directProducts.reduce((sum, item) => sum + item.quantity, 0)}EA · 총 ${totalUnits}개 적재단위로 최종 계산을 시작합니다.`);
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
        <p>제품 실물 규격과 출하 수량, 박스 적재 필요 여부를 기준으로 포장 제품과 직접 적재 제품을 나눠 최종 적재까지 연결합니다.</p>
      </div>
      <div className="company-equipment-badge"><small>현재 장비</small><b>{equipment.shortName}</b><span>{mm(container.length)}×{mm(container.width)}×{mm(container.height)} mm</span></div>
    </header>

    <div className="company-flow-steps" aria-label="진행 단계">
      <span className={products.length ? 'done' : 'active'}><b>1</b> 제품 등록</span>
      <span className={products.length && !Object.keys(recommendations).length ? 'active' : Object.keys(recommendations).length ? 'done' : ''}><b>2</b> 수량·포장 확정</span>
      <span className={Object.keys(recommendations).length || !boxedProducts.length ? 'active' : ''}><b>3</b> 박스 추천·선택</span>
      <span className={canExecute || runningFinal ? 'active' : ''}><b>4</b> 최종 적재</span>
    </div>

    <div className="company-product-layout">
      <article className="company-product-card">
        <div className="company-card-title"><div><h3>1. 회사 제품 등록</h3><p>한 번 등록한 제품은 다음 출하에서도 수량과 포장 방식만 바꿔 재사용합니다.</p></div><strong>{products.length}종</strong></div>
        <input ref={productInputRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => void importProductWorkbook(event.target.files?.[0])} />
        <div className="company-excel-actions">
          <button onClick={downloadProductTemplate}>기초 엑셀 양식 다운로드</button>
          <button className="excel-primary" onClick={() => productInputRef.current?.click()}>제품 엑셀 업로드</button>
          <span>제품코드 · 제품명 · L/W/H · 중량 · 출하수량 · 박스적재필요 · 박스당 최대EA</span>
        </div>
        <div className="company-product-form">
          <label>제품코드<input value={draft.id} disabled={Boolean(editingId)} onChange={(e) => setDraft((value) => ({ ...value, id: e.target.value }))} placeholder="PRD-001" /></label>
          <label>제품명<input value={draft.name} onChange={(e) => setDraft((value) => ({ ...value, name: e.target.value }))} placeholder="회사 제품명" /></label>
          <label>길이 mm<input type="number" min="1" value={draft.lengthMm} onChange={(e) => setDraft((value) => ({ ...value, lengthMm: Number(e.target.value) }))} /></label>
          <label>폭 mm<input type="number" min="1" value={draft.widthMm} onChange={(e) => setDraft((value) => ({ ...value, widthMm: Number(e.target.value) }))} /></label>
          <label>높이 mm<input type="number" min="1" value={draft.heightMm} onChange={(e) => setDraft((value) => ({ ...value, heightMm: Number(e.target.value) }))} /></label>
          <label>제품중량 kg<input type="number" min="0.001" step="0.1" value={draft.weightKg} onChange={(e) => setDraft((value) => ({ ...value, weightKg: Number(e.target.value) }))} /></label>
          <label className="quantity-field">출하 수량 EA<input type="number" min="1" step="1" value={draft.quantity} onChange={(e) => setDraft((value) => ({ ...value, quantity: Number(e.target.value) }))} /></label>
          <label className="packaging-mode-field">박스 적재<select value={draft.requiresBoxPackaging ? 'box' : 'direct'} onChange={(e) => setDraft((value) => ({ ...value, requiresBoxPackaging: e.target.value === 'box' }))}><option value="box">필요</option><option value="direct">불필요 · 직접 적재</option></select></label>
        </div>
        <div className="company-inline-actions">
          <button className="primary" onClick={saveProduct}>{editingId ? '제품 수정 저장' : '제품 등록'}</button>
          {editingId && <button onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>취소</button>}
        </div>

        <div className="company-product-list">
          {products.length ? products.map((item) => {
            const needsBox = requiresBoxPackaging(item);
            const compatibility = needsBox ? getProductBoxCompatibility(item, boxes) : null;
            const remarkClass = !needsBox ? 'direct' : compatibility?.status ?? 'no-box';
            const remark = !needsBox ? '박스 불필요' : compatibility?.status === 'fit' ? '적재 가능' : compatibility?.status === 'unfit' ? '적재 불가' : '등록 박스 없음';
            const remarkDetail = !needsBox
              ? '제품 자체 직접 적재'
              : compatibility?.status === 'fit'
                ? `적합 박스 ${compatibility.compatibleBoxCount}종`
                : compatibility?.status === 'unfit'
                  ? '현재 등록 박스 0종 적합'
                  : '박스 등록 후 자동 판정';
            return <div key={item.id} className="company-product-row">
              <div><b>{item.id} · {item.name}</b><span>{mm(item.length)}×{mm(item.width)}×{mm(item.height)} mm · {item.weightKg}kg · {needsBox ? `박스당 최대 ${item.maxUnitsPerBox ?? 24}EA` : '직접 적재'}</span></div>
              <label>출하수량<input type="number" min="1" step="1" value={item.quantity} onChange={(e) => changeQuantity(item.id, Number(e.target.value))} /></label>
              <div className={`company-product-remark ${remarkClass}`}><small>비고</small><b>{remark}</b><span>{remarkDetail}</span></div>
              <button onClick={() => editProduct(item)}>수정</button>
              <button onClick={() => removeProduct(item.id)}>삭제</button>
            </div>;
          }) : <div className="company-empty">등록된 회사 제품이 없습니다.</div>}
        </div>
      </article>

      <article className="company-product-card recommendation-card">
        <div className="company-card-title"><div><h3>2. 제품별 박스 추천</h3><p>박스 적재가 필요한 제품만 크기·수량·중량·컨테이너 효율을 비교합니다.</p></div><strong>보유 박스 {boxes.length}종</strong></div>
        <div className="company-inline-actions split">
          <button onClick={refreshBoxes}>회사 박스 목록 새로고침</button>
          <button className="primary" onClick={recommend} disabled={!boxedProducts.length}>박스 추천 실행</button>
        </div>
        {!boxes.length && boxedProducts.length > 0 && <p className="company-note">회사 보유 박스가 아직 없으면 자동설계 박스를 추천합니다. 보유 박스의 내·외경과 허용중량은 아래 ‘고급 포장 설정 / 회사 박스 관리’에서 등록할 수 있습니다.</p>}

        <div className="company-recommendations">
          {products.map((product) => {
            if (!requiresBoxPackaging(product)) return <section key={product.id} className="company-recommend-product direct-product">
              <header><div><b>{product.id} · {product.name}</b><span>{product.quantity} EA 출하</span></div><small>박스 불필요</small></header>
              <div className="company-empty direct">제품 자체 규격 {mm(product.length)}×{mm(product.width)}×{mm(product.height)}mm로 직접 적재합니다. 안전상 기본 적층은 1단으로 적용됩니다.</div>
            </section>;
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

    <CommonCartonRecommendations container={container} products={boxedProducts} boxes={boxes} />

    <div className="company-final-bar">
      <div><b>3. 선택 완료 → 최종 적재 실행</b><span>박스 필요 {selectedAssignments.length}/{boxedProducts.length}개 제품 선택 · 직접 적재 {directProducts.length}종 · 포장박스 {selectedAssignments.reduce((sum, item) => sum + item.boxesNeeded, 0)}BOX</span></div>
      <button className="primary" disabled={!canExecute} onClick={executeFinal}>{runningFinal ? '최종 적재 계산 중…' : '선택 완료 · 최종 적재 실행'}</button>
    </div>
    <p className={`company-flow-message ${runningFinal ? 'running' : ''}`} aria-live="polite">{message}</p>
  </section>;
}
