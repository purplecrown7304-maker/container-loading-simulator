import type { CargoItem, ContainerSpec, Placement } from './engine/types';

/** Explain recorded inputs without guessing who set historical limits. */
export function stackLimitExplanation(item: CargoItem) {
  if (item.strengthUnverified) return '자동 제한 · 박스 강도 미확인';
  if (item.topLoadLimitExplicit) return item.maxTopLoadKg === 0 ? '사용자가 명시한 상부 적재 금지' : '사용자가 입력한 상부 허용하중';
  const origin = item.stackLimitOrigin;
  const matches = origin && origin.maxStackLayers === item.maxStackLayers && origin.maxTopLoadKg === item.maxTopLoadKg;
  if (matches && origin.kind === 'unverified-carton') return '자동 제한 · 신규 박스 강도 미확인';
  if (matches && origin.kind === 'direct-product') return '자동 제한 · 직접 적재 제품의 적층 정보 없음';
  if (matches && origin.kind === 'box-catalog') return '박스 등록값·포장 계산에서 적용';
  return '저장된 화물 제한 · 설정 출처 미기록';
}

export function cartonStrengthChecks(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const checks: Array<{ id: string; label: string; severity: 'WARNING'; detail: string }> = [];
  const active = cargo.filter(item => item.quantity > 0);
  for (const item of active) {
    const restricted = item.maxStackLayers === 1 || item.maxTopLoadKg === 0;
    if (item.strengthUnverified || (restricted && !item.topLoadLimitExplicit)) {
      checks.push({ id: `carton-strength-${item.id}`, label: `${item.boxId ?? item.id} 강도·적층 설정 확인`, severity: 'WARNING',
        detail: `${item.name}: ${stackLimitExplanation(item)}. 최대 ${item.maxStackLayers ?? '미설정'}단 / 상부 허용하중 ${item.maxTopLoadKg ?? '미확인'}kg. 실제 강도 자료로 박스 관리 값을 확인하세요. 이름의 ‘강도확인’은 시험 성적서를 의미하지 않습니다.` });
    }
  }
  // A similar recommendation name is a review hint only, never evidence of equal strength.
  const namedFamily = active.filter(item => /(?:범용 추천|추가추천)/.test(item.boxName ?? item.name));
  const families = new Map<string, CargoItem>();
  for (const item of namedFamily) families.set(item.boxId ?? item.id, item);
  const rows = [...families.values()];
  const values = rows.map(item => item.maxTopLoadKg).filter((value): value is number => value != null && Number.isFinite(value));
  if (rows.length > 1 && values.length > 1 && Math.max(...values) > 0 && (Math.min(...values) === 0 || Math.max(...values) >= Math.min(...values) * 4)) {
    checks.push({ id: 'carton-strength-recommendation-difference', label: '추천 박스별 강도 차이 확인', severity: 'WARNING',
      detail: rows.map(item => `${item.boxId ?? item.id}: ${item.maxTopLoadKg ?? '미확인'}kg`).join(' / ') + '. 추천 명칭이 비슷해도 재질·골종·시험 조건이 같다는 근거는 없습니다. 강도값을 자동 복사하지 마세요.' });
  }
  const byId = new Map(active.map(item => [item.id, item]));
  const blocked = placements.filter(placement => {
    const item = byId.get(placement.cargoId);
    return item && (item.maxStackLayers === 1 || item.maxTopLoadKg === 0);
  });
  const maxTop = placements.reduce((top, item) => Math.max(top, item.z + item.height), 0);
  if (blocked.length && container.height > 0 && maxTop / container.height < .5) {
    checks.push({ id: 'carton-low-height-restrictions', label: '낮은 높이 사용률·적층 제한', severity: 'WARNING',
      detail: `최고 적재 높이 ${Math.round(maxTop * 1000)}mm / 장비 높이 ${Math.round(container.height * 1000)}mm (${(maxTop / container.height * 100).toFixed(1)}%). 상부 적재 금지 또는 1단 제한 박스 ${blocked.length}개가 포함됩니다. 제한은 추가 적층을 막는 조건이며, 물량·바닥하중 등 다른 원인도 함께 확인해야 합니다.` });
  }
  return checks;
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
