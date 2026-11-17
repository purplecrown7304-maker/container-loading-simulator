import { describe, expect, it } from 'vitest';
import { validateOperationalLoading, type OperationalSupport } from './operationalValidator';
import { placementsWithinFloorLoadLimit } from './floorLoadLimit';
import { validateAPlan } from './loadSimAdapter';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 4, width: 2, height: 3, maxPayloadKg: 6000, floorLoadLimitKgPerM2: 100 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 1, width: 1, height: .2,
  weightKg: 40, quantity: 10, maxStackLayers: 10, maxTopLoadKg: 1000 }];
const box = (patch: Partial<Placement> = {}): Placement => ({ cargoId: 'A', x: 1.5, y: .5, z: 0,
  length: 1, width: 1, height: .2, weightKg: 40, ...patch });
const pallet = (patch: Partial<OperationalSupport> = {}): OperationalSupport => ({ id: 'PALLET',
  x: 1.5, y: .5, z: 0, length: 1, width: 1, height: .1, weightKg: 20, ...patch });
const floorFindings = (space: ContainerSpec, boxes: Placement[], supports: OperationalSupport[] = []) =>
  validateOperationalLoading(space, cargo, boxes, supports).filter(f => f.code === 'FLOOR_LOAD_LIMIT');

describe('legacy operational hard floor load audit', () => {
  it('matches the existing exact projection for all direct carton tiers', () => {
    const boxes = [box(), box({ z: .2 }), box({ z: .4 })];
    expect(placementsWithinFloorLoadLimit(container, boxes)).toBe(false);
    expect(floorFindings(container, boxes)).toEqual([expect.objectContaining({ severity: 'error', limit: 100 })]);
    expect(floorFindings(container, boxes.slice(0, 2))).toEqual([]);
  });

  it('includes pallet tare and accepts the exact configured limit', () => {
    const boxes = [box({ z: .1 }), box({ z: .3 })];
    expect(floorFindings(container, boxes, [pallet()])).toEqual([]); // 40 + 40 + 20 = 100
    expect(floorFindings(container, boxes, [pallet({ weightKg: 20.01 })])).toHaveLength(1);
  });

  it('includes upper pallet tare through the complete vertical projection', () => {
    const boxes = [box({ z: .1 }), box({ z: .4 })];
    const supports = [pallet({ weightKg: 10 }), pallet({ id: 'UPPER', z: .3, weightKg: 10 })];
    expect(floorFindings(container, boxes, supports)).toEqual([]);
    expect(floorFindings(container, boxes, [...supports.slice(0, 1), { ...supports[1], weightKg: 10.01 }])).toHaveLength(1);
  });

  it('does not spread concentrated carton weight over an unused pallet footprint', () => {
    // Unit-load average is only 60kg/m², but the .25m² cargo footprint projects 180kg/m².
    const boxes = [box({ x: 1.75, y: .75, z: .1, length: .5, width: .5 })];
    expect(floorFindings(container, boxes, [pallet()])).toHaveLength(1);
  });

  it('does not multiply the hard limit by the concentration-warning setting', () => {
    const boxes = [box({ weightKg: 101 })];
    expect(floorFindings({ ...container, floorLoadWarningMultiplier: 3 }, boxes)).toHaveLength(1);
    expect(floorFindings({ ...container, floorLoadWarningMultiplier: 100 }, boxes)).toHaveLength(1);
  });

  it('counts physical supports even when no carton placements remain', () => {
    expect(floorFindings(container, [], [pallet({ weightKg: 101 })])).toHaveLength(1);
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('preserves an unavailable floor limit (%s)', limit => {
    expect(floorFindings({ ...container, floorLoadLimitKgPerM2: limit }, [box({ weightKg: 1000 })], [pallet()])).toEqual([]);
  });

  it('leaves A-rule validation on its own existing path', () => {
    const space: ContainerSpec = { ...container, rules: { version: 'a-v1', equipmentId: 'test',
      kind: 'container', access: ['rear'], source: 'test' } };
    const boxes = [box({ weightKg: 101 })];
    const supports = [pallet()];
    expect(validateOperationalLoading(space, cargo, boxes, supports)).toEqual(validateAPlan(space, cargo, boxes, supports));
    expect(floorFindings(space, boxes, supports)).toEqual([]);
  });
});
