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
  const aCost = scenarioCost(a);
  const bCost = scenarioCost(b);
  if (Number.isFinite(aCost) && Number.isFinite(bCost) && Math.abs(aCost - bCost) > EPS) return aCost - bCost;
  if (a.plan.shipment.containersRequired !== b.plan.shipment.containersRequired) return a.plan.shipment.containersRequired - b.plan.shipment.containersRequired;
  if (a.plan.totalBoxes !== b.plan.totalBoxes) return a.plan.totalBoxes - b.plan.totalBoxes;
  if (familyTypes(a) !== familyTypes(b)) return familyTypes(a) - familyTypes(b);
  if (Math.abs(a.plan.family.averageScoreLoss - b.plan.family.averageScoreLoss) > EPS) return a.plan.family.averageScoreLoss - b.plan.family.averageScoreLoss;
  if (a.plan.mixedCartonSavings !== b.plan.mixedCartonSavings) return b.plan.mixedCartonSavings - a.plan.mixedCartonSavings;
  return a.id.localeCompare(b.id);
}

export function searchEnterprisePackagingScenarios(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  options: EnterpriseScenarioSearchOptions = defaultEnterpriseScenarioSearchOptions,
): EnterpriseScenarioSearchResult {
  const minTarget = Math.max(1, Math.floor(options.minTargetBoxTypes));
  const maxTarget = Math.max(minTarget, Math.min(12, Math.floor(options.maxTargetBoxTypes)));
  const targets = Array.from({ length: maxTarget - minTarget + 1 }, (_, index) => minTarget + index);
  const customValues = options.compareCustomBoxDesign
    ? distinctValues([false, true, options.baseOptions.packaging.allowCustomBoxDesign])
    : [options.baseOptions.packaging.allowCustomBoxDesign];
  const mixedValues = options.compareMixedResidualCartons
    ? distinctValues([false, true, options.baseOptions.allowMixedResidualCartons])
    : [options.baseOptions.allowMixedResidualCartons];

  const scenarios: EnterprisePackagingScenario[] = [];
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
        scenarios.push({
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
  scenarios.push({
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

  const pareto = scenarios
    .filter((scenario) => scenario.feasible)
    .filter((scenario, index, all) => !all.some((other, otherIndex) => otherIndex !== index && dominates(other, scenario)))
    .sort(recommendedSort);
  const recommended = [...pareto].sort(recommendedSort)[0] ?? [...scenarios].sort(recommendedSort)[0];
  return { scenarios, pareto, recommended };
}
