import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'BOX-A', name: 'BOX A', length: 0.5, width: 0.5, height: 0.5,
    weightKg: 10, quantity: 4, maxStackLayers: 2, maxTopLoadKg: 100, allowRotation: true,
    ...overrides,
  };
}

function signature(placements: Placement[]) {
  return placements.map((p) => [p.cargoId, p.x, p.y, p.z, p.length, p.width, p.height].join(':')).sort();
}

describe('block + maximal-empty-space + beam loading engine', () => {
  it('keeps all placements inside the container and collision-free', () => {
    const result = loadContainer(container, [cargo({ quantity: 8 })], { publish: false });
    expect(result.validationIssues).toEqual([]);
    expect(result.placements).toHaveLength(8);
  });

  it('respects the container payload limit', () => {
    const result = loadContainer({ ...container, maxPayloadKg: 25 }, [cargo({ quantity: 10, weightKg: 10 })], { publish: false });
    expect(result.loadedWeightKg).toBeLessThanOrEqual(25);
    expect(result.placements).toHaveLength(2);
    expect(result.remaining[0]?.quantity).toBe(8);
  });

  it('does not exceed maxStackLayers', () => {
    const result = loadContainer(
      { ...container, length: 0.5, width: 0.5, height: 2 },
      [cargo({ quantity: 4, maxStackLayers: 2 })],
      { publish: false },
    );
    expect(result.placements).toHaveLength(2);
    expect(Math.max(...result.placements.map((p) => p.z + p.height), 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('checks cumulative top load instead of only the immediately upper box', () => {
    const result = loadContainer(
      { ...container, length: 0.5, width: 0.5, height: 1.5 },
      [cargo({ quantity: 3, weightKg: 60, maxStackLayers: 3, maxTopLoadKg: 100 })],
      { publish: false },
    );
    expect(result.placements).toHaveLength(2);
    expect(result.remaining[0]?.quantity).toBe(1);
  });

  it('uses 90-degree rotation when it creates a viable homogeneous block', () => {
    const result = loadContainer(
      { length: 1.2, width: 0.7, height: 0.5, maxPayloadKg: 1000 },
      [cargo({ length: 0.7, width: 0.4, height: 0.5, quantity: 2, maxStackLayers: 1, allowRotation: true })],
      { publish: false },
    );
    expect(result.placements).toHaveLength(2);
    expect(result.placements.every((p) => p.rotated)).toBe(true);
  });

  it('does not rotate cargo when rotation is disabled', () => {
    const result = loadContainer(
      { length: 1.2, width: 0.7, height: 0.5, maxPayloadKg: 1000 },
      [cargo({ length: 0.7, width: 0.4, height: 0.5, quantity: 2, maxStackLayers: 1, allowRotation: false })],
      { publish: false },
    );
    expect(result.placements.every((p) => !p.rotated)).toBe(true);
  });

  it('counts exact decimal fits without losing a slot', () => {
    const result = loadContainer(
      { length: 1.2, width: 0.9, height: 0.6, maxPayloadKg: 1000 },
      [cargo({ length: 0.4, width: 0.3, height: 0.3, quantity: 18, maxStackLayers: 2, allowRotation: false })],
      { publish: false },
    );
    expect(result.placements).toHaveLength(18);
    expect(result.validationIssues).toEqual([]);
  });

  it('builds a compact rectangular same-SKU block instead of scattered vertical shelves', () => {
    const result = loadContainer(
      { length: 2, width: 1, height: 1, maxPayloadKg: 5000 },
      [cargo({ id: 'BLOCK', length: 0.5, width: 0.5, height: 0.5, quantity: 8, maxStackLayers: 2 })],
      { publish: false },
    );
    const minX = Math.min(...result.placements.map((p) => p.x));
    const minY = Math.min(...result.placements.map((p) => p.y));
    const minZ = Math.min(...result.placements.map((p) => p.z));
    const maxX = Math.max(...result.placements.map((p) => p.x + p.length));
    const maxY = Math.max(...result.placements.map((p) => p.y + p.width));
    const maxZ = Math.max(...result.placements.map((p) => p.z + p.height));
    const boundingVolume = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
    expect(result.placements).toHaveLength(8);
    expect(minX).toBeCloseTo(0, 6);
    expect(minZ).toBeCloseTo(0, 6);
    expect(boundingVolume).toBeCloseTo(result.usedVolumeM3, 6);
  });

  it('reuses an inner maximal empty space for residual mixed cargo instead of forcing a door-side tail', () => {
    const result = loadContainer(
      { length: 1, width: 1, height: 1, maxPayloadKg: 5000 },
      [
        cargo({ id: 'WIDE', length: 1, width: 0.6, height: 1, quantity: 1, maxStackLayers: 1, allowRotation: false }),
        cargo({ id: 'NARROW', length: 1, width: 0.4, height: 1, quantity: 1, maxStackLayers: 1, allowRotation: false }),
      ],
      { publish: false },
    );
    expect(result.placements).toHaveLength(2);
    expect(result.placements.every((p) => Math.abs(p.x) < 1e-9)).toBe(true);
    expect(result.validationIssues).toEqual([]);
  });

  it('is deterministic and input-order independent', () => {
    const items = [
      cargo({ id: 'C', length: 0.4, width: 0.3, height: 0.25, quantity: 5, maxStackLayers: 3 }),
      cargo({ id: 'A', length: 0.5, width: 0.35, height: 0.25, quantity: 4, maxStackLayers: 3 }),
      cargo({ id: 'B', length: 0.3, width: 0.25, height: 0.2, quantity: 6, maxStackLayers: 4 }),
    ];
    const forward = loadContainer(container, items, { publish: false });
    const reverse = loadContainer(container, [...items].reverse(), { publish: false });
    expect(signature(forward.placements)).toEqual(signature(reverse.placements));
    expect(forward.remaining).toEqual(reverse.remaining);
    expect(forward.validationIssues).toEqual([]);
  });

  it('stays collision-free under a mixed multi-SKU stress case', () => {
    const stressCargo: CargoItem[] = [
      cargo({ id: 'A', length: 0.6, width: 0.4, height: 0.3, weightKg: 18, quantity: 20, maxStackLayers: 6, maxTopLoadKg: 250 }),
      cargo({ id: 'B', length: 0.5, width: 0.35, height: 0.25, weightKg: 14, quantity: 24, maxStackLayers: 7, maxTopLoadKg: 220 }),
      cargo({ id: 'C', length: 0.45, width: 0.3, height: 0.3, weightKg: 12, quantity: 28, maxStackLayers: 6, maxTopLoadKg: 180 }),
      cargo({ id: 'D', length: 0.4, width: 0.4, height: 0.2, weightKg: 10, quantity: 30, maxStackLayers: 7, maxTopLoadKg: 160 }),
      cargo({ id: 'E', length: 0.35, width: 0.25, height: 0.25, weightKg: 8, quantity: 32, maxStackLayers: 7, maxTopLoadKg: 140 }),
    ];
    const result = loadContainer({ length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 }, stressCargo, { publish: false });
    expect(result.validationIssues).toEqual([]);
    expect(result.loadedWeightKg).toBeLessThanOrEqual(26500 + 1e-9);
    expect(result.placements.length).toBeGreaterThan(80);
  }, 15000);
});
