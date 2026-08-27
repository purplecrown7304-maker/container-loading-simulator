import type { EnterprisePackagingPlan } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { CargoItem, ContainerSpec } from './engine/types';

export const ENTERPRISE_PACKAGING_MANIFEST_KEY = 'container-loading-enterprise-packaging-manifest-v1';
export const ENTERPRISE_PACKAGING_MANIFEST_EVENT = 'container-loading:enterprise-packaging-manifest';

export type EnterprisePackagingManifest = {
  version: 1;
  createdAt: string;
  container: ContainerSpec;
  products: ProductItem[];
  boxes: BoxCatalogItem[];
  assignments: EnterprisePackagingPlan['assignments'];
  family: EnterprisePackagingPlan['family'];
  mixedCartons: EnterprisePackagingPlan['mixedCartons'];
  dedicatedPartialCartons: EnterprisePackagingPlan['dedicatedPartialCartons'];
  cargo: EnterprisePackagingPlan['cargo'];
  shipment: EnterprisePackagingPlan['shipment'];
  cost: EnterprisePackagingPlan['cost'];
  baselineTotalBoxes: number;
  totalBoxes: number;
  mixedCartonSavings: number;
  accurateTotalCargoWeightKg: number;
};

function cargoSignature(cargo: CargoItem[]) {
  return [...cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => [
      item.id.trim(), item.name.trim(),
      item.length.toFixed(6), item.width.toFixed(6), item.height.toFixed(6), item.weightKg.toFixed(6),
      item.quantity, item.maxStackLayers ?? null, item.maxTopLoadKg ?? null,
      item.allowRotation !== false, item.unloadPriority ?? null,
    ].join('|'))
    .join('\n');
}

function containerSignature(container: ContainerSpec) {
  return [
    container.length.toFixed(6), container.width.toFixed(6), container.height.toFixed(6), container.maxPayloadKg.toFixed(3),
    container.floorLoadLimitKgPerM2 ?? null, container.floorLoadWarningMultiplier ?? null,
  ].join('|');
}

export function enterprisePackagingManifestMatchesState(
  manifest: EnterprisePackagingManifest | null | undefined,
  container: ContainerSpec | null | undefined,
  cargo: CargoItem[] | null | undefined,
) {
  if (!manifest || !container || !cargo) return false;
  return containerSignature(manifest.container) === containerSignature(container)
    && cargoSignature(manifest.cargo) === cargoSignature(cargo);
}

export function createEnterprisePackagingManifest(
  plan: EnterprisePackagingPlan,
  container: ContainerSpec,
  products: ProductItem[],
  boxes: BoxCatalogItem[],
): EnterprisePackagingManifest {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    container: { ...container },
    products: products.map((item) => ({ ...item })),
    boxes: boxes.map((item) => ({ ...item })),
    assignments: plan.assignments.map((item) => ({ ...item })),
    family: {
      ...plan.family,
      selectedBoxes: plan.family.selectedBoxes.map((item) => ({ ...item, assignedProducts: [...item.assignedProducts] })),
    },
    mixedCartons: plan.mixedCartons.map((item) => ({
      ...item,
      contents: item.contents.map((content) => ({ ...content })),
      placements: item.placements.map((placement) => ({ ...placement })),
    })),
    dedicatedPartialCartons: plan.dedicatedPartialCartons.map((item) => ({ ...item })),
    cargo: plan.cargo.map((item) => ({ ...item })),
    shipment: { ...plan.shipment, remaining: plan.shipment.remaining.map((item) => ({ ...item })) },
    cost: { ...plan.cost },
    baselineTotalBoxes: plan.baselineTotalBoxes,
    totalBoxes: plan.totalBoxes,
    mixedCartonSavings: plan.mixedCartonSavings,
    accurateTotalCargoWeightKg: plan.accurateTotalCargoWeightKg,
  };
}

export function writeEnterprisePackagingManifest(manifest: EnterprisePackagingManifest): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ENTERPRISE_PACKAGING_MANIFEST_KEY, JSON.stringify(manifest));
  window.dispatchEvent(new CustomEvent<EnterprisePackagingManifest>(ENTERPRISE_PACKAGING_MANIFEST_EVENT, { detail: manifest }));
}

export function readEnterprisePackagingManifest(): EnterprisePackagingManifest | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ENTERPRISE_PACKAGING_MANIFEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EnterprisePackagingManifest;
    return parsed?.version === 1 && Array.isArray(parsed.cargo) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearEnterprisePackagingManifest(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ENTERPRISE_PACKAGING_MANIFEST_KEY);
  window.dispatchEvent(new CustomEvent(ENTERPRISE_PACKAGING_MANIFEST_EVENT, { detail: null }));
}
