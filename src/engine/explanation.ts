import type { CargoItem, ContainerSpec, LoadingResult } from './types';

export type CargoExplanation = {
  cargoId: string;
  requested: number;
  loaded: number;
  remaining: number;
  rotated: number;
  avgX: number | null;
  zone: '안쪽' | '중앙' | '문쪽' | '미적재';
  priorityScore: number;
  reasons: string[];
};

export type LoadingExplanation = {
  cargo: CargoExplanation[];
  summary: string[];
};

const cbm = (item: CargoItem) => item.length * item.width * item.height;

function zoneFor(container: ContainerSpec, avgX: number | null): CargoExplanation['zone'] {
  if (avgX == null) return '미적재';
  if (avgX < container.length / 3) return '안쪽';
  if (avgX < container.length * 2 / 3) return '중앙';
  return '문쪽';
}

export function explainLoading(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): LoadingExplanation {
  const remainingMap = new Map(result.remaining.map((item) => [item.cargoId, item]));
  const explanations = cargo.map((item) => {
    const placements = result.placements.filter((p) => p.cargoId === item.id);
    const loaded = placements.length;
    const remaining = Math.max(0, item.quantity - loaded);
    const rotated = placements.filter((p) => p.rotated).length;
    const avgX = loaded ? placements.reduce((sum, p) => sum + p.x, 0) / loaded : null;
    const priorityScore = cbm(item) * item.quantity + item.weightKg * 0.001;
    const reasons: string[] = [];

    if (loaded > 0) {
      reasons.push('CBM 총량과 중량을 함께 계산한 품목 우선순위에 따라 배치되었습니다.');
      const zone = zoneFor(container, avgX);
      if (zone === '안쪽') reasons.push('안쪽부터 채우는 원칙에 따라 컨테이너 깊은 쪽에 우선 배치되었습니다.');
      else if (zone === '중앙') reasons.push('안쪽의 선행 블록 뒤에 이어지는 중앙 구역에 배치되었습니다.');
      else reasons.push('앞선 완전 블록 또는 후순위 잔량 처리 이후 문쪽 구역에 배치되었습니다.');

      if (rotated > 0) reasons.push(`${rotated}개는 바닥 면적 활용도를 높이기 위해 90도 회전 배치되었습니다.`);
      if (item.maxStackLayers != null) reasons.push(`최대 적층단 ${item.maxStackLayers}단을 넘지 않도록 제한했습니다.`);
      if (item.maxTopLoadKg != null) reasons.push(`하부 박스당 상부 허용중량 ${item.maxTopLoadKg}kg 제약을 적용했습니다.`);
      if (remaining > 0) reasons.push('완전한 동일품목 블록을 먼저 만든 뒤 남은 수량은 후순위 혼합 적재로 넘겼습니다.');
    }

    const remainingInfo = remainingMap.get(item.id);
    if (remainingInfo) reasons.push(`미적재 ${remainingInfo.quantity}개: ${remainingInfo.reason}`);
    if (loaded === 0 && !remainingInfo) reasons.push('현재 조건에서 적재 결과가 생성되지 않았습니다.');

    return {
      cargoId: item.id,
      requested: item.quantity,
      loaded,
      remaining,
      rotated,
      avgX,
      zone: zoneFor(container, avgX),
      priorityScore,
      reasons,
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.cargoId.localeCompare(b.cargoId));

  const summary: string[] = [
    '기본 순서: CBM 총량·중량 우선순위 → 안쪽부터 동일품목 완전 블록 → 잔량 후순위 혼합 적재.',
    '배치 후보는 컨테이너 경계, 충돌, 최대 적층단, 상부 허용중량, 최대 적재중량을 통과해야 합니다.',
    '최종 단계에서 중앙 낱개·돌출·품목 분산을 줄이고 낮은 행은 가능한 경우 문쪽 혼합 구역으로 이동합니다.',
  ];

  return { cargo: explanations, summary };
}
