import { useEffect, useMemo, useState } from 'react';
import {
  defaultEnterprisePackagingOptions,
  optimizeEnterprisePackaging,
  type EnterprisePackagingPlan,
} from './engine/enterprisePackagingOptimizer';
import {
  type BoxCatalogItem,
  type ProductItem,
  type ProductOrientationPolicy,
} from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { readStoredState, writeStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

type ProductDraft = {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightKg: number;
  quantity: number;
  maxUnitsPerBox: number;
  orientationPolicy: ProductOrientationPolicy;
  cushioningMm: number;
  maxInternalLayers: number;
  fragile: boolean;
  allowMixedCarton: boolean;
};

type BoxDraft = {
  id: string;
  name: string;
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  outerLengthMm: number;
  outerWidthMm: number;
  outerHeightMm: number;
  tareWeightKg: number;
  maxGrossWeightKg: number;
  maxTopLoadKg: number | '';
  unitCost: number | '';
};

type PlannerSettings = {
  allowCustom: boolean;
  maxGrossKg: number;
  generatedBoxUnitCost: number;
  familyEnabled: boolean;
  targetBoxTypes: number;
  maxScoreLossPct: number;
  allowMixedResidual: boolean;
  containerFreightCost: number;
  handlingCostPerCarton: number;
  newBoxSetupCost: number;
  cartonSkuCarryCost: number;
  currency: string;
};

type StoredPlanner = {
  products: ProductItem[];
  boxes: BoxCatalogItem[];
  container: ContainerSpec;
  settings?: PlannerSettings;
};

const emptyProduct: ProductDraft = {
  id: '', name: '', lengthMm: 200, widthMm: 120, heightMm: 80,
  weightKg: 0.5, quantity: 100, maxUnitsPerBox: 24,
  orientationPolicy: 'base-rotation', cushioningMm: 5, maxInternalLayers: 0,
  fragile: false, allowMixedCarton: true,
};

const emptyBox: BoxDraft = {
  id: '', name: '', innerLengthMm: 590, innerWidthMm: 390, innerHeightMm: 390,
  outerLengthMm: 600, outerWidthMm: 400, outerHeightMm: 400,
  tareWeightKg: 0.8, maxGrossWeightKg: 22, maxTopLoadKg: 80, unitCost: '',
};

const defaultSettings: PlannerSettings = {
  allowCustom: true,
  maxGrossKg: 22,
  generatedBoxUnitCost: 0,
  familyEnabled: true,
  targetBoxTypes: 4,
  maxScoreLossPct: 8,
  allowMixedResidual: false,
  containerFreightCost: 0,
  handlingCostPerCarton: 0,
  newBoxSetupCost: 0,
  cartonSkuCarryCost: 0,
  currency: 'KRW',
};

function readPlanner(): StoredPlanner | null {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPlanner : null;
  } catch {
    return null;
  }
}

function savePlanner(value: StoredPlanner) {
  try { localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const mm = (m: number) => Math.round(m * 1000);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const numberOrEmpty = (value: string) => value.trim() === '' ? '' : Number(value);
const money = (value: number, currency: string) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;

function productToDraft(item: ProductItem): ProductDraft {
  return {
    id: item.id,
    name: item.name,
    lengthMm: mm(item.length),
    widthMm: mm(item.width),
    heightMm: mm(item.height),
    weightKg: item.weightKg,
    quantity: item.quantity,
    maxUnitsPerBox: item.maxUnitsPerBox ?? 24,
    orientationPolicy: item.orientationPolicy ?? (item.allowRotation === false ? 'upright' : 'base-rotation'),
    cushioningMm: mm(item.cushioningM ?? 0),
    maxInternalLayers: item.maxInternalLayers ?? 0,
    fragile: item.fragile === true,
    allowMixedCarton: item.allowMixedCarton !== false,
  };
}

function boxToDraft(item: BoxCatalogItem): BoxDraft {
  return {
    id: item.id,
    name: item.name,
    innerLengthMm: mm(item.innerLength), innerWidthMm: mm(item.innerWidth), innerHeightMm: mm(item.innerHeight),
    outerLengthMm: mm(item.outerLength), outerWidthMm: mm(item.outerWidth), outerHeightMm: mm(item.outerHeight),
    tareWeightKg: item.tareWeightKg,
    maxGrossWeightKg: item.maxGrossWeightKg,
    maxTopLoadKg: item.maxTopLoadKg ?? '',
    unitCost: item.unitCost ?? '',
  };
}

export default function EnterprisePackagingPlanner() {
  const stored = useMemo(() => typeof window === 'undefined' ? null : readPlanner(), []);
  const [container, setContainer] = useState<ContainerSpec>(() => stored?.container ?? readStoredState()?.container ?? defaultContainer);
  const [products, setProducts] = useState<ProductItem[]>(stored?.products ?? []);
  const [boxes, setBoxes] = useState<BoxCatalogItem[]>(stored?.boxes ?? []);
  const [settings, setSettings] = useState<PlannerSettings>({ ...defaultSettings, ...(stored?.settings ?? {}) });
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [boxDraft, setBoxDraft] = useState<BoxDraft>(emptyBox);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [plan, setPlan] = useState<EnterprisePackagingPlan | null>(null);
  const [message, setMessage] = useState('제품 목록과 보유 박스를 등록한 뒤 기업 포장 최적화를 실행하세요.');

  useEffect(() => { savePlanner({ products, boxes, container, settings }); }, [products, boxes, container, settings]);

  useEffect(() => {
    const quick = document.querySelector('.quick-card .quick-row');
    if (!quick || quick.querySelector('.product-packaging-shortcut')) return;
    const button = document.createElement('button');
    button.className = 'product-packaging-shortcut';
    button.textContent = '제품→박스 자동설계';
    button.addEventListener('click', () => document.getElementById('product-packaging-planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    quick.prepend(button);
    return () => button.remove();
  }, []);

  const invalidatePlan = (text?: string) => {
    setPlan(null);
    if (text) setMessage(text);
  };

  const resetProductDraft = () => {
    setProductDraft(emptyProduct);
    setEditingProductId(null);
  };

  const saveProduct = () => {
    const id = productDraft.id.trim();
    const name = productDraft.name.trim();
    if (!id || !name) return setMessage('제품 코드와 제품명을 입력하세요.');
    if (!editingProductId && products.some((item) => item.id === id)) return setMessage(`이미 등록된 제품 코드입니다: ${id}`);
    if ([productDraft.lengthMm, productDraft.widthMm, productDraft.heightMm, productDraft.weightKg].some((v) => !Number.isFinite(v) || v <= 0)) return setMessage('제품 치수와 중량은 0보다 커야 합니다.');
    if (!Number.isInteger(productDraft.quantity) || productDraft.quantity < 1 || !Number.isInteger(productDraft.maxUnitsPerBox) || productDraft.maxUnitsPerBox < 1) return setMessage('제품 수량과 박스당 최대EA는 1 이상의 정수여야 합니다.');
    if (!Number.isFinite(productDraft.cushioningMm) || productDraft.cushioningMm < 0 || (!Number.isInteger(productDraft.maxInternalLayers) || productDraft.maxInternalLayers < 0)) return setMessage('완충여유는 0 이상, 내부 최대적층은 0(자동) 또는 1 이상의 정수여야 합니다.');
    const next: ProductItem = {
      id,
      name,
      length: productDraft.lengthMm / 1000,
      width: productDraft.widthMm / 1000,
      height: productDraft.heightMm / 1000,
      weightKg: productDraft.weightKg,
      quantity: productDraft.quantity,
      maxUnitsPerBox: productDraft.maxUnitsPerBox,
      orientationPolicy: productDraft.orientationPolicy,
      allowRotation: productDraft.orientationPolicy !== 'upright',
      cushioningM: productDraft.cushioningMm / 1000,
      maxInternalLayers: productDraft.maxInternalLayers > 0 ? productDraft.maxInternalLayers : undefined,
      fragile: productDraft.fragile,
      allowMixedCarton: productDraft.allowMixedCarton,
    };
    setProducts((items) => editingProductId ? items.map((item) => item.id === editingProductId ? next : item) : [...items, next]);
    invalidatePlan(editingProductId ? `${id} 제품 조건을 수정했습니다. 다시 최적화하세요.` : `${id} 제품을 등록했습니다.`);
    resetProductDraft();
  };

  const editProduct = (item: ProductItem) => {
    setEditingProductId(item.id);
    setProductDraft(productToDraft(item));
    document.getElementById('enterprise-product-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const resetBoxDraft = () => {
    setBoxDraft(emptyBox);
    setEditingBoxId(null);
  };

  const saveBox = () => {
    const id = boxDraft.id.trim();
    const name = boxDraft.name.trim();
    if (!id || !name) return setMessage('박스 코드와 이름을 입력하세요.');
    if (!editingBoxId && boxes.some((item) => item.id === id)) return setMessage(`이미 등록된 박스 코드입니다: ${id}`);
    const dims = [boxDraft.innerLengthMm, boxDraft.innerWidthMm, boxDraft.innerHeightMm, boxDraft.outerLengthMm, boxDraft.outerWidthMm, boxDraft.outerHeightMm];
    if (dims.some((v) => !Number.isFinite(v) || v <= 0) || boxDraft.tareWeightKg < 0 || boxDraft.maxGrossWeightKg <= 0) return setMessage('박스 치수·자중·최대총중량을 확인하세요.');
    if (boxDraft.outerLengthMm < boxDraft.innerLengthMm || boxDraft.outerWidthMm < boxDraft.innerWidthMm || boxDraft.outerHeightMm < boxDraft.innerHeightMm) return setMessage('박스 외부 치수는 내부 치수보다 작을 수 없습니다.');
    if (boxDraft.maxTopLoadKg !== '' && (!Number.isFinite(boxDraft.maxTopLoadKg) || boxDraft.maxTopLoadKg < 0)) return setMessage('상부 허용중량은 빈칸(제한없음) 또는 0 이상의 값이어야 합니다.');
    if (boxDraft.unitCost !== '' && (!Number.isFinite(boxDraft.unitCost) || boxDraft.unitCost < 0)) return setMessage('박스 단가는 빈칸 또는 0 이상의 값이어야 합니다.');
    const next: BoxCatalogItem = {
      id,
      name,
      innerLength: boxDraft.innerLengthMm / 1000,
      innerWidth: boxDraft.innerWidthMm / 1000,
      innerHeight: boxDraft.innerHeightMm / 1000,
      outerLength: boxDraft.outerLengthMm / 1000,
      outerWidth: boxDraft.outerWidthMm / 1000,
      outerHeight: boxDraft.outerHeightMm / 1000,
      tareWeightKg: boxDraft.tareWeightKg,
      maxGrossWeightKg: boxDraft.maxGrossWeightKg,
      maxTopLoadKg: boxDraft.maxTopLoadKg === '' ? undefined : boxDraft.maxTopLoadKg,
      unitCost: boxDraft.unitCost === '' ? undefined : boxDraft.unitCost,
    };
    setBoxes((items) => editingBoxId ? items.map((item) => item.id === editingBoxId ? next : item) : [...items, next]);
    invalidatePlan(editingBoxId ? `${id} 박스 조건을 수정했습니다. 다시 최적화하세요.` : `${id} 박스를 등록했습니다.`);
    resetBoxDraft();
  };

  const editBox = (item: BoxCatalogItem) => {
    setEditingBoxId(item.id);
    setBoxDraft(boxToDraft(item));
    document.getElementById('enterprise-box-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const run = () => {
    if (!products.length) return setMessage('먼저 제품을 1개 이상 등록하세요.');
    if (![container.length, container.width, container.height, container.maxPayloadKg].every((value) => Number.isFinite(value) && value > 0)) return setMessage('목표 컨테이너 규격과 최대중량을 확인하세요.');
    const next = optimizeEnterprisePackaging(container, products, boxes, {
      ...defaultEnterprisePackagingOptions,
      packaging: {
        ...defaultEnterprisePackagingOptions.packaging,
        allowCustomBoxDesign: settings.allowCustom,
        maxGeneratedGrossWeightKg: Math.max(1, settings.maxGrossKg),
        generatedBoxUnitCost: settings.generatedBoxUnitCost > 0 ? settings.generatedBoxUnitCost : undefined,
      },
      family: {
        ...defaultEnterprisePackagingOptions.family,
        enabled: settings.familyEnabled,
        targetMaxBoxTypes: Math.max(1, Math.floor(settings.targetBoxTypes)),
        maxAssignmentScoreLoss: Math.min(1, Math.max(0, settings.maxScoreLossPct / 100)),
      },
      allowMixedResidualCartons: settings.allowMixedResidual,
      cost: {
        containerFreightCost: Math.max(0, settings.containerFreightCost),
        handlingCostPerCarton: Math.max(0, settings.handlingCostPerCarton),
        newBoxSetupCost: Math.max(0, settings.newBoxSetupCost),
        cartonSkuCarryCost: Math.max(0, settings.cartonSkuCarryCost),
        currency: settings.currency.trim() || 'KRW',
      },
    });
    setPlan(next);
    const rejected = next.rejected.length ? ` · 확인 필요 ${next.rejected.length}종` : '';
    setMessage(`제품 ${next.assignments.length}종 포장설계 완료 · 박스 ${next.totalBoxes}EA · 예상 컨테이너 ${next.shipment.containersRequired}대${rejected}`);
  };

  const apply = () => {
    if (!plan?.cargo.length) return setMessage('적용할 설계 결과가 없습니다.');
    const unverified = plan.assignments.filter((item) => item.strengthStatus === 'design-target').length;
    const warning = unverified ? `\n자동설계 ${unverified}종은 강도 미검증 상태이므로 실제 적재에는 1단으로 적용됩니다.` : '';
    if (!window.confirm(`현재 메인 화물 목록을 최적 포장박스 ${plan.totalBoxes}EA로 교체할까요?${warning}`)) return;
    writeStoredState({ container, cargo: plan.cargo }, true);
    setMessage(`메인 적재 화면에 ${plan.cargo.length}개 화물행 · ${plan.totalBoxes}EA 포장박스를 적용했습니다. 물리 최적 자동 적재와 관성 검증을 다시 실행하세요.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addSamples = () => {
    setProducts([
      { id: 'PRD-A', name: '제품 A', length: 0.22, width: 0.12, height: 0.08, weightKg: 0.6, quantity: 241, maxUnitsPerBox: 24, orientationPolicy: 'base-rotation', cushioningM: 0.005, allowMixedCarton: true },
      { id: 'PRD-B', name: '제품 B', length: 0.31, width: 0.18, height: 0.11, weightKg: 1.2, quantity: 121, maxUnitsPerBox: 12, orientationPolicy: 'upright', cushioningM: 0.01, maxInternalLayers: 2, allowMixedCarton: true },
      { id: 'PRD-C', name: '파손주의 C', length: 0.16, width: 0.1, height: 0.07, weightKg: 0.35, quantity: 80, maxUnitsPerBox: 10, orientationPolicy: 'upright', cushioningM: 0.01, fragile: true, allowMixedCarton: false },
    ]);
    setBoxes([
      { id: 'BOX-604040', name: '600×400×400', innerLength: 0.59, innerWidth: 0.39, innerHeight: 0.39, outerLength: 0.6, outerWidth: 0.4, outerHeight: 0.4, tareWeightKg: 0.8, maxGrossWeightKg: 22, maxTopLoadKg: 80, unitCost: 1.2 },
      { id: 'BOX-503030', name: '500×300×300', innerLength: 0.49, innerWidth: 0.29, innerHeight: 0.29, outerLength: 0.5, outerWidth: 0.3, outerHeight: 0.3, tareWeightKg: 0.6, maxGrossWeightKg: 18, maxTopLoadKg: 60, unitCost: 0.9 },
    ]);
    setSettings((value) => ({ ...value, allowMixedResidual: true }));
    setPlan(null);
    setMessage('샘플 제품/박스 데이터를 불러왔습니다. 기업 포장 최적화를 실행해보세요.');
    resetProductDraft();
    resetBoxDraft();
  };

  const hasCostInputs = settings.containerFreightCost > 0 || settings.handlingCostPerCarton > 0 || settings.newBoxSetupCost > 0 || settings.cartonSkuCarryCost > 0 || settings.generatedBoxUnitCost > 0 || boxes.some((box) => (box.unitCost ?? 0) > 0);

  return <section id="product-packaging-planner" className="product-packaging-planner enterprise-packaging-planner" aria-label="기업 제품 포장박스 자동 설계">
    <header className="packaging-header">
      <div><span className="packaging-kicker">ENTERPRISE CARTONIZATION</span><h2>제품 목록 → 공용 박스 최소화 → 컨테이너 최적 적재</h2><p>제품 취급조건, 보유 박스, 신규 규격, 잔량 혼합, 컨테이너 적재율과 비용을 한 번에 계산합니다.</p></div>
      <div className="packaging-actions"><button onClick={addSamples}>샘플 불러오기</button><button className="primary" onClick={run}>기업 포장 최적화</button></div>
    </header>

    <div className="packaging-grid enterprise-settings-grid">
      <article className="packaging-panel">
        <h3>1. 목표 컨테이너 / 자동설계</h3>
        <div className="packaging-form compact">
          <label>길이(m)<input type="number" min="0.1" step="0.01" value={container.length} onChange={(e) => { setContainer((v) => ({ ...v, length: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>폭(m)<input type="number" min="0.1" step="0.01" value={container.width} onChange={(e) => { setContainer((v) => ({ ...v, width: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>높이(m)<input type="number" min="0.1" step="0.01" value={container.height} onChange={(e) => { setContainer((v) => ({ ...v, height: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>최대중량(kg)<input type="number" min="1" value={container.maxPayloadKg} onChange={(e) => { setContainer((v) => ({ ...v, maxPayloadKg: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>자동설계 최대총중량<input type="number" min="1" step="1" value={settings.maxGrossKg} onChange={(e) => { setSettings((v) => ({ ...v, maxGrossKg: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>자동설계 박스단가<input type="number" min="0" step="0.01" value={settings.generatedBoxUnitCost} onChange={(e) => { setSettings((v) => ({ ...v, generatedBoxUnitCost: Number(e.target.value) })); invalidatePlan(); }} /></label>
        </div>
        <div className="packaging-switch">
          <label><input type="checkbox" checked={settings.allowCustom} onChange={(e) => { setSettings((v) => ({ ...v, allowCustom: e.target.checked })); invalidatePlan(); }} /> 컨테이너 맞춤 신규 박스 자동설계</label>
          <label><input type="checkbox" checked={settings.familyEnabled} onChange={(e) => { setSettings((v) => ({ ...v, familyEnabled: e.target.checked })); invalidatePlan(); }} /> 여러 제품의 공용 박스 규격 최소화</label>
          <label><input type="checkbox" checked={settings.allowMixedResidual} onChange={(e) => { setSettings((v) => ({ ...v, allowMixedResidual: e.target.checked })); invalidatePlan(); }} /> 출하 잔량 혼합박스 허용</label>
        </div>
        <div className="packaging-form compact">
          <label>목표 박스 규격 수<input type="number" min="1" step="1" value={settings.targetBoxTypes} onChange={(e) => { setSettings((v) => ({ ...v, targetBoxTypes: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>허용 효율손실(%)<input type="number" min="0" max="100" step="1" value={settings.maxScoreLossPct} onChange={(e) => { setSettings((v) => ({ ...v, maxScoreLossPct: Number(e.target.value) })); invalidatePlan(); }} /></label>
        </div>
      </article>

      <article className="packaging-panel">
        <h3>2. 비용 모델 <small>선택 입력</small></h3>
        <div className="packaging-form compact">
          <label>통화<input value={settings.currency} onChange={(e) => { setSettings((v) => ({ ...v, currency: e.target.value })); invalidatePlan(); }} /></label>
          <label>컨테이너 1대 운임<input type="number" min="0" step="1" value={settings.containerFreightCost} onChange={(e) => { setSettings((v) => ({ ...v, containerFreightCost: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>박스당 작업비<input type="number" min="0" step="0.01" value={settings.handlingCostPerCarton} onChange={(e) => { setSettings((v) => ({ ...v, handlingCostPerCarton: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>신규규격 셋업비/종<input type="number" min="0" step="1" value={settings.newBoxSetupCost} onChange={(e) => { setSettings((v) => ({ ...v, newBoxSetupCost: Number(e.target.value) })); invalidatePlan(); }} /></label>
          <label>박스 SKU 관리비/종<input type="number" min="0" step="1" value={settings.cartonSkuCarryCost} onChange={(e) => { setSettings((v) => ({ ...v, cartonSkuCarryCost: Number(e.target.value) })); invalidatePlan(); }} /></label>
        </div>
        <p className="packaging-safety-note">단가가 비어 있는 박스는 비용합계에서 0으로 가정하지 않고 ‘미가격 박스’로 별도 집계합니다.</p>
      </article>

      <article className="packaging-panel wide">
        <h3>3. 기업 제품 목록</h3>
        <div id="enterprise-product-form" className="packaging-form product-form enterprise-product-form">
          <label>제품코드<input value={productDraft.id} disabled={Boolean(editingProductId)} onChange={(e) => setProductDraft((v) => ({ ...v, id: e.target.value }))} /></label>
          <label>제품명<input value={productDraft.name} onChange={(e) => setProductDraft((v) => ({ ...v, name: e.target.value }))} /></label>
          <label>L(mm)<input type="number" min="1" value={productDraft.lengthMm} onChange={(e) => setProductDraft((v) => ({ ...v, lengthMm: Number(e.target.value) }))} /></label>
          <label>W(mm)<input type="number" min="1" value={productDraft.widthMm} onChange={(e) => setProductDraft((v) => ({ ...v, widthMm: Number(e.target.value) }))} /></label>
          <label>H(mm)<input type="number" min="1" value={productDraft.heightMm} onChange={(e) => setProductDraft((v) => ({ ...v, heightMm: Number(e.target.value) }))} /></label>
          <label>중량(kg)<input type="number" min="0.001" step="0.1" value={productDraft.weightKg} onChange={(e) => setProductDraft((v) => ({ ...v, weightKg: Number(e.target.value) }))} /></label>
          <label>수량<input type="number" min="1" step="1" value={productDraft.quantity} onChange={(e) => setProductDraft((v) => ({ ...v, quantity: Number(e.target.value) }))} /></label>
          <label>박스당 최대EA<input type="number" min="1" step="1" value={productDraft.maxUnitsPerBox} onChange={(e) => setProductDraft((v) => ({ ...v, maxUnitsPerBox: Number(e.target.value) }))} /></label>
          <label>회전정책<select value={productDraft.orientationPolicy} onChange={(e) => setProductDraft((v) => ({ ...v, orientationPolicy: e.target.value as ProductOrientationPolicy }))}><option value="upright">세워서만</option><option value="base-rotation">바닥면 90°</option><option value="any">3축 회전 허용</option></select></label>
          <label>완충여유(mm)<input type="number" min="0" step="1" value={productDraft.cushioningMm} onChange={(e) => setProductDraft((v) => ({ ...v, cushioningMm: Number(e.target.value) }))} /></label>
          <label>내부 최대적층<input type="number" min="0" step="1" value={productDraft.maxInternalLayers} onChange={(e) => setProductDraft((v) => ({ ...v, maxInternalLayers: Number(e.target.value) }))} /><small>0=자동</small></label>
          <label className="form-check-label"><input type="checkbox" checked={productDraft.fragile} onChange={(e) => setProductDraft((v) => ({ ...v, fragile: e.target.checked }))} /> 파손주의</label>
          <label className="form-check-label"><input type="checkbox" checked={productDraft.allowMixedCarton} onChange={(e) => setProductDraft((v) => ({ ...v, allowMixedCarton: e.target.checked }))} /> 잔량 혼합포장 허용</label>
        </div>
        <div className="packaging-inline-actions"><button onClick={saveProduct}>{editingProductId ? '제품 수정 저장' : '제품 등록'}</button>{editingProductId && <button onClick={resetProductDraft}>수정 취소</button>}</div>
        <div className="packaging-list">{products.length ? products.map((item) => <div key={item.id}><span><b>{item.id}</b> {item.name}<small>{mm(item.length)}×{mm(item.width)}×{mm(item.height)}mm · {item.weightKg}kg · {item.orientationPolicy ?? 'base-rotation'} · 완충 {mm(item.cushioningM ?? 0)}mm{item.fragile ? ' · 파손주의' : ''}</small></span><strong>{item.quantity} EA</strong><span className="row-actions"><button onClick={() => editProduct(item)}>수정</button><button aria-label={`${item.id} 삭제`} onClick={() => { setProducts((v) => v.filter((p) => p.id !== item.id)); invalidatePlan(`${item.id} 제품을 삭제했습니다.`); }}>삭제</button></span></div>) : <p>등록된 제품이 없습니다.</p>}</div>
      </article>

      <article className="packaging-panel wide">
        <h3>4. 회사 보유 박스 카탈로그 <small>미등록 시 자동설계만 사용</small></h3>
        <div id="enterprise-box-form" className="packaging-form box-form enterprise-box-form">
          <label>박스코드<input value={boxDraft.id} disabled={Boolean(editingBoxId)} onChange={(e) => setBoxDraft((v) => ({ ...v, id: e.target.value }))} /></label>
          <label>이름<input value={boxDraft.name} onChange={(e) => setBoxDraft((v) => ({ ...v, name: e.target.value }))} /></label>
          <label>내부L<input type="number" min="1" value={boxDraft.innerLengthMm} onChange={(e) => setBoxDraft((v) => ({ ...v, innerLengthMm: Number(e.target.value) }))} /></label>
          <label>내부W<input type="number" min="1" value={boxDraft.innerWidthMm} onChange={(e) => setBoxDraft((v) => ({ ...v, innerWidthMm: Number(e.target.value) }))} /></label>
          <label>내부H<input type="number" min="1" value={boxDraft.innerHeightMm} onChange={(e) => setBoxDraft((v) => ({ ...v, innerHeightMm: Number(e.target.value) }))} /></label>
          <label>외부L<input type="number" min="1" value={boxDraft.outerLengthMm} onChange={(e) => setBoxDraft((v) => ({ ...v, outerLengthMm: Number(e.target.value) }))} /></label>
          <label>외부W<input type="number" min="1" value={boxDraft.outerWidthMm} onChange={(e) => setBoxDraft((v) => ({ ...v, outerWidthMm: Number(e.target.value) }))} /></label>
          <label>외부H<input type="number" min="1" value={boxDraft.outerHeightMm} onChange={(e) => setBoxDraft((v) => ({ ...v, outerHeightMm: Number(e.target.value) }))} /></label>
          <label>박스자중kg<input type="number" min="0" step="0.1" value={boxDraft.tareWeightKg} onChange={(e) => setBoxDraft((v) => ({ ...v, tareWeightKg: Number(e.target.value) }))} /></label>
          <label>최대총중량kg<input type="number" min="0.1" step="1" value={boxDraft.maxGrossWeightKg} onChange={(e) => setBoxDraft((v) => ({ ...v, maxGrossWeightKg: Number(e.target.value) }))} /></label>
          <label>상부허용kg<input type="number" min="0" step="1" placeholder="제한 없음" value={boxDraft.maxTopLoadKg} onChange={(e) => setBoxDraft((v) => ({ ...v, maxTopLoadKg: numberOrEmpty(e.target.value) }))} /></label>
          <label>박스단가<input type="number" min="0" step="0.01" placeholder="미입력" value={boxDraft.unitCost} onChange={(e) => setBoxDraft((v) => ({ ...v, unitCost: numberOrEmpty(e.target.value) }))} /></label>
        </div>
        <div className="packaging-inline-actions"><button onClick={saveBox}>{editingBoxId ? '박스 수정 저장' : '보유 박스 등록'}</button>{editingBoxId && <button onClick={resetBoxDraft}>수정 취소</button>}</div>
        <div className="packaging-list box-list">{boxes.length ? boxes.map((item) => <div key={item.id}><span><b>{item.id}</b> {item.name}<small>외부 {mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)}mm · 최대 {item.maxGrossWeightKg}kg · 상부 {item.maxTopLoadKg == null ? '제한없음' : `${item.maxTopLoadKg}kg`}</small></span><strong>{item.unitCost == null ? '단가 미입력' : money(item.unitCost, settings.currency)}</strong><span className="row-actions"><button onClick={() => editBox(item)}>수정</button><button onClick={() => { setBoxes((v) => v.filter((b) => b.id !== item.id)); invalidatePlan(`${item.id} 박스를 삭제했습니다.`); }}>삭제</button></span></div>) : <p>보유 박스 미등록 · 자동설계만 사용할 수 있습니다.</p>}</div>
      </article>
    </div>

    <p className="packaging-message" aria-live="polite">{message}</p>

    {plan && <article className="packaging-result enterprise-packaging-result">
      <div className="result-head"><div><h3>기업 포장 최적화 결과</h3><p>제품 {plan.assignments.length}종 · 최종 박스 {plan.totalBoxes}EA · 정확중량 {plan.accurateTotalCargoWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}kg</p></div><button className="primary" onClick={apply} disabled={!plan.cargo.length}>메인 적재에 적용</button></div>

      <div className="enterprise-result-metrics">
        <div><span>박스 규격 수</span><b>{plan.family.baselineBoxTypes} → {plan.family.selectedBoxTypes}종</b><small>{plan.family.boxTypeSavings ? `${plan.family.boxTypeSavings}종 절감` : '유지'}</small></div>
        <div><span>출하 박스 수</span><b>{plan.baselineTotalBoxes} → {plan.totalBoxes}EA</b><small>{plan.mixedCartonSavings ? `혼합 잔량으로 ${plan.mixedCartonSavings}EA 절감` : '잔량 절감 없음'}</small></div>
        <div><span>예상 컨테이너</span><b>{plan.shipment.containersRequired}대</b><small>{plan.shipment.fullyLoaded ? '전량 적재 가능' : `미적재 ${plan.shipment.remaining.reduce((sum, item) => sum + item.quantity, 0)}EA`}</small></div>
        <div><span>공용화 평균 효율손실</span><b>{pct(plan.family.averageScoreLoss)}</b><small>{plan.family.targetExceeded ? `목표 ${plan.family.targetMaxBoxTypes}종 초과 · 안전규격 추가` : '목표 범위 충족'}</small></div>
        {hasCostInputs && <div><span>확인 가능한 총비용</span><b>{money(plan.cost.totalKnownCost, plan.cost.currency)}</b><small>{plan.cost.unpricedCartons ? `단가 미입력 박스 ${plan.cost.unpricedCartons}EA 별도` : '모든 박스 단가 반영'}</small></div>}
      </div>

      <div className="result-table-wrap"><table><thead><tr><th>제품</th><th>선정 박스</th><th>박스 외경</th><th>입수</th><th>필요 박스</th><th>총중량/Full</th><th>충진율</th><th>컨테이너 효율</th><th>설계 적층</th><th>실적용 적층</th><th>강도</th></tr></thead><tbody>
        {plan.assignments.map((item) => <tr key={item.productId}><td><b>{item.productId}</b><small>{item.productName}</small></td><td><span className={`source-badge ${item.source}`}>{item.source === 'generated' ? '자동/공용설계' : '보유박스'}</span><small>{item.boxName}</small></td><td>{mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)}</td><td>{item.unitsPerBox} EA</td><td><b>{item.boxesNeeded} EA</b></td><td>{item.grossWeightKg.toFixed(1)}kg</td><td>{pct(item.productFillRate)}</td><td>{pct(item.containerTileEfficiency)}</td><td>{item.recommendedStackLayers}단</td><td><b>{item.maxStackLayers}단</b></td><td>{item.strengthStatus === 'design-target' ? <span className="strength-warning">미검증 · 목표 {item.requiredTopLoadKg.toFixed(0)}kg</span> : `${item.maxTopLoadKg == null ? '제한없음' : `${item.maxTopLoadKg}kg`}`}</td></tr>)}
      </tbody></table></div>

      {plan.family.selectedBoxes.length > 0 && <section className="enterprise-subresult"><h4>선정된 공용 박스 패밀리</h4><div className="family-box-list">{plan.family.selectedBoxes.map((box) => <div key={box.id}><b>{box.name}</b><span>{mm(box.outerLength)}×{mm(box.outerWidth)}×{mm(box.outerHeight)}mm</span><small>{box.assignedProducts.join(', ')}</small></div>)}</div></section>}

      {plan.mixedCartons.length > 0 && <section className="enterprise-subresult"><h4>혼합 잔량 박스</h4><div className="mixed-carton-list">{plan.mixedCartons.map((carton) => <div key={carton.id}><b>{carton.id} · {carton.boxName}</b><span>{carton.contents.map((item) => `${item.productId} ${item.quantity}EA`).join(' + ')}</span><small>{carton.grossWeightKg.toFixed(1)}kg · 충진율 {pct(carton.fillRate)} · {carton.maxStackLayers}단</small></div>)}</div></section>}

      {hasCostInputs && <section className="enterprise-subresult"><h4>비용 구성</h4><div className="cost-breakdown"><span>박스비 <b>{money(plan.cost.knownCartonCost, plan.cost.currency)}</b></span><span>작업비 <b>{money(plan.cost.handlingCost, plan.cost.currency)}</b></span><span>신규규격 셋업 <b>{money(plan.cost.setupCost, plan.cost.currency)}</b></span><span>박스 SKU 관리 <b>{money(plan.cost.cartonSkuCost, plan.cost.currency)}</b></span><span>운임 <b>{money(plan.cost.freightCost, plan.cost.currency)}</b></span></div></section>}

      {plan.rejected.length > 0 && <div className="packaging-rejected"><b>설계 제외</b>{plan.rejected.map((item) => <span key={item.productId}>{item.productId}: {item.reason}</span>)}</div>}
      {!plan.shipment.fullyLoaded && <div className="packaging-rejected"><b>컨테이너 적재 미완료</b>{plan.shipment.remaining.map((item) => <span key={item.cargoId}>{item.cargoId}: {item.quantity}EA</span>)}</div>}
      <p className="packaging-safety-note"><b>자동설계 강도 원칙:</b> 자동/공용 신규규격의 상부하중은 제조 요구치일 뿐 인증값이 아닙니다. 강도 확인 전 메인 적재에는 1단·상부허용 0kg로 적용됩니다. 실제 원지·골종·ECT/BCT·습도·테이핑 조건을 검증한 뒤 보유박스 카탈로그에 상부허용중량을 등록하세요.</p>
    </article>}
  </section>;
}
