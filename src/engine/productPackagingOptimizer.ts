import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const EPS = 1e-9;
const volume = (l: number, w: number, h: number) => l * w * h;

export type ProductItem = {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  quantity: number;
  allowRotation?: boolean;
  maxUnitsPerBox?: number;
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
};

export type ProductPackagingOptions = {
  allowCustomBoxDesign: boolean;
  maxGeneratedGrossWeightKg: number;
  generatedBoxTareKg: number;
  clearanceM: number;
  wallThicknessM: number;
  maxGeneratedUnitsPerBox: number;
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
  maxStackLayers: number;
  maxTopLoadKg?: number;
  requiredTopLoadKg: number;
  score: number;
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
};

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function productError(product: ProductItem): string | null {
  if (!product.id.trim()) return '제품 코드가 비어 있습니다.';
  if (!product.name.trim()) return '제품명이 비어 있습니다.';
  if (![product.length, product.width, product.height, product.weightKg].every(finitePositive)) return '제품 치수와 중량은 0보다 커야 합니다.';
  if (!Number.isInteger(product.quantity) || product.quantity < 1) return '제품 수량은 1 이상의 정수여야 합니다.';
  if (product.maxUnitsPerBox != null && (!Number.isInteger(product.maxUnitsPerBox) || product.maxUnitsPerBox < 1)) return '박스당 최대 수량은 1 이상의 정수여야 합니다.';
  return null;
}

function boxError(box: BoxCatalogItem): string | null {
  if (!box.id.trim() || !box.name.trim()) return '박스 코드/이름이 비어 있습니다.';
  if (![box.innerLength, box.innerWidth, box.innerHeight, box.outerLength, box.outerWidth, box.outerHeight].every(finitePositive)) return '박스 내외부 치수는 0보다 커야 합니다.';
  if (box.outerLength + EPS < box.innerLength || box.outerWidth + EPS < box.innerWidth || box.outerHeight + EPS < box.innerHeight) return '박스 외부 치수는 내부 치수보다 작을 수 없습니다.';
  if (!Number.isFinite(box.tareWeightKg) || box.tareWeightKg < 0 || !finitePositive(box.maxGrossWeightKg)) return '박스 자중/최대 총중량을 확인하세요.';
  if (box.maxTopLoadKg != null && (!Number.isFinite(box.maxTopLoadKg) || box.maxTopLoadKg < 0)) return '상부 허용중량은 0 이상이어야 합니다.';
  return null;
}

function orientations(product: ProductItem): Array<[number, number, number]> {
  const { length: l, width: w, height: h } = product;
  const source: Array<[number, number, number]> = product.allowRotation === false
    ? [[l, w, h]]
    : [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]];
  const seen = new Set<string>();
  return source.filter(([a, b, c]) => {
    const key = `${a.toFixed(6)}:${b.toFixed(6)}:${c.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tileEfficiency(container: ContainerSpec, l: number, w: number, h: number) {
  const count = (a: number, b: number, c: number) => Math.floor(container.length / a) * Math.floor(container.width / b) * Math.floor(container.height / c);
  const bestCount = Math.max(count(l, w, h), count(w, l, h));
  const containerVolume = volume(container.length, container.width, container.height);
  return containerVolume > 0 ? Math.min(1, bestCount * volume(l, w, h) / containerVolume) : 0;
}

function assignmentFromBox(container: ContainerSpec, product: ProductItem, box: BoxCatalogItem, source: 'catalog' | 'generated'): ProductPackagingAssignment | null {
  let bestUnits = 0;
  for (const [pl, pw, ph] of orientations(product)) {
    const nx = Math.floor((box.innerLength + EPS) / pl);
    const ny = Math.floor((box.innerWidth + EPS) / pw);
    const nz = Math.floor((box.innerHeight + EPS) / ph);
    const geometric = nx * ny * nz;
    const byWeight = Math.floor((box.maxGrossWeightKg - box.tareWeightKg + EPS) / product.weightKg);
    const perBoxLimit = product.maxUnitsPerBox ?? Number.POSITIVE_INFINITY;
    bestUnits = Math.max(bestUnits, Math.min(geometric, byWeight, perBoxLimit));
  }
  if (bestUnits < 1) return null;

  const unitsPerBox = Math.max(1, Math.floor(bestUnits));
  const boxesNeeded = Math.ceil(product.quantity / unitsPerBox);
  const grossWeightKg = box.tareWeightKg + unitsPerBox * product.weightKg;
  const boxVolume = volume(box.outerLength, box.outerWidth, box.outerHeight);
  const productFillRate = Math.min(1, unitsPerBox * volume(product.length, product.width, product.height) / Math.max(EPS, volume(box.innerLength, box.innerWidth, box.innerHeight)));
  const containerTileEfficiency = tileEfficiency(container, box.outerLength, box.outerWidth, box.outerHeight);
  const geometryStack = Math.max(1, Math.min(7, Math.floor((container.height + EPS) / box.outerHeight)));
  const topLoadStack = box.maxTopLoadKg == null ? geometryStack : Math.max(1, Math.min(geometryStack, 1 + Math.floor((box.maxTopLoadKg + EPS) / grossWeightKg)));
  const requiredTopLoadKg = Math.max(0, grossWeightKg * (geometryStack - 1));
  const cargo: CargoItem = {
    id: `PKG-${product.id}`,
    name: `${product.name} · ${box.name}`,
    length: box.outerLength,
    width: box.outerWidth,
    height: box.outerHeight,
    weightKg: grossWeightKg,
    quantity: boxesNeeded,
    maxStackLayers: topLoadStack,
    maxTopLoadKg: box.maxTopLoadKg,
    allowRotation: true,
  };
  const simulation = loadContainer(container, [cargo], { strategy: 'capacity', publish: false });
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
    maxStackLayers: topLoadStack,
    maxTopLoadKg: box.maxTopLoadKg,
    requiredTopLoadKg,
    score,
  };
}

function generatedBoxes(container: ContainerSpec, product: ProductItem, options: ProductPackagingOptions): BoxCatalogItem[] {
  if (!options.allowCustomBoxDesign) return [];
  const result: BoxCatalogItem[] = [];
  const seen = new Set<string>();
  const maxUnits = Math.min(product.maxUnitsPerBox ?? options.maxGeneratedUnitsPerBox, options.maxGeneratedUnitsPerBox);
  let index = 0;

  for (const [pl, pw, ph] of orientations(product)) {
    for (let nx = 1; nx <= 4; nx += 1) for (let ny = 1; ny <= 4; ny += 1) for (let nz = 1; nz <= 6; nz += 1) {
      const units = nx * ny * nz;
      if (units > maxUnits || units * product.weightKg + options.generatedBoxTareKg > options.maxGeneratedGrossWeightKg + EPS) continue;
      const innerLength = pl * nx + options.clearanceM * 2;
      const innerWidth = pw * ny + options.clearanceM * 2;
      const innerHeight = ph * nz + options.clearanceM * 2;
      const outerLength = innerLength + options.wallThicknessM * 2;
      const outerWidth = innerWidth + options.wallThicknessM * 2;
      const outerHeight = innerHeight + options.wallThicknessM * 2;
      if (outerLength > container.length + EPS || outerWidth > container.width + EPS || outerHeight > container.height + EPS) continue;
      const key = [outerLength, outerWidth, outerHeight].map(v => v.toFixed(3)).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      index += 1;
      const geometryStack = Math.max(1, Math.min(7, Math.floor((container.height + EPS) / outerHeight)));
      const gross = options.generatedBoxTareKg + units * product.weightKg;
      result.push({
        id: `AUTO-${product.id}-${index}`,
        name: `자동설계 ${Math.round(outerLength * 1000)}×${Math.round(outerWidth * 1000)}×${Math.round(outerHeight * 1000)}mm`,
        innerLength, innerWidth, innerHeight,
        outerLength, outerWidth, outerHeight,
        tareWeightKg: options.generatedBoxTareKg,
        maxGrossWeightKg: options.maxGeneratedGrossWeightKg,
        maxTopLoadKg: Math.max(0, gross * (geometryStack - 1)),
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
    const best = candidates.sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || b.productFillRate - a.productFillRate)[0];
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
    generatedBoxCount: assignments.filter(item => item.source === 'generated').length,
  };
}
