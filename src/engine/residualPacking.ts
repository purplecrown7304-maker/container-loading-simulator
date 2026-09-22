import { nextSpaces, type Space, type BeamPackingOutput } from './blockSpaceBeamPackerV2';
import { isInsideContainer, overlaps } from './constraints';
import { hasAdequateSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import { unloadingObstructions } from './operationalQuality';
import type { LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-6;
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const volume = (p: { length: number; width: number; height: number }) => p.length * p.width * p.height;
function orientations(item: CargoItem) {
  return [{ length: item.length, width: item.width, rotated: false },
    ...(item.allowRotation !== false && item.length !== item.width ? [{ length: item.width, width: item.length, rotated: true }] : [])];
}
function fits(item: CargoItem, space: Space | ContainerSpec) {
  return item.height <= space.height + EPS && orientations(item).some(o => o.length <= space.length + EPS && o.width <= space.width + EPS);
}

/** A final insertion pass, independent of beam/iteration caps. It stops only when no
 * tested empty-space/support-edge position accepts another remaining unit. This is
 * local saturation, not a proof of the global 3-D packing optimum. */
export function completeResidualPacking(container: ContainerSpec, cargo: CargoItem[], input: BeamPackingOutput, strategy: LoadingStrategy): BeamPackingOutput {
  const placements = [...input.placements];
  const cargoById = new Map(cargo.map(item => [item.id, item]));
  const counts = new Map<string, number>();
  placements.forEach(p => counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1));
  const left = new Map(cargo.map(item => [item.id, Math.max(0, item.quantity - (counts.get(item.id) ?? 0))]));
  let weight = placements.reduce((sum, p) => sum + p.weightKg, 0);
  let used = placements.reduce((sum, p) => sum + volume(p), 0);
  const waiting = () => cargo.filter(item => (left.get(item.id) ?? 0) > 0);
  if (!waiting().length) return { ...input, remaining: [] };
  let spaces: Space[] = [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }];
  if (waiting().some(item => fits(item, container) && weight + item.weightKg <= container.maxPayloadKg + EPS)) {
    for (const p of placements) spaces = nextSpaces(spaces, p);
  }
  const failures = new Map<string, string>();
  while (waiting().length) {
    let added = false;
    for (const item of waiting().sort((a, b) => (strategy === 'unloading' ? (b.unloadPriority ?? 0) - (a.unloadPriority ?? 0) : 0) || volume(b) - volume(a) || a.id.localeCompare(b.id))) {
      if (!fits(item, container)) { failures.set(item.id, '허용 회전 방향에서도 박스 크기가 적재공간 내부 규격에 맞지 않음'); continue; }
      if (weight + item.weightKg > container.maxPayloadKg + EPS) { failures.set(item.id, '컨테이너 최대 적재 중량 초과 · 남은 허용중량 부족'); continue; }
      if (volume(container) - used < volume(item) - EPS) { failures.set(item.id, '잔여 공간 부족 · 남은 전체 용적이 박스 1개보다 작음'); continue; }
      let geometry = false, support = false, stacking = false;
      let selected: Placement | undefined;
      const blockers = strategy === 'unloading' ? unloadingObstructions(cargo, placements) : 0;
      search: for (const space of [...spaces].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y)) {
        if (!fits(item, space)) continue;
        for (const o of orientations(item)) {
          if (o.length > space.length + EPS || o.width > space.width + EPS) continue;
          const supportEdges = space.z > EPS ? placements.filter(p => Math.abs(p.z + p.height - space.z) < .0015) : [];
          const xs = new Set([space.x, round(space.x + space.length - o.length), ...supportEdges.flatMap(p => [p.x, round(p.x + p.length - o.length)])]);
          const ys = new Set([space.y, round(space.y + space.width - o.width), ...supportEdges.flatMap(p => [p.y, round(p.y + p.width - o.width)])]);
          for (const x of xs) for (const y of ys) {
            if (x < space.x - EPS || x + o.length > space.x + space.length + EPS || y < space.y - EPS || y + o.width > space.y + space.width + EPS) continue;
            const p: Placement = { cargoId: item.id, x, y, z: space.z, ...o, height: item.height, weightKg: item.weightKg };
            if (!isInsideContainer(container, p) || placements.some(q => overlaps(p, q))) continue;
            geometry = true;
            if (!hasAdequateSupport(p, placements, undefined, .999)) continue;
            support = true;
            if (!canPlaceByStackingRules(item, p, placements, cargoById)) continue;
            stacking = true;
            if (strategy === 'unloading' && unloadingObstructions(cargo, [...placements, p]) > blockers) continue;
            selected = p; break search;
          }
        }
      }
      if (selected) {
        placements.push(selected); weight += item.weightKg; used += volume(item);
        left.set(item.id, (left.get(item.id) ?? 0) - 1);
        spaces = nextSpaces(spaces, selected); added = true; break;
      }
      failures.set(item.id, !geometry ? '잔여 공간의 가로·세로·높이에 박스가 맞지 않음 · 허용 회전 및 빈 공간 재검사 완료'
        : !support ? '빈 공간은 있으나 박스 바닥을 충분히 지지할 수 없음'
        : !stacking ? '추가 적재 시 최대 적층단 또는 누적 상부 허용중량 초과'
        : '추가 적재 시 먼저 하역할 화물의 접근 경로가 차단됨');
    }
    if (!added) break;
  }
  return { placements, loadedWeightKg: weight, usedVolumeM3: used,
    remaining: waiting().map(item => ({ cargoId: item.id, quantity: left.get(item.id)!, reason: failures.get(item.id) ?? '현재 배치의 안전한 추가 적재 위치 없음' })) };
}
