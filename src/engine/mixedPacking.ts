import type { CargoItem, ContainerSpec, Placement } from './types';
import { allowedOrientations, orientedSize } from '../load-sim';
import { expandCargoToLoadSim } from '../rule-engine/loadSimAdapter';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';

export type MixedPlacementOptions = { minX?: number; maxX?: number; preferDoorSide?: boolean; preferVerticalStack?: boolean };

/** Supplemental insertion uses A orientations/canPlace/final validate, never the retired B rules. */
export function findMixedPlacement(container: ContainerSpec, item: CargoItem, placements: Placement[], cargoById: Map<string, CargoItem>, options: MixedPlacementOptions = {}): Placement | null {
  const source = expandCargoToLoadSim([{ ...item, quantity: 1 }]).items[0];
  if (!source) return null;
  const rows = [...cargoById.values()].map(row => ({ ...row, quantity: Math.max(row.quantity, placements.filter(p => p.cargoId === row.id).length + (row.id === item.id ? 1 : 0)) }));
  if (!rows.some(row => row.id === item.id)) rows.push({ ...item, quantity: 1 });
  const points = new Map<string, { x: number; y: number }>();
  const add = (x: number, y: number) => points.set(`${x}:${y}`, { x, y });
  add(options.minX ?? 0, 0);
  for (const p of placements) { add(p.x + p.length, p.y); add(p.x, p.y + p.width); add(p.x, p.y); }
  const candidates: Placement[] = [];
  for (const point of points.values()) for (const orientation of allowedOrientations(source)) {
    const size = orientedSize(source.dims, orientation);
    const length = size.x / 1000, width = size.y / 1000, height = size.z / 1000;
    const z = placements.reduce((top, p) => Math.min(point.x + length, p.x + p.length) - Math.max(point.x, p.x) > .0005
      && Math.min(point.y + width, p.y + p.width) - Math.max(point.y, p.y) > .0005 ? Math.max(top, p.z + p.height) : top, 0);
    if (point.x < (options.minX ?? 0) || point.x + length > (options.maxX ?? container.length)) continue;
    candidates.push({ cargoId: item.id, ...point, z, length, width, height, weightKg: item.weightKg, rotated: orientation !== 'LWH', loadSimOrientation: orientation });
  }
  const floorFirst = source.forklift ?? source.type !== 'carton';
  candidates.sort((a, b) => (floorFirst ? Number(a.z > .005) - Number(b.z > .005) : 0) || a.x - b.x || a.z - b.z || a.y - b.y || b.length * b.width - a.length * a.width || a.height - b.height);
  for (const candidate of candidates.slice(0, 400)) {
    if (canPlaceWithLoadSim(container, rows, placements, candidate).length) continue;
    if (validateExistingWithLoadSim(container, rows, [...placements, candidate]).validationIssues.length) continue;
    return candidate;
  }
  return null;
}
