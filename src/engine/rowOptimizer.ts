import type { CargoItem, ContainerSpec, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';

const EPS = 1e-6;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export type RowOptimizationResult = {
  placements: Placement[];
  movedCount: number;
  flaggedRows: number;
};

type RowInfo = {
  x: number;
  indexes: number[];
  height: number;
  levels: number;
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

function buildRows(placements: Placement[]): RowInfo[] {
  const grouped = new Map<number, number[]>();
  placements.forEach((p, index) => {
    const key = round3(p.x);
    grouped.set(key, [...(grouped.get(key) ?? []), index]);
  });
  return [...grouped.entries()]
    .map(([x, indexes]) => {
      const items = indexes.map((i) => placements[i]);
      return {
        x,
        indexes,
        height: Math.max(...items.map((p) => p.z + p.height)),
        levels: new Set(items.map((p) => round3(p.z))).size,
      };
    })
    .sort((a, b) => a.x - b.x);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 앞/중앙에 남은 저층 행을 문쪽 마지막 혼합 구역으로 밀어낸다.
 * - 대표 행 높이의 50% 미만인 행 또는 사실상 1단 행을 대상으로 한다.
 * - 문쪽 1/3에 이미 있는 행은 건드리지 않는다.
 * - 위 박스를 받치는 박스는 이동하지 않는다.
 * - 기존 혼합 적재의 경계/충돌/지지/적층/상부하중 검사를 그대로 통과해야 한다.
 */
export function moveLowRowsToDoorZone(
  container: ContainerSpec,
  input: Placement[],
  cargoById: Map<string, CargoItem>,
): RowOptimizationResult {
  let placements = input.map((p) => ({ ...p }));
  const doorZoneStart = container.length * 2 / 3;
  const initialRows = buildRows(placements);
  const interiorRows = initialRows.filter((row) => row.x < doorZoneStart - EPS);
  const representativeHeight = median(interiorRows.map((row) => row.height).filter((h) => h > EPS));
  if (representativeHeight <= EPS) return { placements, movedCount: 0, flaggedRows: 0 };

  const lowRowXs = new Set<number>();
  for (const row of interiorRows) {
    const halfHeight = row.height < representativeHeight * 0.5 - EPS;
    const oneLayer = row.levels <= 1 && representativeHeight > row.height * 1.45;
    if (halfHeight || oneLayer) lowRowXs.add(row.x);
  }

  let movedCount = 0;
  const maxMoves = 32;
  // 문쪽에 가까운 저층 행부터 비워 중간에 작은 섬이 남는 것을 줄인다.
  const candidates = placements
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => lowRowXs.has(round3(p.x)))
    .sort((a, b) => b.p.x - a.p.x || b.p.z - a.p.z);

  for (const { p } of candidates) {
    if (movedCount >= maxMoves) break;
    const index = placements.findIndex((current) => current === p || (
      Math.abs(current.x - p.x) <= EPS && Math.abs(current.y - p.y) <= EPS &&
      Math.abs(current.z - p.z) <= EPS && current.cargoId === p.cargoId
    ));
    if (index < 0 || supportsAnother(index, placements)) continue;
    const item = cargoById.get(placements[index].cargoId);
    if (!item) continue;

    const without = placements.filter((_, j) => j !== index);
    const candidate = findMixedPlacement(container, item, without, cargoById, {
      minX: doorZoneStart,
      preferDoorSide: false,
    });
    if (!candidate || candidate.x <= placements[index].x + EPS) continue;

    placements = [...without, candidate];
    movedCount += 1;
  }

  return { placements, movedCount, flaggedRows: lowRowXs.size };
}
