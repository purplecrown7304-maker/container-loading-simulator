import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { nearestStagingHit, nextStagingHover, STAGING_CONFLICT_COLOR, STAGING_CONFLICT_OUTLINE_LIMIT, STAGING_HOVER_COLOR, stagingCursor, stagingHitSource, stagingPreviewConflicts, stagingSceneBounds, stagingUnitDraggable, stagingUnitSceneBounds, stagingUnitVehicleBox } from './stagingDragCues';
import { createStagingOutlineResources } from './ThreeStagingCues';
import type { StagingUnit } from './stagingInventory';
import type { Placement } from './engine/types';

const container = { length: 6, width: 2.4 };
const placement = (x: number, y: number, z = 0, patch: Partial<Placement> = {}): Placement => ({ cargoId: 'SKU', x, y, z, length: 1, width: 1, height: 1, weightKg: 10, rotated: false, ...patch } as Placement);
const boxUnit = (id: string, at: Placement, patch: Partial<StagingUnit> = {}): StagingUnit => ({ id, kind: 'box', name: id, cargoIds: ['SKU'], length: at.length, width: at.width, height: at.height, weightKg: 10, boxCount: 1,
  unloadPriorities: [], location: 'vehicle', verdict: 'placed', reasons: [], boxUnits: [{ id: `${id}:box`, stableId: `${id}:box`, cargoId: 'SKU' }], placement: at, ...patch } as StagingUnit);
/** A pallet base 0.15 m high whose unit (base + load + packaging) is 1.2 x 0.8 x 1.1 m. */
const palletUnit = (id: string, x: number, y: number, patch: Partial<StagingUnit> = {}): StagingUnit => ({ ...boxUnit(id, placement(x, y)), kind: 'pallet', length: 1.2, width: .8, height: 1.1, placement: undefined,
  pallet: { x, y, z: 0, length: 1.2, width: .8, height: .15 }, ...patch } as unknown as StagingUnit);
const rejected = (unitId: string, candidate: Placement) => ({ unitId, candidate, valid: false });

describe('display cues for a staging drag', () => {
  it('describes the space a placed unit takes: the carton itself or the whole loaded pallet', () => {
    expect(stagingUnitVehicleBox(boxUnit('a', placement(1, .5, .3, { length: .6, width: .4, height: .2 })))).toEqual({ x: 1, y: .5, z: .3, length: .6, width: .4, height: .2 });
    // The pallet's own record is only its base; the unit is the base with its load.
    expect(stagingUnitVehicleBox(palletUnit('p', 2, 1))).toEqual({ x: 2, y: 1, z: 0, length: 1.2, width: .8, height: 1.1 });
    expect(stagingUnitVehicleBox(boxUnit('yard', placement(0, 0), { location: 'yard' }))).toBeNull();
    expect(stagingUnitVehicleBox(boxUnit('other', placement(0, 0), { location: 'other-vehicle' }))).toBeNull();
    expect(stagingUnitVehicleBox(boxUnit('bare', placement(0, 0), { placement: undefined }))).toBeNull();
    expect(stagingUnitVehicleBox(palletUnit('no-load', 0, 0, { pallet: undefined }))).toBeNull();
    expect(stagingUnitVehicleBox(boxUnit('nan', placement(NaN, 0)))).toBeNull();
    expect(stagingUnitVehicleBox(boxUnit('flat', placement(0, 0, 0, { height: 0 })))).toBeNull();
  });

  it('converts engine axes to the centred, Y-up scene box', () => {
    expect(stagingSceneBounds({ x: 1, y: .5, z: .3, length: .6, width: .4, height: .2 }, container)).toEqual({ min: [1 - 3, .3, .5 - 1.2], max: [1.6 - 3, .5, .9 - 1.2] });
    const units = [boxUnit('a', placement(0, 0)), palletUnit('p', 2, 1)];
    const pallet = stagingUnitSceneBounds(units, 'p', container)!;
    expect(pallet).toEqual(stagingSceneBounds({ x: 2, y: 1, z: 0, length: 1.2, width: .8, height: 1.1 }, container));
    [-1, 0, -.2].forEach((value, axis) => expect(pallet.min[axis]).toBeCloseTo(value));
    [.2, 1.1, .6].forEach((value, axis) => expect(pallet.max[axis]).toBeCloseTo(value));
    expect(stagingUnitSceneBounds(units, 'missing', container)).toBeNull(); expect(stagingUnitSceneBounds(units, null, container)).toBeNull();
  });

  it('lists the placed cargo a rejected candidate runs into, in inventory order', () => {
    const units = [boxUnit('a', placement(0, 0)), boxUnit('b', placement(1, 0)), boxUnit('c', placement(3, 0)), palletUnit('p', 1.5, 1)];
    const before = JSON.stringify(units);
    // Half over a and half over b; c is clear.
    const candidate = placement(.5, .2);
    expect(stagingPreviewConflicts(units, rejected('new', candidate), container)).toEqual([
      stagingSceneBounds({ x: 0, y: 0, z: 0, length: 1, width: 1, height: 1 }, container),
      stagingSceneBounds({ x: 1, y: 0, z: 0, length: 1, width: 1, height: 1 }, container),
    ]);
    // A carton that reaches into a pallet's load, above its base, runs into the pallet as a whole.
    const intoLoad = placement(1.8, 1.1, .5, { length: .5, width: .5, height: .4 });
    expect(stagingPreviewConflicts(units, rejected('new', intoLoad), container)).toEqual([stagingSceneBounds({ x: 1.5, y: 1, z: 0, length: 1.2, width: .8, height: 1.1 }, container)]);
    expect(JSON.stringify(units)).toBe(before);
  });

  it('never counts the moved unit against itself and treats touching faces as clear', () => {
    const units = [boxUnit('a', placement(0, 0)), boxUnit('b', placement(1, 0))];
    // Unit a nudged a little along its own position still overlaps where it stands now.
    expect(stagingPreviewConflicts(units, rejected('a', placement(.1, 0)), container)).toEqual([stagingSceneBounds({ x: 1, y: 0, z: 0, length: 1, width: 1, height: 1 }, container)]);
    expect(stagingPreviewConflicts(units, rejected('a', placement(0, 1)), container)).toEqual([]);
    // Face to face, stacked exactly on top, and beside: none is a collision.
    for (const candidate of [placement(2, 0), placement(0, 0, 1), placement(0, 1)]) expect(stagingPreviewConflicts(units, rejected('new', candidate), container)).toEqual([]);
  });

  it('shows nothing for an accepted candidate, for no drag, or for one rejected for another reason', () => {
    const units = [boxUnit('a', placement(0, 0))];
    expect(stagingPreviewConflicts(units, { unitId: 'new', candidate: placement(.5, 0), valid: true }, container)).toEqual([]);
    expect(stagingPreviewConflicts(units, null, container)).toEqual([]); expect(stagingPreviewConflicts(units, undefined, container)).toEqual([]);
    // Outside the equipment and clear of all cargo: the candidate alone is red.
    expect(stagingPreviewConflicts(units, rejected('new', placement(-2, 0)), container)).toEqual([]);
    expect(stagingPreviewConflicts(units, rejected('new', placement(NaN, 0)), container)).toEqual([]);
    // Cargo that is not in this vehicle is never outlined.
    expect(stagingPreviewConflicts([boxUnit('yard', placement(0, 0), { location: 'yard' })], rejected('new', placement(.5, 0)), container)).toEqual([]);
  });

  it('bounds the number of outlines for a candidate over many small cartons', () => {
    const units = Array.from({ length: 60 }, (_, index) => boxUnit(`s-${index}`, placement(index * .1, 0, 0, { length: .1, width: .1, height: .1 })));
    const conflicts = stagingPreviewConflicts(units, rejected('new', placement(0, 0, 0, { length: 6, width: 1, height: 1 })), container);
    expect(conflicts).toHaveLength(STAGING_CONFLICT_OUTLINE_LIMIT);
    expect(conflicts[0]).toEqual(stagingSceneBounds({ x: 0, y: 0, z: 0, length: .1, width: .1, height: .1 }, container));
  });
});

describe('pointer-over state for staging units', () => {
  const hit = (kind?: string) => ({ object: { userData: kind ? { kind } : {} }, distance: 1 });
  it('takes the nearest hit that is a unit and passes through equipment and scenery in front of it', () => {
    const wall = hit('container-shell'), cargo = hit('cargo'), behind = hit('stagingCargo'), floor = hit();
    expect(stagingHitSource(cargo)).toBe('vehicle'); expect(stagingHitSource(hit('support'))).toBe('vehicle');
    expect(stagingHitSource(behind)).toBe('yard'); expect(stagingHitSource(wall)).toBeNull(); expect(stagingHitSource(floor)).toBeNull();
    expect(stagingHitSource(null)).toBeNull();
    expect(nearestStagingHit([wall, cargo, behind])).toBe(cargo);
    expect(nearestStagingHit([floor, behind, cargo])).toBe(behind);
    expect(nearestStagingHit([wall, floor, hit('weightSurface')])).toBeNull();
    expect(nearestStagingHit([])).toBeNull(); expect(nearestStagingHit(undefined)).toBeNull();
  });

  it('lets a source clear only what it set, so the yard and the vehicle never undo each other', () => {
    const yard = nextStagingHover(null, 'yard', 'u1');
    expect(yard).toEqual({ id: 'u1', source: 'yard' });
    // The same report keeps the same object, so nothing re-renders while the pointer moves over one unit.
    expect(nextStagingHover(yard, 'yard', 'u1')).toBe(yard);
    expect(nextStagingHover(yard, 'yard', 'u2')).toEqual({ id: 'u2', source: 'yard' });
    // The vehicle saying "nothing here" does not clear a yard unit, and the other way round.
    expect(nextStagingHover(yard, 'vehicle', null)).toBe(yard);
    expect(nextStagingHover(yard, 'yard', null)).toBeNull();
    const vehicle = nextStagingHover(yard, 'vehicle', 'v1');
    expect(vehicle).toEqual({ id: 'v1', source: 'vehicle' });
    expect(nextStagingHover(vehicle, 'yard', null)).toBe(vehicle); expect(nextStagingHover(null, 'yard', null)).toBeNull();
  });

  it('shows grab only over a unit whose drag would be assessed', () => {
    const movable = boxUnit('a', placement(0, 0), { location: 'yard', verdict: 'pending' });
    expect(stagingUnitDraggable(movable)).toBe(true); expect(stagingUnitDraggable(boxUnit('v', placement(0, 0)))).toBe(true);
    expect(stagingUnitDraggable({ ...movable, verdict: 'error' })).toBe(false);
    expect(stagingUnitDraggable({ ...movable, requiresPackaging: true })).toBe(false);
    expect(stagingUnitDraggable({ ...movable, location: 'other-vehicle' })).toBe(false);
    // An error verdict blocks loading from the yard, not moving cargo that is already placed.
    expect(stagingUnitDraggable(boxUnit('placed', placement(0, 0), { verdict: 'error' }))).toBe(true);
    expect(stagingUnitDraggable(null)).toBe(false); expect(stagingUnitDraggable(undefined)).toBe(false);
    const hover = { id: 'a', source: 'yard' as const };
    expect(stagingCursor({ dragging: false, hover, canDrag: true })).toBe('grab');
    expect(stagingCursor({ dragging: false, hover, canDrag: false })).toBe('pointer');
    expect(stagingCursor({ dragging: false, hover: null, canDrag: true })).toBe('');
    expect(stagingCursor({ dragging: true, hover: null, canDrag: false })).toBe('grabbing');
    expect(stagingCursor({ dragging: true, hover, canDrag: true })).toBe('grabbing');
  });
});

describe('scene outlines for the cues', () => {
  const visible = (root: THREE.Object3D) => root.children.filter(child => child.visible) as THREE.LineSegments[];
  it('draws one padded outline per box, reuses them, and is never a pick target', () => {
    const outlines = createStagingOutlineResources('Cargo a rejected drag runs into', STAGING_CONFLICT_COLOR, 9);
    expect(outlines.root.children).toHaveLength(0); expect(outlines.root.userData.displayOnly).toBe(true);
    const first = { min: [-3, 0, -1.2] as [number, number, number], max: [-2, 1, -.2] as [number, number, number] };
    const second = { min: [0, .5, 0] as [number, number, number], max: [1.2, 1.6, .8] as [number, number, number] };
    outlines.update([first, second]);
    const lines = visible(outlines.root);
    expect(lines).toHaveLength(2); expect(outlines.root.userData.outlines).toBe(2);
    expect(lines[0].position.toArray()).toEqual([-2.5, .5, -.7]);
    lines[0].scale.toArray().forEach(value => expect(value).toBeCloseTo(1.04));
    expect(lines[1].position.x).toBeCloseTo(.6); expect(lines[1].position.y).toBeCloseTo(1.05); expect(lines[1].position.z).toBeCloseTo(.4);
    expect(lines[1].scale.x).toBeCloseTo(1.24); expect(lines[1].scale.y).toBeCloseTo(1.14); expect(lines[1].scale.z).toBeCloseTo(.84);
    // One geometry and one material for the whole set, drawn over the cargo.
    expect(lines[0].geometry).toBe(lines[1].geometry); expect(lines[0].material).toBe(lines[1].material);
    const material = lines[0].material as THREE.LineBasicMaterial;
    expect(material.depthTest).toBe(false); expect(`#${material.color.getHexString()}`).toBe(STAGING_CONFLICT_COLOR); expect(lines[0].renderOrder).toBe(9);
    outlines.root.updateMatrixWorld(true);
    expect(new THREE.Raycaster(new THREE.Vector3(-2.5, 5, -.7), new THREE.Vector3(0, -1, 0)).intersectObject(outlines.root, true)).toEqual([]);
    // Fewer boxes hide the spare outline instead of rebuilding; more reuse it.
    outlines.update([second]);
    expect(visible(outlines.root)).toHaveLength(1); expect(outlines.root.children).toHaveLength(2); expect(visible(outlines.root)[0]).toBe(lines[0]);
    expect(lines[0].position.x).toBeCloseTo(.6);
    outlines.update([]); expect(visible(outlines.root)).toHaveLength(0); expect(outlines.root.userData.outlines).toBe(0);
    outlines.update([first, second, first]); expect(visible(outlines.root)).toHaveLength(3); expect(outlines.root.children).toHaveLength(3);
    // Freeing the GPU side leaves a set a re-mounted owner can still draw with.
    outlines.dispose(); outlines.update([first]); expect(visible(outlines.root)).toHaveLength(1);
  });

  it('keeps the pointer-over colour apart from the conflict and selection colours', () => {
    expect(STAGING_HOVER_COLOR).not.toBe(STAGING_CONFLICT_COLOR); expect(STAGING_HOVER_COLOR.toLowerCase()).not.toBe('#2563eb');
  });
});
