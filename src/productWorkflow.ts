import { isAdminSession } from './adminAccess';
import { randomUniqueCargoColor } from './cargoColors';
import { requiresBoxPackaging, type CompanyProductItem } from './companyProduct';
import {
  cartonStackLimits,
  defaultProductPackagingOptions,
  type BoxCatalogItem,
  type ProductPackagingAssignment,
} from './engine/productPackagingOptimizer';
import type { CargoItem, ContainerSpec } from './engine/types';
import {
  enterprisePackagingOptionsFromPlanner,
  readEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { operatorScopedStorageKey, readLocalOperator } from './localOperator';

export const PRODUCT_SELECTION_KEY = 'container-loading:selected-company-products-v1';
export const PRODUCT_SELECTION_EVENT = 'container-loading:selected-company-products-updated';
export const PRODUCT_PACKAGING_EVENT = 'container-loading:product-packaging-updated';

const ADMIN_SELECTION_KEY = `${PRODUCT_SELECTION_KEY}:admin`;
const GUEST_SELECTION_KEY = `${PRODUCT_SELECTION_KEY}:guest`;
const QUICK_EPS = 1e-9;
const PACKAGING_CANDIDATE_CACHE_LIMIT = 300;
const packagingCandidateCache = new Map<string, ProductPackagingAssignment[]>();
const boxCatalogFingerprintCache = new WeakMap<BoxCatalogItem[], string>();

export type ProductSelectionMap = Record<string, number>;

function activeSelectionKey() {
  if (isAdminSession()) return ADMIN_SELECTION_KEY;
  const operator = readLocalOperator();
  if (operator) return operatorScopedStorageKey(PRODUCT_SELECTION_KEY, operator);
  return GUEST_SELECTION_KEY;
}

function migrateLegacyAdminSelectionIfNeeded(key: string) {
  if (key !== ADMIN_SELECTION_KEY || window.localStorage.getItem(key)) return;
  const legacy = window.localStorage.getItem(PRODUCT_SELECTION_KEY);
  if (legacy) window.localStorage.setItem(key, legacy);
}

export function readProductSelection(): ProductSelectionMap {
  if (typeof window === 'undefined') return {};
  try {
    const key = activeSelectionKey();
    // 예전 공용 선택 기록은 관리자에게만 이전한다. 회원에게 관리자 선택값이 섞이지 않게 한다.
    migrateLegacyAdminSelectionIfNeeded(key);
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') as ProductSelectionMap;
    const planner = readEnterprisePackagingPlannerState();
    const validProductIds = new Set((planner?.products ?? []).map(product => product.id));
    const clean = Object.fromEntries(
      Object.entries(parsed).filter(([id, quantity]) => validProductIds.has(id) && Number.isInteger(quantity) && quantity > 0),
    );
    if (Object.keys(clean).length !== Object.keys(parsed).length) {
      window.localStorage.setItem(key, JSON.stringify(clean));
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
  window.localStorage.setItem(activeSelectionKey(), JSON.stringify(clean));
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

type QuickOrientation = [number, number, number];

function quickOrientations(product: CompanyProductItem): QuickOrientation[] {
  const padding = Math.max(0, product.cushioningM ?? 0);
  const l = product.length + padding * 2;
  const w = product.width + padding * 2;
  const h = product.height + padding * 2;
  const policy = product.orientationPolicy ?? (product.allowRotation === false ? 'upright' : 'base-rotation');
  const raw: QuickOrientation[] = policy === 'upright'
    ? [[l, w, h]]
    : policy === 'any'
      ? [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]]
      : [[l, w, h], [w, l, h]];
  const seen = new Set<string>();
  return raw.filter(([a, b, c]) => {
    const key = `${a.toFixed(6)}:${b.toFixed(6)}:${c.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function quickTileEfficiency(container: ContainerSpec, l: number, w: number, h: number) {
  const count = (a: number, b: number) => Math.floor((container.length + QUICK_EPS) / a) * Math.floor((container.width + QUICK_EPS) / b) * Math.floor((container.height + QUICK_EPS) / h);
  const bestCount = Math.max(count(l, w), count(w, l));
  const containerVolume = container.length * container.width * container.height;
  return containerVolume > 0 ? Math.min(1, bestCount * l * w * h / containerVolume) : 0;
}

function quickUnitsInBox(product: CompanyProductItem, box: BoxCatalogItem) {
  const layerLimit = product.maxInternalLayers ?? (product.fragile ? 1 : Number.POSITIVE_INFINITY);
  const perBoxLimit = product.maxUnitsPerBox ?? Number.POSITIVE_INFINITY;
  let best = 0;
  for (const [pl, pw, ph] of quickOrientations(product)) {
    const nx = Math.floor((box.innerLength + QUICK_EPS) / pl);
    const ny = Math.floor((box.innerWidth + QUICK_EPS) / pw);
    const nz = Math.min(layerLimit, Math.floor((box.innerHeight + QUICK_EPS) / ph));
    const byWeight = Math.floor((box.maxGrossWeightKg - box.tareWeightKg + QUICK_EPS) / product.weightKg);
    best = Math.max(best, Math.min(nx * ny * nz, byWeight, perBoxLimit));
  }
  return Math.max(0, Math.floor(best));
}

function quickAssignment(container: ContainerSpec, product: CompanyProductItem, box: BoxCatalogItem, source: 'catalog' | 'generated'): ProductPackagingAssignment | undefined {
  const unitsPerBox = quickUnitsInBox(product, box);
  if (unitsPerBox < 1) return undefined;
  const boxesNeeded = Math.ceil(Math.max(1, product.quantity) / unitsPerBox);
  const grossWeightKg = box.tareWeightKg + unitsPerBox * product.weightKg;
  const innerVolume = Math.max(QUICK_EPS, box.innerLength * box.innerWidth * box.innerHeight);
  const productFillRate = Math.min(1, unitsPerBox * product.length * product.width * product.height / innerVolume);
  const containerTileEfficiency = quickTileEfficiency(container, box.outerLength, box.outerWidth, box.outerHeight);
  const { geometryStack, maxStackLayers: declaredStack } = cartonStackLimits(container, box, grossWeightKg);
  const maxStackLayers = source === 'generated' ? 1 : declaredStack;
  const requiredTopLoadKg = Math.max(0, grossWeightKg * (geometryStack - 1));
  // 포장 단계에서는 빠른 기하/중량 평가만 한다. 실제 컨테이너 배치는 자동 적재 단계에서 검증한다.
  const score = productFillRate * 0.55 + containerTileEfficiency * 0.35 + Math.min(1, unitsPerBox / 24) * 0.10;
  return {
    productId: product.id,
    productName: product.name,
    boxId: box.id,
    boxName: box.name,
    source,
    unitsPerBox,
    boxesNeeded,
    outerLength: box.outerLength,
    outerWidth: box.outerWidth,
    outerHeight: box.outerHeight,
    innerLength: box.innerLength,
    innerWidth: box.innerWidth,
    innerHeight: box.innerHeight,
    grossWeightKg,
    productFillRate,
    containerTileEfficiency,
    simulatedLoadedBoxes: 0,
    maxStackLayers,
    recommendedStackLayers: geometryStack,
    maxTopLoadKg: source === 'generated' ? 0 : box.maxTopLoadKg,
    requiredTopLoadKg,
    strengthStatus: source === 'generated' ? 'design-target' : 'catalog',
    score,
    boxUnitCost: box.unitCost,
  };
}

function roundUpQuick(value: number, step: number) {
  return !Number.isFinite(step) || step <= 0 ? value : Math.ceil((value - QUICK_EPS) / step) * step;
}

function boxCatalogFingerprint(boxes: BoxCatalogItem[]) {
  const cached = boxCatalogFingerprintCache.get(boxes);
  if (cached) return cached;
  const fingerprint = boxes.map(box => [
    box.id,
    box.innerLength,
    box.innerWidth,
    box.innerHeight,
    box.outerLength,
    box.outerWidth,
    box.outerHeight,
    box.tareWeightKg,
    box.maxGrossWeightKg,
    box.maxStackLayers ?? '',
    box.maxTopLoadKg ?? '',
    box.unitCost ?? '',
  ].join(':')).join('|');
  boxCatalogFingerprintCache.set(boxes, fingerprint);
  return fingerprint;
}

function packagingCacheKey(
  container: ContainerSpec,
  product: CompanyProductItem,
  boxes: BoxCatalogItem[],
  planner?: EnterprisePackagingPlannerState | null,
) {
  return JSON.stringify({
    c: [container.length, container.width, container.height, container.maxPayloadKg],
    p: [
      product.id, product.length, product.width, product.height, product.weightKg, product.quantity,
      product.allowRotation, product.orientationPolicy, product.maxUnitsPerBox, product.cushioningM,
      product.maxInternalLayers, product.fragile,
    ],
    b: boxCatalogFingerprint(boxes),
    s: planner?.settings ?? null,
  });
}

function rememberPackagingCandidates(key: string, candidates: ProductPackagingAssignment[]) {
  if (packagingCandidateCache.size >= PACKAGING_CANDIDATE_CACHE_LIMIT) {
    const oldest = packagingCandidateCache.keys().next().value as string | undefined;
    if (oldest) packagingCandidateCache.delete(oldest);
  }
  packagingCandidateCache.set(key, candidates);
  return candidates;
}

function generatedQuickCandidates(
  container: ContainerSpec,
  product: CompanyProductItem,
  boxes: BoxCatalogItem[],
  state?: EnterprisePackagingPlannerState | null,
): ProductPackagingAssignment[] {
  const planner = state ?? readEnterprisePackagingPlannerState();
  const packaging = enterprisePackagingOptionsFromPlanner({
    container,
    products: [product],
    boxes,
    settings: planner?.settings,
  }).packaging ?? defaultProductPackagingOptions;
  if (!packaging.allowCustomBoxDesign) return [];

  const step = Math.max(0.001, packaging.generatedDimensionStepM ?? 0.005);
  const layerLimit = Math.min(6, product.maxInternalLayers ?? (product.fragile ? 1 : 6));
  const maxUnits = Math.min(
    product.maxUnitsPerBox ?? packaging.maxGeneratedUnitsPerBox,
    packaging.maxGeneratedUnitsPerBox,
  );
  const generated: ProductPackagingAssignment[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const [pl, pw, ph] of quickOrientations(product)) {
    for (let nx = 1; nx <= 4; nx += 1) for (let ny = 1; ny <= 4; ny += 1) for (let nz = 1; nz <= layerLimit; nz += 1) {
      const units = nx * ny * nz;
      if (units > maxUnits || units * product.weightKg + packaging.generatedBoxTareKg > packaging.maxGeneratedGrossWeightKg + QUICK_EPS) continue;
      const innerLength = roundUpQuick(pl * nx + packaging.clearanceM * 2, step);
      const innerWidth = roundUpQuick(pw * ny + packaging.clearanceM * 2, step);
      const innerHeight = roundUpQuick(ph * nz + packaging.clearanceM * 2, step);
      const outerLength = roundUpQuick(innerLength + packaging.wallThicknessM * 2, step);
      const outerWidth = roundUpQuick(innerWidth + packaging.wallThicknessM * 2, step);
      const outerHeight = roundUpQuick(innerHeight + packaging.wallThicknessM * 2, step);
      if (outerHeight > container.height + QUICK_EPS) continue;
      const floorFits = (outerLength <= container.length + QUICK_EPS && outerWidth <= container.width + QUICK_EPS)
        || (outerWidth <= container.length + QUICK_EPS && outerLength <= container.width + QUICK_EPS);
      if (!floorFits) continue;
      const dimensionKey = [innerLength, innerWidth, innerHeight, outerLength, outerWidth, outerHeight].map(value => value.toFixed(4)).join(':');
      if (seen.has(dimensionKey)) continue;
      seen.add(dimensionKey);
      index += 1;
      const box: BoxCatalogItem = {
        id: `AUTO-${product.id}-${index}`,
        name: `자동설계 ${Math.round(outerLength * 1000)}×${Math.round(outerWidth * 1000)}×${Math.round(outerHeight * 1000)}mm`,
        innerLength,
        innerWidth,
        innerHeight,
        outerLength,
        outerWidth,
        outerHeight,
        tareWeightKg: packaging.generatedBoxTareKg,
        maxGrossWeightKg: packaging.maxGeneratedGrossWeightKg,
        maxTopLoadKg: undefined,
        unitCost: packaging.generatedBoxUnitCost && packaging.generatedBoxUnitCost > 0 ? packaging.generatedBoxUnitCost : undefined,
      };
      const candidate = quickAssignment(container, product, box, 'generated');
      if (candidate) generated.push(candidate);
    }
  }

  return generated
    .sort((a, b) => b.score - a.score || b.unitsPerBox - a.unitsPerBox || a.boxesNeeded - b.boxesNeeded)
    .slice(0, 3);
}

/**
 * 가이드 제품 포장 화면용 후보 계산.
 * 예전에는 제품 × 보유박스마다 loadContainer()를 실행해 제품 수가 늘수록 화면 전환이 급격히 느려졌다.
 * 여기서는 포장 적합성(치수/중량/적층)만 즉시 계산하고 실제 차량 배치와 물리 검증은 자동 적재 단계에 맡긴다.
 */
export function packagingCandidates(
  container: ContainerSpec,
  product: CompanyProductItem,
  boxes: BoxCatalogItem[],
  state?: EnterprisePackagingPlannerState | null,
): ProductPackagingAssignment[] {
  if (!requiresBoxPackaging(product)) return [];
  const planner = state ?? readEnterprisePackagingPlannerState();
  const cacheKey = packagingCacheKey(container, product, boxes, planner);
  const cached = packagingCandidateCache.get(cacheKey);
  if (cached) return cached;

  // 보유 박스를 항상 먼저 사용한다. 유효한 보유 박스가 하나라도 있으면 자동설계 박스를 만들지 않는다.
  const catalogCandidates = boxes
    .map(box => quickAssignment(container, product, box, 'catalog'))
    .filter((candidate): candidate is ProductPackagingAssignment => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || b.productFillRate - a.productFillRate)
    .slice(0, 3);

  if (catalogCandidates.length > 0) return rememberPackagingCandidates(cacheKey, catalogCandidates);
  return rememberPackagingCandidates(cacheKey, generatedQuickCandidates(container, product, boxes, planner));
}

/**
 * 제품 검색 화면 전용 빠른 미리보기. loadContainer 시뮬레이션을 전혀 실행하지 않는다.
 * 실제 차량 배치/물리 검증은 자동 적재 단계에서 수행한다.
 */
export function previewPackagingCandidate(
  container: ContainerSpec,
  product: CompanyProductItem,
  boxes: BoxCatalogItem[],
  state?: EnterprisePackagingPlannerState | null,
): ProductPackagingAssignment | undefined {
  return packagingCandidates(container, product, boxes, state)[0];
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
        boxId: assignment.boxId,
        boxName: assignment.boxName,
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
