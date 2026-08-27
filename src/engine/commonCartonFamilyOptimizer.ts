import {
  defaultProductPackagingOptions,
  optimizeProductPackaging,
  type BoxCatalogItem,
  type ProductItem,
  type ProductPackagingAssignment,
  type ProductPackagingOptions,
  type ProductPackagingPlan,
} from './productPackagingOptimizer';
import type { CargoItem, ContainerSpec } from './types';

const EPS = 1e-9;

export type CommonCartonFamilyOptions = {
  enabled: boolean;
  /** 목표 박스 규격 수. 불가능한 경우 안전한 포장을 위해 초과할 수 있다. */
  targetMaxBoxTypes: number;
  /** 제품별 개별 최적점 대비 허용할 최대 점수 손실(0~1). */
  maxAssignmentScoreLoss: number;
  /** 공용 자동규격을 만들 때 내부 치수를 올림하는 단위(m). */
  dimensionRoundingM: number;
  /** 보유 박스가 동점이면 신규 규격보다 우선한다. */
  preferCatalog: boolean;
};

export const defaultCommonCartonFamilyOptions: CommonCartonFamilyOptions = {
  enabled: true,
  targetMaxBoxTypes: 4,
  maxAssignmentScoreLoss: 0.08,
  dimensionRoundingM: 0.01,
  preferCatalog: true,
};

type FamilySource = 'catalog' | 'generated' | 'standardized';
type FamilyBox = BoxCatalogItem & { familySource: FamilySource };

type CandidateEvaluation = {
  box: FamilyBox;
  byProduct: Map<string, ProductPackagingAssignment>;
};

export type CommonCartonFamilySummary = {
  baselineBoxTypes: number;
  selectedBoxTypes: number;
  boxTypeSavings: number;
  targetMaxBoxTypes: number;
  targetExceeded: boolean;
  averageScoreLoss: number;
  selectedBoxes: Array<{
    id: string;
    name: string;
    source: FamilySource;
    outerLength: number;
    outerWidth: number;
    outerHeight: number;
    assignedProducts: string[];
  }>;
};

export type CommonCartonFamilyPlan = ProductPackagingPlan & {
  family: CommonCartonFamilySummary;
};

function roundUp(value: number, step: number) {
  if (!Number.isFinite(step) || step <= 0) return value;
  return Math.ceil((value - EPS) / step) * step;
}

function boxKey(box: BoxCatalogItem) {
  return [box.outerLength, box.outerWidth, box.outerHeight, box.innerLength, box.innerWidth, box.innerHeight]
    .map((value) => value.toFixed(4))
    .join(':');
}

function assignmentKey(item: ProductPackagingAssignment) {
  return [item.outerLength, item.outerWidth, item.outerHeight, item.innerLength, item.innerWidth, item.innerHeight]
    .map((value) => value.toFixed(4))
    .join(':');
}

function generatedAssignmentBox(
  item: ProductPackagingAssignment,
  packaging: ProductPackagingOptions,
): FamilyBox {
  return {
    id: item.boxId,
    name: item.boxName,
    innerLength: item.innerLength,
    innerWidth: item.innerWidth,
    innerHeight: item.innerHeight,
    outerLength: item.outerLength,
    outerWidth: item.outerWidth,
    outerHeight: item.outerHeight,
    tareWeightKg: packaging.generatedBoxTareKg,
    maxGrossWeightKg: Math.max(packaging.maxGeneratedGrossWeightKg, item.grossWeightKg),
    maxTopLoadKg: undefined,
    unitCost: item.boxUnitCost ?? (packaging.generatedBoxUnitCost && packaging.generatedBoxUnitCost > 0 ? packaging.generatedBoxUnitCost : undefined),
    familySource: 'generated',
  };
}

function sanitizedCatalog(catalog: BoxCatalogItem[], container: ContainerSpec): FamilyBox[] {
  return catalog
    .filter((box) =>
      box.outerLength > 0 && box.outerWidth > 0 && box.outerHeight > 0
      && box.innerLength > 0 && box.innerWidth > 0 && box.innerHeight > 0
      && box.outerLength <= container.length + EPS
      && box.outerWidth <= container.width + EPS
      && box.outerHeight <= container.height + EPS,
    )
    .map((box) => ({ ...box, familySource: 'catalog' as const }));
}

function standardizedEnvelope(
  a: ProductPackagingAssignment,
  b: ProductPackagingAssignment,
  index: number,
  options: CommonCartonFamilyOptions,
  packaging: ProductPackagingOptions,
  container: ContainerSpec,
): FamilyBox | null {
  const step = Math.max(0.001, options.dimensionRoundingM);
  const innerLength = roundUp(Math.max(a.innerLength, b.innerLength), step);
  const innerWidth = roundUp(Math.max(a.innerWidth, b.innerWidth), step);
  const innerHeight = roundUp(Math.max(a.innerHeight, b.innerHeight), step);
  const wall = Math.max(0, packaging.wallThicknessM);
  const outerLength = roundUp(innerLength + wall * 2, step);
  const outerWidth = roundUp(innerWidth + wall * 2, step);
  const outerHeight = roundUp(innerHeight + wall * 2, step);
  if (outerLength > container.length + EPS || outerWidth > container.width + EPS || outerHeight > container.height + EPS) return null;
  return {
    id: `FAMILY-AUTO-${index}`,
    name: `공용 자동규격 ${Math.round(outerLength * 1000)}×${Math.round(outerWidth * 1000)}×${Math.round(outerHeight * 1000)}mm`,
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
    familySource: 'standardized',
  };
}

function candidatePool(
  container: ContainerSpec,
  baseline: ProductPackagingPlan,
  catalog: BoxCatalogItem[],
  family: CommonCartonFamilyOptions,
  packaging: ProductPackagingOptions,
) {
  const pool: FamilyBox[] = sanitizedCatalog(catalog, container);
  for (const assignment of baseline.assignments) {
    if (assignment.source === 'generated') pool.push(generatedAssignmentBox(assignment, packaging));
  }

  let pairIndex = 0;
  for (let i = 0; i < baseline.assignments.length; i += 1) {
    for (let j = i + 1; j < baseline.assignments.length; j += 1) {
      pairIndex += 1;
      const shared = standardizedEnvelope(baseline.assignments[i], baseline.assignments[j], pairIndex, family, packaging, container);
      if (shared) pool.push(shared);
    }
  }

  const unique = new Map<string, FamilyBox>();
  for (const box of pool) {
    const key = boxKey(box);
    const current = unique.get(key);
    if (!current || (family.preferCatalog && box.familySource === 'catalog' && current.familySource !== 'catalog')) unique.set(key, box);
  }

  return [...unique.values()]
    .sort((a, b) => {
      if (family.preferCatalog && a.familySource !== b.familySource) {
        if (a.familySource === 'catalog') return -1;
        if (b.familySource === 'catalog') return 1;
      }
      const volumeA = a.outerLength * a.outerWidth * a.outerHeight;
      const volumeB = b.outerLength * b.outerWidth * b.outerHeight;
      return volumeA - volumeB || a.id.localeCompare(b.id);
    })
    .slice(0, 72);
}

function evaluateCandidate(
  container: ContainerSpec,
  products: ProductItem[],
  box: FamilyBox,
  packaging: ProductPackagingOptions,
): CandidateEvaluation {
  const byProduct = new Map<string, ProductPackagingAssignment>();
  for (const product of products) {
    const plan = optimizeProductPackaging(container, [product], [box], {
      ...packaging,
      allowCustomBoxDesign: false,
    });
    const assignment = plan.assignments[0];
    if (!assignment || assignment.simulatedLoadedBoxes < 1) continue;
    const generated = box.familySource !== 'catalog';
    byProduct.set(product.id, {
      ...assignment,
      boxId: box.id,
      boxName: box.name,
      source: generated ? 'generated' : 'catalog',
      maxStackLayers: generated ? 1 : assignment.maxStackLayers,
      maxTopLoadKg: generated ? 0 : box.maxTopLoadKg,
      strengthStatus: generated ? 'design-target' : 'catalog',
      boxUnitCost: box.unitCost,
    });
  }
  return { box, byProduct };
}

function cargoFromAssignments(assignments: ProductPackagingAssignment[]): CargoItem[] {
  return assignments.map((item) => ({
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
  }));
}

export function optimizeCommonCartonFamily(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  packaging: ProductPackagingOptions = defaultProductPackagingOptions,
  family: CommonCartonFamilyOptions = defaultCommonCartonFamilyOptions,
): CommonCartonFamilyPlan {
  const baseline = optimizeProductPackaging(container, products, catalog, packaging);
  const target = Math.max(1, Math.floor(family.targetMaxBoxTypes));
  if (!family.enabled || baseline.assignments.length <= 1) {
    const baselineTypes = new Set(baseline.assignments.map(assignmentKey)).size;
    return {
      ...baseline,
      family: {
        baselineBoxTypes: baselineTypes,
        selectedBoxTypes: baselineTypes,
        boxTypeSavings: 0,
        targetMaxBoxTypes: target,
        targetExceeded: baselineTypes > target,
        averageScoreLoss: 0,
        selectedBoxes: baseline.assignments.map((item) => ({
          id: item.boxId,
          name: item.boxName,
          source: item.source === 'catalog' ? 'catalog' : 'generated',
          outerLength: item.outerLength,
          outerWidth: item.outerWidth,
          outerHeight: item.outerHeight,
          assignedProducts: [item.productId],
        })),
      },
    };
  }

  const baselineByProduct = new Map(baseline.assignments.map((item) => [item.productId, item]));
  const activeProducts = products.filter((product) => baselineByProduct.has(product.id));
  const pool = candidatePool(container, baseline, catalog, family, packaging);
  const evaluations = pool.map((box) => evaluateCandidate(container, activeProducts, box, packaging));
  const lossLimit = Math.min(1, Math.max(0, family.maxAssignmentScoreLoss));
  const uncovered = new Set(activeProducts.map((product) => product.id));
  const selected: CandidateEvaluation[] = [];

  while (uncovered.size > 0 && selected.length < target) {
    let best: CandidateEvaluation | undefined;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const candidate of evaluations) {
      if (selected.includes(candidate)) continue;
      let coverage = 0;
      let quality = 0;
      for (const productId of uncovered) {
        const assignment = candidate.byProduct.get(productId);
        const baselineAssignment = baselineByProduct.get(productId);
        if (!assignment || !baselineAssignment) continue;
        const loss = baselineAssignment.score - assignment.score;
        if (loss > lossLimit + EPS) continue;
        coverage += 1;
        quality += assignment.score;
      }
      if (!coverage) continue;
      const sourceBonus = family.preferCatalog && candidate.box.familySource === 'catalog' ? 0.05 : 0;
      const value = coverage * 100 + quality + sourceBonus;
      if (value > bestValue + EPS || (Math.abs(value - bestValue) <= EPS && candidate.box.id.localeCompare(best?.box.id ?? '') < 0)) {
        best = candidate;
        bestValue = value;
      }
    }
    if (!best) break;
    selected.push(best);
    for (const productId of [...uncovered]) {
      const assignment = best.byProduct.get(productId);
      const baselineAssignment = baselineByProduct.get(productId);
      if (assignment && baselineAssignment && baselineAssignment.score - assignment.score <= lossLimit + EPS) uncovered.delete(productId);
    }
  }

  // 목표 규격 수로 모든 제품을 커버하지 못하면 안전성을 우선해 필요한 규격을 추가한다.
  for (const productId of [...uncovered]) {
    const baselineAssignment = baselineByProduct.get(productId);
    if (!baselineAssignment) continue;
    let fallback = evaluations.find((candidate) => candidate.byProduct.has(productId) && boxKey(candidate.box) === assignmentKey(baselineAssignment));
    if (!fallback) {
      fallback = evaluations
        .filter((candidate) => candidate.byProduct.has(productId))
        .sort((a, b) => (b.byProduct.get(productId)?.score ?? -1) - (a.byProduct.get(productId)?.score ?? -1) || a.box.id.localeCompare(b.box.id))[0];
    }
    if (fallback && !selected.includes(fallback)) selected.push(fallback);
    uncovered.delete(productId);
  }

  const assignments: ProductPackagingAssignment[] = [];
  let totalLoss = 0;
  for (const product of activeProducts) {
    const baselineAssignment = baselineByProduct.get(product.id);
    if (!baselineAssignment) continue;
    const choices = selected
      .map((candidate) => candidate.byProduct.get(product.id))
      .filter((item): item is ProductPackagingAssignment => Boolean(item))
      .sort((a, b) => b.score - a.score || a.boxesNeeded - b.boxesNeeded || a.boxId.localeCompare(b.boxId));
    const chosen = choices.find((item) => baselineAssignment.score - item.score <= lossLimit + EPS) ?? choices[0] ?? baselineAssignment;
    assignments.push(chosen);
    totalLoss += Math.max(0, baselineAssignment.score - chosen.score);
  }

  const usedIds = new Set(assignments.map((item) => item.boxId));
  const selectedUsed = selected.filter((candidate) => usedIds.has(candidate.box.id));
  const baselineTypes = new Set(baseline.assignments.map(assignmentKey)).size;
  const selectedTypes = usedIds.size;
  const assignedByBox = new Map<string, string[]>();
  for (const item of assignments) {
    const list = assignedByBox.get(item.boxId) ?? [];
    list.push(item.productId);
    assignedByBox.set(item.boxId, list);
  }

  return {
    assignments,
    cargo: cargoFromAssignments(assignments),
    rejected: baseline.rejected,
    totalBoxes: assignments.reduce((sum, item) => sum + item.boxesNeeded, 0),
    totalPackedProducts: baseline.totalPackedProducts,
    generatedBoxCount: new Set(assignments.filter((item) => item.source === 'generated').map((item) => item.boxId)).size,
    family: {
      baselineBoxTypes: baselineTypes,
      selectedBoxTypes: selectedTypes,
      boxTypeSavings: Math.max(0, baselineTypes - selectedTypes),
      targetMaxBoxTypes: target,
      targetExceeded: selectedTypes > target,
      averageScoreLoss: assignments.length ? totalLoss / assignments.length : 0,
      selectedBoxes: selectedUsed.map((candidate) => ({
        id: candidate.box.id,
        name: candidate.box.name,
        source: candidate.box.familySource,
        outerLength: candidate.box.outerLength,
        outerWidth: candidate.box.outerWidth,
        outerHeight: candidate.box.outerHeight,
        assignedProducts: [...(assignedByBox.get(candidate.box.id) ?? [])].sort(),
      })),
    },
  };
}
