import { validatePlacements } from './constraints';
import { assessPlacementSupport } from './support';
import type { CargoItem, ContainerSpec, Placement, ValidationIssue } from './types';

const EPS = 1e-6;
/** Independent final audit. Shared descendants are counted once per supporting box,
 * matching the packer's conservative full transmitted-load policy. */
export function auditLoading(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]): ValidationIssue[] {
  const issues = validatePlacements(container, placements);
  const byId = new Map(cargo.map(item => [item.id, item]));
  const counts = new Map<string, number>();
  const upper = placements.map(() => [] as number[]);
  const lower = placements.map(() => [] as number[]);
  const add = (type: ValidationIssue['type'], message: string, indexes: number[]) => issues.push({ type, message, placementIndexes: indexes });
  placements.forEach((p, i) => {
    const item = byId.get(p.cargoId);
    counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
    if (![p.x, p.y, p.z, p.length, p.width, p.height, p.weightKg].every(Number.isFinite) || Math.min(p.length, p.width, p.height) <= 0 || p.weightKg < 0) {
      add('INVALID_CARGO', '화물 치수·좌표·중량이 유효하지 않습니다.', [i]);
      return;
    }
    const same = (a: number, b: number) => Math.abs(a - b) <= EPS;
    const validDimensions = item && same(p.height, item.height) && (p.rotated
      ? item.allowRotation !== false && same(p.length, item.width) && same(p.width, item.length)
      : same(p.length, item.length) && same(p.width, item.width));
    if (!item || !validDimensions || !same(p.weightKg, item.weightKg)) add('INVALID_CARGO', '등록 화물의 규격·회전 허용·중량과 배치가 일치하지 않습니다.', [i]);
    if (!assessPlacementSupport(p, placements).supported) add('UNSUPPORTED', '화물의 지지 면적 또는 무게중심 지지가 부족합니다.', [i]);
    placements.forEach((q, j) => {
      if (i === j || q.z <= p.z || Math.abs(p.z + p.height - q.z) > 0.0015) return;
      const area = Math.max(0, Math.min(p.x + p.length, q.x + q.length) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.width, q.y + q.width) - Math.max(p.y, q.y));
      if (area > 1e-9) { upper[i].push(j); lower[j].push(i); }
    });
  });
  for (const [id, count] of counts) if (count > (byId.get(id)?.quantity ?? 0)) add('QUANTITY', `화물 ${id}의 등록 수량을 초과했습니다.`, placements.flatMap((p, i) => p.cargoId === id ? [i] : []));
  const order = placements.map((_, i) => i).sort((a, b) => placements[a].z - placements[b].z);
  const depth = placements.map(() => 1);
  const height = placements.map(() => 1);
  for (const i of order) for (const j of lower[i]) depth[i] = Math.max(depth[i], depth[j] + 1);
  for (const i of [...order].reverse()) for (const j of upper[i]) height[i] = Math.max(height[i], height[j] + 1);
  placements.forEach((p, i) => {
    const item = byId.get(p.cargoId);
    if (item?.maxStackLayers !== undefined && Math.max(depth[i], height[i]) > item.maxStackLayers) add('STACK_LIMIT', '혼합 화물을 포함한 최대 적층단을 초과했습니다.', [i]);
    if (item?.maxTopLoadKg === undefined) return;
    const descendants = new Set<number>();
    const queue = [...upper[i]];
    while (queue.length) {
      const j = queue.pop()!;
      if (descendants.has(j)) continue;
      descendants.add(j);
      queue.push(...upper[j]);
    }
    const load = [...descendants].reduce((sum, j) => sum + placements[j].weightKg, 0);
    if (load > item.maxTopLoadKg + EPS) add('TOP_LOAD', `누적 상부 하중 ${load.toFixed(1)}kg이 허용치 ${item.maxTopLoadKg}kg을 초과했습니다.`, [i]);
  });
  if (placements.reduce((sum, p) => sum + p.weightKg, 0) > container.maxPayloadKg + EPS) add('PAYLOAD', '운송 장비의 허용 적재 중량을 초과했습니다.', []);
  return issues;
}
