import type { AutoCorrectionRecord, CargoItem, ContainerSpec, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';
import { assessShapeQuality } from './shapeQuality';
import { assessZoneUtilization } from './zoneUtilization';

const EPS = 1e-6;

export type ZoneHeightOptimizationResult = {
  placements: Placement[];
  movedCount: number;
  beforeSpikeScore: number;
  afterSpikeScore: number;
  history: AutoCorrectionRecord[];
};

function footprintOverlap(a: Placement, b: Placement) {
  return Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > EPS &&
    Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > EPS;
}

function supportsAnother(index: number, placements: Placement[]) {
  const current = placements[index];
  const top = current.z + current.height;
  return placements.some((other, j) =>
    j !== index && Math.abs(other.z - top) <= EPS && footprintOverlap(current, other),
  );
}

function middleSpikeScore(container: ContainerSpec, placements: Placement[]) {
  const zones = assessZoneUtilization(container, placements);
  const inside = zones.find(z => z.id === 'inside');
  const middle = zones.find(z => z.id === 'middle');
  if (!inside || !middle) return 0;

  const avgExcess = Math.max(0, middle.averageHeightM - inside.averageHeightM - 0.2);
  const peakExcess = Math.max(0, middle.maxHeightM - inside.maxHeightM - 0.25);
  return avgExcess * 3 + peakExcess * 1.5;
}

function inMiddleZone(container: ContainerSpec, placement: Placement) {
  const centerX = placement.x + placement.length / 2;
  return centerX >= container.length / 3 - EPS && centerX < container.length * 2 / 3 - EPS;
}

function samePosition(a: Placement, b: Placement) {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS && Math.abs(a.z - b.z) <= EPS &&
    Math.abs(a.length - b.length) <= EPS && Math.abs(a.width - b.width) <= EPS;
}

function zoneName(container: ContainerSpec, placement: Placement) {
  const centerX = placement.x + placement.length / 2;
  if (centerX < container.length / 3) return '안쪽';
  if (centerX < container.length * 2 / 3) return '중앙';
  return '문쪽';
}

/**
 * 중앙 구역의 뿔 모양 적재를 안전하게 완화한다.
 * - 위 화물을 받치지 않는 중앙 최상단 박스만 이동 후보로 삼는다.
 * - 안쪽 1/3을 먼저 탐색하고, 불가능하면 문쪽 1/3을 탐색한다.
 * - 적층/충돌/지지/상부하중 규칙은 findMixedPlacement에서 동일하게 검증한다.
 * - 중앙 돌출 점수가 줄고 전체 형상 패널티가 악화되지 않을 때만 확정한다.
 */
export function optimizeZoneHeightShape(
  container: ContainerSpec,
  input: Placement[],
  cargoById: Map<string, CargoItem>,
): ZoneHeightOptimizationResult {
  let placements = input.map(p => ({ ...p }));
  const beforeSpikeScore = middleSpikeScore(container, placements);
  let currentSpikeScore = beforeSpikeScore;
  let currentShapePenalty = assessShapeQuality(container, placements).shapePenalty;
  let movedCount = 0;
  const history: AutoCorrectionRecord[] = [];

  if (beforeSpikeScore <= EPS) {
    return { placements, movedCount, beforeSpikeScore, afterSpikeScore: currentSpikeScore, history };
  }

  const zoneLength = container.length / 3;
  const maxMoves = 16;
  const candidates = placements
    .map((p, index) => ({ p, index, top: p.z + p.height }))
    .filter(({ p, index }) => inMiddleZone(container, p) && !supportsAnother(index, placements))
    .sort((a, b) => b.top - a.top || b.p.x - a.p.x);

  for (const originalCandidate of candidates) {
    if (movedCount >= maxMoves || currentSpikeScore <= EPS) break;

    const index = placements.findIndex(current =>
      current.cargoId === originalCandidate.p.cargoId &&
      samePosition(current, originalCandidate.p),
    );
    if (index < 0 || supportsAnother(index, placements)) continue;

    const original = placements[index];
    const item = cargoById.get(original.cargoId);
    if (!item) continue;
    const without = placements.filter((_, j) => j !== index);

    const destinations = [
      findMixedPlacement(container, item, without, cargoById, { minX: 0, maxX: zoneLength, preferDoorSide: false }),
      findMixedPlacement(container, item, without, cargoById, { minX: zoneLength * 2, maxX: container.length, preferDoorSide: false }),
    ].filter((candidate): candidate is Placement => Boolean(candidate));

    let bestTrial: Placement[] | null = null;
    let bestCandidate: Placement | null = null;
    let bestSpike = currentSpikeScore;
    let bestPenalty = currentShapePenalty;

    for (const candidate of destinations) {
      if (samePosition(candidate, original)) continue;
      const trial = [...without, candidate];
      const spike = middleSpikeScore(container, trial);
      const penalty = assessShapeQuality(container, trial).shapePenalty;
      if (spike >= bestSpike - EPS) continue;
      if (penalty > currentShapePenalty + 0.5) continue;
      if (spike < bestSpike - EPS || (Math.abs(spike - bestSpike) <= EPS && penalty < bestPenalty)) {
        bestTrial = trial;
        bestCandidate = candidate;
        bestSpike = spike;
        bestPenalty = penalty;
      }
    }

    if (!bestTrial || !bestCandidate) continue;
    const previousSpike = currentSpikeScore;
    placements = bestTrial;
    currentSpikeScore = bestSpike;
    currentShapePenalty = bestPenalty;
    movedCount += 1;
    history.push({
      kind: 'ZONE_HEIGHT',
      label: '중앙 돌출 자동 보정',
      cargoId: original.cargoId,
      from: { x: original.x, y: original.y, z: original.z },
      to: { x: bestCandidate.x, y: bestCandidate.y, z: bestCandidate.z },
      beforeScore: previousSpike,
      afterScore: bestSpike,
      description: `${original.cargoId}를 중앙에서 ${zoneName(container, bestCandidate)} 구역의 더 낮은 안전 위치로 이동`,
    });
  }

  return {
    placements,
    movedCount,
    beforeSpikeScore,
    afterSpikeScore: currentSpikeScore,
    history,
  };
}
