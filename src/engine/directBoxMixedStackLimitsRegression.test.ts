import { describe, expect, it } from 'vitest';
import { canPlaceByStackingRules } from './stacking';
import type { CargoItem, Placement } from './types';

function item(id: string, maxStackLayers: number): CargoItem {
  return {
    id,
    name: id,
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 10,
    quantity: 1,
    maxStackLayers,
    maxTopLoadKg: 100,
    allowRotation: false,
  };
}

function box(cargoId: string, z: number): Placement {
  return {
    cargoId,
    x: 0,
    y: 0,
    z,
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 10,
    rotated: false,
  };
}

describe('DIRECT BOX mixed stack layer limits', () => {
  it('rejects a third mixed-SKU layer when the supporting base allows only two layers', () => {
    const baseItem = item('BASE', 2);
    const middleItem = item('MIDDLE', 7);
    const topItem = item('TOP', 7);
    const placements = [box('BASE', 0), box('MIDDLE', 0.5)];
    const cargoById = new Map([
      [baseItem.id, baseItem],
      [middleItem.id, middleItem],
      [topItem.id, topItem],
    ]);

    expect(canPlaceByStackingRules(topItem, box('TOP', 1), placements, cargoById)).toBe(false);
  });
});
