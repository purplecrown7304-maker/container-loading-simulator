import type { BoxCatalogItem } from './engine/productPackagingOptimizer';
import type { CargoItem } from './engine/types';

const EPS = 1e-9;

export function normalizeDeclaredStackLayers(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 1) return undefined;
  return Math.min(50, number);
}

export function positiveTopLoadKg(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > EPS ? number : undefined;
}

/**
 * 개인 박스의 최대 적층단을 플래너의 기존 상부하중 모델에도 전달한다.
 * 플래너는 과거에 maxStackLayers 필드가 없었으므로, 최대총중량 기준으로 보수적인
 * 등가 상부하중을 계산한다. 실제 자동 적재에는 applyPersonalStackPolicyToCargo가
 * 명시적인 maxStackLayers를 다시 넣어 층수 한도를 정확히 보존한다.
 */
export function effectivePlannerTopLoadKg(box: BoxCatalogItem, personal: Pick<CargoItem, 'maxStackLayers' | 'maxTopLoadKg'>): number | undefined {
  const layers = normalizeDeclaredStackLayers(personal.maxStackLayers);
  const explicit = positiveTopLoadKg(personal.maxTopLoadKg) ?? positiveTopLoadKg(box.maxTopLoadKg);
  if (!layers) return explicit ?? box.maxTopLoadKg;
  if (layers <= 1) return 0;

  const layerDerivedTopLoad = (layers - 1) * Math.max(0.001, box.maxGrossWeightKg);
  return explicit == null ? layerDerivedTopLoad : Math.min(explicit, layerDerivedTopLoad);
}

/** 개인 박스에서 사용자가 선언한 적층단을 실제 적재 CargoItem에 그대로 적용한다. */
export function applyPersonalStackPolicyToCargo<T extends CargoItem>(cargo: T, personal: Pick<CargoItem, 'maxStackLayers' | 'maxTopLoadKg'> | undefined): T {
  if (!personal) return cargo;
  const layers = normalizeDeclaredStackLayers(personal.maxStackLayers);
  if (!layers) return cargo;

  const explicitTopLoad = positiveTopLoadKg(personal.maxTopLoadKg);
  const nextTopLoad = explicitTopLoad ?? (layers > 1 ? undefined : 0);
  if (cargo.maxStackLayers === layers && cargo.maxTopLoadKg === nextTopLoad) return cargo;
  return { ...cargo, maxStackLayers: layers, maxTopLoadKg: nextTopLoad };
}
