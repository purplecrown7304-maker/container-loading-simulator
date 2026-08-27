import { useEffect, useState } from 'react';
import {
  optimizeEnterprisePackagingPortfolio,
  type EnterpriseOptimizationObjective,
  type EnterprisePackagingPortfolio,
} from './engine/enterprisePackagingPortfolio';
import { downloadEnterprisePackagingWorkbook } from './enterprisePackagingExcelExport';
import { createEnterprisePackagingManifest, writeEnterprisePackagingManifest } from './enterprisePackagingManifest';
import {
  enterprisePackagingOptionsFromPlanner,
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  readEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { writeStoredState } from './storage';

const objectiveLabel: Record<EnterpriseOptimizationObjective, string> = {
  balanced: '균형 최적화',
  freight: '컨테이너 대수 최소',
  'carton-sku': '박스 SKU 최소',
  cost: '총비용 최소',
};

function portfolioFromStored(stored: EnterprisePackagingPlannerState, objective: EnterpriseOptimizationObjective) {
  return optimizeEnterprisePackagingPortfolio(
    stored.container,
    stored.products,
    stored.boxes ?? [],
    enterprisePackagingOptionsFromPlanner(stored),
    objective,
    Math.min(8, Math.max(1, stored.products.length)),
  );
}

export default function EnterprisePackagingStrategyExplorer() {
  const [objective, setObjective] = useState<EnterpriseOptimizationObjective>('balanced');
  const [portfolio, setPortfolio] = useState<EnterprisePackagingPortfolio | null>(null);
  const [stored, setStored] = useState<EnterprisePackagingPlannerState | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const invalidate = () => {
      setPortfolio(null);
      setStored(null);
      setMessage('기업 포장 입력이 변경되었습니다. 전략 자동비교를 다시 실행하세요.');
    };
    const onPlannerInput = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#product-packaging-planner')) invalidate();
    };
    const onPlannerClick = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('#product-packaging-planner button')) invalidate();
    };
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, invalidate);
    document.addEventListener('input', onPlannerInput, true);
    document.addEventListener('change', onPlannerInput, true);
    document.addEventListener('click', onPlannerClick, true);
    return () => {
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, invalidate);
      document.removeEventListener('input', onPlannerInput, true);
      document.removeEventListener('change', onPlannerInput, true);
      document.removeEventListener('click', onPlannerClick, true);
    };
  }, []);

  const compare = () => {
    const current = readEnterprisePackagingPlannerState();
    if (!current?.products?.length) return setMessage('제품 목록을 먼저 등록하거나 Excel로 불러오세요.');
    const next = portfolioFromStored(current, objective);
    setStored(current);
    setPortfolio(next);
    const recommended = next.recommended.plan;
    setMessage(`${objectiveLabel[objective]} 추천 · 컨테이너 ${recommended.shipment.containersRequired}대 · 박스 ${recommended.totalBoxes}EA · 규격 ${recommended.family.selectedBoxTypes}종`);
  };

  const apply = () => {
    if (!portfolio || !stored) return;
    const plan = portfolio.recommended.plan;
    const unverified = plan.assignments.filter((item) => item.strengthStatus === 'design-target').length;
    if (!window.confirm(`추천 전략을 메인 적재에 적용할까요?\n${objectiveLabel[portfolio.objective]} · 박스 ${plan.totalBoxes}EA · 컨테이너 ${plan.shipment.containersRequired}대${unverified ? `\n자동설계 ${unverified}종은 강도 미검증으로 1단 적용` : ''}`)) return;
    writeStoredState({ container: stored.container, cargo: plan.cargo }, true);
    writeEnterprisePackagingManifest(createEnterprisePackagingManifest(plan, stored.container, stored.products, stored.boxes));
    setMessage('추천 포장계획을 메인 적재에 적용했습니다. 다음 단계에서 물리 최적화와 관성 검증을 다시 실행하세요.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportPlan = () => {
    if (!portfolio || !stored) return;
    downloadEnterprisePackagingWorkbook(portfolio.recommended.plan, stored.container, stored.products, stored.boxes);
  };

  return <section className="enterprise-strategy-explorer" aria-label="기업 포장 전략 자동 비교">
    <div className="strategy-explorer-head">
      <div><span>STRATEGY SWEEP</span><h3>포장 전략 자동 비교</h3><p>같은 제품을 여러 박스 패밀리/잔량 방식으로 다시 계산해 목적에 맞는 추천안을 선택합니다.</p></div>
      <div className="strategy-explorer-controls">
        <label>최적화 기준<select value={objective} onChange={(event) => { setObjective(event.target.value as EnterpriseOptimizationObjective); setPortfolio(null); setStored(null); }}><option value="balanced">균형</option><option value="freight">컨테이너 대수 최소</option><option value="carton-sku">박스 SKU 최소</option><option value="cost">총비용 최소</option></select></label>
        <button type="button" onClick={compare}>전략 자동비교</button>
      </div>
    </div>
    {message && <p className="strategy-explorer-message" aria-live="polite">{message}</p>}
    {portfolio && <>
      {portfolio.objective === 'cost' && !portfolio.costComparisonComplete && <p className="strategy-cost-warning">박스 단가가 비어 있는 항목이 있어 완전한 최저비용 비교는 불가능합니다. 미가격 박스 수가 적은 시나리오를 우선한 뒤 확인 가능한 비용을 비교했습니다.</p>}
      <div className="strategy-recommended">
        <div><span>추천</span><b>{objectiveLabel[portfolio.objective]}</b><small>{portfolio.recommended.id}</small></div>
        <div><span>컨테이너</span><b>{portfolio.recommended.plan.shipment.containersRequired}대</b></div>
        <div><span>박스</span><b>{portfolio.recommended.plan.totalBoxes}EA</b></div>
        <div><span>박스 규격</span><b>{portfolio.recommended.plan.family.selectedBoxTypes}종</b></div>
        <div><span>확인 비용</span><b>{portfolio.recommended.plan.cost.totalKnownCost.toLocaleString()} {portfolio.recommended.plan.cost.currency}</b><small>미가격 {portfolio.recommended.plan.cost.unpricedCartons}EA</small></div>
        <div className="strategy-recommended-actions"><button type="button" onClick={exportPlan}>추천안 Excel</button><button type="button" className="primary" onClick={apply}>추천안 메인 적용</button></div>
      </div>
      <div className="strategy-scenario-table"><table><thead><tr><th>순위</th><th>목표 규격</th><th>잔량 혼합</th><th>실제 규격</th><th>박스수</th><th>컨테이너</th><th>효율손실</th><th>확인비용</th><th>미가격</th></tr></thead><tbody>{portfolio.scenarios.slice(0, 10).map((scenario, index) => <tr key={scenario.id} className={index === 0 ? 'recommended' : ''}><td>{index + 1}</td><td>{scenario.targetBoxTypes}종</td><td>{scenario.mixedResidual ? '허용' : '전용'}</td><td>{scenario.plan.family.selectedBoxTypes}종</td><td>{scenario.plan.totalBoxes}EA</td><td>{scenario.plan.shipment.containersRequired}대</td><td>{(scenario.plan.family.averageScoreLoss * 100).toFixed(1)}%</td><td>{scenario.plan.cost.totalKnownCost.toLocaleString()}</td><td>{scenario.plan.cost.unpricedCartons}EA</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
