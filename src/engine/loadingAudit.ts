import { isARules } from './loadingRuleset';
import { validateAPlan } from './loadSimAdapter';
import { validatePlacements } from './constraints';
import { placementsWithinFloorLoadLimit } from './floorLoadLimit';
import { assessPlacementSupport, CONTACT_TOLERANCE_M, supportContactArea } from './support';
import { acceptsUnloadCandidate } from './unloadingPolicy';
import { candidateIndexes, footprintGridFor } from './footprintGrid';
import type { CargoItem, ContainerSpec, Placement, ValidationIssue } from './types';

const EPS = 1e-6;
/** Independent final audit. Shared descendants are counted once per supporting box,
 * matching the packer's conservative full transmitted-load policy. */
export function auditLoading(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], options: { minimumSupportRatio?: number } = {}): ValidationIssue[] {
  if (isARules(container)) return validateAPlan(container, cargo, placements).filter(f=>f.severity==='error').map(f=>({type:'INVALID_CARGO' as const,message:f.message,placementIndexes:f.placementIndexes}));
  const issues = validatePlacements(container, placements);
  const byId = new Map(cargo.map(item => [item.id, item]));
  const counts = new Map<string, number>();
  const upper = placements.map(() => [] as number[]);
  const lower = placements.map(() => [] as number[]);
  const add = (type: ValidationIssue['type'], message: string, indexes: number[]) => issues.push({ type, message, placementIndexes: indexes });
  // Footprint index: support/contact links only exist between overlapping footprints.
  // Candidates come back in ascending order, so every result below matches the full scan.
  const grid = footprintGridFor(placements);
  placements.forEach((p, i) => {
    const item = byId.get(p.cargoId);
    if (!acceptsUnloadCandidate(container, byId, placements, p)) add('INVALID_CARGO', 'BLOCKS_UNLOAD_PATH: 먼저 내릴 화물의 반출 경로가 차단됩니다.', [i]);
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
    if (item?.allowedOrientations && !item.allowedOrientations.includes(p.rotated ? 'WLH' : 'LWH')) {
      add('INVALID_CARGO', 'ORIENTATION_RESTRICTED: 허용되지 않은 화물 방향입니다.', [i]);
    }
    if (item?.floorOnly && p.z > CONTACT_TOLERANCE_M) add('INVALID_CARGO', '바닥 전용 화물은 상부에 적층할 수 없습니다.', [i]);
    const near = candidateIndexes(grid, placements.length, p.x, p.y, p.x + p.length, p.y + p.width);
    const nearPlacements = grid ? near.map(j => placements[j]) : placements;
    if (!assessPlacementSupport(p, nearPlacements, undefined, options.minimumSupportRatio).supported) add('UNSUPPORTED', '화물의 지지 면적 또는 무게중심 지지가 부족합니다.', [i]);
    for (const j of near) {
      if (i !== j && supportContactArea(p, placements[j]) > 0) { upper[i].push(j); lower[j].push(i); }
    }
  });
  for (const [id, count] of counts) if (count > (byId.get(id)?.quantity ?? 0)) add('QUANTITY', `화물 ${id}의 등록 수량을 초과했습니다.`, placements.flatMap((p, i) => p.cargoId === id ? [i] : []));
  const order = placements.map((_, i) => i).sort((a, b) => placements[a].z - placements[b].z);
  const depth = placements.map(() => 1);
  const height = placements.map(() => 1);
  for (const i of order) for (const j of lower[i]) depth[i] = Math.max(depth[i], depth[j] + 1);
  for (const i of [...order].reverse()) for (const j of upper[i]) height[i] = Math.max(height[i], height[j] + 1);
  placements.forEach((p, i) => {
    const item = byId.get(p.cargoId);
    const maxLayers = item?.strengthUnverified ? Math.min(1,item.maxStackLayers ?? 1) : item?.maxStackLayers;
    if (maxLayers !== undefined && Math.max(depth[i], height[i]) > maxLayers) add('STACK_LIMIT', '혼합 화물을 포함한 최대 적층단을 초과했습니다.', [i]);
    const maxTopLoad = item?.strengthUnverified ? 0 : item?.maxTopLoadKg;
    if (maxTopLoad === undefined && item?.maxTopPressureKgPerM2 === undefined) return;
    const descendants = new Set<number>();
    const queue = [...upper[i]];
    while (queue.length) {
      const j = queue.pop()!;
      if (descendants.has(j)) continue;
      descendants.add(j);
      queue.push(...upper[j]);
    }
    const load = [...descendants].reduce((sum, j) => sum + placements[j].weightKg, 0);
    if (maxTopLoad !== undefined && load > maxTopLoad + EPS) add('TOP_LOAD', `누적 상부 하중 ${load.toFixed(1)}kg이 허용치 ${maxTopLoad}kg을 초과했습니다.`, [i]);
    if (item?.maxTopPressureKgPerM2 !== undefined && load > item.maxTopPressureKgPerM2 * p.length * p.width + EPS) {
      add('TOP_LOAD','TOP_PRESSURE_LIMIT: 누적 상부 압력이 허용 면적하중을 초과했습니다.',[i]);
    }
  });
  if (placements.reduce((sum, p) => sum + p.weightKg, 0) > container.maxPayloadKg + EPS) add('PAYLOAD', '운송 장비의 허용 적재 중량을 초과했습니다.', []);
  if (!placementsWithinFloorLoadLimit(container, placements)) add('INVALID_CARGO', 'FLOOR_LOAD_LIMIT: 투영 국부 바닥하중이 장비 한도를 초과했습니다.', []);
  return issues;
}
