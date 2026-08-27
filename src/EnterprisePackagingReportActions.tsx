import { useState } from 'react';
import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging, type EnterprisePackagingOptions } from './engine/enterprisePackagingOptimizer';
import { searchEnterprisePackagingScenarios } from './engine/enterprisePackagingScenarioSearch';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { downloadEnterprisePackagingWorkbook } from './enterprisePackagingReport';
import { readStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

type PlannerSettings = {
  allowCustom?: boolean; maxGrossKg?: number; generatedBoxUnitCost?: number;
  familyEnabled?: boolean; targetBoxTypes?: number; maxScoreLossPct?: number; allowMixedResidual?: boolean;
  containerFreightCost?: number; handlingCostPerCarton?: number; newBoxSetupCost?: number; cartonSkuCarryCost?: number; currency?: string;
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

function optionsFrom(settings: PlannerSettings | undefined): EnterprisePackagingOptions {
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
      enabled: settings?.familyEnabled ?? true,
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

export default function EnterprisePackagingReportActions() {
  const [message, setMessage] = useState('');

  const current = () => {
    const stored = readPlanner();
    const products = stored?.products ?? [];
    const catalog = stored?.boxes ?? [];
    const container = stored?.container ?? readStoredState()?.container ?? defaultContainer;
    if (!products.length) return setMessage('보고서를 만들 제품이 없습니다.');
    const plan = optimizeEnterprisePackaging(container, products, catalog, optionsFrom(stored?.settings));
    downloadEnterprisePackagingWorkbook({ plan, products, catalog, container, scenarioLabel: '현재 기업 포장 설정' }, 'enterprise-packaging-current.xlsx');
    setMessage(`현재 설정 보고서 생성 · 제품 ${plan.assignments.length}종 · 박스 ${plan.totalBoxes}EA`);
  };

  const recommended = () => {
    const stored = readPlanner();
    const products = stored?.products ?? [];
    const catalog = stored?.boxes ?? [];
    const container = stored?.container ?? readStoredState()?.container ?? defaultContainer;
    if (!products.length) return setMessage('보고서를 만들 제품이 없습니다.');
    const base = optionsFrom(stored?.settings);
    const maxTarget = Math.max(4, Math.min(8, (stored?.settings?.targetBoxTypes ?? 4) + 2));
    const search = searchEnterprisePackagingScenarios(container, products, catalog, {
      minTargetBoxTypes: 1,
      maxTargetBoxTypes: maxTarget,
      compareCustomBoxDesign: true,
      compareMixedResidualCartons: true,
      baseOptions: base,
    });
    if (!search.recommended) return setMessage('추천 보고서를 만들 수 있는 적재 가능 시나리오가 없습니다.');
    downloadEnterprisePackagingWorkbook({
      plan: search.recommended.plan,
      products,
      catalog,
      container,
      scenarioLabel: search.recommended.label,
    }, 'enterprise-packaging-recommended.xlsx');
    setMessage(`추천안 보고서 생성 · ${search.recommended.label}`);
  };

  return <section className="enterprise-report-actions" aria-label="기업 포장 설계서 내보내기">
    <div><b>기업 포장 설계서</b><span>구매·포장업체·현장 공유용 Excel: 선정 박스, 공용 규격, 혼합 잔량, 내부 좌표, 강도 요구치, 컨테이너 대수, 비용, 경고를 포함합니다.</span></div>
    <div className="enterprise-report-buttons"><button onClick={current}>현재 설정 Excel</button><button className="primary" onClick={recommended}>자동 추천안 Excel</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
