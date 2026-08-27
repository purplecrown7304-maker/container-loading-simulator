import { useState } from 'react';
import { defaultCartonStandardizationOptions, standardizeProductCartons, type CartonStandardizationPlan } from './engine/cartonStandardization';
import { defaultProductPackagingOptions, type BoxCatalogItem, type ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { readStoredState, writeStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

type StoredPlanner = { products?: ProductItem[]; boxes?: BoxCatalogItem[]; container?: ContainerSpec };

function readPlanner(): StoredPlanner | null {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPlanner : null;
  } catch {
    return null;
  }
}

const mm = (m: number) => Math.round(m * 1000);
const money = (value: number) => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-';
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function CartonStandardizationPanel() {
  const [targetSku, setTargetSku] = useState(4);
  const [maxLossPct, setMaxLossPct] = useState(12);
  const [minFillPct, setMinFillPct] = useState(45);
  const [baseCost, setBaseCost] = useState(defaultCartonStandardizationOptions.baseCostPerBox);
  const [volumeCost, setVolumeCost] = useState(defaultCartonStandardizationOptions.volumeCostPerM3);
  const [skuSetupCost, setSkuSetupCost] = useState(defaultCartonStandardizationOptions.skuSetupCost);
  const [plan, setPlan] = useState<CartonStandardizationPlan | null>(null);
  const [message, setMessage] = useState('위 제품→박스 자동설계에 제품을 등록한 뒤 표준화를 실행하세요.');

  const run = () => {
    const planner = readPlanner();
    const products = planner?.products ?? [];
    const boxes = planner?.boxes ?? [];
    const container = planner?.container ?? readStoredState()?.container ?? defaultContainer;
    if (!products.length) {
      setPlan(null);
      setMessage('표준화할 제품이 없습니다. 먼저 기업 제품 목록을 등록하세요.');
      return;
    }
    if (!Number.isInteger(targetSku) || targetSku < 1) return setMessage('목표 박스 규격 수는 1 이상의 정수여야 합니다.');
    if (![maxLossPct, minFillPct, baseCost, volumeCost, skuSetupCost].every(Number.isFinite)) return setMessage('표준화 옵션 숫자를 확인하세요.');

    const next = standardizeProductCartons(container, products, boxes, {
      targetBoxSkuCount: targetSku,
      maxAssignmentScoreLoss: Math.max(0, maxLossPct) / 100,
      minProductFillRate: Math.min(1, Math.max(0, minFillPct) / 100),
      maxCandidates: 48,
      baseCostPerBox: Math.max(0, baseCost),
      volumeCostPerM3: Math.max(0, volumeCost),
      skuSetupCost: Math.max(0, skuSetupCost),
      packagingOptions: defaultProductPackagingOptions,
    });
    setPlan(next);
    const capText = next.standardizedBoxSkuCount <= targetSku ? '목표 규격 수 달성' : `안전성 때문에 목표 ${targetSku}종보다 ${next.standardizedBoxSkuCount - targetSku}종 추가 유지`;
    setMessage(`${next.assignments.length}개 제품 표준화 계산 완료 · ${capText}`);
  };

  const apply = () => {
    if (!plan?.cargo.length) return setMessage('적용할 표준화 결과가 없습니다.');
    const planner = readPlanner();
    const container = planner?.container ?? readStoredState()?.container ?? defaultContainer;
    if (!window.confirm(`표준화 박스 ${plan.standardizedBoxSkuCount}종을 메인 적재 화물로 적용할까요?`)) return;
    writeStoredState({ container, cargo: plan.cargo }, true);
    setMessage(`표준화 박스 ${plan.standardizedBoxSkuCount}종 · 총 ${plan.cargo.reduce((sum, item) => sum + item.quantity, 0)}EA를 메인 적재에 적용했습니다. 물리 최적 자동 적재를 다시 실행하세요.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return <section id="carton-standardization-panel" className="carton-standardization-panel" aria-label="공용 박스 규격 표준화">
    <header className="carton-standardization-header">
      <div><span>ENTERPRISE CARTON STANDARDIZATION</span><h2>공용 박스 규격 최소화 + 컨테이너/원가 동시 비교</h2><p>제품마다 별도 박스를 만드는 대신 적합성 손실이 허용 범위인 제품들을 공용 박스로 묶습니다. 안전하게 합칠 수 없으면 목표 SKU 수를 초과하더라도 개별 박스를 유지합니다.</p></div>
      <button className="primary" onClick={run}>박스 표준화 실행</button>
    </header>

    <div className="carton-standardization-controls">
      <label>목표 박스 규격 수<input type="number" min="1" step="1" value={targetSku} onChange={e => setTargetSku(Number(e.target.value))} /></label>
      <label>허용 적합성 손실(%)<input type="number" min="0" max="100" step="1" value={maxLossPct} onChange={e => setMaxLossPct(Number(e.target.value))} /></label>
      <label>최소 제품 충진율(%)<input type="number" min="0" max="100" step="1" value={minFillPct} onChange={e => setMinFillPct(Number(e.target.value))} /></label>
      <label>박스 기본 원가<input type="number" min="0" step="0.01" value={baseCost} onChange={e => setBaseCost(Number(e.target.value))} /></label>
      <label>부피 원가/m³<input type="number" min="0" step="0.1" value={volumeCost} onChange={e => setVolumeCost(Number(e.target.value))} /></label>
      <label>박스 SKU 관리비<input type="number" min="0" step="1" value={skuSetupCost} onChange={e => setSkuSetupCost(Number(e.target.value))} /></label>
    </div>

    <p className="carton-standardization-message" role="status">{message}</p>

    {plan && <>
      <div className="carton-kpi-grid">
        <article><span>표준화 전 박스 SKU</span><strong>{plan.baselineBoxSkuCount}종</strong></article>
        <article><span>표준화 후 박스 SKU</span><strong>{plan.standardizedBoxSkuCount}종</strong><small>목표 {plan.targetBoxSkuCount}종</small></article>
        <article><span>공용 박스로 전환</span><strong>{plan.productsStandardized}제품</strong></article>
        <article><span>예상 컨테이너</span><strong>{Number.isFinite(plan.estimatedContainersNeeded) ? `${plan.estimatedContainersNeeded}대` : '적재 불가'}</strong><small>평균 용적률 {percent(plan.estimatedContainerUtilization)}</small></article>
        <article><span>예상 포장비</span><strong>{money(plan.estimatedPackagingCost)}</strong></article>
        <article><span>SKU 관리비 포함</span><strong>{money(plan.estimatedTotalCost)}</strong><small>관리비 {money(plan.estimatedSkuSetupCost)}</small></article>
      </div>

      <div className="carton-standardization-table-wrap">
        <table className="carton-standardization-table">
          <thead><tr><th>제품</th><th>선정 박스</th><th>외경</th><th>입수</th><th>박스 수</th><th>충진율</th><th>컨테이너 효율</th><th>적합성 손실</th></tr></thead>
          <tbody>{plan.assignments.map(item => <tr key={item.productId}>
            <td><b>{item.productId}</b><small>{item.productName}</small></td>
            <td><b>{item.boxId}</b><small>{item.standardized ? `공용화 · 기존 ${item.baselineBoxId}` : '개별 최적 유지'}</small></td>
            <td>{mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)} mm</td>
            <td>{item.unitsPerBox} EA</td>
            <td>{item.boxesNeeded} EA</td>
            <td>{percent(item.productFillRate)}</td>
            <td>{percent(item.containerTileEfficiency)}</td>
            <td>{percent(item.scoreLoss)}</td>
          </tr>)}</tbody>
        </table>
      </div>

      {plan.rejected.length > 0 && <div className="carton-rejected"><b>확인 필요</b>{plan.rejected.map(item => <span key={item.productId}>{item.productId}: {item.reason}</span>)}</div>}
      <div className="carton-standardization-apply"><button className="primary" onClick={apply}>표준화 결과를 메인 적재에 적용</button><small>적용 시 기존 인증은 폐기되고 새 박스 규격으로 관성 검증을 다시 받아야 합니다.</small></div>
    </>}
  </section>;
}
