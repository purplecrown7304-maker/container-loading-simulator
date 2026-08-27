import { describe, expect, it } from 'vitest';
import { canPlaceByStackingRules } from './stacking';
import type { CargoItem, Placement } from './types';

function item(id: string, overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id,
    name: id,
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 10,
    quantity: 1,
    maxStackLayers: 10,
    maxTopLoadKg: 1000,
    allowRotation: false,
    ...overrides,
  };
}

function placement(cargoId: string, z: number): Placement {
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

describe('mixed-SKU stacking limits', () => {
  it('rejects a third layer when the bottom carton allows only two layers', () => {
    const base = item('BASE', { maxStackLayers: 2 });
    const middle = item('MIDDLE', { maxStackLayers: 10 });
    const top = item('TOP', { maxStackLayers: 10 });
    const cargoById = new Map([[base.id, base], [middle.id, middle], [top.id, top]]);

    expect(canPlaceByStackingRules(
      top,
      placement('TOP', 1),
      [placement('BASE', 0), placement('MIDDLE', 0.5)],
      cargoById,
    )).toBe(false);
  });

  it('allows the same third layer when every supporting carton permits it', () => {
    const base = item('BASE', { maxStackLayers: 3 });
    const middle = item('MIDDLE', { maxStackLayers: 3 });
    const top = item('TOP', { maxStackLayers: 3 });
    const cargoById = new Map([[base.id, base], [middle.id, middle], [top.id, top]]);

    expect(canPlaceByStackingRules(
      top,
      placement('TOP', 1),
      [placement('BASE', 0), placement('MIDDLE', 0.5)],
      cargoById,
    )).toBe(true);
  });
});
