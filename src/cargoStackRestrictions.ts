import type { CargoItem } from './engine/types';

/** Explain recorded inputs without guessing who set historical limits. */
export function stackLimitExplanation(item: CargoItem) {
  const origin = item.stackLimitOrigin;
  const matches = origin && origin.maxStackLayers === item.maxStackLayers && origin.maxTopLoadKg === item.maxTopLoadKg;
  if (matches && origin.kind === 'unverified-carton') return '자동 제한 · 신규 박스 강도 미확인';
  if (matches && origin.kind === 'direct-product') return '자동 제한 · 직접 적재 제품의 적층 정보 없음';
  if (matches && origin.kind === 'box-catalog') return '박스 등록값·포장 계산에서 적용';
  return '저장된 화물 제한 · 설정 출처 미기록';
}

export function cargoStackRestrictions(cargo: CargoItem[]) {
  const groups = new Map<string, { name: string; box: string; reason: string; limits: string; quantity: number; rows: number }>();
  for (const item of cargo) {
    if (item.quantity <= 0 || (item.maxStackLayers !== 1 && item.maxTopLoadKg !== 0)) continue;
    const reason = stackLimitExplanation(item);
    const limits = [item.maxStackLayers === 1 ? '최대 1단' : '', item.maxTopLoadKg === 0 ? '상부 허용하중 0 kg' : ''].filter(Boolean).join(' · ');
    const key = JSON.stringify([item.productId ?? item.id, item.boxId, reason, limits]);
    const previous = groups.get(key);
    if (previous) { previous.quantity += item.quantity; previous.rows++; }
    else groups.set(key, { name: item.productName ?? item.name, box: item.boxName ?? item.boxId ?? '직접 적재', reason, limits, quantity: item.quantity, rows: 1 });
  }
  return [...groups.values()];
}
