import { randomUniqueCargoColor } from './cargoColors';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import {
  defaultProductPackagingOptions,
  optimizeProductPackaging,
  type BoxCatalogItem,
  type ProductPackagingAssignment,
} from './engine/productPackagingOptimizer';
import type { CargoItem, ContainerSpec } from './engine/types';
import {
  enterprisePackagingOptionsFromPlanner,
  readEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';

export const PRODUCT_SELECTION_KEY = 'container-loading:selected-company-products-v1';
export const PRODUCT_SELECTION_EVENT = 'container-loading:selected-company-products-updated';
export const PRODUCT_PACKAGING_EVENT = 'container-loading:product-packaging-updated';

export type ProductSelectionMap = Record<string, number>;

export function readProductSelection(): ProductSelectionMap {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRODUCT_SELECTION_KEY) || '{}') as ProductSelectionMap;
    const planner = readEnterprisePackagingPlannerState();
    const validProductIds = new Set((planner?.products ?? []).map(product => product.id));
    const clean = Object.fromEntries(
      Object.entries(parsed).filter(([id, quantity]) => validProductIds.has(id) && Number.isInteger(quantity) && quantity > 0),
    );
    if (Object.keys(clean).length !== Object.keys(parsed).length) {
      window.localStorage.setItem(PRODUCT_SELECTION_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch {
    return {};
  }
}

export function writeProductSelection(selection: ProductSelectionMap) {
  if (typeof window === 'undefined') return;
  const validProductIds = new Set((readEnterprisePackagingPlannerState()?.products ?? []).map(product => product.id));
  const clean = Object.fromEntries(
    Object.entries(selection).filter(([id, quantity]) => validProductIds.has(id) && Number.isInteger(quantity) && quantity > 0),
  );
  window.localStorage.setItem(PRODUCT_SELECTION_KEY, JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent<ProductSelectionMap>(PRODUCT_SELECTION_EVENT, { detail: clean }));
}

export function selectedProducts(products: CompanyProductItem[], selection = readProductSelection()): CompanyProductItem[] {
  return products.flatMap((product) => {
    const quantity = selection[product.id] ?? 0;
    return quantity > 0 ? [{ ...product, quantity }] : [];
  });
}

export function plannerContainer(): ContainerSpec {
  const state = readEnterprisePackagingPlannerState();
  return state?.container ?? { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };
}

export function packagingCandidates(
  container: ContainerSpec,
  product: CompanyProductItem,
  boxes: BoxCatalogItem[],
  state?: EnterprisePackagingPlannerState | null,
): ProductPackagingAssignment[] {
  if (!requiresBoxPackaging(product)) return [];
  const planner = state ?? readEnterprisePackagingPlannerState();
  const sourceState: EnterprisePackagingPlannerState = {
    container,
    products: [product],
    boxes,
    settings: planner?.settings,
  };
  const enterprise = enterprisePackagingOptionsFromPlanner(sourceState);
  const packaging = enterprise.packaging ?? defaultProductPackagingOptions;
  const candidates: ProductPackagingAssignment[] = [];

  for (const box of boxes) {
    const plan = optimizeProductPackaging(container, [product], [box], { ...packaging, allowCustomBoxDesign: false });
    if (plan.assignments[0]) candidates.push(plan.assignments[0]);
  }

  const generated = optimizeProductPackaging(container, [product], [], { ...packaging, allowCustomBoxDesign: true }).assignments[0];
  if (generated) candidates.push(generated);

  const unique = new Map<string, ProductPackagingAssignment>();
  for (const candidate of candidates) {
    const key = `${candidate.boxId}:${candidate.outerLength.toFixed(4)}:${candidate.outerWidth.toFixed(4)}:${candidate.outerHeight.toFixed(4)}`;
    const previous = unique.get(key);
    if (!previous || candidate.score > previous.score) unique.set(key, candidate);
  }

  return [...unique.values()]
    .sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || b.productFillRate - a.productFillRate)
    .slice(0, 3);
}

export function bestPackagingAssignments(
  container: ContainerSpec,
  products: CompanyProductItem[],
  boxes: BoxCatalogItem[],
): ProductPackagingAssignment[] {
  const state = readEnterprisePackagingPlannerState();
  return products.flatMap((product) => {
    if (!requiresBoxPackaging(product)) return [];
    const best = packagingCandidates(container, product, boxes, state)[0];
    return best ? [best] : [];
  });
}

export function cargoFromProductPackaging(
  products: CompanyProductItem[],
  assignments: ProductPackagingAssignment[],
): CargoItem[] {
  const byProduct = new Map(assignments.map((assignment) => [assignment.productId, assignment]));
  const usedColors: string[] = [];
  const cargo: CargoItem[] = [];

  for (const product of products) {
    const displayColor = randomUniqueCargoColor(usedColors);
    usedColors.push(displayColor);
    if (!requiresBoxPackaging(product)) {
      cargo.push({
        id: `DIRECT-${product.id}`,
        name: `${product.name} · 직접 적재`,
        length: product.length,
        width: product.width,
        height: product.height,
        weightKg: product.weightKg,
        quantity: product.quantity,
        maxStackLayers: 1,
        maxTopLoadKg: 0,
        productId: product.id,
        productName: product.name,
        unitsPerPackage: 1,
        contentWeightKg: product.weightKg,
        allowRotation: product.allowRotation !== false,
        displayColor,
      });
      continue;
    }

    const assignment = byProduct.get(product.id);
    if (!assignment) continue;

    const unitsPerBox = Math.max(1, assignment.unitsPerBox);
    const fullBoxCount = Math.floor(product.quantity / unitsPerBox);
    const remainingUnits = product.quantity % unitsPerBox;
    const addPackedBoxes = (id: string, quantity: number, unitsInBox: number, suffix = '') => {
      if (quantity <= 0 || unitsInBox <= 0) return;
      const contentWeightKg = product.weightKg * unitsInBox;
      cargo.push({
        id,
        name: `${product.name} · ${assignment.boxName}${suffix}`,
        length: assignment.outerLength,
        width: assignment.outerWidth,
        height: assignment.outerHeight,
        // 적재 화물의 박스 무게는 빈 박스 자중이 아니라 실제 담긴 제품들의 총중량으로 사용한다.
        weightKg: contentWeightKg,
        quantity,
        maxStackLayers: assignment.maxStackLayers,
        maxTopLoadKg: assignment.maxTopLoadKg,
        productId: product.id,
        productName: product.name,
        unitsPerPackage: unitsInBox,
        contentWeightKg,
        allowRotation: true,
        displayColor,
      });
    };

    if (fullBoxCount > 0) {
      addPackedBoxes(`PKG-${product.id}`, fullBoxCount, unitsPerBox);
    }
    if (remainingUnits > 0) {
      // 마지막 박스는 실제 잔량 EA와 실제 제품 총중량을 별도 적재단위로 만들어 과대 중량 계산을 막는다.
      addPackedBoxes(
        fullBoxCount > 0 ? `PKG-${product.id}-PARTIAL` : `PKG-${product.id}`,
        1,
        remainingUnits,
        ' · 잔량박스',
      );
    }
  }

  return cargo;
}

export function formatBoxSize(assignment: ProductPackagingAssignment) {
  return `${Math.round(assignment.outerLength * 1000)} × ${Math.round(assignment.outerWidth * 1000)} × ${Math.round(assignment.outerHeight * 1000)} mm`;
}
