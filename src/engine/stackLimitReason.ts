import { usableHeight } from './constraints';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const EPS = 1e-9;

/** The layer cap a package's own stacking data imposes, and where it comes from. Null = no cap. */
export function declaredStackCap(item: CargoItem): { layers: number; source: string } | null {
  const caps: Array<{ layers: number; source: string }> = [];
  if (item.strengthUnverified) caps.push({ layers: 1, source: '박스 강도 미확인' });
  if (item.floorOnly) caps.push({ layers: 1, source: '바닥 전용 화물' });
  if (item.maxStackLayers != null && Number.isFinite(item.maxStackLayers)) caps.push({ layers: Math.max(1, Math.floor(item.maxStackLayers)), source: `최대 적층단 ${Math.floor(item.maxStackLayers)}단` });
  if (!item.strengthUnverified && item.maxTopLoadKg != null && item.weightKg > EPS) {
    const layers = 1 + Math.floor((Math.max(0, item.maxTopLoadKg) + EPS) / item.weightKg);
    caps.push({ layers, source: item.maxTopLoadKg <= 0 ? '상부 허용하중 0 kg' : `상부 허용하중 ${item.maxTopLoadKg} kg` });
  }
  if (!caps.length) return null;
  const layers = Math.min(...caps.map(cap => cap.layers));
  return { layers, source: caps.filter(cap => cap.layers === layers).map(cap => cap.source).join(' · ') };
}

/**
 * Waiting cargo that ran out of floor space only because its own stacking data stops it
 * from going higher is reported as STACK_LIMIT with the actual cause (2026-10-08). Placement
 * is not changed; only the explanation of rows the packer marked as space or stack limited.
 */
export function explainStackLimitedRemaining(
  container: ContainerSpec,
  cargo: CargoItem[],
  remaining: LoadingResult['remaining'],
): LoadingResult['remaining'] {
  const byId = new Map(cargo.map(item => [item.id, item]));
  return remaining.map(row => {
    if (row.reasonCode !== 'NO_FEASIBLE_EMS' && row.reasonCode !== 'STACK_LIMIT') return row;
    const item = byId.get(row.cargoId);
    if (!item || !(item.height > EPS)) return row;
    const byHeight = Math.floor((usableHeight(container) + EPS) / item.height);
    const cap = declaredStackCap(item);
    if (!cap || byHeight <= 1 || cap.layers >= byHeight) return row;
    return {
      ...row,
      reasonCode: 'STACK_LIMIT',
      reason: `적층 ${cap.layers}단 제한(${cap.source})으로 위에 쌓을 수 없어 바닥 자리가 부족함. 높이로는 ${byHeight}단까지 가능합니다. 박스 관리에서 최대 적층단·상부 허용하중을 확인하세요.`,
    };
  });
}
