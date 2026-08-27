import {
  defaultEnterprisePackagingOptions,
  optimizeEnterprisePackaging,
  type EnterprisePackagingOptions,
  type EnterprisePackagingPlan,
} from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';

export const ENTERPRISE_PACKAGING_PLANNER_KEY = 'container-loading-product-packaging-v1';
export const ENTERPRISE_PACKAGING_PLANNER_EVENT = 'container-loading:enterprise-packaging-planner-updated';

export type EnterprisePackagingPlannerSettings = {
  allowCustom?: boolean;
  maxGrossKg?: number;
  generatedBoxUnitCost?: number;
  generatedDimensionStepMm?: number;
  familyEnabled?: boolean;
  targetBoxTypes?: number;
  maxScoreLossPct?: number;
  allowMixedResidual?: boolean;
  containerFreightCost?: number;
  handlingCostPerCarton?: number;
  newBoxSetupCost?: number;
  cartonSkuCarryCost?: number;
  currency?: string;
};

export type EnterprisePackagingPlannerState = {
  products: ProductItem[];
  boxes: BoxCatalogItem[];
  container: ContainerSpec;
  settings?: EnterprisePackagingPlannerSettings;
};

export function readEnterprisePackagingPlannerState(): EnterprisePackagingPlannerState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ENTERPRISE_PACKAGING_PLANNER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EnterprisePackagingPlannerState;
    if (!parsed?.container || !Array.isArray(parsed.products) || !Array.isArray(parsed.boxes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeEnterprisePackagingPlannerState(state: EnterprisePackagingPlannerState, notify = true) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ENTERPRISE_PACKAGING_PLANNER_KEY, JSON.stringify(state));
  if (notify) window.dispatchEvent(new CustomEvent<EnterprisePackagingPlannerState>(ENTERPRISE_PACKAGING_PLANNER_EVENT, { detail: state }));
}

export function enterprisePackagingOptionsFromPlanner(
  state: EnterprisePackagingPlannerState,
): EnterprisePackagingOptions {
  const settings = state.settings ?? {};
  const dimensionStepMm = Number.isFinite(settings.generatedDimensionStepMm) && (settings.generatedDimensionStepMm ?? 0) > 0
    ? settings.generatedDimensionStepMm as number
    : 5;
  return {
    ...defaultEnterprisePackagingOptions,
    packaging: {
      ...defaultEnterprisePackagingOptions.packaging,
      allowCustomBoxDesign: settings.allowCustom ?? true,
      maxGeneratedGrossWeightKg: Math.max(1, settings.maxGrossKg ?? 22),
      generatedDimensionStepM: dimensionStepMm / 1000,
      generatedBoxUnitCost: (settings.generatedBoxUnitCost ?? 0) > 0 ? settings.generatedBoxUnitCost : undefined,
    },
    family: {
      ...defaultEnterprisePackagingOptions.family,
      enabled: settings.familyEnabled ?? true,
      targetMaxBoxTypes: Math.max(1, Math.floor(settings.targetBoxTypes ?? 4)),
      maxAssignmentScoreLoss: Math.min(1, Math.max(0, (settings.maxScoreLossPct ?? 8) / 100)),
      dimensionRoundingM: Math.max(0.001, dimensionStepMm / 1000),
    },
    allowMixedResidualCartons: settings.allowMixedResidual ?? false,
    cost: {
      containerFreightCost: Math.max(0, settings.containerFreightCost ?? 0),
      handlingCostPerCarton: Math.max(0, settings.handlingCostPerCarton ?? 0),
      newBoxSetupCost: Math.max(0, settings.newBoxSetupCost ?? 0),
      cartonSkuCarryCost: Math.max(0, settings.cartonSkuCarryCost ?? 0),
      currency: settings.currency?.trim() || 'KRW',
    },
  };
}

export function buildEnterprisePackagingPlanFromPlanner(
  state: EnterprisePackagingPlannerState,
): EnterprisePackagingPlan {
  return optimizeEnterprisePackaging(
    state.container,
    state.products,
    state.boxes ?? [],
    enterprisePackagingOptionsFromPlanner(state),
  );
}
