import {
  optimizeEnterprisePackaging,
  type EnterprisePackagingOptions,
  type EnterprisePackagingPlan,
} from './enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './productPackagingOptimizer';
import type { ContainerSpec } from './types';

const EPS = 1e-9;

export type EnterpriseOptimizationObjective = 'balanced' | 'freight' | 'carton-sku' | 'cost';

export type EnterprisePackagingScenario = {
  id: string;
  targetBoxTypes: number;
  mixedResidual: boolean;
  plan: EnterprisePackagingPlan;
};

export type EnterprisePackagingPortfolio = {
  objective: EnterpriseOptimizationObjective;
  recommended: EnterprisePackagingScenario;
  scenarios: EnterprisePackagingScenario[];
  costComparisonComplete: boolean;
};

function scenarioSignature(scenario: EnterprisePackagingScenario) {
  return [
    scenario.plan.family.selectedBoxTypes,
    scenario.plan.totalBoxes,
    scenario.plan.shipment.containersRequired,
    scenario.plan.mixedCartons.length,
    ...scenario.plan.assignments
      .map((item) => `${item.productId}:${item.boxId}:${item.unitsPerBox}`)
      .sort(),
  ].join('|');
}

function numberCompare(a: number, b: number) {
  return Math.abs(a - b) <= EPS ? 0 : a < b ? -1 : 1;
}

function compareScenario(
  a: EnterprisePackagingScenario,
  b: EnterprisePackagingScenario,
  objective: EnterpriseOptimizationObjective,
) {
  // 전량 적재 가능한 시나리오가 항상 우선이다.
  if (a.plan.shipment.fullyLoaded !== b.plan.shipment.fullyLoaded) return a.plan.shipment.fullyLoaded ? -1 : 1;

  if (objective === 'cost') {
    const unpriced = numberCompare(a.plan.cost.unpricedCartons, b.plan.cost.unpricedCartons);
    if (unpriced) return unpriced;
    const cost = numberCompare(a.plan.cost.totalKnownCost, b.plan.cost.totalKnownCost);
    if (cost) return cost;
    const containers = numberCompare(a.plan.shipment.containersRequired, b.plan.shipment.containersRequired);
    if (containers) return containers;
    const boxes = numberCompare(a.plan.totalBoxes, b.plan.totalBoxes);
    if (boxes) return boxes;
    return numberCompare(a.plan.family.selectedBoxTypes, b.plan.family.selectedBoxTypes);
  }

  if (objective === 'freight') {
    const containers = numberCompare(a.plan.shipment.containersRequired, b.plan.shipment.containersRequired);
    if (containers) return containers;
    const boxes = numberCompare(a.plan.totalBoxes, b.plan.totalBoxes);
    if (boxes) return boxes;
    const types = numberCompare(a.plan.family.selectedBoxTypes, b.plan.family.selectedBoxTypes);
    if (types) return types;
    return numberCompare(a.plan.family.averageScoreLoss, b.plan.family.averageScoreLoss);
  }

  if (objective === 'carton-sku') {
    const types = numberCompare(a.plan.family.selectedBoxTypes, b.plan.family.selectedBoxTypes);
    if (types) return types;
    const containers = numberCompare(a.plan.shipment.containersRequired, b.plan.shipment.containersRequired);
    if (containers) return containers;
    const boxes = numberCompare(a.plan.totalBoxes, b.plan.totalBoxes);
    if (boxes) return boxes;
    return numberCompare(a.plan.family.averageScoreLoss, b.plan.family.averageScoreLoss);
  }

  // 균형 모드: 운송대수를 먼저 지키고, 같은 대수 안에서 박스 수와 SKU 수를 함께 낮춘다.
  const containers = numberCompare(a.plan.shipment.containersRequired, b.plan.shipment.containersRequired);
  if (containers) return containers;
  const combinedA = a.plan.totalBoxes + a.plan.family.selectedBoxTypes * 3 + a.plan.family.averageScoreLoss * 100;
  const combinedB = b.plan.totalBoxes + b.plan.family.selectedBoxTypes * 3 + b.plan.family.averageScoreLoss * 100;
  const combined = numberCompare(combinedA, combinedB);
  if (combined) return combined;
  return a.id.localeCompare(b.id);
}

export function optimizeEnterprisePackagingPortfolio(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  baseOptions: EnterprisePackagingOptions,
  objective: EnterpriseOptimizationObjective = 'balanced',
  maxScenarioBoxTypes = 8,
): EnterprisePackagingPortfolio {
  const maxTypes = Math.max(1, Math.min(
    Math.floor(maxScenarioBoxTypes),
    Math.max(1, products.length),
  ));
  const targets = baseOptions.family.enabled
    ? Array.from({ length: maxTypes }, (_, index) => index + 1)
    : [Math.max(1, baseOptions.family.targetMaxBoxTypes)];
  const mixedChoices = baseOptions.allowMixedResidualCartons ? [false, true] : [false];
  const raw: EnterprisePackagingScenario[] = [];

  for (const targetBoxTypes of targets) {
    for (const mixedResidual of mixedChoices) {
      const plan = optimizeEnterprisePackaging(container, products, catalog, {
        ...baseOptions,
        family: {
          ...baseOptions.family,
          targetMaxBoxTypes: targetBoxTypes,
        },
        allowMixedResidualCartons: mixedResidual,
      });
      raw.push({
        id: `types-${targetBoxTypes}-${mixedResidual ? 'mixed' : 'dedicated'}`,
        targetBoxTypes,
        mixedResidual,
        plan,
      });
    }
  }

  const unique = new Map<string, EnterprisePackagingScenario>();
  for (const scenario of raw) {
    const key = scenarioSignature(scenario);
    const current = unique.get(key);
    if (!current || scenario.id.localeCompare(current.id) < 0) unique.set(key, scenario);
  }
  const scenarios = [...unique.values()].sort((a, b) => compareScenario(a, b, objective) || a.id.localeCompare(b.id));
  const recommended = scenarios[0] ?? {
    id: 'fallback',
    targetBoxTypes: Math.max(1, baseOptions.family.targetMaxBoxTypes),
    mixedResidual: baseOptions.allowMixedResidualCartons,
    plan: optimizeEnterprisePackaging(container, products, catalog, baseOptions),
  };

  return {
    objective,
    recommended,
    scenarios,
    costComparisonComplete: scenarios.every((scenario) => scenario.plan.cost.unpricedCartons === 0),
  };
}
