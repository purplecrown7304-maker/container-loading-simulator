import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const EPS = 1e-9;
const volume = (l: number, w: number, h: number) => l * w * h;
const roundUp = (value: number, step: number) => !Number.isFinite(step) || step <= 0 ? value : Math.ceil((value - EPS) / step) * step;

export type ProductOrientationPolicy = 'upright' | 'base-rotation' | 'any';
export type PackagingStrengthStatus = 'catalog' | 'design-target';

export type ProductItem = {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  quantity: number;
  /** 하위 호환: false면 upright, 생략/true면 base-rotation으로 해석한다. */
  allowRotation?: boolean;
  /** 제품 자체의 포장 방향 정책. */
  orientationPolicy?: ProductOrientationPolicy;
  maxUnitsPerBox?: number;
  /** 제품 한 개 주위에 확보할 완충/유격(m). 각 축 양쪽에 적용한다. */
  cushioningM?: number;
  /** 박스 내부에서 제품을 몇 단까지 겹칠 수 있는지. */
  maxInternalLayers?: number;
  /** 파손주의 제품은 maxInternalLayers 미입력 시 내부 1단으로 제한한다. */
  fragile?: boolean;
  /** 출하 잔량 혼합박스에 다른 SKU와 같이 넣어도 되는지. */
  allowMixedCarton?: boolean;
};

export type BoxCatalogItem = {
  id: string;
  name: string;
  innerLength: number;
  innerWidth: number;
  innerHeight: number;
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
  tareWeightKg: number;
  maxGrossWeightKg: number;
  maxTopLoadKg?: number;
  /** 박스 1EA 구매/제작 단가. 통화 단위는 기업 설정에서 일관되게 사용한다. */
  unitCost?: number;
};

export type ProductPackagingOptions = {
  allowCustomBoxDesign: boolean;
  maxGeneratedGrossWeightKg: number;
  generatedBoxTareKg: number;
  clearanceM: number;
  wallThicknessM: number;
  maxGeneratedUnitsPerBox: number;
  /** 자동설계 박스 외경/내경을 올림하는 제조 치수 단위. 기본 5mm. */
  generatedDimensionStepM?: number;
  /** 자동설계 박스 예상 단가. 0이면 비용점수에 반영하지 않는다. */
  generatedBoxUnitCost?: number;
};

export type ProductPackagingAssignment = {
  productId: string;
  productName: string;
  boxId: string;
  boxName: string;
  source: 'catalog' | 'generated';
  unitsPerBox: number;
  boxesNeeded: number;
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
  innerLength: number;
  innerWidth: number;
  innerHeight: number;
  grossWeightKg: number;
  productFillRate: number;
  containerTileEfficiency: number;
  simulatedLoadedBoxes: number;
  /** 실제 적재에 즉시 적용 가능한 적층단. 자동설계 미검증 박스는 1단이다. */
  maxStackLayers: number;
  /** 치수상 가능한 목표 적층단. 제조 강도 검증 전에는 작업지시용 값이 아니다. */
  recommendedStackLayers: number;
  maxTopLoadKg?: number;
  requiredTopLoadKg: number;
  strengthStatus: PackagingStrengthStatus;
  score: number;
  boxUnitCost?: number;
};

export type ProductPackagingPlan = {
  assignments: ProductPackagingAssignment[];
  cargo: CargoItem[];
  rejected: Array<{ productId: string; reason: string }>;
  totalBoxes: number;
  totalPackedProducts: number;
  generatedBoxCount: number;
};

export const defaultProductPackagingOptions: ProductPackagingOptions = {
  allowCustomBoxDesign: true,
  maxGeneratedGrossWeightKg: 22,
  generatedBoxTareKg: 0.6,
  clearanceM: 0.01,
  wallThicknessM: 0.004,
  maxGeneratedUnitsPerBox: 24,
  generatedDimensionStepM: 0.005,
  generatedBoxUnitCost: 0,
};

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function orientationPolicy(product: ProductItem): ProductOrientationPolicy {
  if (product.orientationPolicy === 'upright' || product.orientationPolicy === 'base-rotation' || product.orientationPolicy === 'any') return product.orientationPolicy;
  return product.allowRotation === false ? 'upright' : 'base-rotation';
}

function productError(product: ProductItem): string | null {
  if (!product.id.trim()) return '제품 코드가 비어 있습니다.';
  if (!product.name.trim()) return '제품명이 비어 있습니다.';
  if (![product.length, product.width, product.height, product.weightKg].every(finitePositive)) return '제품 치수와 중량은 0보다 커야 합니다.';
  if (!Number.isInteger(product.quantity) || product.quantity < 1) return '제품 수량은 1 이상의 정수여야 합니다.';
  if (product.maxUnitsPerBox != null && (!Number.isInteger(product.maxUnitsPerBox) || product.maxUnitsPerBox < 1)) return '박스당 최대 수량은 1 이상의 정수여야 합니다.';
  if (product.cushioningM != null && (!Number.isFinite(product.cushioningM) || product.cushioningM < 0)) return '완충 여유는 0 이상의 값이어야 합니다.';
  if (product.maxInternalLayers != null && (!Number.isInteger(product.maxInternalLayers) || product.maxInternalLayers < 1)) return '박스 내부 최대 적층은 1 이상의 정수여야 합니다.';
  if (product.orientationPolicy != null && !['upright', 'base-rotation', 'any'].includes(product.orientationPolicy)) return '제품 회전 정책을 확인하세요.';
  return null;
}

function boxError(box: BoxCatalogItem): string | null {
  if (!box.id.trim() || !box.name.trim()) return '박스 코드/이름이 비어 있습니다.';
  if (![box.innerLength, box.innerWidth, box.innerHeight, box.outerLength, box.outerWidth, box.outerHeight].every(finitePositive)) return '박스 내외부 치수는 0보다 커야 합니다.';
  if (box.outerLength + EPS < box.innerLength || box.outerWidth + EPS < box.innerWidth || box.outerHeight + EPS < box.innerHeight) return '박스 외부 치수는 내부 치수보다 작을 수 없습니다.';
  if (!Number.isFinite(box.tareWeightKg) || box.tareWeightKg < 0 || !finitePositive(box.maxGrossWeightKg)) return '박스 자중/최대 총중량을 확인하세요.';
  if (box.maxTopLoadKg != null && (!Number.isFinite(box.maxTopLoadKg) || box.maxTopLoadKg < 0)) return '상부 허용중량은 0 이상이어야 합니다.';
  if (box.unitCost != null && (!Number.isFinite(box.unitCost) || box.unitCost < 0)) return '박스 단가는 0 이상이어야 합니다.';
  return null;
}

type UnitOrientation = [number, number, number];

function effectiveDimensions(product: ProductItem): [number, number, number] {
  const padding = Math.max(0, product.cushioningM ?? 0);
  return [product.length + padding * 2, product.width + padding * 2, product.height + padding * 2];
}

function orientations(product: ProductItem): UnitOrientation[] {
  const [l, w, h] = effectiveDimensions(product);
  const policy = orientationPolicy(product);
  const source: UnitOrientation[] = policy === 'upright'
    ? [[l, w, h]]
    : policy === 'base-rotation'
      ? [[l, w, h], [w, l, h]]
      : [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]];
  const seen = new Set<string>();
  return source.filter(([a, b, c]) => {
    const key = `${a.toFixed(6)}:${b.toFixed(6)}:${c.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function maxInternalLayers(product: ProductItem) {
  if (product.maxInternalLayers != null) return product.maxInternalLayers;
  return product.fragile ? 1 : Number.POSITIVE_INFINITY;
}

function tileEfficiency(container: ContainerSpec, l: number, w: number, h: number) {
  const count = (a: number, b: number, c: number) => Math.floor(container.length / a) * Math.floor(container.width / b) * Math.floor(container.height / c);
  const bestCount = Math.max(count(l, w, h), count(w, l, h));
  const containerVolume = volume(container.length, container.width, container.height);
  return containerVolume > 0 ? Math.min(1, bestCount * volume(l, w, h) / containerVolume) : 0;
}

function assignmentFromBox(container: ContainerSpec, product: ProductItem, box: BoxCatalogItem, source: 'catalog' | 'generated'): ProductPackagingAssignment | null {
  let bestUnits = 0;
  const layerLimit = maxInternalLayers(product);
  for (const [pl, pw, ph] of orientations(product)) {
    const nx = Math.floor((box.innerLength + EPS) / pl);
    const ny = Math.floor((box.innerWidth + EPS) / pw);
    const nz = Math.min(layerLimit, Math.floor((box.innerHeight + EPS) / ph));
    const geometric = nx * ny * nz;
    const byWeight = Math.floor((box.maxGrossWeightKg - box.tareWeightKg + EPS) / product.weightKg);
    const perBoxLimit = product.maxUnitsPerBox ?? Number.POSITIVE_INFINITY;
    bestUnits = Math.max(bestUnits, Math.min(geometric, byWeight, perBoxLimit));
  }
  if (bestUnits < 1) return null;

  const unitsPerBox = Math.max(1, Math.floor(bestUnits));
  const boxesNeeded = Math.ceil(product.quantity / unitsPerBox);
  const grossWeightKg = box.tareWeightKg + unitsPerBox * product.weightKg;
  const productFillRate = Math.min(1, unitsPerBox * volume(product.length, product.width, product.height) / Math.max(EPS, volume(box.innerLength, box.innerWidth, box.innerHeight)));
  const containerTileEfficiency = tileEfficiency(container, box.outerLength, box.outerWidth, box.outerHeight);
  const geometryStack = Math.max(1, Math.min(7, Math.floor((container.height + EPS) / box.outerHeight)));
  const declaredStack = box.maxTopLoadKg == null ? geometryStack : Math.max(1, Math.min(geometryStack, 1 + Math.floor((box.maxTopLoadKg + EPS) / grossWeightKg)));
  const requiredTopLoadKg = Math.max(0, grossWeightKg * (geometryStack - 1));
  const operationalStack = source === 'generated' ? 1 : declaredStack;
  const operationalTopLoad = source === 'generated' ? 0 : box.maxTopLoadKg;

  // 자동설계 규격의 강도는 아직 검증되지 않았으므로 후보 비교만 목표 강도를 가정해 수행한다.
  // 실제 메인 적재로 넘기는 assignment는 1단/0kg로 fail-closed 된다.
  const simulationCargo: CargoItem = {
    id: `PKG-${product.id}`,
    name: `${product.name} · ${box.name}`,
    length: box.outerLength,
    width: box.outerWidth,
    height: box.outerHeight,
    weightKg: grossWeightKg,
    quantity: boxesNeeded,
    maxStackLayers: source === 'generated' ? geometryStack : operationalStack,
    maxTopLoadKg: source === 'generated' ? requiredTopLoadKg : operationalTopLoad,
    allowRotation: true,
  };
  const simulation = loadContainer(container, [simulationCargo], { strategy: 'capacity', publish: false });
  const simulatedLoadedBoxes = simulation.placements.length;
  const loadedRatio = boxesNeeded > 0 ? simulatedLoadedBoxes / boxesNeeded : 0;
  const score = loadedRatio * 0.55 + containerTileEfficiency * 0.25 + productFillRate * 0.20 - Math.max(0, boxesNeeded - simulatedLoadedBoxes) * 0.001;

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
    simulatedLoadedBoxes,
    maxStackLayers: operationalStack,
    recommendedStackLayers: geometryStack,
    maxTopLoadKg: operationalTopLoad,
    requiredTopLoadKg,
    strengthStatus: source === 'generated' ? 'design-target' : 'catalog',
    score,
    boxUnitCost: box.unitCost,
  };
}

function generatedBoxes(container: ContainerSpec, product: ProductItem, options: ProductPackagingOptions): BoxCatalogItem[] {
  if (!options.allowCustomBoxDesign) return [];
  const result: BoxCatalogItem[] = [];
  const seen = new Set<string>();
  const maxUnits = Math.min(product.maxUnitsPerBox ?? options.maxGeneratedUnitsPerBox, options.maxGeneratedUnitsPerBox);
  let index = 0;
  const layerLimit = maxInternalLayers(product);
  const dimensionStep = Number.isFinite(options.generatedDimensionStepM) && (options.generatedDimensionStepM ?? 0) > 0
    ? options.generatedDimensionStepM as number
    : 0.005;

  for (const [pl, pw, ph] of orientations(product)) {
    for (let nx = 1; nx <= 4; nx += 1) for (let ny = 1; ny <= 4; ny += 1) for (let nz = 1; nz <= Math.min(6, layerLimit); nz += 1) {
      const units = nx * ny * nz;
      if (units > maxUnits || units * product.weightKg + options.generatedBoxTareKg > options.maxGeneratedGrossWeightKg + EPS) continue;
      const requiredInnerLength = pl * nx + options.clearanceM * 2;
      const requiredInnerWidth = pw * ny + options.clearanceM * 2;
      const requiredInnerHeight = ph * nz + options.clearanceM * 2;
      // 제조 단위로 항상 바깥쪽 올림한다. 제품 수용공간을 줄이는 반올림은 금지한다.
      const innerLength = roundUp(requiredInnerLength, dimensionStep);
      const innerWidth = roundUp(requiredInnerWidth, dimensionStep);
      const innerHeight = roundUp(requiredInnerHeight, dimensionStep);
      const outerLength = roundUp(innerLength + options.wallThicknessM * 2, dimensionStep);
      const outerWidth = roundUp(innerWidth + options.wallThicknessM * 2, dimensionStep);
      const outerHeight = roundUp(innerHeight + options.wallThicknessM * 2, dimensionStep);
      if (outerLength > container.length + EPS || outerWidth > container.width + EPS || outerHeight > container.height + EPS) continue;
      const key = [innerLength, innerWidth, innerHeight, outerLength, outerWidth, outerHeight].map(v => v.toFixed(4)).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      index += 1;
      result.push({
        id: `AUTO-${product.id}-${index}`,
        name: `자동설계 ${Math.round(outerLength * 1000)}×${Math.round(outerWidth * 1000)}×${Math.round(outerHeight * 1000)}mm`,
        innerLength, innerWidth, innerHeight,
        outerLength, outerWidth, outerHeight,
        tareWeightKg: options.generatedBoxTareKg,
        maxGrossWeightKg: options.maxGeneratedGrossWeightKg,
        // 자동설계 단계에서는 실제 압축강도가 검증되지 않았다.
        maxTopLoadKg: undefined,
        unitCost: options.generatedBoxUnitCost && options.generatedBoxUnitCost > 0 ? options.generatedBoxUnitCost : undefined,
      });
    }
  }

  return result
    .sort((a, b) => tileEfficiency(container, b.outerLength, b.outerWidth, b.outerHeight) - tileEfficiency(container, a.outerLength, a.outerWidth, a.outerHeight))
    .slice(0, 48);
}

export function optimizeProductPackaging(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  options: ProductPackagingOptions = defaultProductPackagingOptions,
): ProductPackagingPlan {
  const assignments: ProductPackagingAssignment[] = [];
  const rejected: Array<{ productId: string; reason: string }> = [];
  const validCatalog = catalog.filter(box => !boxError(box));

  for (const product of products) {
    const error = productError(product);
    if (error) {
      rejected.push({ productId: product.id || '(미입력)', reason: error });
      continue;
    }
    const candidates = [
      ...validCatalog.map(box => assignmentFromBox(container, product, box, 'catalog')).filter((item): item is ProductPackagingAssignment => Boolean(item)),
      ...generatedBoxes(container, product, options).map(box => assignmentFromBox(container, product, box, 'generated')).filter((item): item is ProductPackagingAssignment => Boolean(item)),
    ];
    const best = candidates.sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || b.productFillRate - a.productFillRate || a.boxId.localeCompare(b.boxId))[0];
    if (!best) {
      rejected.push({ productId: product.id, reason: '등록 박스와 자동설계 후보 중 제품을 안전하게 담을 수 있는 규격이 없습니다.' });
      continue;
    }
    assignments.push(best);
  }

  const cargo = assignments.map(item => ({
    id: `PKG-${item.productId}`,
    name: `${item.productName} · ${item.boxName}`,
    length: item.outerLength,
    width: item.outerWidth,
    height: item.outerHeight,
    weightKg: item.grossWeightKg,
    quantity: item.boxesNeeded,
    maxStackLayers: item.maxStackLayers,
    maxTopLoadKg: item.maxTopLoadKg,
    allowRotation: true,
  } satisfies CargoItem));

  return {
    assignments,
    cargo,
    rejected,
    totalBoxes: assignments.reduce((sum, item) => sum + item.boxesNeeded, 0),
    totalPackedProducts: assignments.reduce((sum, item) => sum + (products.find(product => product.id === item.productId)?.quantity ?? 0), 0),
    generatedBoxCount: new Set(assignments.filter(item => item.source === 'generated').map(item => item.boxId)).size,
  };
}
