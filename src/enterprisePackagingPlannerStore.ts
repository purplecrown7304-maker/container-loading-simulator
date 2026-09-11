import { isAdminSession } from './adminAccess';
import { isLegacyVirtualCompanyProduct } from './companyProduct';
import {
  defaultEnterprisePackagingOptions,
  optimizeEnterprisePackaging,
  type EnterprisePackagingOptions,
  type EnterprisePackagingPlan,
} from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { operatorScopedStorageKey, readLocalOperator } from './localOperator';

export const ENTERPRISE_PACKAGING_PLANNER_KEY = 'container-loading-product-packaging-v1';
export const ENTERPRISE_PACKAGING_PLANNER_EVENT = 'container-loading:enterprise-packaging-planner-updated';

const ADMIN_PLANNER_KEY = `${ENTERPRISE_PACKAGING_PLANNER_KEY}:admin`;
const GUEST_PLANNER_KEY = `${ENTERPRISE_PACKAGING_PLANNER_KEY}:guest`;

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

function cleanPlannerState(state: EnterprisePackagingPlannerState) {
  let changed = false;
  const products = state.products.flatMap(product => {
    if (isLegacyVirtualCompanyProduct(product)) {
      changed = true;
      return [];
    }
    if ('maxUnitsPerBox' in product) {
      const { maxUnitsPerBox: _legacyMaxUnitsPerBox, ...cleaned } = product;
      changed = true;
      return [cleaned as ProductItem];
    }
    return [product];
  });
  return changed ? { ...state, products } : state;
}

function activePlannerKey() {
  if (isAdminSession()) return ADMIN_PLANNER_KEY;
  const operator = readLocalOperator();
  if (operator) return operatorScopedStorageKey(ENTERPRISE_PACKAGING_PLANNER_KEY, operator);
  return GUEST_PLANNER_KEY;
}

function parsePlannerState(raw: string | null): EnterprisePackagingPlannerState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EnterprisePackagingPlannerState;
    if (!parsed?.container || !Array.isArray(parsed.products) || !Array.isArray(parsed.boxes)) return null;
    return cleanPlannerState(parsed);
  } catch {
    return null;
  }
}

function migrateLegacyAdminPlannerIfNeeded(key: string) {
  if (key !== ADMIN_PLANNER_KEY || window.localStorage.getItem(key)) return;
  const legacy = parsePlannerState(window.localStorage.getItem(ENTERPRISE_PACKAGING_PLANNER_KEY));
  if (legacy) window.localStorage.setItem(key, JSON.stringify(legacy));
}

export function readEnterprisePackagingPlannerState(): EnterprisePackagingPlannerState | null {
  if (typeof window === 'undefined') return null;
  const key = activePlannerKey();
  try {
    // 예전 공용 제품 데이터는 관리자 영역으로만 이전한다. 회원/게스트에게는 절대 상속하지 않는다.
    migrateLegacyAdminPlannerIfNeeded(key);
    const parsed = parsePlannerState(window.localStorage.getItem(key));
    if (!parsed) return null;
    const raw = window.localStorage.getItem(key);
    if (raw !== JSON.stringify(parsed)) window.localStorage.setItem(key, JSON.stringify(parsed));
    return parsed;
  } catch {
    return null;
  }
}

export function writeEnterprisePackagingPlannerState(state: EnterprisePackagingPlannerState, notify = true) {
  if (typeof window === 'undefined') return;
  const cleaned = cleanPlannerState(state);
  const key = activePlannerKey();
  window.localStorage.setItem(key, JSON.stringify(cleaned));
  if (notify) window.dispatchEvent(new CustomEvent<EnterprisePackagingPlannerState>(ENTERPRISE_PACKAGING_PLANNER_EVENT, { detail: cleaned }));
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
      // 박스당 최대 EA는 사람이 입력하지 않는다. 규격·중량·내부 배치로 자동 산출한다.
      maxGeneratedUnitsPerBox: Number.MAX_SAFE_INTEGER,
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
  const cleaned = cleanPlannerState(state);
  return optimizeEnterprisePackaging(
    cleaned.container,
    cleaned.products,
    cleaned.boxes ?? [],
    enterprisePackagingOptionsFromPlanner(cleaned),
  );
}
