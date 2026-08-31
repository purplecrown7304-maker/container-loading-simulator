import { describe, expect, it } from 'vitest';
import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const baseContainer: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 10000 };

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5,
    weightKg: 10, quantity: 8, maxStackLayers: 2, maxTopLoadKg: 100, allowRotation: false,
    ...overrides,
  };
}

function signature(placements: Placement[]) {
  return placements.map((p) => `${p.cargoId}:${p.x}:${p.y}:${p.z}:${p.length}:${p.width}:${p.height}`).sort();
}

describe('DIRECT BOX block / maximal-empty-space discipline', () => {
  it.each<LoadingStrategy>(['capacity', 'stability', 'unloading'])(
    '%s keeps physical constraints hard while using the new block search',
    (strategy) => {
      const result = loadContainer(baseContainer, [cargo()], { strategy, publish: false });
      expect(result.placements).toHaveLength(8);
      expect(result.remaining).toEqual([]);
      expect(result.validationIssues).toEqual([]);
    },
  );

  it('uses the top-load limit to cap each vertical column even inside a generated block', () => {
    const item = cargo({ quantity: 6, maxStackLayers: 7, maxTopLoadKg: 20, weightKg: 10 });
    const result = loadContainer({ ...baseContainer, height: 2 }, [item], { publish: false });
    const columns = new Map<string, Placement[]>();
    for (const p of result.placements) {
      const key = `${p.x}:${p.y}`;
      const values = columns.get(key) ?? [];
      values.push(p);
      columns.set(key, values);
    }
    expect(result.placements).toHaveLength(6);
    expect(Math.max(...[...columns.values()].map((items) => items.length))).toBeLessThanOrEqual(3);
    expect(result.validationIssues).toEqual([]);
  });

  it('fills a side residual space at the same inner x instead of reserving a separate tail zone', () => {
    const result = loadContainer(
      { length: 1.5, width: 1, height: 1, maxPayloadKg: 10000 },
      [
        cargo({ id: 'A-WIDE', length: 0.75, width: 0.6, height: 1, quantity: 2, maxStackLayers: 1 }),
        cargo({ id: 'B-NARROW', length: 0.75, width: 0.4, height: 1, quantity: 2, maxStackLayers: 1 }),
      ],
      { publish: false },
    );
    expect(result.placements).toHaveLength(4);
    expect(new Set(result.placements.map((p) => p.x))).toEqual(new Set([0, 0.75]));
    expect(result.validationIssues).toEqual([]);
  });

  it('does not depend on input row order when equal candidates compete', () => {
    const items = [cargo({ id: 'B', quantity: 2 }), cargo({ id: 'A', quantity: 2 })];
    const forward = loadContainer(baseContainer, items, { publish: false });
    const reverse = loadContainer(baseContainer, [...items].reverse(), { publish: false });
    expect(signature(forward.placements)).toEqual(signature(reverse.placements));
    expect(forward.remaining).toEqual(reverse.remaining);
  });
});
