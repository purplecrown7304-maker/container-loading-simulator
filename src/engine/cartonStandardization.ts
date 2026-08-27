import { defaultProductPackagingOptions, optimizeProductPackaging, type BoxCatalogItem, type ProductItem, type ProductPackagingAssignment, type ProductPackagingOptions, type ProductPackagingPlan } from './productPackagingOptimizer';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const EPS = 1e-9;
const volume = (l: number, w: number, h: number) => l * w * h;

export type CartonStandardizationOptions = {
  targetBoxSkuCount: number;
  maxAssignmentScoreLoss: number;
  minProductFillRate: number;
  maxCandidates: number;
  baseCostPerBox: number;
  volumeCostPerM3: number;
  skuSetupCost: number;
  packagingOptions?: ProductPackagingOptions;
};

export type StandardizedProductAssignment = ProductPackagingAssignment & {
  baselineBoxId: string;
  baselineScore: number;
  scoreLoss: number;
  standardized: boolean;
};

export type CartonStandardizationPlan = {
  baseline: ProductPackagingPlan;
  assignments: StandardizedProductAssignment[];
  cargo: CargoItem[];
  selectedBoxes: BoxCatalogItem[];
  baselineBoxSkuCount: number;
  standardizedBoxSkuCount: number;
  targetBoxSkuCount: number;
  productsStandardized: number;
  rejected: Array<{ productId: string; reason: string }>;
  estimatedPackagingCost: number;
  estimatedSkuSetupCost: number;
  estimatedTotalCost: number;
  estimatedContainersNeeded: number;
  estimatedContainerUtilization: number;
};

export const defaultCartonStandardizationOptions: CartonStandardizationOptions = {
  targetBoxSkuCount: 4,
  maxAssignmentScoreLoss: 0.12,
  minProductFillRate: 0.45,
  maxCandidates: 48,
  baseCostPerBox: 0.35,
  volumeCostPerM3: 2.5,
  skuSetupCost: 30,
};

function assignmentToBox(item: ProductPackagingAssignment): BoxCatalogItem {
  return {
    id: item.boxId,
    name: item.boxName,
    innerLength: item.innerLength,
    innerWidth: item.innerWidth,
    innerHeight: item.innerHeight,
    outerLength: item.outerLength,
    outerWidth: item.outerWidth,
    outerHeight: item.outerHeight,
    tareWeightKg: Math.max(0, item.grossWeightKg - item.unitsPerBox * 0),
    maxGrossWeightKg: Math.max(item.grossWeightKg, 1),
    maxTopLoadKg: item.maxTopLoadKg,
  };
}

function deriveCandidateBox(item: ProductPackagingAssignment, product: ProductItem): BoxCatalogItem {
  const tare = Math.max(0, item.grossWeightKg - item.unitsPerBox * product.weightKg);
  return {
    id: item.boxId,
    name: item.boxName,
    innerLength: item.innerLength,
    innerWidth: item.innerWidth,
    innerHeight: item.innerHeight,
    outerLength: item.outerLength,
    outerWidth: item.outerWidth,
    outerHeight: item.outerHeight,
    tareWeightKg: tare,
    maxGrossWeightKg: Math.max(item.grossWeightKg, tare + product.weightKg),
    maxTopLoadKg: item.maxTopLoadKg,
  };
}

function normalizedBoxKey(box: BoxCatalogItem) {
  return [box.outerLength, box.outerWidth, box.outerHeight, box.innerLength, box.innerWidth, box.innerHeight]
    .map(value => value.toFixed(4)).join(':');
}

function candidateBoxes(products: ProductItem[], catalog: BoxCatalogItem[], baseline: ProductPackagingPlan, maxCandidates: number) {
  const map = new Map<string, BoxCatalogItem>();
  for (const box of catalog) map.set(normalizedBoxKey(box), box);
  for (const assignment of baseline.assignments) {
    const product = products.find(item => item.id === assignment.productId);
    if (!product) continue;
    const box = deriveCandidateBox(assignment, product);
    if (!map.has(normalizedBoxKey(box))) map.set(normalizedBoxKey(box), box);
  }
  return [...map.values()]
    .sort((a, b) => volume(a.outerLength, a.outerWidth, a.outerHeight) - volume(b.outerLength, b.outerWidth, b.outerHeight) || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, maxCandidates));
}

function evaluateProductBox(container: ContainerSpec, product: ProductItem, box: BoxCatalogItem, packagingOptions: ProductPackagingOptions) {
  const plan = optimizeProductPackaging(container, [product], [box], { ...packagingOptions, allowCustomBoxDesign: false });
  return plan.assignments[0];
}

function estimateContainerRuns(container: ContainerSpec, cargo: CargoItem[]) {
  let pending = cargo.filter(item => item.quantity > 0).map(item => ({ ...item }));
  const totalVolume = pending.reduce((sum, item) => sum + item.length * item.width * item.height * item.quantity, 0);
  const totalContainerVolume = container.length * container.width * container.height;
  let runs = 0;
  let loadedVolume = 0;
  const maxRuns = 100;

  while (pending.length && runs < maxRuns) {
    const result = loadContainer(container, pending, { strategy: 'capacity', publish: false });
    if (!result.placements.length) break;
    runs += 1;
    loadedVolume += result.usedVolumeM3;
    const remaining = new Map(result.remaining.map(item => [item.cargoId, item.quantity]));
    pending = pending
      .map(item => ({ ...item, quantity: remaining.get(item.id) ?? 0 }))
      .filter(item => item.quantity > 0);
  }

  if (pending.length) return { runs: Number.POSITIVE_INFINITY, utilization: 0 };
  const utilization = runs > 0 && totalContainerVolume > 0 ? Math.min(1, totalVolume / (runs * totalContainerVolume)) : 0;
  return { runs, utilization: Math.max(0, Math.min(1, utilization)) };
}

export function standardizeProductCartons(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  options: CartonStandardizationOptions = defaultCartonStandardizationOptions,
): CartonStandardizationPlan {
  const target = Math.max(1, Math.floor(options.targetBoxSkuCount));
  const packagingOptions = options.packagingOptions ?? defaultProductPackagingOptions;
  const baseline = optimizeProductPackaging(container, products, catalog, packagingOptions);
  const baselineByProduct = new Map(baseline.assignments.map(item => [item.productId, item]));
  const productById = new Map(products.map(item => [item.id, item]));
  const candidates = candidateBoxes(products, catalog, baseline, options.maxCandidates);

  const evaluations = new Map<string, ProductPackagingAssignment>();
  for (const product of products) {
    const base = baselineByProduct.get(product.id);
    if (!base) continue;
    for (const box of candidates) {
      const assignment = evaluateProductBox(container, product, box, packagingOptions);
      if (!assignment) continue;
      const loss = base.score - assignment.score;
      if (loss > options.maxAssignmentScoreLoss + EPS) continue;
      if (assignment.productFillRate + EPS < options.minProductFillRate) continue;
      evaluations.set(`${product.id}::${box.id}`, assignment);
    }
  }

  const selected: BoxCatalogItem[] = [];
  const uncovered = new Set(baseline.assignments.map(item => item.productId));
  while (selected.length < target && uncovered.size) {
    let bestBox: BoxCatalogItem | undefined;
    let bestScore = -Infinity;
    for (const box of candidates) {
      if (selected.some(item => item.id === box.id)) continue;
      let score = 0;
      for (const productId of uncovered) {
        const product = productById.get(productId);
        const assignment = evaluations.get(`${productId}::${box.id}`);
        if (!product || !assignment) continue;
        score += product.quantity * (0.6 + assignment.productFillRate * 0.25 + assignment.containerTileEfficiency * 0.15);
      }
      if (score > bestScore + EPS) {
        bestScore = score;
        bestBox = box;
      }
    }
    if (!bestBox || bestScore <= 0) break;
    selected.push(bestBox);
    for (const productId of [...uncovered]) {
      if (evaluations.has(`${productId}::${bestBox.id}`)) uncovered.delete(productId);
    }
  }

  // Safety-first fallback: if the requested SKU cap cannot cover a product without
  // unacceptable fit/packing loss, keep that product's individually optimized box.
  for (const productId of uncovered) {
    const baselineAssignment = baselineByProduct.get(productId);
    const product = productById.get(productId);
    if (!baselineAssignment || !product) continue;
    const fallback = deriveCandidateBox(baselineAssignment, product);
    if (!selected.some(item => normalizedBoxKey(item) === normalizedBoxKey(fallback))) selected.push(fallback);
  }

  const assignments: StandardizedProductAssignment[] = [];
  const rejected = [...baseline.rejected];
  for (const product of products) {
    const base = baselineByProduct.get(product.id);
    if (!base) continue;
    const matches = selected
      .map(box => evaluateProductBox(container, product, box, packagingOptions))
      .filter((item): item is ProductPackagingAssignment => Boolean(item))
      .filter(item => item.productFillRate + EPS >= options.minProductFillRate)
      .sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || a.boxId.localeCompare(b.boxId));
    const best = matches[0] ?? base;
    const scoreLoss = Math.max(0, base.score - best.score);
    if (best !== base && scoreLoss > options.maxAssignmentScoreLoss + EPS) {
      assignments.push({ ...base, baselineBoxId: base.boxId, baselineScore: base.score, scoreLoss: 0, standardized: false });
      continue;
    }
    assignments.push({
      ...best,
      baselineBoxId: base.boxId,
      baselineScore: base.score,
      scoreLoss,
      standardized: best.boxId !== base.boxId,
    });
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

  const distinctBoxes = new Map<string, ProductPackagingAssignment>();
  for (const assignment of assignments) distinctBoxes.set(normalizedBoxKey(deriveCandidateBox(assignment, productById.get(assignment.productId)!)), assignment);
  const baselineDistinct = new Set(baseline.assignments.map(item => [item.outerLength, item.outerWidth, item.outerHeight].map(v => v.toFixed(4)).join(':'))).size;
  const estimatedPackagingCost = assignments.reduce((sum, item) => {
    const unit = options.baseCostPerBox + volume(item.outerLength, item.outerWidth, item.outerHeight) * options.volumeCostPerM3;
    return sum + unit * item.boxesNeeded;
  }, 0);
  const estimatedSkuSetupCost = distinctBoxes.size * options.skuSetupCost;
  const containerRuns = estimateContainerRuns(container, cargo);

  return {
    baseline,
    assignments,
    cargo,
    selectedBoxes: selected,
    baselineBoxSkuCount: baselineDistinct,
    standardizedBoxSkuCount: distinctBoxes.size,
    targetBoxSkuCount: target,
    productsStandardized: assignments.filter(item => item.standardized).length,
    rejected,
    estimatedPackagingCost,
    estimatedSkuSetupCost,
    estimatedTotalCost: estimatedPackagingCost + estimatedSkuSetupCost,
    estimatedContainersNeeded: containerRuns.runs,
    estimatedContainerUtilization: containerRuns.utilization,
  };
}
