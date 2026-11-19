import { describe, expect, it } from 'vitest';
import { STAGING_DRAG_TARGET_PROFILE, stagingDragTarget, stagingPreviewSupport } from './stagingDragTarget';
import { stagingSceneBounds } from './stagingDragCues';
import type { StagingUnit } from './stagingInventory';
import type { Placement } from './engine/types';

const container = { length: 6, width: 2.4 };
const reach = STAGING_DRAG_TARGET_PROFILE.magnetM;
const placement = (x: number, y: number, z = 0, patch: Partial<Placement> = {}): Placement => ({ cargoId: 'SKU', x, y, z, length: 1, width: 1, height: 1, weightKg: 10, rotated: false, ...patch } as Placement);
const boxUnit = (id: string, at: Placement, patch: Partial<StagingUnit> = {}): StagingUnit => ({ id, kind: 'box', name: id, cargoIds: ['SKU'], length: at.length, width: at.width, height: at.height, weightKg: 10, boxCount: 1,
  unloadPriorities: [], location: 'vehicle', verdict: 'placed', reasons: [], boxUnits: [{ id: `${id}:box`, stableId: `${id}:box`, cargoId: 'SKU' }], placement: at, ...patch } as StagingUnit);
/** A pallet base 0.15 m high whose unit (base, load and packaging) is 1.1 x 1.1 x 0.96 m. */
const palletUnit = (id: string, x: number, y: number, z = 0, patch: Partial<StagingUnit> = {}): StagingUnit => ({ ...boxUnit(id, placement(x, y, z)), kind: 'pallet', length: 1.1, width: 1.1, height: .96, placement: undefined,
  pallet: { x, y, z, length: 1.1, width: 1.1, height: .15 }, ...patch } as unknown as StagingUnit);
const waiting = (unit: StagingUnit): StagingUnit => ({ ...unit, location: 'yard', verdict: 'pending' });

describe('where a staging drag is aimed', () => {
  it('leaves a position in open floor exactly where the pointer put it', () => {
    const moving = waiting(boxUnit('new', placement(0, 0)));
    const target = stagingDragTarget(moving, { x: 2.37, y: .61, z: 0 }, container, [boxUnit('far', placement(4.5, 1.3))]);
    expect(target).toEqual({ x: 2.37, y: .61, z: 0, stackedOn: null, magnet: { x: false, y: false } });
  });

  it('pulls a unit flush against a wall or a neighbour it nearly touches, and no further', () => {
    const moving = waiting(boxUnit('new', placement(0, 0)));
    const neighbour = boxUnit('a', placement(2, .5));
    // Just short of the inner wall and of the side wall.
    expect(stagingDragTarget(moving, { x: .06, y: 1.34, z: 0 }, container, [])).toMatchObject({ x: 0, y: 1.4, magnet: { x: true, y: true } });
    // A little outside the equipment is still the wall; far outside is left for the checks to reject.
    expect(stagingDragTarget(moving, { x: -.04, y: .7, z: 0 }, container, []).x).toBe(0);
    expect(stagingDragTarget(moving, { x: -reach - .05, y: .7, z: 0 }, container, []).x).toBe(-reach - .05);
    // Overlapping the neighbour by 3 cm, or 4 cm short of it: flush against its face either way.
    expect(stagingDragTarget(moving, { x: 2.97, y: .6, z: 0 }, container, [neighbour])).toMatchObject({ x: 3, magnet: { x: true } });
    expect(stagingDragTarget(moving, { x: .96, y: .6, z: 0 }, container, [neighbour])).toMatchObject({ x: 1, magnet: { x: true } });
    // Deep inside the neighbour nothing is pulled: the collision is the operator's to see.
    expect(stagingDragTarget(moving, { x: 2.5, y: 1.1, z: 0 }, container, [neighbour])).toMatchObject({ x: 2.5, y: 1.1, magnet: { x: false, y: false } });
    // A neighbour in another lane is not a face to stop against.
    expect(stagingDragTarget(moving, { x: 2.97, y: 1.7, z: 0 }, container, [boxUnit('lane', placement(2, 0, 0, { width: .5 }))]).magnet.x).toBe(false);
  });

  it('lines a unit up with the edge of the neighbour right beside it', () => {
    const moving = waiting(boxUnit('new', placement(0, 0)));
    const neighbour = boxUnit('a', placement(2, .5));
    // Dropped behind the neighbour, 4 cm off its lane: flush in X and in line in Y.
    expect(stagingDragTarget(moving, { x: 3.03, y: .54, z: 0 }, container, [neighbour])).toMatchObject({ x: 3, y: .5, magnet: { x: true, y: true } });
    // Too far off the lane to be meant as the same lane.
    expect(stagingDragTarget(moving, { x: 3.03, y: .5 + reach + .08, z: 0 }, container, [neighbour]).magnet.y).toBe(false);
  });

  it('puts a pallet exactly on the pallet its middle is over, and only on a pallet', () => {
    const lower = palletUnit('lower', 1.1, .1), moving = palletUnit('moving', 3.3, .1);
    const placed = [lower, moving, boxUnit('loose', placement(4.6, 1.2))];
    // Middle of the dragged pallet inside the lower pallet's footprint: aligned on top.
    expect(stagingDragTarget(moving, { x: 1.4, y: .45, z: 0 }, container, placed)).toEqual({ x: 1.1, y: .1, z: .96, stackedOn: 'lower', magnet: { x: true, y: true } });
    // Middle still outside: it stays on the floor, overlapping, for the checks to reject.
    expect(stagingDragTarget(moving, { x: 1.8, y: .1, z: 0 }, container, placed)).toMatchObject({ x: 1.8, z: 0, stackedOn: null });
    // Loose cargo never carries a pallet.
    expect(stagingDragTarget(moving, { x: 4.5, y: 1.1, z: 0 }, container, placed)).toMatchObject({ z: 0, stackedOn: null });
    // The dragged pallet is never its own support.
    expect(stagingDragTarget(moving, { x: 3.35, y: .12, z: 0 }, container, placed)).toMatchObject({ z: 0, stackedOn: null });
  });

  it('aims at the top of a stack and brings a raised pallet back to the floor', () => {
    const lower = palletUnit('lower', 1.1, .1), upper = palletUnit('upper', 1.1, .1, .96), moving = palletUnit('moving', 3.3, .1);
    // Over a column of two the target is the top of the upper one; the checks decide the level limit.
    expect(stagingDragTarget(moving, { x: 1.2, y: .2, z: 0 }, container, [lower, upper, moving])).toMatchObject({ x: 1.1, y: .1, stackedOn: 'upper' });
    expect(stagingDragTarget(moving, { x: 1.2, y: .2, z: 0 }, container, [lower, upper, moving]).z).toBeCloseTo(1.92);
    // The upper pallet dragged off its column, at the height it was grabbed, lands on the floor.
    expect(stagingDragTarget(upper, { x: 3.5, y: .9, z: .96 }, container, [lower, upper])).toMatchObject({ x: 3.5, y: .9, z: 0, stackedOn: null });
    // Moved a little while still over its own column it stays on it.
    expect(stagingDragTarget(upper, { x: 1.3, y: .3, z: .96 }, container, [lower, upper])).toMatchObject({ x: 1.1, y: .1, z: .96, stackedOn: 'lower' });
  });

  it('raises a loose carton onto what its middle is over and keeps it inside that edge', () => {
    const base = boxUnit('base', placement(2, .5, 0, { length: 1.2, width: 1 })), moving = waiting(boxUnit('new', placement(0, 0, 0, { length: .6, width: .5, height: .4 })));
    // 3 cm over the edge of the carton below: pulled inside so the whole base is carried.
    expect(stagingDragTarget(moving, { x: 1.97, y: .47, z: 0 }, container, [base])).toMatchObject({ x: 2, y: .5, z: 1, stackedOn: 'base', magnet: { x: true, y: true } });
    expect(stagingDragTarget(moving, { x: 2.63, y: 1.02, z: 0 }, container, [base])).toMatchObject({ x: 2.6, y: 1, z: 1, stackedOn: 'base' });
    // In the middle of it nothing is pulled.
    expect(stagingDragTarget(moving, { x: 2.3, y: .75, z: 0 }, container, [base])).toMatchObject({ x: 2.3, y: .75, z: 1, magnet: { x: false, y: false } });
    // A carton may also be aimed onto a pallet's load; whether that is allowed is the checks' answer.
    const pallet = palletUnit('p', 4, .5);
    expect(stagingDragTarget(moving, { x: 4.2, y: .8, z: 0 }, container, [pallet])).toMatchObject({ z: .96, stackedOn: 'p' });
  });

  it('never changes the units it reads and passes unusable input through', () => {
    const placed = [palletUnit('lower', 1.1, .1), boxUnit('a', placement(2, .5))], before = JSON.stringify(placed);
    const moving = palletUnit('moving', 3.3, .1);
    stagingDragTarget(moving, { x: 1.2, y: .2, z: 0 }, container, placed);
    expect(JSON.stringify(placed)).toBe(before);
    expect(stagingDragTarget(moving, { x: NaN, y: .2, z: 0 }, container, placed)).toMatchObject({ y: .2, z: 0, stackedOn: null });
    expect(stagingDragTarget({ ...moving, length: 0 }, { x: 1.2, y: .2, z: .5 }, container, placed)).toMatchObject({ x: 1.2, y: .2, z: .5, stackedOn: null });
    // A magnet of zero leaves every free position alone but still raises onto a support.
    expect(stagingDragTarget(waiting(boxUnit('new', placement(0, 0))), { x: .03, y: .7, z: 0 }, container, [], { magnetM: 0 }).x).toBe(.03);
    expect(stagingDragTarget(moving, { x: 1.2, y: .2, z: 0 }, container, placed, { magnetM: 0 })).toMatchObject({ x: 1.1, y: .1, stackedOn: 'lower' });
  });
});

describe('what a raised candidate rests on', () => {
  it('names the unit directly under a raised candidate and nothing for the floor', () => {
    const lower = palletUnit('lower', 1.1, .1), moving = palletUnit('moving', 3.3, .1), units = [lower, moving];
    const raised = { unitId: 'moving', candidate: placement(1.1, .1, .96, { length: 1.1, width: 1.1, height: .96 }), valid: true };
    expect(stagingPreviewSupport(units, raised, container)).toEqual(stagingSceneBounds({ x: 1.1, y: .1, z: 0, length: 1.1, width: 1.1, height: .96 }, container));
    // Shown for a rejected candidate too, so the operator sees what refused it.
    expect(stagingPreviewSupport(units, { ...raised, valid: false }, container)).not.toBeNull();
    expect(stagingPreviewSupport(units, { ...raised, candidate: { ...raised.candidate, z: 0 } }, container)).toBeNull();
    // Hanging in the air over nothing, or level with something beside it, has no support to show.
    expect(stagingPreviewSupport(units, { ...raised, candidate: { ...raised.candidate, x: 4.5 } }, container)).toBeNull();
    expect(stagingPreviewSupport(units, { ...raised, candidate: { ...raised.candidate, z: .5 } }, container)).toBeNull();
    expect(stagingPreviewSupport(units, { ...raised, unitId: 'lower' }, container)).toBeNull();
    expect(stagingPreviewSupport(units, null, container)).toBeNull();
  });
});
