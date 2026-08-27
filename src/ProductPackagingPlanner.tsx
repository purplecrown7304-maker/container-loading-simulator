import { useEffect, useMemo, useState } from 'react';
import {
  defaultProductPackagingOptions,
  optimizeProductPackaging,
  type BoxCatalogItem,
  type ProductItem,
  type ProductPackagingPlan,
} from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { readStoredState, writeStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

type ProductDraft = { id: string; name: string; lengthMm: number; widthMm: number; heightMm: number; weightKg: number; quantity: number; maxUnitsPerBox: number };
type BoxDraft = { id: string; name: string; innerLengthMm: number; innerWidthMm: number; innerHeightMm: number; outerLengthMm: number; outerWidthMm: number; outerHeightMm: number; tareWeightKg: number; maxGrossWeightKg: number; maxTopLoadKg: number };

type StoredPlanner = { products: ProductItem[]; boxes: BoxCatalogItem[]; container: ContainerSpec };

const emptyProduct: ProductDraft = { id: '', name: '', lengthMm: 200, widthMm: 120, heightMm: 80, weightKg: 0.5, quantity: 100, maxUnitsPerBox: 24 };
const emptyBox: BoxDraft = { id: '', name: '', innerLengthMm: 590, innerWidthMm: 390, innerHeightMm: 390, outerLengthMm: 600, outerWidthMm: 400, outerHeightMm: 400, tareWeightKg: 0.8, maxGrossWeightKg: 22, maxTopLoadKg: 80 };

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

export default function ProductPackagingPlanner() {
  const stored = useMemo(() => typeof window === 'undefined' ? null : readPlanner(), []);
  const [container, setContainer] = useState<ContainerSpec>(() => stored?.container ?? readStoredState()?.container ?? defaultContainer);
  const [products, setProducts] = useState<ProductItem[]>(stored?.products ?? []);
  const [boxes, setBoxes] = useState<BoxCatalogItem[]>(stored?.boxes ?? []);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [boxDraft, setBoxDraft] = useState<BoxDraft>(emptyBox);
  const [allowCustom, setAllowCustom] = useState(true);
  const [maxGrossKg, setMaxGrossKg] = useState(22);
  const [plan, setPlan] = useState<ProductPackagingPlan | null>(null);
  const [message, setMessage] = useState('제품 목록과 보유 박스를 등록한 뒤 자동설계를 실행하세요.');

  useEffect(() => { savePlanner({ products, boxes, container }); }, [products, boxes, container]);

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

  const addProduct = () => {
    const id = productDraft.id.trim();
    if (!id || !productDraft.name.trim()) return setMessage('제품 코드와 제품명을 입력하세요.');
    if (products.some(item => item.id === id)) return setMessage(`이미 등록된 제품 코드입니다: ${id}`);
    if ([productDraft.lengthMm, productDraft.widthMm, productDraft.heightMm, productDraft.weightKg].some(v => !Number.isFinite(v) || v <= 0) || !Number.isInteger(productDraft.quantity) || productDraft.quantity < 1) return setMessage('제품 치수·중량은 0보다 커야 하고 수량은 정수여야 합니다.');
    setProducts(items => [...items, {
      id,
      name: productDraft.name.trim(),
      length: productDraft.lengthMm / 1000,
      width: productDraft.widthMm / 1000,
      height: productDraft.heightMm / 1000,
      weightKg: productDraft.weightKg,
      quantity: productDraft.quantity,
      maxUnitsPerBox: Math.max(1, Math.floor(productDraft.maxUnitsPerBox)),
      allowRotation: true,
    }]);
    setProductDraft(emptyProduct);
    setPlan(null);
    setMessage(`${id} 제품을 등록했습니다.`);
  };

  const addBox = () => {
    const id = boxDraft.id.trim();
    if (!id || !boxDraft.name.trim()) return setMessage('박스 코드와 이름을 입력하세요.');
    if (boxes.some(item => item.id === id)) return setMessage(`이미 등록된 박스 코드입니다: ${id}`);
    const dims = [boxDraft.innerLengthMm, boxDraft.innerWidthMm, boxDraft.innerHeightMm, boxDraft.outerLengthMm, boxDraft.outerWidthMm, boxDraft.outerHeightMm];
    if (dims.some(v => !Number.isFinite(v) || v <= 0) || boxDraft.tareWeightKg < 0 || boxDraft.maxGrossWeightKg <= 0 || boxDraft.maxTopLoadKg < 0) return setMessage('박스 치수·중량·상부 허용중량을 확인하세요.');
    setBoxes(items => [...items, {
      id,
      name: boxDraft.name.trim(),
      innerLength: boxDraft.innerLengthMm / 1000,
      innerWidth: boxDraft.innerWidthMm / 1000,
      innerHeight: boxDraft.innerHeightMm / 1000,
      outerLength: boxDraft.outerLengthMm / 1000,
      outerWidth: boxDraft.outerWidthMm / 1000,
      outerHeight: boxDraft.outerHeightMm / 1000,
      tareWeightKg: boxDraft.tareWeightKg,
      maxGrossWeightKg: boxDraft.maxGrossWeightKg,
      maxTopLoadKg: boxDraft.maxTopLoadKg,
    }]);
    setBoxDraft(emptyBox);
    setPlan(null);
    setMessage(`${id} 박스를 등록했습니다.`);
  };

  const run = () => {
    if (!products.length) return setMessage('먼저 제품을 1개 이상 등록하세요.');
    const next = optimizeProductPackaging(container, products, boxes, {
      ...defaultProductPackagingOptions,
      allowCustomBoxDesign: allowCustom,
      maxGeneratedGrossWeightKg: Math.max(1, maxGrossKg),
    });
    setPlan(next);
    setMessage(next.rejected.length ? `${next.assignments.length}개 제품 설계 완료 · ${next.rejected.length}개 제품 확인 필요` : `${next.assignments.length}개 제품의 최적 박스 설계를 완료했습니다.`);
  };

  const apply = () => {
    if (!plan?.cargo.length) return setMessage('적용할 설계 결과가 없습니다.');
    if (!window.confirm(`현재 메인 화물 목록을 최적 포장박스 ${plan.totalBoxes}EA로 교체할까요?`)) return;
    writeStoredState({ container, cargo: plan.cargo }, true);
    setMessage(`메인 적재 화면에 ${plan.cargo.length}종 · ${plan.totalBoxes}EA 포장박스를 적용했습니다. 이제 물리 최적 자동 적재를 실행하세요.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addSamples = () => {
    setProducts([
      { id: 'PRD-A', name: '제품 A', length: 0.22, width: 0.12, height: 0.08, weightKg: 0.6, quantity: 240, maxUnitsPerBox: 24, allowRotation: true },
      { id: 'PRD-B', name: '제품 B', length: 0.31, width: 0.18, height: 0.11, weightKg: 1.2, quantity: 120, maxUnitsPerBox: 12, allowRotation: true },
    ]);
    setBoxes([
      { id: 'BOX-604040', name: '600×400×400', innerLength: 0.59, innerWidth: 0.39, innerHeight: 0.39, outerLength: 0.6, outerWidth: 0.4, outerHeight: 0.4, tareWeightKg: 0.8, maxGrossWeightKg: 22, maxTopLoadKg: 80 },
      { id: 'BOX-503030', name: '500×300×300', innerLength: 0.49, innerWidth: 0.29, innerHeight: 0.29, outerLength: 0.5, outerWidth: 0.3, outerHeight: 0.3, tareWeightKg: 0.6, maxGrossWeightKg: 18, maxTopLoadKg: 60 },
    ]);
    setPlan(null);
    setMessage('샘플 제품/박스 데이터를 불러왔습니다. 자동설계를 실행해보세요.');
  };

  return <section id="product-packaging-planner" className="product-packaging-planner" aria-label="기업 제품 포장박스 자동 설계">
    <header className="packaging-header">
      <div><span className="packaging-kicker">ENTERPRISE PACKAGING</span><h2>제품 목록 → 최적 포장박스 → 컨테이너 적재</h2><p>보유 박스를 자동 매칭하고, 더 좋은 규격이 있으면 컨테이너 적재 효율을 기준으로 새 박스 규격까지 설계합니다.</p></div>
      <div className="packaging-actions"><button onClick={addSamples}>샘플 불러오기</button><button className="primary" onClick={run}>자동 박스 설계</button></div>
    </header>

    <div className="packaging-grid">
      <article className="packaging-panel">
        <h3>1. 목표 컨테이너</h3>
        <div className="packaging-form compact">
          <label>길이(m)<input type="number" min="0.1" step="0.01" value={container.length} onChange={e => setContainer(v => ({ ...v, length: Number(e.target.value) }))} /></label>
          <label>폭(m)<input type="number" min="0.1" step="0.01" value={container.width} onChange={e => setContainer(v => ({ ...v, width: Number(e.target.value) }))} /></label>
          <label>높이(m)<input type="number" min="0.1" step="0.01" value={container.height} onChange={e => setContainer(v => ({ ...v, height: Number(e.target.value) }))} /></label>
          <label>최대중량(kg)<input type="number" min="1" value={container.maxPayloadKg} onChange={e => setContainer(v => ({ ...v, maxPayloadKg: Number(e.target.value) }))} /></label>
        </div>
        <div className="packaging-switch"><label><input type="checkbox" checked={allowCustom} onChange={e => setAllowCustom(e.target.checked)} /> 컨테이너 맞춤형 새 박스 규격도 자동 설계</label><label>자동설계 박스 최대 총중량(kg)<input type="number" min="1" step="1" value={maxGrossKg} onChange={e => setMaxGrossKg(Number(e.target.value))} /></label></div>
      </article>

      <article className="packaging-panel">
        <h3>2. 기업 제품 목록</h3>
        <div className="packaging-form product-form">
          <label>제품코드<input value={productDraft.id} onChange={e => setProductDraft(v => ({ ...v, id: e.target.value }))} /></label>
          <label>제품명<input value={productDraft.name} onChange={e => setProductDraft(v => ({ ...v, name: e.target.value }))} /></label>
          <label>L(mm)<input type="number" min="1" value={productDraft.lengthMm} onChange={e => setProductDraft(v => ({ ...v, lengthMm: Number(e.target.value) }))} /></label>
          <label>W(mm)<input type="number" min="1" value={productDraft.widthMm} onChange={e => setProductDraft(v => ({ ...v, widthMm: Number(e.target.value) }))} /></label>
          <label>H(mm)<input type="number" min="1" value={productDraft.heightMm} onChange={e => setProductDraft(v => ({ ...v, heightMm: Number(e.target.value) }))} /></label>
          <label>중량(kg)<input type="number" min="0.001" step="0.1" value={productDraft.weightKg} onChange={e => setProductDraft(v => ({ ...v, weightKg: Number(e.target.value) }))} /></label>
          <label>수량<input type="number" min="1" step="1" value={productDraft.quantity} onChange={e => setProductDraft(v => ({ ...v, quantity: Number(e.target.value) }))} /></label>
          <label>박스당 최대EA<input type="number" min="1" step="1" value={productDraft.maxUnitsPerBox} onChange={e => setProductDraft(v => ({ ...v, maxUnitsPerBox: Number(e.target.value) }))} /></label>
        </div>
        <button onClick={addProduct}>제품 등록</button>
        <div className="packaging-list">{products.length ? products.map(item => <div key={item.id}><span><b>{item.id}</b> {item.name}<small>{mm(item.length)}×{mm(item.width)}×{mm(item.height)}mm · {item.weightKg}kg</small></span><strong>{item.quantity} EA</strong><button aria-label={`${item.id} 삭제`} onClick={() => { setProducts(v => v.filter(p => p.id !== item.id)); setPlan(null); }}>삭제</button></div>) : <p>등록된 제품이 없습니다.</p>}</div>
      </article>

      <article className="packaging-panel wide">
        <h3>3. 회사 보유 박스 카탈로그 <small>등록하지 않아도 자동설계 가능</small></h3>
        <div className="packaging-form box-form">
          <label>박스코드<input value={boxDraft.id} onChange={e => setBoxDraft(v => ({ ...v, id: e.target.value }))} /></label>
          <label>이름<input value={boxDraft.name} onChange={e => setBoxDraft(v => ({ ...v, name: e.target.value }))} /></label>
          <label>내부L<input type="number" min="1" value={boxDraft.innerLengthMm} onChange={e => setBoxDraft(v => ({ ...v, innerLengthMm: Number(e.target.value) }))} /></label>
          <label>내부W<input type="number" min="1" value={boxDraft.innerWidthMm} onChange={e => setBoxDraft(v => ({ ...v, innerWidthMm: Number(e.target.value) }))} /></label>
          <label>내부H<input type="number" min="1" value={boxDraft.innerHeightMm} onChange={e => setBoxDraft(v => ({ ...v, innerHeightMm: Number(e.target.value) }))} /></label>
          <label>외부L<input type="number" min="1" value={boxDraft.outerLengthMm} onChange={e => setBoxDraft(v => ({ ...v, outerLengthMm: Number(e.target.value) }))} /></label>
          <label>외부W<input type="number" min="1" value={boxDraft.outerWidthMm} onChange={e => setBoxDraft(v => ({ ...v, outerWidthMm: Number(e.target.value) }))} /></label>
          <label>외부H<input type="number" min="1" value={boxDraft.outerHeightMm} onChange={e => setBoxDraft(v => ({ ...v, outerHeightMm: Number(e.target.value) }))} /></label>
          <label>박스자중kg<input type="number" min="0" step="0.1" value={boxDraft.tareWeightKg} onChange={e => setBoxDraft(v => ({ ...v, tareWeightKg: Number(e.target.value) }))} /></label>
          <label>최대총중량kg<input type="number" min="0.1" step="1" value={boxDraft.maxGrossWeightKg} onChange={e => setBoxDraft(v => ({ ...v, maxGrossWeightKg: Number(e.target.value) }))} /></label>
          <label>상부허용kg<input type="number" min="0" step="1" value={boxDraft.maxTopLoadKg} onChange={e => setBoxDraft(v => ({ ...v, maxTopLoadKg: Number(e.target.value) }))} /></label>
        </div>
        <button onClick={addBox}>보유 박스 등록</button>
        <div className="packaging-list box-list">{boxes.length ? boxes.map(item => <div key={item.id}><span><b>{item.id}</b> {item.name}<small>외부 {mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)}mm · 최대 {item.maxGrossWeightKg}kg</small></span><strong>상부 {item.maxTopLoadKg ?? '미입력'}kg</strong><button onClick={() => { setBoxes(v => v.filter(b => b.id !== item.id)); setPlan(null); }}>삭제</button></div>) : <p>보유 박스 미등록 · 자동설계만 사용할 수 있습니다.</p>}</div>
      </article>
    </div>

    <p className="packaging-message" aria-live="polite">{message}</p>

    {plan && <article className="packaging-result">
      <div className="result-head"><div><h3>최적 포장 설계 결과</h3><p>제품 {plan.assignments.length}종 → 포장박스 총 {plan.totalBoxes}EA · 신규 자동설계 {plan.generatedBoxCount}종</p></div><button className="primary" onClick={apply} disabled={!plan.cargo.length}>메인 적재에 적용</button></div>
      <div className="result-table-wrap"><table><thead><tr><th>제품</th><th>선정 박스</th><th>박스 외경</th><th>입수</th><th>필요 박스</th><th>총중량/박스</th><th>제품 충진율</th><th>컨테이너 타일효율</th><th>시뮬 적재</th><th>최대 적층</th><th>상부하중</th></tr></thead><tbody>
        {plan.assignments.map(item => <tr key={item.productId}><td><b>{item.productId}</b><small>{item.productName}</small></td><td><span className={`source-badge ${item.source}`}>{item.source === 'generated' ? '자동설계' : '보유박스'}</span><small>{item.boxName}</small></td><td>{mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)}</td><td>{item.unitsPerBox} EA</td><td><b>{item.boxesNeeded} EA</b></td><td>{item.grossWeightKg.toFixed(1)}kg</td><td>{pct(item.productFillRate)}</td><td>{pct(item.containerTileEfficiency)}</td><td>{item.simulatedLoadedBoxes}/{item.boxesNeeded}</td><td>{item.maxStackLayers}단</td><td>{item.source === 'generated' ? `설계요구 ${item.requiredTopLoadKg.toFixed(0)}kg` : `${item.maxTopLoadKg ?? '미입력'}kg`}</td></tr>)}
      </tbody></table></div>
      {plan.rejected.length > 0 && <div className="packaging-rejected"><b>설계 제외</b>{plan.rejected.map(item => <span key={item.productId}>{item.productId}: {item.reason}</span>)}</div>}
      <p className="packaging-safety-note">자동설계 박스의 상부하중 값은 실제 박스 강도 인증값이 아니라, 해당 적층안을 사용하기 위해 박스가 충족해야 할 설계 요구치입니다. 실제 골판지 사양/압축강도는 박스 제조사 검증이 필요합니다.</p>
    </article>}
  </section>;
}
