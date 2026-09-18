import { describe, expect, it } from 'vitest';
import { validatePlacements } from './constraints';
import { packByStrictWalls } from './strictWallPacker';
import type { CargoItem, Placement } from './types';

describe('strict wall grid validation', () => {
  it('loads 1562 registered cartons with supported columns and cumulative top-load limits', () => {
    const quantities = [1000, 2000, 3000, 4000, 50000, 50000];
    const units = [96, 80, 80, 70, 70, 70];
    const cargo: CargoItem[] = quantities.flatMap((quantity, i) => {
      const full = { id: `B${i}`, name: `B${i}`, length: 0.235, width: 0.13, height: 0.265, weightKg: units[i] * 0.1, quantity: Math.floor(quantity / units[i]), maxStackLayers: 10, maxTopLoadKg: 100 };
      const partial = quantity % units[i];
      return partial ? [full, { ...full, id: `${full.id}-PARTIAL`, quantity: 1, weightKg: partial * 0.1 }] : [full];
    });
    const container = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
    const result = packByStrictWalls(container, cargo, 'capacity');
    expect(result.placements).toHaveLength(1562);
    expect(result.remaining).toEqual([]);
    expect(validatePlacements(container, result.placements)).toEqual([]);
    expect(result.loadedWeightKg).toBeCloseTo(11000);
    const columns = new Map<string, Placement[]>();
    for (const placement of result.placements) {
      const key = [placement.x, placement.y, placement.length, placement.width].join(':');
      columns.set(key, [...(columns.get(key) ?? []), placement]);
    }
    expect(Math.max(...result.placements.map(item => item.z))).toBeGreaterThan(0.265);
    const byId = new Map(cargo.map(item => [item.id, item]));
    for (const column of columns.values()) {
      column.sort((a, b) => a.z - b.z);
      expect(column.length).toBeLessThanOrEqual(9);
      expect(column[0].z).toBe(0);
      for (let index = 0; index < column.length; index++) {
        const item = byId.get(column[index].cargoId)!;
        expect(column.length - index).toBeLessThanOrEqual(item.maxStackLayers!);
        expect(column.slice(index + 1).reduce((sum, p) => sum + p.weightKg, 0)).toBeLessThanOrEqual(item.maxTopLoadKg!);
        if (index) expect(column[index].z).toBeCloseTo(column[index - 1].z + column[index - 1].height, 6);
      }
    }
  });

  it.each([{ maxStackLayers: 2, maxTopLoadKg: 100, expected: 2 }, { maxStackLayers: 10, maxTopLoadKg: 10, expected: 2 }, { maxStackLayers: 10, maxTopLoadKg: 0, expected: 1 }])('preserves declared layers and top load: %j', limits => {
    const container = { length: 0.5, width: 0.5, height: 3, maxPayloadKg: 1000 };
    const item = { id: 'LIMIT', name: 'LIMIT', length: 0.5, width: 0.5, height: 0.25, weightKg: 10, quantity: 10, maxStackLayers: limits.maxStackLayers, maxTopLoadKg: limits.maxTopLoadKg };
    const result = packByStrictWalls(container, [item], 'capacity');
    expect(result.placements).toHaveLength(limits.expected);
    expect(result.remaining.reduce((sum, remaining) => sum + remaining.quantity, 0)).toBe(10 - limits.expected);
  });
});
