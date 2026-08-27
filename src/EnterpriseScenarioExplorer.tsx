import { useState } from 'react';
import { defaultEnterprisePackagingOptions, type EnterprisePackagingOptions } from './engine/enterprisePackagingOptimizer';
import { searchEnterprisePackagingScenarios, type EnterprisePackagingScenario, type EnterpriseScenarioSearchResult } from './engine/enterprisePackagingScenarioSearch';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { readStoredState, writeStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

type PlannerSettings = {
  allowCustom?: boolean;
  maxGrossKg?: number;
  generatedBoxUnitCost?: number;
  targetBoxTypes?: number;
  maxScoreLossPct?: number;
  allowMixedResidual?: boolean;
  containerFreightCost?: number;
  handlingCostPerCarton?: number;
  newBoxSetupCost?: number;
  cartonSkuCarryCost?: number;
  currency?: string;
};

type StoredPlanner = { products?: ProductItem[]; boxes?: BoxCatalogItem[]; container?: ContainerSpec; settings?: PlannerSettings };

function readPlanner(): StoredPlanner | null {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPlanner : null;
  } catch {
    return null;
  }
}

function baseOptions(settings: PlannerSettings | undefined): EnterprisePackagingOptions {
  return {
    ...defaultEnterprisePackagingOptions,
    packaging: {
      ...defaultEnterprisePackagingOptions.packaging,
      allowCustomBoxDesign: settings?.allowCustom ?? true,
      maxGeneratedGrossWeightKg: Math.max(1, settings?.maxGrossKg ?? defaultEnterprisePackagingOptions.packaging.maxGeneratedGrossWeightKg),
      generatedBoxUnitCost: (settings?.generatedBoxUnitCost ?? 0) > 0 ? settings?.generatedBoxUnitCost : undefined,
    },
    family: {
      ...defaultEnterprisePackagingOptions.family,
      enabled: true,
      targetMaxBoxTypes: Math.max(1, Math.floor(settings?.targetBoxTypes ?? defaultEnterprisePackagingOptions.family.targetMaxBoxTypes)),
      maxAssignmentScoreLoss: Math.min(1, Math.max(0, (settings?.maxScoreLossPct ?? 8) / 100)),
    },
    allowMixedResidualCartons: settings?.allowMixedResidual ?? false,
    cost: {
      containerFreightCost: Math.max(0, settings?.containerFreightCost ?? 0),
      handlingCostPerCarton: Math.max(0, settings?.handlingCostPerCarton ?? 0),
      newBoxSetupCost: Math.max(0, settings?.newBoxSetupCost ?? 0),
      cartonSkuCarryCost: Math.max(0, settings?.cartonSkuCarryCost ?? 0),
      currency: settings?.currency?.trim() || 'KRW',
    },
  };
}

function currencyValue(value: number, currency: string) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function EnterpriseScenarioExplorer() {
  const [maxBoxTypes, setMaxBoxTypes] = useState(6);
  const [result, setResult] = useState<EnterpriseScenarioSearchResult | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [message, setMessage] = useState('기업 포장 데이터를 등록한 뒤 여러 전략을 자동 비교할 수 있습니다.');

  const run = () => {
    const stored = readPlanner();
    const products = stored?.products ?? [];
    const boxes = stored?.boxes ?? [];
    const container = stored?.container ?? readStoredState()?.container ?? defaultContainer;
    if (!products.length) {
      setResult(null);
      setMessage('비교할 제품이 없습니다. 위 기업 제품 목록을 먼저 등록하세요.');
      return;
    }
    if (!Number.isInteger(maxBoxTypes) || maxBoxTypes < 1 || maxBoxTypes > 12) {
      setMessage('자동 비교 최대 박스 규격 수는 1~12 정수로 입력하세요.');
      return;
    }
    const searched = searchEnterprisePackagingScenarios(container, products, boxes, {
      minTargetBoxTypes: 1,
      maxTargetBoxTypes: maxBoxTypes,
      compareCustomBoxDesign: true,
      compareMixedResidualCartons: true,
      baseOptions: baseOptions(stored?.settings),
    });
    setResult(searched);
    setSelectedId(searched.recommended?.id ?? '');
    setMessage(searched.recommended
      ? `총 ${searched.scenarios.length}개 전략을 비교해 Pareto ${searched.pareto.length}개를 추렸습니다. 추천안: ${searched.recommended.label}`
      : '사용 가능한 전략을 찾지 못했습니다. 제품/박스 제약을 확인하세요.');
  };

  const apply = (scenario: EnterprisePackagingScenario) => {
    if (!scenario.feasible || !scenario.plan.cargo.length) return setMessage('이 전략은 전체 물량을 안전하게 적재할 수 없어 적용할 수 없습니다.');
    const stored = readPlanner();
    const container = stored?.container ?? readStoredState()?.container ?? defaultContainer;
    if (!window.confirm(`${scenario.label}\n박스 ${scenario.plan.totalBoxes}EA · 컨테이너 ${scenario.plan.shipment.containersRequired}대\n이 전략을 메인 적재에 적용할까요?`)) return;
    writeStoredState({ container, cargo: scenario.plan.cargo }, true);
    setSelectedId(scenario.id);
    setMessage(`${scenario.label}을 메인 적재에 적용했습니다. 새 박스 구성으로 물리 최적 적재와 관성 검증을 다시 실행하세요.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const visible = result?.pareto ?? [];
  return <section id="enterprise-scenario-explorer" className="enterprise-scenario-explorer" aria-label="기업 포장 전략 자동 비교">
    <header className="scenario-head">
      <div><span>ENTERPRISE SCENARIO SEARCH</span><h2>포장 전략 자동 비교 · Pareto 최적안</h2><p>신규 박스 여부, 공용 박스 규격 수, 잔량 혼합 여부를 자동 조합해 컨테이너 대수·박스 수·SKU 수·비용·효율손실을 함께 비교합니다.</p></div>
      <div className="scenario-actions"><label>최대 박스 규격<input type="number" min="1" max="12" step="1" value={maxBoxTypes} onChange={(e) => setMaxBoxTypes(Number(e.target.value))} /></label><button className="primary" onClick={run}>시나리오 자동 비교</button></div>
    </header>
    <p className="scenario-message" role="status">{message}</p>

    {result?.recommended && <article className="scenario-recommended">
      <div><span>추천 전략</span><h3>{result.recommended.label}</h3><p>{result.recommended.completeCost ? '등록된 비용정보까지 포함해 비교했습니다.' : '일부 박스 단가가 없어 비용은 참고값이며 물류 지표를 우선 비교했습니다.'}</p></div>
      <div className="scenario-recommended-kpis">
        <b>컨테이너 {result.recommended.plan.shipment.containersRequired}대</b>
        <b>박스 {result.recommended.plan.totalBoxes}EA</b>
        <b>박스 SKU {result.recommended.plan.family.selectedBoxTypes}종</b>
        <b>손실 {pct(result.recommended.plan.family.averageScoreLoss)}</b>
        <b>{currencyValue(result.recommended.plan.cost.totalKnownCost, result.recommended.plan.cost.currency)}</b>
      </div>
      <button className="primary" onClick={() => apply(result.recommended!)}>추천안 메인 적재에 적용</button>
    </article>}

    {visible.length > 0 && <div className="scenario-table-wrap">
      <table className="scenario-table">
        <thead><tr><th>전략</th><th>컨테이너</th><th>총 박스</th><th>박스 SKU</th><th>잔량절감</th><th>평균손실</th><th>비용</th><th>상태</th><th /></tr></thead>
        <tbody>{visible.map((scenario) => <tr key={scenario.id} className={scenario.id === selectedId ? 'selected' : ''}>
          <td><b>{scenario.label}</b><small>{scenario.completeCost ? '비용 완전' : `미가격 ${scenario.plan.cost.unpricedCartons}EA`}</small></td>
          <td>{scenario.plan.shipment.containersRequired}대</td>
          <td>{scenario.plan.totalBoxes}EA</td>
          <td>{scenario.plan.family.selectedBoxTypes}종</td>
          <td>{scenario.plan.mixedCartonSavings}EA</td>
          <td>{pct(scenario.plan.family.averageScoreLoss)}</td>
          <td>{currencyValue(scenario.plan.cost.totalKnownCost, scenario.plan.cost.currency)}</td>
          <td>{scenario.feasible ? '적재 가능' : '확인 필요'}</td>
          <td><button disabled={!scenario.feasible} onClick={() => apply(scenario)}>적용</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
