import { optimizeCommonCartonFamily, defaultCommonCartonFamilyOptions, type CommonCartonFamilyOptions, type CommonCartonFamilyPlan } from './commonCartonFamilyOptimizer';
import { loadContainer } from './loadingEngine';
import { packMixedUnitsIntoCarton, residualUnitsForProducts, type MixedCartonPlacement, type MixedCartonUnit } from './mixedCartonPacker';
import {
  defaultProductPackagingOptions,
  type BoxCatalogItem,
  type ProductItem,
  type ProductPackagingAssignment,
  type ProductPackagingOptions,
} from './productPackagingOptimizer';
import type { CargoItem, ContainerSpec } from './types';

const EPS = 1e-9;

export type PackagingCostOptions = {
  /** 컨테이너 1대 운임. 0이면 비용계산에서 제외한다. */
  containerFreightCost: number;
  /** 박스 1EA 취급/포장 작업비. */
  handlingCostPerCarton: number;
  /** 신규 자동규격 1종을 처음 만들 때 드는 금형/샘플/셋업비. */
  newBoxSetupCost: number;
  /** 박스 규격 1종을 운영할 때의 SKU 관리비. */
  cartonSkuCarryCost: number;
  currency: string;
};

export const defaultPackagingCostOptions: PackagingCostOptions = {
  containerFreightCost: 0,
  handlingCostPerCarton: 0,
  newBoxSetupCost: 0,
  cartonSkuCarryCost: 0,
  currency: 'KRW',
};

export type EnterprisePackagingOptions = {
  packaging: ProductPackagingOptions;
  family: CommonCartonFamilyOptions;
  allowMixedResidualCartons: boolean;
  maxMixedResidualUnits: number;
  maxMixedCandidateBoxes: number;
  maxEstimatedContainers: number;
  cost: PackagingCostOptions;
};

export const defaultEnterprisePackagingOptions: EnterprisePackagingOptions = {
  packaging: defaultProductPackagingOptions,
  family: defaultCommonCartonFamilyOptions,
  allowMixedResidualCartons: false,
  maxMixedResidualUnits: 500,
  maxMixedCandidateBoxes: 24,
  maxEstimatedContainers: 200,
  cost: defaultPackagingCostOptions,
};

export type MixedResidualCarton = {
  id: string;
  boxId: string;
  boxName: string;
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
  grossWeightKg: number;
  fillRate: number;
  maxStackLayers: number;
  maxTopLoadKg?: number;
  source: 'catalog' | 'generated';
  boxUnitCost?: number;
  contents: Array<{ productId: string; productName: string; quantity: number }>;
  placements: MixedCartonPlacement[];
};

export type ShipmentEstimate = {
  containersRequired: number;
  fullyLoaded: boolean;
  remaining: Array<{ cargoId: string; quantity: number }>;
  loadedBoxes: number;
};

export type PackagingCostSummary = {
  currency: string;
  knownCartonCost: number;
  handlingCost: number;
  setupCost: number;
  cartonSkuCost: number;
  freightCost: number;
  totalKnownCost: number;
  unpricedCartons: number;
};

export type EnterprisePackagingPlan = CommonCartonFamilyPlan & {
  mixedCartons: MixedResidualCarton[];
  dedicatedPartialCartons: Array<{ productId: string; quantity: number; grossWeightKg: number; cargoId: string }>;
  baselineTotalBoxes: number;
  mixedCartonSavings: number;
  accurateTotalCargoWeightKg: number;
  shipment: ShipmentEstimate;
  cost: PackagingCostSummary;
};

type CandidateBox = BoxCatalogItem & { source: 'catalog' | 'generated' };

function assignmentProduct(assignment: ProductPackagingAssignment, products: ProductItem[]) {
  return products.find((product) => product.id === assignment.productId);
}

function assignmentTare(assignment: ProductPackagingAssignment, product: ProductItem) {
  return Math.max(0, assignment.grossWeightKg - assignment.unitsPerBox * product.weightKg);
}

function assignmentBox(
  assignment: ProductPackagingAssignment,
  product: ProductItem,
  catalog: BoxCatalogItem[],
  packaging: ProductPackagingOptions,
): CandidateBox {
  const catalogBox = catalog.find((box) => box.id === assignment.boxId);
  if (catalogBox) return { ...catalogBox, source: 'catalog' };
  return {
    id: assignment.boxId,
    name: assignment.boxName,
    innerLength: assignment.innerLength,
    innerWidth: assignment.innerWidth,
    innerHeight: assignment.innerHeight,
    outerLength: assignment.outerLength,
    outerWidth: assignment.outerWidth,
    outerHeight: assignment.outerHeight,
    tareWeightKg: assignmentTare(assignment, product),
    maxGrossWeightKg: Math.max(packaging.maxGeneratedGrossWeightKg, assignment.grossWeightKg),
    // 자동설계/공용규격은 강도 미검증 상태라 0kg 상부하중을 유지한다.
    maxTopLoadKg: assignment.source === 'generated' ? 0 : assignment.maxTopLoadKg,
    unitCost: assignment.boxUnitCost ?? (packaging.generatedBoxUnitCost && packaging.generatedBoxUnitCost > 0 ? packaging.generatedBoxUnitCost : undefined),
    source: assignment.source === 'catalog' ? 'catalog' : 'generated',
  };
}

function boxKey(box: BoxCatalogItem) {
  return [box.outerLength, box.outerWidth, box.outerHeight, box.innerLength, box.innerWidth, box.innerHeight]
    .map((value) => value.toFixed(4)).join(':');
}

function mixedBoxCandidates(
  familyPlan: CommonCartonFamilyPlan,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  packaging: ProductPackagingOptions,
  limit: number,
): CandidateBox[] {
  const pool: CandidateBox[] = catalog.map((box) => ({ ...box, source: 'catalog' as const }));
  for (const assignment of familyPlan.assignments) {
    const product = assignmentProduct(assignment, products);
    if (product) pool.push(assignmentBox(assignment, product, catalog, packaging));
  }
  const unique = new Map<string, CandidateBox>();
  for (const box of pool) {
    const key = boxKey(box);
    const current = unique.get(key);
    if (!current || (box.source === 'catalog' && current.source !== 'catalog')) unique.set(key, box);
  }
  return [...unique.values()]
    .sort((a, b) =>
      (a.innerLength * a.innerWidth * a.innerHeight) - (b.innerLength * b.innerWidth * b.innerHeight)
      || (a.source === b.source ? 0 : a.source === 'catalog' ? -1 : 1)
      || a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(1, Math.floor(limit)));
}

function maxStackForCarton(container: ContainerSpec, box: BoxCatalogItem, grossWeightKg: number) {
  const geometry = Math.max(1, Math.min(7, Math.floor((container.height + EPS) / box.outerHeight)));
  if (box.maxTopLoadKg == null) return geometry;
  return Math.max(1, Math.min(geometry, 1 + Math.floor((box.maxTopLoadKg + EPS) / Math.max(EPS, grossWeightKg))));
}

function dedicatedPartialCargo(
  assignment: ProductPackagingAssignment,
  product: ProductItem,
  residual: number,
): CargoItem {
  const tare = assignmentTare(assignment, product);
  return {
    id: `PKG-${product.id}-PARTIAL`,
    name: `${product.name} · ${assignment.boxName} · 잔량 ${residual}EA`,
    length: assignment.outerLength,
    width: assignment.outerWidth,
    height: assignment.outerHeight,
    weightKg: tare + residual * product.weightKg,
    quantity: 1,
    maxStackLayers: assignment.maxStackLayers,
    maxTopLoadKg: assignment.maxTopLoadKg,
    allowRotation: true,
  };
}

function fullCartonCargo(assignment: ProductPackagingAssignment, fullCount: number): CargoItem | null {
  if (fullCount <= 0) return null;
  return {
    id: `PKG-${assignment.productId}`,
    name: `${assignment.productName} · ${assignment.boxName}`,
    length: assignment.outerLength,
    width: assignment.outerWidth,
    height: assignment.outerHeight,
    weightKg: assignment.grossWeightKg,
    quantity: fullCount,
    maxStackLayers: assignment.maxStackLayers,
    maxTopLoadKg: assignment.maxTopLoadKg,
    allowRotation: true,
  };
}

function chooseMixedPacking(boxes: CandidateBox[], units: MixedCartonUnit[]) {
  return boxes
    .map((box) => ({ box, packing: packMixedUnitsIntoCarton(box, units) }))
    .filter((candidate) => candidate.packing.placements.length > 0)
    .sort((a, b) =>
      b.packing.placements.length - a.packing.placements.length
      || b.packing.fillRate - a.packing.fillRate
      || (a.box.innerLength * a.box.innerWidth * a.box.innerHeight) - (b.box.innerLength * b.box.innerWidth * b.box.innerHeight)
      || (a.box.source === b.box.source ? 0 : a.box.source === 'catalog' ? -1 : 1)
      || a.box.id.localeCompare(b.box.id),
    )[0];
}

function buildAccurateCargo(
  container: ContainerSpec,
  familyPlan: CommonCartonFamilyPlan,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  options: EnterprisePackagingOptions,
) {
  const cargo: CargoItem[] = [];
  const dedicatedPartialCartons: EnterprisePackagingPlan['dedicatedPartialCartons'] = [];
  const unitsPerBox = new Map(familyPlan.assignments.map((assignment) => [assignment.productId, assignment.unitsPerBox]));
  const residual = residualUnitsForProducts(products, unitsPerBox);

  for (const assignment of familyPlan.assignments) {
    const product = assignmentProduct(assignment, products);
    if (!product) continue;
    const fullCount = Math.floor(product.quantity / Math.max(1, assignment.unitsPerBox));
    const full = fullCartonCargo(assignment, fullCount);
    if (full) cargo.push(full);
    const remainder = product.quantity % Math.max(1, assignment.unitsPerBox);
    if (!remainder) continue;
    const mixable = options.allowMixedResidualCartons && !product.fragile && product.allowMixedCarton !== false;
    if (!mixable) {
      const partial = dedicatedPartialCargo(assignment, product, remainder);
      cargo.push(partial);
      dedicatedPartialCartons.push({ productId: product.id, quantity: remainder, grossWeightKg: partial.weightKg, cargoId: partial.id });
    }
  }

  const mixedCartons: MixedResidualCarton[] = [];
  let remainingUnits = options.allowMixedResidualCartons
    ? residual.mixable.slice(0, Math.max(0, Math.floor(options.maxMixedResidualUnits)))
    : [];
  const omittedMixable = options.allowMixedResidualCartons ? residual.mixable.slice(remainingUnits.length) : residual.mixable;
  const boxes = mixedBoxCandidates(familyPlan, products, catalog, options.packaging, options.maxMixedCandidateBoxes);
  let mixedIndex = 0;

  while (remainingUnits.length > 0) {
    const chosen = chooseMixedPacking(boxes, remainingUnits);
    if (!chosen) break;
    mixedIndex += 1;
    const id = `PKG-MIX-${String(mixedIndex).padStart(3, '0')}`;
    const stack = maxStackForCarton(container, chosen.box, chosen.packing.grossWeightKg);
    mixedCartons.push({
      id,
      boxId: chosen.box.id,
      boxName: chosen.box.name,
      outerLength: chosen.box.outerLength,
      outerWidth: chosen.box.outerWidth,
      outerHeight: chosen.box.outerHeight,
      grossWeightKg: chosen.packing.grossWeightKg,
      fillRate: chosen.packing.fillRate,
      maxStackLayers: stack,
      maxTopLoadKg: chosen.box.maxTopLoadKg,
      source: chosen.box.source,
      boxUnitCost: chosen.box.unitCost,
      contents: chosen.packing.contents,
      placements: chosen.packing.placements,
    });
    cargo.push({
      id,
      name: `혼합 잔량 · ${chosen.packing.contents.map((item) => `${item.productId} ${item.quantity}EA`).join(' + ')}`,
      length: chosen.box.outerLength,
      width: chosen.box.outerWidth,
      height: chosen.box.outerHeight,
      weightKg: chosen.packing.grossWeightKg,
      quantity: 1,
      maxStackLayers: stack,
      maxTopLoadKg: chosen.box.maxTopLoadKg,
      allowRotation: true,
    });
    const placed = new Set(chosen.packing.placements.map((placement) => placement.unitKey));
    remainingUnits = remainingUnits.filter((unit) => !placed.has(unit.key));
  }

  // 혼합 후보에 못 들어간 잔량은 절대 유실하지 않고 원래 제품의 전용 잔량 박스로 되돌린다.
  const fallbackUnits = [...remainingUnits, ...omittedMixable];
  const fallbackByProduct = new Map<string, number>();
  for (const unit of fallbackUnits) fallbackByProduct.set(unit.productId, (fallbackByProduct.get(unit.productId) ?? 0) + 1);
  for (const [productId, quantity] of fallbackByProduct) {
    const assignment = familyPlan.assignments.find((item) => item.productId === productId);
    const product = products.find((item) => item.id === productId);
    if (!assignment || !product || quantity <= 0) continue;
    const partial = dedicatedPartialCargo(assignment, product, quantity);
    if (!cargo.some((item) => item.id === partial.id)) {
      cargo.push(partial);
      dedicatedPartialCartons.push({ productId, quantity, grossWeightKg: partial.weightKg, cargoId: partial.id });
    }
  }

  return { cargo, mixedCartons, dedicatedPartialCartons };
}

export function estimateShipmentContainers(
  container: ContainerSpec,
  cargo: CargoItem[],
  maxContainers = 200,
): ShipmentEstimate {
  let remaining = cargo.filter((item) => item.quantity > 0).map((item) => ({ ...item }));
  let containersRequired = 0;
  let loadedBoxes = 0;
  const limit = Math.max(1, Math.floor(maxContainers));

  while (remaining.length > 0 && containersRequired < limit) {
    const result = loadContainer(container, remaining, { strategy: 'capacity', publish: false });
    if (!result.placements.length) break;
    containersRequired += 1;
    loadedBoxes += result.placements.length;
    const loadedById = new Map<string, number>();
    for (const placement of result.placements) loadedById.set(placement.cargoId, (loadedById.get(placement.cargoId) ?? 0) + 1);
    remaining = remaining
      .map((item) => ({ ...item, quantity: Math.max(0, item.quantity - (loadedById.get(item.id) ?? 0)) }))
      .filter((item) => item.quantity > 0);
  }

  return {
    containersRequired,
    fullyLoaded: remaining.length === 0,
    remaining: remaining.map((item) => ({ cargoId: item.id, quantity: item.quantity })),
    loadedBoxes,
  };
}

function actualCartonCountForProduct(accurateCargo: CargoItem[], productId: string) {
  const fullId = `PKG-${productId}`;
  const partialId = `PKG-${productId}-PARTIAL`;
  return accurateCargo.reduce((sum, item) => item.id === fullId || item.id === partialId ? sum + item.quantity : sum, 0);
}

function costSummary(
  familyPlan: CommonCartonFamilyPlan,
  catalog: BoxCatalogItem[],
  accurateCargo: CargoItem[],
  mixedCartons: MixedResidualCarton[],
  shipment: ShipmentEstimate,
  options: EnterprisePackagingOptions,
): PackagingCostSummary {
  let knownCartonCost = 0;
  let unpricedCartons = 0;
  const usedGenerated = new Set<string>();
  const usedBoxKeys = new Set<string>();

  // 비용은 혼합 가능 여부가 아니라 최종 생성된 실제 화물행을 기준으로 계산한다.
  // 따라서 혼합에 실패해 전용 partial로 되돌아간 박스도 빠짐없이 집계된다.
  for (const assignment of familyPlan.assignments) {
    const actualCount = actualCartonCountForProduct(accurateCargo, assignment.productId);
    if (actualCount <= 0) continue;
    const catalogBox = catalog.find((box) => box.id === assignment.boxId);
    const unitCost = catalogBox?.unitCost
      ?? assignment.boxUnitCost
      ?? (assignment.source === 'generated' ? options.packaging.generatedBoxUnitCost : undefined);
    if (unitCost != null && Number.isFinite(unitCost) && unitCost >= 0) knownCartonCost += unitCost * actualCount;
    else unpricedCartons += actualCount;
    if (assignment.source === 'generated') usedGenerated.add(assignment.boxId);
    usedBoxKeys.add(`${assignment.outerLength.toFixed(4)}:${assignment.outerWidth.toFixed(4)}:${assignment.outerHeight.toFixed(4)}`);
  }

  for (const carton of mixedCartons) {
    if (carton.boxUnitCost != null && Number.isFinite(carton.boxUnitCost) && carton.boxUnitCost >= 0) knownCartonCost += carton.boxUnitCost;
    else unpricedCartons += 1;
    if (carton.source === 'generated') usedGenerated.add(carton.boxId);
    usedBoxKeys.add(`${carton.outerLength.toFixed(4)}:${carton.outerWidth.toFixed(4)}:${carton.outerHeight.toFixed(4)}`);
  }

  const totalCartons = accurateCargo.reduce((sum, item) => sum + item.quantity, 0);
  const handlingCost = totalCartons * Math.max(0, options.cost.handlingCostPerCarton);
  const setupCost = usedGenerated.size * Math.max(0, options.cost.newBoxSetupCost);
  const cartonSkuCost = usedBoxKeys.size * Math.max(0, options.cost.cartonSkuCarryCost);
  const freightCost = shipment.containersRequired * Math.max(0, options.cost.containerFreightCost);
  return {
    currency: options.cost.currency || 'KRW',
    knownCartonCost,
    handlingCost,
    setupCost,
    cartonSkuCost,
    freightCost,
    totalKnownCost: knownCartonCost + handlingCost + setupCost + cartonSkuCost + freightCost,
    unpricedCartons,
  };
}

export function optimizeEnterprisePackaging(
  container: ContainerSpec,
  products: ProductItem[],
  catalog: BoxCatalogItem[],
  options: EnterprisePackagingOptions = defaultEnterprisePackagingOptions,
): EnterprisePackagingPlan {
  const familyPlan = optimizeCommonCartonFamily(container, products, catalog, options.packaging, options.family);
  const accurate = buildAccurateCargo(container, familyPlan, products, catalog, options);
  const shipment = estimateShipmentContainers(container, accurate.cargo, options.maxEstimatedContainers);
  const cost = costSummary(familyPlan, catalog, accurate.cargo, accurate.mixedCartons, shipment, options);
  const totalBoxes = accurate.cargo.reduce((sum, item) => sum + item.quantity, 0);
  const accurateTotalCargoWeightKg = accurate.cargo.reduce((sum, item) => sum + item.weightKg * item.quantity, 0);

  return {
    ...familyPlan,
    cargo: accurate.cargo,
    totalBoxes,
    mixedCartons: accurate.mixedCartons,
    dedicatedPartialCartons: accurate.dedicatedPartialCartons,
    baselineTotalBoxes: familyPlan.totalBoxes,
    mixedCartonSavings: Math.max(0, familyPlan.totalBoxes - totalBoxes),
    accurateTotalCargoWeightKg,
    shipment,
    cost,
  };
}
