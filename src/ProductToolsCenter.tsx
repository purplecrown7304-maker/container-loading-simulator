import { useEffect, useMemo, useRef, useState } from 'react';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import { optimizeCommonCartonFamily, type CommonCartonFamilyPlan } from './engine/commonCartonFamilyOptimizer';
import {
  optimizeProductPackaging,
  type BoxCatalogItem,
  type ProductPackagingAssignment,
} from './engine/productPackagingOptimizer';
import { getProductBoxCompatibility } from './productBoxCompatibility';
import { downloadProductTemplate, parseProductWorkbook } from './productExcel';
import {
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  enterprisePackagingOptionsFromPlanner,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { useTransportEquipment } from './transportEquipment';
import { formatBoxSize, packagingCandidates } from './productWorkflow';
import { OPEN_PRODUCT_TOOL_EVENT, type ProductToolView } from './productToolEvents';
import './product-tools-center.css';

type ProductDraft = {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightKg: number;
  maxUnitsPerBox: number;
  requiresBoxPackaging: boolean;
};

type SuggestedBox = {
  key: string;
  assignment: ProductPackagingAssignment;
  products: string[];
  reason: string;
};

const emptyDraft: ProductDraft = {
  id: '', name: '', lengthMm: 200, widthMm: 150, heightMm: 100,
  weightKg: 1, maxUnitsPerBox: 24, requiresBoxPackaging: true,
};
const mm = (value: number) => Math.round(value * 1000);

function containerFromEquipment(equipment: ReturnType<typeof useTransportEquipment>) {
  return {
    length: equipment.length,
    width: equipment.width,
    height: equipment.height,
    maxPayloadKg: equipment.maxPayloadKg,
    floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
    floorLoadWarningMultiplier: 3,
  };
}

function nextSuggestedId(boxes: BoxCatalogItem[], l: number, w: number, h: number) {
  const base = `REC-${mm(l)}X${mm(w)}X${mm(h)}`;
  if (!boxes.some(box => box.id === base)) return base;
  let index = 2;
  while (boxes.some(box => box.id === `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export default function ProductToolsCenter() {
  const equipment = useTransportEquipment();
  const container = useMemo(() => containerFromEquipment(equipment), [equipment]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ProductToolView | null>(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [familyPlan, setFamilyPlan] = useState<CommonCartonFamilyPlan | null>(null);
  const [additional, setAdditional] = useState<SuggestedBox[]>([]);

  useEffect(() => {
    const open = (event: Event) => {
      setView((event as CustomEvent<ProductToolView>).detail);
      setMessage('');
      setFamilyPlan(null);
      setAdditional([]);
    };
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(OPEN_PRODUCT_TOOL_EVENT, open);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    return () => {
      window.removeEventListener(OPEN_PRODUCT_TOOL_EVENT, open);
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, refresh);
    };
  }, []);

  const state = useMemo(() => readEnterprisePackagingPlannerState(), [revision, view]);
  const products = (state?.products ?? []) as CompanyProductItem[];
  const boxes = state?.boxes ?? [];
  const plannerState: EnterprisePackagingPlannerState = state ?? { container, products: [], boxes: [] };
  const filtered = products.filter(product => `${product.id} ${product.name}`.toLowerCase().includes(query.trim().toLowerCase()));

  const saveState = (nextProducts: CompanyProductItem[], nextBoxes = boxes) => {
    writeEnterprisePackagingPlannerState({
      ...plannerState,
      container,
      products: nextProducts,
      boxes: nextBoxes,
    });
  };

  const saveProduct = () => {
    const id = draft.id.trim();
    const name = draft.name.trim();
    if (!id || !name) return setMessage('제품코드와 제품명을 입력하세요.');
    if ([draft.lengthMm, draft.widthMm, draft.heightMm, draft.weightKg].some(value => !Number.isFinite(value) || value <= 0)) return setMessage('제품 크기와 중량은 0보다 커야 합니다.');
    if (!Number.isInteger(draft.maxUnitsPerBox) || draft.maxUnitsPerBox < 1) return setMessage('박스당 최대 EA는 1 이상의 정수여야 합니다.');
    if (!editingId && products.some(product => product.id === id)) return setMessage(`이미 등록된 제품코드입니다: ${id}`);
    const previous = editingId ? products.find(product => product.id === editingId) : undefined;
    const nextProduct: CompanyProductItem = {
      ...previous,
      id,
      name,
      length: draft.lengthMm / 1000,
      width: draft.widthMm / 1000,
      height: draft.heightMm / 1000,
      weightKg: draft.weightKg,
      quantity: Math.max(1, previous?.quantity ?? 1),
      maxUnitsPerBox: draft.maxUnitsPerBox,
      requiresBoxPackaging: draft.requiresBoxPackaging,
      orientationPolicy: previous?.orientationPolicy ?? 'base-rotation',
      allowRotation: previous?.allowRotation ?? true,
      cushioningM: previous?.cushioningM ?? 0.005,
      allowMixedCarton: previous?.allowMixedCarton ?? true,
    };
    const next = editingId ? products.map(product => product.id === editingId ? nextProduct : product) : [...products, nextProduct];
    saveState(next);
    setDraft(emptyDraft);
    setEditingId(null);
    setMessage(`${id} 제품 정보를 저장했습니다.`);
  };

  const editProduct = (product: CompanyProductItem) => {
    setEditingId(product.id);
    setDraft({
      id: product.id,
      name: product.name,
      lengthMm: mm(product.length),
      widthMm: mm(product.width),
      heightMm: mm(product.height),
      weightKg: product.weightKg,
      maxUnitsPerBox: product.maxUnitsPerBox ?? 24,
      requiresBoxPackaging: requiresBoxPackaging(product),
    });
  };

  const removeProduct = (product: CompanyProductItem) => {
    if (!window.confirm(`${product.id} ${product.name} 제품을 삭제할까요?`)) return;
    saveState(products.filter(item => item.id !== product.id));
    if (editingId === product.id) { setEditingId(null); setDraft(emptyDraft); }
    setMessage(`${product.id} 제품을 삭제했습니다.`);
  };

  const importWorkbook = async (file?: File) => {
    if (!file) return;
    try {
      const result = await parseProductWorkbook(file);
      const map = new Map(products.map(product => [product.id, product]));
      for (const imported of result.items) {
        const previous = map.get(imported.id);
        map.set(imported.id, {
          ...previous,
          ...imported,
          quantity: Math.max(1, previous?.quantity ?? imported.quantity ?? 1),
          orientationPolicy: previous?.orientationPolicy ?? imported.orientationPolicy,
          allowRotation: previous?.allowRotation ?? imported.allowRotation,
          cushioningM: previous?.cushioningM ?? imported.cushioningM,
          maxInternalLayers: previous?.maxInternalLayers,
          fragile: previous?.fragile,
          allowMixedCarton: previous?.allowMixedCarton ?? imported.allowMixedCarton,
        });
      }
      saveState([...map.values()]);
      setMessage(`제품 엑셀 반영 완료 · ${result.items.length}종 · 확인 필요 ${result.issues.length}건`);
    } catch {
      setMessage('제품 엑셀을 읽지 못했습니다. 기초 양식의 열 이름을 확인하세요.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const calculateCartons = () => {
    const boxed = products.filter(requiresBoxPackaging).map(product => ({ ...product, quantity: Math.max(1, product.quantity) }));
    if (!boxed.length) {
      setFamilyPlan(null);
      setAdditional([]);
      return setMessage('박스 포장이 필요한 제품이 없습니다.');
    }
    const options = enterprisePackagingOptionsFromPlanner({ ...plannerState, container, products: boxed, boxes });
    const family = optimizeCommonCartonFamily(container, boxed, boxes, options.packaging, { ...options.family, enabled: true });
    setFamilyPlan(family);

    const suggestions = new Map<string, SuggestedBox>();
    for (const product of boxed) {
      const current = optimizeProductPackaging(container, [product], boxes, { ...options.packaging, allowCustomBoxDesign: false }).assignments[0];
      const generated = optimizeProductPackaging(container, [product], [], { ...options.packaging, allowCustomBoxDesign: true }).assignments[0];
      if (!generated) continue;
      const meaningful = !current || generated.score > current.score + 0.04 || generated.productFillRate > current.productFillRate + 0.12;
      if (!meaningful) continue;
      const key = `${generated.outerLength.toFixed(4)}:${generated.outerWidth.toFixed(4)}:${generated.outerHeight.toFixed(4)}`;
      const existing = suggestions.get(key);
      if (existing) existing.products.push(product.id);
      else suggestions.set(key, {
        key,
        assignment: generated,
        products: [product.id],
        reason: !current ? '현재 보유 박스로 포장 불가' : '현재 보유 박스보다 제품 충진/적재 효율 개선',
      });
    }
    setAdditional([...suggestions.values()].sort((a, b) => b.products.length - a.products.length || b.assignment.score - a.assignment.score));
    setMessage(`제품 ${boxed.length}종과 현재 등록 박스 ${boxes.length}종을 함께 분석했습니다.`);
  };

  const registerAssignment = (assignment: ProductPackagingAssignment, label: string) => {
    const options = enterprisePackagingOptionsFromPlanner({ ...plannerState, container, products, boxes });
    const box: BoxCatalogItem = {
      id: nextSuggestedId(boxes, assignment.outerLength, assignment.outerWidth, assignment.outerHeight),
      name: `${label} ${mm(assignment.outerLength)}×${mm(assignment.outerWidth)}×${mm(assignment.outerHeight)} (강도확인)`,
      innerLength: assignment.innerLength,
      innerWidth: assignment.innerWidth,
      innerHeight: assignment.innerHeight,
      outerLength: assignment.outerLength,
      outerWidth: assignment.outerWidth,
      outerHeight: assignment.outerHeight,
      tareWeightKg: options.packaging.generatedBoxTareKg,
      maxGrossWeightKg: Math.max(options.packaging.maxGeneratedGrossWeightKg, assignment.grossWeightKg),
      maxTopLoadKg: 0,
      unitCost: assignment.boxUnitCost,
    };
    saveState(products, [...boxes, box]);
    setMessage(`${box.id} 규격을 회사 박스로 등록했습니다. 강도 확인 전 상부 허용중량은 0kg로 등록됩니다.`);
  };

  const registerFamily = (item: NonNullable<CommonCartonFamilyPlan['family']['selectedBoxes']>[number]) => {
    const options = enterprisePackagingOptionsFromPlanner({ ...plannerState, container, products, boxes });
    const wall = Math.max(0.001, options.packaging.wallThicknessM);
    const outerLength = item.outerLength;
    const outerWidth = item.outerWidth;
    const outerHeight = item.outerHeight;
    const box: BoxCatalogItem = {
      id: nextSuggestedId(boxes, outerLength, outerWidth, outerHeight),
      name: `범용 추천 ${mm(outerLength)}×${mm(outerWidth)}×${mm(outerHeight)} (강도확인)`,
      innerLength: Math.max(0.001, outerLength - wall * 2),
      innerWidth: Math.max(0.001, outerWidth - wall * 2),
      innerHeight: Math.max(0.001, outerHeight - wall * 2),
      outerLength, outerWidth, outerHeight,
      tareWeightKg: options.packaging.generatedBoxTareKg,
      maxGrossWeightKg: options.packaging.maxGeneratedGrossWeightKg,
      maxTopLoadKg: 0,
    };
    saveState(products, [...boxes, box]);
    setMessage(`${box.id} 범용 규격을 회사 박스로 등록했습니다. 압축강도 확인 후 상부 허용중량을 수정하세요.`);
  };

  if (!view) return null;
  const universal = familyPlan?.family.selectedBoxes.filter(item => item.assignedProducts.length >= 2) ?? [];

  return <div className="product-tools-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setView(null); }}>
    <section className="product-tools-dialog" role="dialog" aria-modal="true" aria-label={view === 'products' ? '회사 제품 관리' : '범용 및 추가 박스 추천'}>
      <header><div><span>COMPANY DATA</span><h2>{view === 'products' ? '회사 제품 관리' : '범용 · 추가 박스 스펙 추천'}</h2><p>{view === 'products' ? '제품 마스터를 관리합니다. 실제 출하 수량은 메인 2단계 제품 선택에서 입력합니다.' : '등록 제품 전체와 현재 회사 박스를 함께 분석해 공용화 규격과 추가 보유할 박스 스펙을 제안합니다.'}</p></div><button type="button" onClick={() => setView(null)}>×</button></header>

      {view === 'products' ? <div className="product-tools-body">
        <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={event => void importWorkbook(event.target.files?.[0])}/>
        <div className="product-tools-actions"><button onClick={downloadProductTemplate}>기초 엑셀 양식</button><button onClick={() => inputRef.current?.click()}>제품 엑셀 업로드</button><span>등록 {products.length}종 · 보유 박스 {boxes.length}종</span></div>
        <div className="product-master-form">
          <label>제품코드<input value={draft.id} disabled={Boolean(editingId)} onChange={event => setDraft(value => ({ ...value, id: event.target.value }))}/></label>
          <label>제품명<input value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))}/></label>
          <label>길이 mm<input type="number" min="1" value={draft.lengthMm} onChange={event => setDraft(value => ({ ...value, lengthMm: Number(event.target.value) }))}/></label>
          <label>폭 mm<input type="number" min="1" value={draft.widthMm} onChange={event => setDraft(value => ({ ...value, widthMm: Number(event.target.value) }))}/></label>
          <label>높이 mm<input type="number" min="1" value={draft.heightMm} onChange={event => setDraft(value => ({ ...value, heightMm: Number(event.target.value) }))}/></label>
          <label>중량 kg<input type="number" min=".001" step=".1" value={draft.weightKg} onChange={event => setDraft(value => ({ ...value, weightKg: Number(event.target.value) }))}/></label>
          <label>박스당 최대 EA<input type="number" min="1" step="1" value={draft.maxUnitsPerBox} onChange={event => setDraft(value => ({ ...value, maxUnitsPerBox: Number(event.target.value) }))}/></label>
          <label>박스 적재<select value={draft.requiresBoxPackaging ? 'yes' : 'no'} onChange={event => setDraft(value => ({ ...value, requiresBoxPackaging: event.target.value === 'yes' }))}><option value="yes">필요</option><option value="no">불필요 · 직접 적재</option></select></label>
          <div className="product-master-form-buttons"><button className="primary" onClick={saveProduct}>{editingId ? '제품 수정 저장' : '제품 등록'}</button>{editingId && <button onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>취소</button>}</div>
        </div>
        <div className="product-master-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="제품명 또는 제품코드 검색"/></div>
        <div className="product-master-list">
          <div className="product-master-head"><span>제품 정보</span><span>박스 적합성</span><span>자동 추천 포장</span><span>관리</span></div>
          {filtered.map(product => {
            const needsBox = requiresBoxPackaging(product);
            const compatibility = needsBox ? getProductBoxCompatibility(product, boxes) : null;
            const recommended = needsBox ? packagingCandidates(container, { ...product, quantity: 1 }, boxes, plannerState)[0] : undefined;
            return <article key={product.id}><div><b>{product.name}</b><span>{product.id} · {mm(product.length)}×{mm(product.width)}×{mm(product.height)} mm · {product.weightKg}kg</span></div><div>{!needsBox ? <><b>박스 불필요</b><span>직접 적재</span></> : compatibility?.status === 'fit' ? <><b className="good">적재 가능</b><span>보유 박스 {compatibility.compatibleBoxCount}종 적합</span></> : compatibility?.status === 'unfit' ? <><b className="warn">적재 불가</b><span>현재 등록 박스에 맞지 않음</span></> : <><b>등록 박스 없음</b><span>신규 규격 추천 사용</span></>}</div><div>{recommended ? <><b>{formatBoxSize(recommended)}</b><span>{recommended.source === 'catalog' ? `보유 · ${recommended.boxName}` : '추가 추천 규격'} · {recommended.unitsPerBox}EA/BOX</span></> : <><b>-</b><span>{needsBox ? '추천 불가' : '제품 실물 적재'}</span></>}</div><div className="product-row-actions"><button onClick={() => editProduct(product)}>수정</button><button onClick={() => removeProduct(product)}>삭제</button></div></article>;
          })}
        </div>
      </div> : <div className="product-tools-body">
        <div className="carton-analyze-head"><div><b>분석 대상</b><span>회사 제품 {products.filter(requiresBoxPackaging).length}종 · 현재 회사 박스 {boxes.length}종 · {equipment.shortName}</span></div><button className="primary" onClick={calculateCartons}>제품·보유박스 분석</button></div>
        {familyPlan && <div className="carton-metrics"><div><span>개별 최적 규격</span><b>{familyPlan.family.baselineBoxTypes}종</b></div><div><span>범용화 후</span><b>{familyPlan.family.selectedBoxTypes}종</b></div><div><span>규격 절감</span><b>{familyPlan.family.boxTypeSavings}종</b></div><div><span>평균 효율 손실</span><b>{(familyPlan.family.averageScoreLoss * 100).toFixed(1)}%</b></div></div>}
        <div className="carton-tool-section"><div className="carton-tool-title"><h3>범용 상자 크기 추천</h3><span>여러 제품에 같이 사용할 수 있는 규격</span></div>{universal.length ? universal.map(item => <article className="carton-recommend-row" key={`${item.id}-${item.outerLength}`}><div><b>{mm(item.outerLength)} × {mm(item.outerWidth)} × {mm(item.outerHeight)} mm</b><span>{item.source === 'catalog' ? '현재 보유 박스 재사용' : '신규 범용 규격'}</span></div><div><b>{item.assignedProducts.length}개 제품 공용</b><span>{item.assignedProducts.join(', ')}</span></div>{item.source === 'catalog' ? <strong className="registered">보유 중</strong> : <button onClick={() => registerFamily(item)}>회사 박스로 등록</button>}</article>) : <div className="carton-empty">분석 버튼을 누르면 범용 규격이 표시됩니다.</div>}</div>
        <div className="carton-tool-section"><div className="carton-tool-title"><h3>추가 보유 권장 박스</h3><span>현재 박스 스펙과 비교했을 때 추가하면 효율이 좋아지는 규격</span></div>{additional.length ? additional.map(item => <article className="carton-recommend-row" key={item.key}><div><b>{formatBoxSize(item.assignment)}</b><span>{item.reason}</span></div><div><b>{item.products.length}개 제품 개선</b><span>{item.products.join(', ')} · {item.assignment.unitsPerBox}EA/BOX · 충진율 {Math.round(item.assignment.productFillRate * 100)}%</span></div><button onClick={() => registerAssignment(item.assignment, '추가추천')}>회사 박스로 등록</button></article>) : <div className="carton-empty">분석 후 현재 보유 박스보다 추가 가치가 있는 규격만 표시합니다.</div>}</div>
      </div>}
      {message && <footer className="product-tools-message">{message}</footer>}
    </section>
  </div>;
}
