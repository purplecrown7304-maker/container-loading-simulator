import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 2,
  width: 1,
  height: 1,
  maxPayloadKg: 1000,
};

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'BOX-A',
    name: 'BOX A',
    length: 0.5,
    width: 0.5,
    height: 0.5,
    weightKg: 10,
    quantity: 4,
    maxStackLayers: 2,
    maxTopLoadKg: 100,
    allowRotation: true,
    ...overrides,
  };
}

describe('loadContainer', () => {
  it('keeps all placements inside the container and collision-free', () => {
    const result = loadContainer(container, [cargo({ quantity: 8 })]);
    expect(result.validationIssues).toEqual([]);
    expect(result.placements).toHaveLength(8);
  });

  it('respects the container payload limit', () => {
    const result = loadContainer({ ...container, maxPayloadKg: 25 }, [cargo({ quantity: 10, weightKg: 10 })]);
    expect(result.loadedWeightKg).toBeLessThanOrEqual(25);
    expect(result.placements).toHaveLength(2);
    expect(result.remaining[0]?.quantity).toBe(8);
  });

  it('does not exceed maxStackLayers', () => {
    const result = loadContainer(
      { ...container, length: 0.5, width: 0.5, height: 2 },
      [cargo({ quantity: 4, maxStackLayers: 2 })],
    );
    const maxTop = Math.max(...result.placements.map((p) => p.z + p.height), 0);
    expect(maxTop).toBeLessThanOrEqual(1);
    expect(result.placements).toHaveLength(2);
  });

  it('blocks extra stacking when top-load capacity is exceeded', () => {
    const result = loadContainer(
      { ...container, length: 0.5, width: 0.5, height: 1.5 },
      [cargo({ quantity: 3, weightKg: 60, maxStackLayers: 3, maxTopLoadKg: 100 })],
    );
    expect(result.placements).toHaveLength(2);
    expect(result.remaining[0]?.quantity).toBe(1);
  });

  it('uses 90-degree rotation when it increases fit', () => {
    const result = loadContainer(
      { length: 1.2, width: 0.7, height: 0.5, maxPayloadKg: 1000 },
      [cargo({ length: 0.7, width: 0.4, height: 0.5, quantity: 2, maxStackLayers: 1, allowRotation: true })],
    );
    expect(result.placements).toHaveLength(2);
    expect(result.placements.some((p) => p.rotated)).toBe(true);
  });

  it('does not rotate cargo when rotation is disabled', () => {
    const result = loadContainer(
      { length: 1.2, width: 0.7, height: 0.5, maxPayloadKg: 1000 },
      [cargo({ length: 0.7, width: 0.4, height: 0.5, quantity: 2, maxStackLayers: 1, allowRotation: false })],
    );
    expect(result.placements.every((p) => !p.rotated)).toBe(true);
  });

  it('counts decimal dimensions that fit exactly without losing a slot', () => {
    const result = loadContainer(
      { length: 1.2, width: 0.9, height: 0.6, maxPayloadKg: 1000 },
      [cargo({ length: 0.4, width: 0.3, height: 0.3, quantity: 18, maxStackLayers: 2, allowRotation: false })],
    );
    expect(result.placements).toHaveLength(18);
    expect(result.validationIssues).toEqual([]);
  });

  it('stays collision-free under a mixed multi-SKU stress case', () => {
    const stressCargo: CargoItem[] = [
      cargo({ id: 'A', name: 'A', length: 0.6, width: 0.4, height: 0.3, weightKg: 18, quantity: 36, maxStackLayers: 6, maxTopLoadKg: 250 }),
      cargo({ id: 'B', name: 'B', length: 0.5, width: 0.35, height: 0.25, weightKg: 14, quantity: 42, maxStackLayers: 7, maxTopLoadKg: 220 }),
      cargo({ id: 'C', name: 'C', length: 0.45, width: 0.3, height: 0.3, weightKg: 12, quantity: 48, maxStackLayers: 6, maxTopLoadKg: 180 }),
      cargo({ id: 'D', name: 'D', length: 0.4, width: 0.4, height: 0.2, weightKg: 10, quantity: 54, maxStackLayers: 7, maxTopLoadKg: 160 }),
      cargo({ id: 'E', name: 'E', length: 0.35, width: 0.25, height: 0.25, weightKg: 8, quantity: 60, maxStackLayers: 7, maxTopLoadKg: 140 }),
    ];
    const result = loadContainer(
      { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      stressCargo,
    );
    expect(result.validationIssues).toEqual([]);
    expect(result.loadedWeightKg).toBeLessThanOrEqual(26500 + 1e-9);
    expect(result.placements.length).toBeGreaterThan(150);
  });
});
