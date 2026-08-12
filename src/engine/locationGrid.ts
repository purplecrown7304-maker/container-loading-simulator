import type { Placement } from './types';

export type PlacementAddress = {
  row: number;
  column: number;
  layer: number;
  zone: '안쪽' | '중앙' | '문쪽';
};

const EPS = 1e-6;

function cluster(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[] = [];
  for (const value of sorted) {
    if (groups.length === 0 || Math.abs(value - groups[groups.length - 1]) > EPS) groups.push(value);
  }
  return groups;
}

export function buildPlacementAddresses(placements: Placement[], containerLength: number): PlacementAddress[] {
  const xs = cluster(placements.map((p) => p.x));
  const ys = cluster(placements.map((p) => p.y));
  const zs = cluster(placements.map((p) => p.z));

  return placements.map((placement) => {
    const centerX = placement.x + placement.length / 2;
    const ratio = containerLength > 0 ? centerX / containerLength : 0;
    const zone: PlacementAddress['zone'] = ratio < 1 / 3 ? '안쪽' : ratio < 2 / 3 ? '중앙' : '문쪽';
    return {
      row: xs.findIndex((value) => Math.abs(value - placement.x) <= EPS) + 1,
      column: ys.findIndex((value) => Math.abs(value - placement.y) <= EPS) + 1,
      layer: zs.findIndex((value) => Math.abs(value - placement.z) <= EPS) + 1,
      zone,
    };
  });
}
