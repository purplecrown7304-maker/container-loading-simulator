import { overlaps } from './engine/constraints';
import type { Placement } from './engine/types';
import type { StagingUnit } from './stagingInventory';
import type { StagingBounds } from './stagingYardLayout';

/** Display cues for the staging view: which placed cargo a rejected drag runs into, and
 * which unit the pointer is over. Nothing here validates, accepts or changes a placement;
 * the command owner's assessment stays the only verdict. */

type EngineBox = Pick<Placement, 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>;
type Container = { length: number; width: number };
export type StagingDragPreview = { unitId: string; candidate: Placement; valid: boolean };

/** More outlines than this would hide the candidate instead of explaining it. */
export const STAGING_CONFLICT_OUTLINE_LIMIT = 24;
/** The red of a rejected candidate, so cargo and candidate read as one conflict. */
export const STAGING_CONFLICT_COLOR = '#dc2626';
/** Pointer-over outline, distinct from the blue selection and the red/green candidate. */
export const STAGING_HOVER_COLOR = '#0891b2';

/** The space a unit in this vehicle takes up, in engine axes: the carton itself, or the
 * whole pallet with its load and packaging. */
export function stagingUnitVehicleBox(unit: StagingUnit): EngineBox | null {
  if (unit.location !== 'vehicle') return null;
  const source = unit.kind === 'pallet' ? unit.pallet : unit.placement;
  if (!source) return null;
  const box = unit.kind === 'pallet'
    ? { x: source.x, y: source.y, z: source.z, length: unit.length, width: unit.width, height: unit.height }
    : { x: source.x, y: source.y, z: source.z, length: source.length, width: source.width, height: source.height };
  return Object.values(box).every(Number.isFinite) && box.length > 0 && box.width > 0 && box.height > 0 ? box : null;
}

/** Engine axes are length X, width Y, height Z; the scene is centred on the floor with Y up. */
export function stagingSceneBounds(box: EngineBox, container: Container): StagingBounds {
  return {
    min: [box.x - container.length / 2, box.z, box.y - container.width / 2],
    max: [box.x + box.length - container.length / 2, box.z + box.height, box.y + box.width - container.width / 2],
  };
}

/** Units already in the vehicle that a rejected candidate overlaps, as scene boxes in
 * inventory order. A candidate that was rejected for another reason (outside, unsupported,
 * overweight) yields none, and the unit being moved never counts against itself. */
export function stagingPreviewConflicts(units: readonly StagingUnit[], preview: StagingDragPreview | null | undefined, container: Container): StagingBounds[] {
  if (!preview || preview.valid) return [];
  const { candidate } = preview;
  if (![candidate.x, candidate.y, candidate.z, candidate.length, candidate.width, candidate.height].every(Number.isFinite)) return [];
  const conflicts: StagingBounds[] = [];
  for (const unit of units) {
    if (unit.id === preview.unitId) continue;
    const box = stagingUnitVehicleBox(unit);
    if (!box || !overlaps(candidate, box as Placement)) continue;
    conflicts.push(stagingSceneBounds(box, container));
    if (conflicts.length === STAGING_CONFLICT_OUTLINE_LIMIT) break;
  }
  return conflicts;
}

/** Scene box of one unit in this vehicle, for the pointer-over outline. */
export function stagingUnitSceneBounds(units: readonly StagingUnit[], id: string | null | undefined, container: Container): StagingBounds | null {
  const unit = id ? units.find(item => item.id === id) : undefined;
  const box = unit ? stagingUnitVehicleBox(unit) : null;
  return box ? stagingSceneBounds(box, container) : null;
}

export type StagingHoverSource = 'yard' | 'vehicle';
type Hit = { object: { userData: Record<string, unknown> } };

/** Which kind of unit a pointer hit belongs to; walls, floors and guides are neither. */
export function stagingHitSource(hit: Hit | null | undefined): StagingHoverSource | null {
  const kind = hit?.object.userData.kind;
  return kind === 'stagingCargo' ? 'yard' : kind === 'cargo' || kind === 'support' ? 'vehicle' : null;
}

/** The nearest hit that is a unit. Hits arrive nearest first; what lies in front of the
 * first unit is equipment or scenery the pointer passes through, exactly as a click does. */
export function nearestStagingHit<T extends Hit>(hits: readonly T[] | null | undefined): T | null {
  return hits?.find(hit => stagingHitSource(hit) !== null) ?? null;
}

/** Whether a drag of this unit is assessed at all. The command owner applies this same
 * rule before it previews a drag, so the cursor never promises a move it will ignore. */
export function stagingUnitDraggable(unit: StagingUnit | null | undefined): boolean {
  return Boolean(unit) && unit!.location !== 'other-vehicle' && !unit!.requiresPackaging
    && !(unit!.location === 'yard' && unit!.verdict === 'error');
}

export type StagingHover = { id: string; source: StagingHoverSource };
export type StagingCursor = '' | 'pointer' | 'grab' | 'grabbing';

/** The pointer-over state after one report from the yard or the vehicle. A report of
 * "nothing" clears only what that same source had set, so the two never undo each other. */
export function nextStagingHover(current: StagingHover | null, source: StagingHoverSource, id: string | null): StagingHover | null {
  if (id) return current?.id === id && current.source === source ? current : { id, source };
  return current?.source === source ? null : current;
}

/** `grabbing` while a unit is held, `grab` over one that can be moved, `pointer` over one
 * that can only be selected, and the default everywhere else. */
export function stagingCursor(state: { dragging: boolean; hover: StagingHover | null; canDrag: boolean }): StagingCursor {
  if (state.dragging) return 'grabbing';
  if (!state.hover) return '';
  return state.canDrag ? 'grab' : 'pointer';
}
