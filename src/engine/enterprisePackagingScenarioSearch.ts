import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging, type EnterprisePackagingOptions, type EnterprisePackagingPlan } from './enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const EPS = 1e-9;

export type EnterprisePackagingScenario = {
  id: string;
  label: string;
  allowCustomBoxDesign: boolean;
  familyEnabled: boolean;
  targetBoxTypes: number;
  allowMixedResidualCartons: boolean;
  plan: EnterprisePackagingPlan;
  feasible: boolean;
  completeCost: boolean;
};

export type EnterpriseScenarioSearchOptions = {
  minTargetBoxTypes: number;
  maxTargetBoxTypes: number;
  compareCustomBoxDesign: boolean;
  compareMixedResidualCartons: boolean;
  baseOptions: EnterprisePackagingOptions;
};

export type EnterpriseScenarioSearchResult = {
  scenarios: EnterprisePackagingScenario[];
  pareto: EnterprisePackagingScenario[];
  recommended?: EnterprisePackagingScenario;
};

export const defaultEnterpriseScenarioSearchOptions: EnterpriseScenarioSearchOptions = {
  minTargetBoxTypes: 1,
  maxTargetBoxTypes: 6,
  compareCustomBoxDesign: true,
  compareMixedResidualCartons: true,
  baseOptions: defaultEnterprisePackagingOptions,
};

function distinctValues<T>(values: T[]) {
  return [...new Set(values)];
}

function scenarioCost(scenario: EnterprisePackagingScenario) {
  return scenario.completeCost ? scenario.plan.cost.totalKnownCost : Number.POSITIVE_INFINITY;
}

function familyTypes(scenario: EnterprisePackagingScenario) {
  return scenario.plan.family.selectedBoxTypes;
}

function feasible(plan: EnterprisePackagingPlan) {
  return plan.rejected.length === 0 && plan.shipment.fullyLoaded && plan.shipment.remaining.length === 0;
}

function dominates(a: EnterprisePackagingScenario, b: EnterprisePackagingScenario) {
  if (!a.feasible || !b.feasible) return false;
  const aCost = scenarioCost(a);
  const bCost = scenarioCost(b);
  const comparableCost = Number.isFinite(aCost) && Number.isFinite(bCost);
  const noWorse = a.plan.shipment.containersRequired <= b.plan.shipment.containersRequired
    && a.plan.totalBoxes <= b.plan.totalBoxes
    && familyTypes(a) <= familyTypes(b)
    && (!comparableCost || aCost <= bCost + EPS)
    && a.plan.family.averageScoreLoss <= b.plan.family.averageScoreLoss + EPS;
  if (!noWorse) return false;
  return a.plan.shipment.containersRequired < b.plan.shipment.containersRequired
    || a.plan.totalBoxes < b.plan.totalBoxes
    || familyTypes(a) < familyTypes(b)
    || (comparableCost && aCost < bCost - EPS)
    || a.plan.family.averageScoreLoss < b.plan.family.averageScoreLoss - EPS;
}

function recommendedSort(a: EnterprisePackagingScenario, b: EnterprisePackagingScenario) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  // 비용이 완전한 시나리오끼리만 금액으로 직접 우열을 정한다. 단가가 비어 있는
  // 시나리오는 0원으로 간주하지 않고 물류 지표 순으로 비교한다.
  if (a.completeCost && b.completeCost) {
    const diff = a.plan.cost.totalKnownCost - b.plan.cost.totalKnownCost;
    if (Math.abs(diff) > EPS) return diff;
  } else if (a.completeCost !== b.completeCost) {
    return a.completeCost ? -1 : 1;
  }
  if (a.plan.shipment.containersRequired !== b.plan.shipment.containersRequired) return a.plan.shipment.containersRequired - b.plan.shipment.containersRequired;
  if (a.plan.totalBoxes !== b.plan.totalBoxes) return a.plan.totalBoxes - b.plan.totalBoxes;
  if (familyTypes(a) !== familyTypes(b)) return familyTypes(a) - familyTypes(b);
  if (Math.abs(a.plan.family.averageScoreLoss - b.plan.family.averageScoreLoss) > EPS) return a.plan.family.averageScoreLoss - b.plan.family.averageScoreLoss;
  if (a.plan.mixedCartonSavings !== b.plan.mixedCartonSavings) return b.plan.mixedCartonSavings - a.plan.mixedCartonSavings;
  return a.id.localeCompare(b.id);
}

function resultSignature(scenario: EnterprisePackagingScenario) {
  const assignments = scenario.plan.assignments
    .map((item) => `${item.productId}:${item.boxId}:${item.unitsPerBox}:${item.boxesNeeded}`)
    .sort().join('|');
  const mixed = scenario.plan.mixedCartons
    .map((item) => `${item.boxId}:${item.contents.map((content) => `${content.productId}:${content.quantity}`).sort().join(',')}`)
    .sort().join('|');
  return [
    scenario.feasible ? 1 : 0,
    scenario.plan.shipment.containersRequired,
    scenario.plan.totalBoxes,
    scenario.plan.family.selectedBoxTypes,
    scenario.plan.cost.unpricedCartons,
    scenario.plan.cost.totalKnownCost.toFixed(4),
    assignments,
    mixed,
  ].join('::');
}

export function searchEnterprisePackagingScenarios(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  options: EnterpriseScenarioSearchOptions = defaultEnterpriseScenarioSearchOptions,
): EnterpriseScenarioSearchResult {
  const activeProductCount = Math.max(1, products.filter((product) => Number.isInteger(product.quantity) && product.quantity > 0).length);
  const minTarget = Math.max(1, Math.min(activeProductCount, Math.floor(options.minTargetBoxTypes)));
  // 제품 종류보다 많은 공용 박스 목표는 family optimizer에서 새로운 의미가 없으므로
  // 반복 계산하지 않는다. 브라우저 폭주를 막기 위해 절대 상한도 12종으로 유지한다.
  const effectiveMax = Math.min(12, activeProductCount, Math.floor(options.maxTargetBoxTypes));
  const maxTarget = Math.max(minTarget, effectiveMax);
  const targets = Array.from({ length: maxTarget - minTarget + 1 }, (_, index) => minTarget + index);
  const customValues = options.compareCustomBoxDesign
    ? distinctValues([false, true, options.baseOptions.packaging.allowCustomBoxDesign])
    : [options.baseOptions.packaging.allowCustomBoxDesign];
  const mixedValues = options.compareMixedResidualCartons
    ? distinctValues([false, true, options.baseOptions.allowMixedResidualCartons])
    : [options.baseOptions.allowMixedResidualCartons];

  const rawScenarios: EnterprisePackagingScenario[] = [];
  for (const allowCustomBoxDesign of customValues) {
    for (const allowMixedResidualCartons of mixedValues) {
      for (const targetBoxTypes of targets) {
        const familyEnabled = true;
        const scenarioOptions: EnterprisePackagingOptions = {
          ...options.baseOptions,
          packaging: { ...options.baseOptions.packaging, allowCustomBoxDesign },
          family: { ...options.baseOptions.family, enabled: familyEnabled, targetMaxBoxTypes: targetBoxTypes },
          allowMixedResidualCartons,
        };
        const plan = optimizeEnterprisePackaging(container, products, catalog, scenarioOptions);
        const id = `custom-${allowCustomBoxDesign ? 1 : 0}-family-${targetBoxTypes}-mix-${allowMixedResidualCartons ? 1 : 0}`;
        rawScenarios.push({
          id,
          label: `${allowCustomBoxDesign ? '신규규격 허용' : '보유박스 우선'} · 공용 ${targetBoxTypes}종 · ${allowMixedResidualCartons ? '잔량혼합' : '잔량분리'}`,
          allowCustomBoxDesign,
          familyEnabled,
          targetBoxTypes,
          allowMixedResidualCartons,
          plan,
          feasible: feasible(plan),
          completeCost: plan.cost.unpricedCartons === 0,
        });
      }
    }
  }

  // family 자체를 끈 개별 최적안도 기준점으로 항상 포함한다.
  const baselineOptions: EnterprisePackagingOptions = {
    ...options.baseOptions,
    family: { ...options.baseOptions.family, enabled: false },
  };
  const baselinePlan = optimizeEnterprisePackaging(container, products, catalog, baselineOptions);
  rawScenarios.push({
    id: 'baseline-individual',
    label: '제품별 개별 최적 기준안',
    allowCustomBoxDesign: baselineOptions.packaging.allowCustomBoxDesign,
    familyEnabled: false,
    targetBoxTypes: baselinePlan.family.selectedBoxTypes,
    allowMixedResidualCartons: baselineOptions.allowMixedResidualCartons,
    plan: baselinePlan,
    feasible: feasible(baselinePlan),
    completeCost: baselinePlan.cost.unpricedCartons === 0,
  });

  // 서로 다른 옵션이 실제로 완전히 같은 박스/수량 결과를 만든 경우 UI에는 한 번만
  // 노출한다. 먼저 생성된 낮은 target 시나리오를 보존해 설명 가능성도 유지한다.
  const uniqueResults = new Map<string, EnterprisePackagingScenario>();
  for (const scenario of rawScenarios) {
    const signature = resultSignature(scenario);
    if (!uniqueResults.has(signature)) uniqueResults.set(signature, scenario);
  }
  const scenarios = [...uniqueResults.values()];

  const pareto = scenarios
    .filter((scenario) => scenario.feasible)
    .filter((scenario, index, all) => !all.some((other, otherIndex) => otherIndex !== index && dominates(other, scenario)))
    .sort(recommendedSort);
  const recommended = [...pareto].sort(recommendedSort)[0] ?? [...scenarios].sort(recommendedSort)[0];
  return { scenarios, pareto, recommended };
}
