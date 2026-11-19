import type { StagingUnit } from './stagingInventory';
import type { StagingBounds } from './stagingYardLayout';
import { stagingSceneBounds, stagingUnitVehicleBox, type StagingDragPreview } from './stagingDragCues';

/** Where a drag is aimed. The pointer gives a rough floor position; this turns it into the
 * position the operator most likely means: on top of the cargo under it, and flush
 * against a wall or a neighbour that is nearly touched.
 *
 * It only chooses the coordinates that are then assessed. It accepts nothing: bounds,
 * collision, support, stack levels, loads and every other verdict stay with the command
 * owner (`engine/stagingCommands.ts`), which may still reject the position chosen here. */
export const STAGING_DRAG_TARGET_PROFILE = Object.freeze({
  /** A face this close to a wall or to a neighbour's face is pulled flush against it. */
  magnetM: .1,
});

type Position = { x: number; y: number; z: number };
type Container = { length: number; width: number };
type Body = { id: string; kind: StagingUnit['kind']; x: number; y: number; z: number; length: number; width: number; height: number };
export type StagingDragTarget = Position & {
  /** The placed unit this position rests on, or null on the floor. */
  stackedOn: string | null;
  /** Whether each axis was pulled flush or aligned rather than left where the pointer put it. */
  magnet: { x: boolean; y: boolean };
};

const EPS = 1e-6;
const spans = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - EPS && b0 < a1 - EPS;

function nearest(value: number, candidates: readonly number[], reach: number): number | null {
  let best: number | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate) || Math.abs(candidate - value) > reach + EPS) continue;
    if (best === null || Math.abs(candidate - value) < Math.abs(best - value) - EPS) best = candidate;
  }
  return best;
}

export function stagingDragTarget(unit: StagingUnit, pointer: Position, container: Container, placed: readonly StagingUnit[],
  profile: { magnetM: number } = STAGING_DRAG_TARGET_PROFILE): StagingDragTarget {
  const { length, width, height } = unit;
  const free: StagingDragTarget = { x: pointer.x, y: pointer.y, z: Math.max(0, pointer.z), stackedOn: null, magnet: { x: false, y: false } };
  if (![pointer.x, pointer.y, length, width, height].every(Number.isFinite) || length <= 0 || width <= 0 || height <= 0) return free;
  const others: Body[] = placed.flatMap(other => {
    const box = other.id === unit.id ? null : stagingUnitVehicleBox(other);
    return box ? [{ id: other.id, kind: other.kind, ...box }] : [];
  });
  // What the middle of the dragged unit is over decides the level: the highest of it.
  const centreX = pointer.x + length / 2, centreY = pointer.y + width / 2;
  let support: Body | null = null;
  for (const other of others) {
    // A pallet rides only on another pallet; loose cargo can never carry one.
    if (unit.kind === 'pallet' && other.kind !== 'pallet') continue;
    if (centreX < other.x - EPS || centreX > other.x + other.length + EPS || centreY < other.y - EPS || centreY > other.y + other.width + EPS) continue;
    if (!support || other.z + other.height > support.z + support.height + EPS) support = other;
  }
  const z = support ? support.z + support.height : 0;
  // Pallets of one plan share one footprint, so the upper one sits exactly on the lower.
  if (support && unit.kind === 'pallet') return { x: support.x, y: support.y, z, stackedOn: support.id, magnet: { x: true, y: true } };

  const reach = Number.isFinite(profile.magnetM) ? Math.max(0, profile.magnetM) : 0;
  const level = others.filter(other => spans(other.z, other.z + other.height, z, z + height));
  const near = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 + reach + EPS && b0 < a1 + reach + EPS;
  // Flush against the walls, against the faces of neighbours it would touch, in line with
  // the edges of neighbours right beside it, and inside the edges of what it rests on.
  const xs = [0, container.length - length,
    ...level.flatMap(other => spans(other.y, other.y + other.width, pointer.y, pointer.y + width) ? [other.x - length, other.x + other.length] : []),
    ...level.flatMap(other => near(other.y, other.y + other.width, pointer.y, pointer.y + width) && !spans(other.y, other.y + other.width, pointer.y, pointer.y + width) ? [other.x, other.x + other.length - length] : []),
    ...(support ? [support.x, support.x + support.length - length] : [])];
  const snappedX = nearest(pointer.x, xs, reach), x = snappedX ?? pointer.x;
  const ys = [0, container.width - width,
    ...level.flatMap(other => spans(other.x, other.x + other.length, x, x + length) ? [other.y - width, other.y + other.width] : []),
    ...level.flatMap(other => near(other.x, other.x + other.length, x, x + length) && !spans(other.x, other.x + other.length, x, x + length) ? [other.y, other.y + other.width - width] : []),
    ...(support ? [support.y, support.y + support.width - width] : [])];
  const snappedY = nearest(pointer.y, ys, reach), y = snappedY ?? pointer.y;
  return { x, y, z, stackedOn: support?.id ?? null, magnet: { x: snappedX !== null, y: snappedY !== null } };
}

/** The placed unit a raised drag candidate would rest on, as a scene box, so the view can
 * show what it is being put on. Display only; none for a candidate on the floor. */
export function stagingPreviewSupport(units: readonly StagingUnit[], preview: StagingDragPreview | null | undefined, container: Container): StagingBounds | null {
  if (!preview) return null;
  const { candidate } = preview;
  if (![candidate.x, candidate.y, candidate.z, candidate.length, candidate.width].every(Number.isFinite) || candidate.z <= .001) return null;
  const centreX = candidate.x + candidate.length / 2, centreY = candidate.y + candidate.width / 2;
  for (const unit of units) {
    if (unit.id === preview.unitId) continue;
    const box = stagingUnitVehicleBox(unit);
    if (!box || Math.abs(box.z + box.height - candidate.z) > .001) continue;
    if (centreX < box.x - EPS || centreX > box.x + box.length + EPS || centreY < box.y - EPS || centreY > box.y + box.width + EPS) continue;
    return stagingSceneBounds(box, container);
  }
  return null;
}
