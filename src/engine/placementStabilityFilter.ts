import type { CargoItem, ContainerSpec, Placement } from './types';

const TOUCH = 0.004;
const GAP = 0.03;
const MIN_OPEN_FALL_GAP = 0.12;
const MAX_EXPOSED_LAYERS = 2;

type Column = {
  key: string;
  x: number;
  y: number;
  length: number;
  width: number;
  placements: Placement[];
};

type Face = 'xMin' | 'xMax' | 'yMin' | 'yMax';
const FACES: Face[] = ['xMin', 'xMax', 'yMin', 'yMax'];

export type StabilityFilterResult = {
  placements: Placement[];
  removedByCargo: Map<string, number>;
};

function roundKey(value: number) {
  return Math.round(value * 1000) / 1000;
}

function columnKey(p: Placement) {
  return `${roundKey(p.x)}|${roundKey(p.y)}|${roundKey(p.length)}|${roundKey(p.width)}`;
}

function intervalOverlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function areSideAdjacent(a: Column, b: Column) {
  const xTouch = Math.abs((a.x + a.length) - b.x) <= TOUCH || Math.abs((b.x + b.length) - a.x) <= TOUCH;
  const yTouch = Math.abs((a.y + a.width) - b.y) <= TOUCH || Math.abs((b.y + b.width) - a.y) <= TOUCH;
  const yOverlap = intervalOverlap(a.y, a.y + a.width, b.y, b.y + b.width);
  const xOverlap = intervalOverlap(a.x, a.x + a.length, b.x, b.x + b.length);
  const enoughY = yOverlap >= Math.min(a.width, b.width) * 0.3 - TOUCH;
  const enoughX = xOverlap >= Math.min(a.length, b.length) * 0.3 - TOUCH;
  return (xTouch && enoughY) || (yTouch && enoughX);
}

function faceNeighbours(column: Column, columns: Column[], face: Face) {
  return columns.filter((other) => {
    if (other === column || !other.placements.length) return false;
    const xOverlap = intervalOverlap(column.x, column.x + column.length, other.x, other.x + other.length);
    const yOverlap = intervalOverlap(column.y, column.y + column.width, other.y, other.y + other.width);
    if (face === 'xMin') {
      return Math.abs((other.x + other.length) - column.x) <= TOUCH
        && yOverlap >= Math.min(column.width, other.width) * 0.3 - TOUCH;
    }
    if (face === 'xMax') {
      return Math.abs((column.x + column.length) - other.x) <= TOUCH
        && yOverlap >= Math.min(column.width, other.width) * 0.3 - TOUCH;
    }
    if (face === 'yMin') {
      return Math.abs((other.y + other.width) - column.y) <= TOUCH
        && xOverlap >= Math.min(column.length, other.length) * 0.3 - TOUCH;
    }
    return Math.abs((column.y + column.width) - other.y) <= TOUCH
      && xOverlap >= Math.min(column.length, other.length) * 0.3 - TOUCH;
  });
}

function faceTouchesContainer(column: Column, container: ContainerSpec, face: Face) {
  if (face === 'xMin') return column.x <= TOUCH;
  if (face === 'xMax') return column.x + column.length >= container.length - TOUCH;
  if (face === 'yMin') return column.y <= TOUCH;
  return column.y + column.width >= container.width - TOUCH;
}

function nearestFacingGap(column: Column, columns: Column[], face: Face) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of columns) {
    if (other === column || !other.placements.length) continue;
    const xOverlap = intervalOverlap(column.x, column.x + column.length, other.x, other.x + other.length);
    const yOverlap = intervalOverlap(column.y, column.y + column.width, other.y, other.y + other.width);
    let gap = Number.POSITIVE_INFINITY;
    if (face === 'xMin' && other.x + other.length <= column.x + TOUCH
      && yOverlap >= Math.min(column.width, other.width) * 0.3 - TOUCH) {
      gap = column.x - (other.x + other.length);
    } else if (face === 'xMax' && other.x >= column.x + column.length - TOUCH
      && yOverlap >= Math.min(column.width, other.width) * 0.3 - TOUCH) {
      gap = other.x - (column.x + column.length);
    } else if (face === 'yMin' && other.y + other.width <= column.y + TOUCH
      && xOverlap >= Math.min(column.length, other.length) * 0.3 - TOUCH) {
      gap = column.y - (other.y + other.width);
    } else if (face === 'yMax' && other.y >= column.y + column.width - TOUCH
      && xOverlap >= Math.min(column.length, other.length) * 0.3 - TOUCH) {
      gap = other.y - (column.y + column.width);
    }
    if (gap >= -TOUCH) nearest = Math.min(nearest, Math.max(0, gap));
  }
  return nearest;
}

function dangerousOpenClearance(column: Column, face: Face) {
  const fallDimension = face === 'xMin' || face === 'xMax' ? column.length : column.width;
  return Math.max(MIN_OPEN_FALL_GAP, fallDimension * 0.4);
}

function gapBetween(a: Column, b: Column) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.length, b.x + b.length));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.width, b.y + b.width));
  return Math.hypot(dx, dy);
}

function buildColumns(placements: Placement[]) {
  const map = new Map<string, Column>();
  for (const placement of placements) {
    const key = columnKey(placement);
    const column = map.get(key) ?? {
      key,
      x: placement.x,
      y: placement.y,
      length: placement.length,
      width: placement.width,
      placements: [],
    };
    column.placements.push(placement);
    map.set(key, column);
  }
  for (const column of map.values()) column.placements.sort((a, b) => a.z - b.z);
  return [...map.values()];
}

function columnTop(column: Column) {
  const top = column.placements[column.placements.length - 1];
  return top ? top.z + top.height : 0;
}

function topCargoId(column: Column) {
  return column.placements[column.placements.length - 1]?.cargoId ?? '';
}

function countSameSkuNeighbours(column: Column, columns: Column[]) {
  const cargoId = topCargoId(column);
  return columns.filter(other => other !== column && topCargoId(other) === cargoId && areSideAdjacent(column, other)).length;
}

function trimTop(column: Column, removed: Placement[]) {
  const top = column.placements.pop();
  if (top) removed.push(top);
}

/**
 * Operational shape guard applied after the geometric packer.
 *
 * Fall and overturn prevention is a hard constraint and outranks CG centering / fill rate.
 * Every horizontal face is checked independently, so same-height neighbours on the left/right
 * cannot hide a dangerous height cliff or a large open fall zone in front/behind the stack.
 *
 * Rules:
 * - a stack facing a sufficiently large open interior gap may expose at most two layers;
 * - adjacent stacks may rise by at most roughly one box layer at a time, producing a staircase;
 * - container walls count as restraint;
 * - only top boxes are removed, so retained boxes never lose vertical support.
 */
export function filterOperationallyUnsafeShape(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
): StabilityFilterResult {
  if (placements.length <= 1) return { placements, removedByCargo: new Map() };

  const cargoById = new Map(cargo.map(item => [item.id, item]));
  const columns = buildColumns(placements);
  const removed: Placement[] = [];

  // Repeat because trimming one edge can expose the next row and must create a gradual staircase.
  for (let pass = 0; pass < 24; pass += 1) {
    let changed = false;

    for (const column of columns) {
      if (!column.placements.length) continue;
      const neighbours = columns.filter(other => other !== column && other.placements.length && areSideAdjacent(column, other));
      const layers = column.placements.length;
      const top = column.placements[column.placements.length - 1];
      const item = cargoById.get(top.cargoId);
      const sameSkuNeighbours = countSameSkuNeighbours(column, columns);

      // A vertical stack standing completely by itself is never allowed to become a tower.
      if (layers > 1 && neighbours.length === 0) {
        trimTop(column, removed);
        changed = true;
        continue;
      }

      // Three or more layers need a same-SKU footprint at least two boxes wide.
      // Five or more layers need a wider block, not a 1x1 / 1x2 chimney.
      if (layers >= 3 && sameSkuNeighbours < 1) {
        trimTop(column, removed);
        changed = true;
        continue;
      }
      if (layers >= 5 && sameSkuNeighbours < 2) {
        trimTop(column, removed);
        changed = true;
        continue;
      }

      let directionalRisk = false;
      for (const face of FACES) {
        if (faceTouchesContainer(column, container, face)) continue;
        const facing = faceNeighbours(column, columns, face);

        if (facing.length > 0) {
          // Use the lowest significant facing neighbour. A tall neighbour elsewhere on another
          // face must not mask a low row directly in front of this stack.
          const facingTop = Math.min(...facing.map(columnTop));
          const tallestFacingLayer = Math.max(...facing.map(n => n.placements[n.placements.length - 1]?.height ?? 0));
          const allowedCliff = Math.max(top.height, tallestFacingLayer, item?.height ?? 0, 0.25);
          if (columnTop(column) - facingTop > allowedCliff + TOUCH) {
            trimTop(column, removed);
            changed = true;
            directionalRisk = true;
            break;
          }
          continue;
        }

        // No touching restraint on this face. A tiny seam is tolerated, but a gap large enough
        // for a box/stack to rotate into is treated as a fall zone. Open edges stay low (<= 2 layers).
        const gap = nearestFacingGap(column, columns, face);
        if (gap > dangerousOpenClearance(column, face) + TOUCH && layers > MAX_EXPOSED_LAYERS) {
          trimTop(column, removed);
          changed = true;
          directionalRisk = true;
          break;
        }
      }
      if (directionalRisk) continue;
    }

    if (!changed) break;
  }

  // Remove isolated single-box islands when the rest of the load already forms a block.
  // A small end gap is tolerated, but a visibly detached box is not.
  const nonEmpty = columns.filter(column => column.placements.length);
  if (nonEmpty.length >= 4) {
    for (const column of nonEmpty) {
      if (column.placements.length !== 1) continue;
      const nearest = Math.min(...nonEmpty.filter(other => other !== column).map(other => gapBetween(column, other)));
      const p = column.placements[0];
      const touchesBoundary = p.x <= TOUCH || p.y <= TOUCH || p.x + p.length >= container.length - TOUCH || p.y + p.width >= container.width - TOUCH;
      if (nearest > GAP && !touchesBoundary) {
        trimTop(column, removed);
      }
    }
  }

  const kept = columns.flatMap(column => column.placements).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  const removedByCargo = new Map<string, number>();
  for (const placement of removed) removedByCargo.set(placement.cargoId, (removedByCargo.get(placement.cargoId) ?? 0) + 1);
  return { placements: kept, removedByCargo };
}
