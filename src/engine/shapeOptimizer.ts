import type { CargoItem, ContainerSpec, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';
import { assessShapeQuality } from './shapeQuality';

const EPS = 1e-6;

export type ShapeOptimizationResult = {
  placements: Placement[];
  movedCount: number;
  beforePenalty: number;
  afterPenalty: number;
};

function footprintOverlap(a: Placement, b: Placement) {
  const xOverlap = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y);
  return xOverlap > EPS && yOverlap > EPS;
}

function supportsAnother(index: number, placements: Placement[]) {
  const current = placements[index];
  const top = current.z + current.height;
  return placements.some((other, j) =>
    j !== index &&
    Math.abs(other.z - top) <= EPS &&
    footprintOverlap(current, other),
  );
}

function samePosition(a: Placement, b: Placement) {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS && Math.abs(a.z - b.z) <= EPS &&
    Math.abs(a.length - b.length) <= EPS && Math.abs(a.width - b.width) <= EPS;
}

/**
 * 적재 완료 뒤 모양을 정돈한다.
 * - 위 박스를 받치지 않는 최상단 박스만 이동한다.
 * - 기존 혼합 적재의 안전/적층 검사를 그대로 통과한 위치만 사용한다.
 * - 형상 패널티가 실제로 감소할 때만 이동을 확정한다.
 */
export function optimizeLoadingShape(
  container: ContainerSpec,
  input: Placement[],
  cargoById: Map<string, CargoItem>,
): ShapeOptimizationResult {
  let placements = input.map((p) => ({ ...p }));
  const beforePenalty = assessShapeQuality(container, placements).shapePenalty;
  let currentPenalty = beforePenalty;
  let movedCount = 0;

  // 후처리가 지나치게 비싸지지 않도록 한 번의 패스에서 최대 24개만 확정 이동한다.
  const maxMoves = 24;
  for (let index = placements.length - 1; index >= 0 && movedCount < maxMoves; index -= 1) {
    if (supportsAnother(index, placements)) continue;

    const original = placements[index];
    const item = cargoById.get(original.cargoId);
    if (!item) continue;

    const without = placements.filter((_, j) => j !== index);
    const candidate = findMixedPlacement(container, item, without, cargoById);
    if (!candidate || samePosition(candidate, original)) continue;

    const trial = [...without, candidate];
    const trialPenalty = assessShapeQuality(container, trial).shapePenalty;
    if (trialPenalty >= currentPenalty) continue;

    placements = trial;
    currentPenalty = trialPenalty;
    movedCount += 1;
    // 배열 순서가 바뀌었으므로 다음 반복은 현재 길이 범위 안에서 계속한다.
    index = Math.min(index, placements.length - 1);
  }

  return {
    placements,
    movedCount,
    beforePenalty,
    afterPenalty: currentPenalty,
  };
}
