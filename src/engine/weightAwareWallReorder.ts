import type { ContainerSpec, Placement } from './types';

const EPS = 1e-7;
const BEAM_WIDTH = 24;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

type Axis = 'x' | 'y';
type IndexedPlacement = { index: number; placement: Placement };
type Slice = {
  id: number;
  start: number;
  end: number;
  length: number;
  weightKg: number;
  localMoment: number;
  indexes: number[];
  originalOrder: number;
};

function axisStart(placement: Placement, axis: Axis) {
  return axis === 'x' ? placement.x : placement.y;
}

function axisSize(placement: Placement, axis: Axis) {
  return axis === 'x' ? placement.length : placement.width;
}

function uniqueSorted(values: number[]) {
  return [...new Set(values.map(round6))].sort((a, b) => a - b);
}

/**
 * StrictWallPacker 결과에서 박스가 가로지르지 않는 절단면만 찾는다.
 * 이 절단면 사이 구간은 하나의 안전한 강체 slice로 이동할 수 있다.
 * 상부 박스가 경계를 걸치면 절단면 후보에서 자동 제외되므로 지지 관계가 깨지지 않는다.
 */
function buildSlices(placements: Placement[], indexes: number[], axis: Axis): Slice[] {
  if (indexes.length < 2) return [];
  const items: IndexedPlacement[] = indexes.map(index => ({ index, placement: placements[index] }));
  const min = Math.min(...items.map(item => axisStart(item.placement, axis)));
  const max = Math.max(...items.map(item => axisStart(item.placement, axis) + axisSize(item.placement, axis)));
  if (!(max > min + EPS)) return [];

  const candidates = uniqueSorted(items.flatMap(item => {
    const start = axisStart(item.placement, axis);
    return [start, start + axisSize(item.placement, axis)];
  })).filter(value => value > min + EPS && value < max - EPS);

  const cuts = candidates.filter(cut => !items.some(item => {
    const start = axisStart(item.placement, axis);
    const end = start + axisSize(item.placement, axis);
    return start < cut - EPS && end > cut + EPS;
  }));
  const boundaries = [min, ...cuts, max];
  const slices: Slice[] = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const members = items.filter(item => {
      const itemStart = axisStart(item.placement, axis);
      const itemEnd = itemStart + axisSize(item.placement, axis);
      return itemStart >= start - EPS && itemEnd <= end + EPS;
    });

    // 빈 구간은 작업 통로/의도된 gap일 수 있다. 이 경우 압축하거나 gap 위치를 바꾸지 않는다.
    if (!members.length) return [];
    const weightKg = members.reduce((sum, item) => sum + item.placement.weightKg, 0);
    const localMoment = members.reduce((sum, item) => {
      const center = axisStart(item.placement, axis) + axisSize(item.placement, axis) / 2;
      return sum + (center - start) * item.placement.weightKg;
    }, 0);
    slices.push({
      id: i,
      start,
      end,
      length: end - start,
      weightKg,
      localMoment,
      indexes: members.map(item => item.index),
      originalOrder: i,
    });
  }

  // 같은 박스가 두 slice에 중복 귀속되는 비정상 경계라면 안전하게 아무것도 하지 않는다.
  const assigned = slices.flatMap(slice => slice.indexes);
  if (assigned.length !== indexes.length || new Set(assigned).size !== indexes.length) return [];
  return slices;
}

function sequenceDeviation(sequence: Slice[]) {
  if (!sequence.length) return 0;
  const totalWeight = sequence.reduce((sum, slice) => sum + slice.weightKg, 0);
  const totalLength = sequence.reduce((sum, slice) => sum + slice.length, 0);
  if (totalWeight <= EPS || totalLength <= EPS) return 0;
  let cursor = 0;
  let moment = 0;
  for (const slice of sequence) {
    moment += slice.localMoment + cursor * slice.weightKg;
    cursor += slice.length;
  }
  const cog = moment / totalWeight;
  return Math.abs(cog - totalLength / 2) / totalLength;
}

function sequenceKey(sequence: Slice[]) {
  return sequence.map(slice => slice.id).join(',');
}

/**
 * 무거운 slice부터 하나씩 삽입하는 작은 beam search.
 * 공간 사용률을 바꾸지 않고, 동일 footprint 안에서 중량중심이 중앙에 가까운 순서만 찾는다.
 */
function bestSequence(slices: Slice[]) {
  if (slices.length < 2) return slices;
  const insertionOrder = [...slices].sort((a, b) =>
    b.weightKg - a.weightKg
    || b.length - a.length
    || a.originalOrder - b.originalOrder,
  );
  let beam: Slice[][] = [[]];

  for (const slice of insertionOrder) {
    const next = new Map<string, Slice[]>();
    for (const sequence of beam) {
      for (let position = 0; position <= sequence.length; position += 1) {
        const candidate = [...sequence.slice(0, position), slice, ...sequence.slice(position)];
        next.set(sequenceKey(candidate), candidate);
      }
    }
    beam = [...next.values()]
      .sort((a, b) => sequenceDeviation(a) - sequenceDeviation(b) || sequenceKey(a).localeCompare(sequenceKey(b)))
      .slice(0, BEAM_WIDTH);
  }

  const original = [...slices].sort((a, b) => a.originalOrder - b.originalOrder);
  const best = beam[0] ?? original;
  return sequenceDeviation(best) + EPS < sequenceDeviation(original) ? best : original;
}

function reorderAxis(placements: Placement[], indexes: number[], axis: Axis) {
  const slices = buildSlices(placements, indexes, axis);
  if (slices.length < 2) return placements;
  const sequence = bestSequence(slices);
  const originalKey = sequenceKey([...slices].sort((a, b) => a.originalOrder - b.originalOrder));
  if (sequenceKey(sequence) === originalKey) return placements;

  const base = Math.min(...slices.map(slice => slice.start));
  const shiftByIndex = new Map<number, number>();
  let cursor = base;
  for (const slice of sequence) {
    const shift = cursor - slice.start;
    for (const index of slice.indexes) shiftByIndex.set(index, shift);
    cursor += slice.length;
  }

  return placements.map((placement, index) => {
    const shift = shiftByIndex.get(index);
    if (shift == null || Math.abs(shift) <= EPS) return placement;
    return axis === 'x'
      ? { ...placement, x: round6(placement.x + shift) }
      : { ...placement, y: round6(placement.y + shift) };
  });
}

function allIndexes(placements: Placement[]) {
  return placements.map((_, index) => index);
}

/**
 * StrictWallPacker의 '빈 통로 없는 연속 wall' 안전성을 유지하면서 중량 배치를 개선한다.
 *
 * 1) X 절단면으로 독립 wall/column을 찾는다.
 * 2) 각 wall 내부에서 Y slice 순서를 중량 기준으로 재배치해 좌우 편중을 줄인다.
 * 3) X slice 순서를 재배치해 앞뒤 편중을 줄인다.
 * 4) slice 내부 상대좌표는 그대로이므로 충돌/적층/지지 관계는 보존된다.
 *
 * 이 단계는 공간을 새로 만들거나 압축하지 않는다. 빈 gap이 감지되면 해당 축은 건드리지 않는다.
 */
export function rebalanceStrictWallPlacements(container: ContainerSpec, placements: Placement[]): Placement[] {
  if (placements.length < 2) return placements;
  let next = placements.map(placement => ({ ...placement }));

  const xSlices = buildSlices(next, allIndexes(next), 'x');
  for (const xSlice of xSlices) {
    next = reorderAxis(next, xSlice.indexes, 'y');
  }
  next = reorderAxis(next, allIndexes(next), 'x');

  // 수치 오차 방어. 같은 footprint를 유지하므로 보통 실행되지 않는다.
  const outOfBounds = next.some(placement =>
    placement.x < -EPS
    || placement.y < -EPS
    || placement.x + placement.length > container.length + EPS
    || placement.y + placement.width > container.width + EPS,
  );
  return outOfBounds ? placements : next;
}
