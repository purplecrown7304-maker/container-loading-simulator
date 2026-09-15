import { isInsideContainer, overlaps } from './constraints';
import { assessPlacementSupport } from './support';
import { canPlaceByStackingRules } from './stacking';
import type { StrictWallOutput, StrictWallStrategy } from './strictWallPacker';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-9;
const CONTACT_TOLERANCE_M = 0.0015;
const MIN_MIXED_TOP_SUPPORT_RATIO = 0.995;
const MAX_MIXED_TOP_FILL_STEPS = 1200;

const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const volumeOf = (item: CargoItem) => item.length * item.width * item.height;

type Orientation = {
  length: number;
  width: number;
  rotated: boolean;
};

type TopCandidate = {
  item: CargoItem;
  placement: Placement;
  supportRatio: number;
  score: number;
};

function orientations(item: CargoItem): Orientation[] {
  const normal = { length: item.length, width: item.width, rotated: false };
  if (item.allowRotation === false || Math.abs(item.length - item.width) <= EPS) return [normal];
  return [normal, { length: item.width, width: item.length, rotated: true }];
}

function topOf(placement: Placement) {
  return round6(placement.z + placement.height);
}

function overlapArea(a: Placement, b: Placement) {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
  return x * y;
}

function supportLevels(placements: Placement[]) {
  return [...new Set(placements.map(topOf))].sort((a, b) => a - b);
}

function supportsAtLevel(placements: Placement[], z: number) {
  return placements.filter((placement) => Math.abs(topOf(placement) - z) <= CONTACT_TOLERANCE_M);
}

function candidateAnchors(
  supports: Placement[],
  length: number,
  width: number,
  container: ContainerSpec,
) {
  const seen = new Set<string>();
  const result: Array<{ x: number; y: number }> = [];

  const push = (x: number, y: number) => {
    const rx = round6(x);
    const ry = round6(y);
    if (rx < -EPS || ry < -EPS) return;
    if (rx + length > container.length + EPS || ry + width > container.width + EPS) return;
    const key = `${rx.toFixed(6)}:${ry.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ x: rx, y: ry });
  };

  // 모서리 정렬 후보를 먼저 만든다. 작은 박스를 큰 박스 중앙에 먼저 놓아
  // 나머지 상부 면적을 네 조각으로 깨뜨리는 것보다, 가장자리부터 타일처럼 채워야
  // 후속 박스를 더 많이 적재할 수 있다.
  for (const support of supports) {
    const xs = [support.x, support.x + support.length - length];
    const ys = [support.y, support.y + support.width - width];
    for (const x of xs) for (const y of ys) push(x, y);
  }

  return result;
}

function directSupports(candidate: Placement, placements: Placement[]) {
  return placements.filter((lower) =>
    Math.abs(lower.z + lower.height - candidate.z) <= CONTACT_TOLERANCE_M
    && overlapArea(candidate, lower) > EPS,
  );
}

function candidateScore(
  candidate: Placement,
  item: CargoItem,
  supportRatio: number,
  placements: Placement[],
  container: ContainerSpec,
  strategy: StrictWallStrategy,
) {
  const contacts = directSupports(candidate, placements);
  const sameSkuContacts = contacts.filter((support) => support.cargoId === item.id).length;
  const centerX = candidate.x + candidate.length / 2;
  const centerY = candidate.y + candidate.width / 2;
  const xDistance = Math.abs(centerX - container.length / 2) / Math.max(EPS, container.length / 2);
  const yDistance = Math.abs(centerY - container.width / 2) / Math.max(EPS, container.width / 2);
  const centerPenalty = xDistance + yDistance;
  const zNorm = (candidate.z + candidate.height / 2) / Math.max(EPS, container.height);
  const volumeNorm = volumeOf(item) / Math.max(EPS, container.length * container.width * container.height);

  let score = supportRatio * 2000 + volumeNorm * 800 - zNorm * 120 + sameSkuContacts * 6;
  if (strategy === 'capacity') score += volumeNorm * 1000 - centerPenalty * 3;
  if (strategy === 'stability') score -= zNorm * 240 + centerPenalty * 35;
  if (strategy === 'unloading') score -= zNorm * 100 + centerPenalty * 5;
  return score;
}

function bestCandidateAtLevel(
  z: number,
  currentPlacements: Placement[],
  remaining: Map<string, number>,
  cargo: CargoItem[],
  cargoById: Map<string, CargoItem>,
  container: ContainerSpec,
  loadedWeightKg: number,
  strategy: StrictWallStrategy,
): TopCandidate | null {
  const supports = supportsAtLevel(currentPlacements, z);
  if (!supports.length) return null;

  let best: TopCandidate | null = null;
  for (const item of cargo) {
    if ((remaining.get(item.id) ?? 0) <= 0) continue;
    if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) continue;

    for (const orientation of orientations(item)) {
      const anchors = candidateAnchors(supports, orientation.length, orientation.width, container);
      for (const anchor of anchors) {
        const candidate: Placement = {
          cargoId: item.id,
          x: anchor.x,
          y: anchor.y,
          z,
          length: orientation.length,
          width: orientation.width,
          height: item.height,
          weightKg: item.weightKg,
          rotated: orientation.rotated,
        };
        if (!isInsideContainer(container, candidate)) continue;
        if (currentPlacements.some((placement) => overlaps(candidate, placement))) continue;

        const support = assessPlacementSupport(
          candidate,
          currentPlacements,
          undefined,
          MIN_MIXED_TOP_SUPPORT_RATIO,
        );
        if (!support.supported) continue;
        if (!canPlaceByStackingRules(item, candidate, currentPlacements, cargoById)) continue;

        const score = candidateScore(candidate, item, support.supportRatio, currentPlacements, container, strategy);
        if (
          !best
          || score > best.score + EPS
          || (Math.abs(score - best.score) <= EPS && item.id.localeCompare(best.item.id) < 0)
        ) {
          best = { item, placement: candidate, supportRatio: support.supportRatio, score };
        }
      }
    }
  }
  return best;
}

/**
 * StrictWall이 바닥/벽 단위의 안정적인 기본 형상을 만든 뒤 남은 박스를
 * 이미 적재된 박스의 상부 면에 추가 배치한다.
 *
 * 기존 topFill은 위/아래 박스의 바닥면 크기가 사실상 완전히 같을 때만 후보를 만들었다.
 * 이 보정은 서로 다른 규격도 허용하되 다음 조건을 모두 강제한다.
 * - 후보 바닥면의 99.5% 이상이 바로 아래 박스들에 의해 지지됨
 * - 후보 무게중심이 지지영역 안에 있음
 * - maxStackLayers / maxTopLoadKg 누적 규칙 통과
 * - 컨테이너 경계/충돌/최대 중량 통과
 *
 * 따라서 큰 박스 위에 작은 박스를 여러 개 올리거나, 같은 높이의 작은 박스 여러 개가
 * 하나의 큰 박스를 완전히 받치는 경우처럼 실제로 지지면이 확보된 혼합 적층만 허용한다.
 */
export function fillSupportedTopVoids(
  container: ContainerSpec,
  cargo: CargoItem[],
  packed: StrictWallOutput,
  strategy: StrictWallStrategy,
): StrictWallOutput {
  if (!packed.remaining.length || !packed.placements.length) return packed;

  const cargoById = new Map(cargo.map((item) => [item.id, item]));
  const remaining = new Map<string, number>();
  for (const entry of packed.remaining) remaining.set(entry.cargoId, Math.max(0, entry.quantity));

  let placements = [...packed.placements];
  let loadedWeightKg = packed.loadedWeightKg;
  let usedVolumeM3 = packed.usedVolumeM3;
  const requestedExtra = [...remaining.values()].reduce((sum, quantity) => sum + quantity, 0);
  const maxSteps = Math.min(MAX_MIXED_TOP_FILL_STEPS, requestedExtra);

  for (let step = 0; step < maxSteps; step += 1) {
    if ([...remaining.values()].every((quantity) => quantity <= 0)) break;

    let selected: TopCandidate | null = null;
    for (const z of supportLevels(placements)) {
      const candidate = bestCandidateAtLevel(
        z,
        placements,
        remaining,
        cargo,
        cargoById,
        container,
        loadedWeightKg,
        strategy,
      );
      if (candidate) {
        selected = candidate;
        break; // 가능한 가장 낮은 상부면부터 채운다.
      }
    }

    if (!selected) break;
    placements = [...placements, selected.placement];
    remaining.set(selected.item.id, Math.max(0, (remaining.get(selected.item.id) ?? 0) - 1));
    loadedWeightKg += selected.item.weightKg;
    usedVolumeM3 += volumeOf(selected.item);
  }

  const finalRemaining = packed.remaining.flatMap((entry) => {
    const quantity = Math.max(0, remaining.get(entry.cargoId) ?? 0);
    if (!quantity) return [];
    const weightLimited = loadedWeightKg + (cargoById.get(entry.cargoId)?.weightKg ?? 0) > container.maxPayloadKg + EPS;
    return [{
      ...entry,
      quantity,
      reason: weightLimited
        ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함'
        : '연속 벽 적재 후 상부의 99.5% 지지·적층강도 조건을 만족하는 안전 위치를 찾지 못함',
    }];
  });

  return {
    placements,
    remaining: finalRemaining,
    loadedWeightKg,
    usedVolumeM3,
  };
}
