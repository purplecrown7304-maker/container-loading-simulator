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

  it('fills complete same-SKU slices from the inside before moving toward the door', () => {
    const result = loadContainer(
      { length: 2, width: 1, height: 1, maxPayloadKg: 5000 },
      [cargo({ id: 'FULL', name: 'FULL', length: 0.5, width: 0.5, height: 0.5, quantity: 8, maxStackLayers: 2 })],
    );
    const xs = [...new Set(result.placements.map((p) => Number(p.x.toFixed(6))))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 0.5]);
    for (const x of xs) expect(result.placements.filter((p) => Math.abs(p.x - x) < 1e-9)).toHaveLength(4);
  });

  it('defers an incomplete same-SKU slice instead of opening a ragged next slice', () => {
    const result = loadContainer(
      { length: 2, width: 1, height: 1, maxPayloadKg: 5000 },
      [cargo({ id: 'RAGGED', name: 'RAGGED', length: 0.5, width: 0.5, height: 0.5, quantity: 5, maxStackLayers: 2 })],
    );
    const fullInsideSlice = result.placements.filter((p) => Math.abs(p.x) < 1e-9);
    expect(fullInsideSlice).toHaveLength(4);
    expect(result.placements).toHaveLength(5);
    expect(result.validationIssues).toEqual([]);
  });

  it('prioritizes larger CBM demand and weight before smaller cargo', () => {
    const result = loadContainer(
      { length: 2, width: 1, height: 1, maxPayloadKg: 5000 },
      [
        cargo({ id: 'SMALL', name: 'SMALL', length: 0.25, width: 0.25, height: 0.25, weightKg: 2, quantity: 8, maxStackLayers: 4 }),
        cargo({ id: 'BIG', name: 'BIG', length: 0.5, width: 0.5, height: 0.5, weightKg: 30, quantity: 8, maxStackLayers: 2 }),
      ],
    );
    const insideMost = [...result.placements].sort((a, b) => a.x - b.x)[0];
    expect(insideMost?.cargoId).toBe('BIG');
    expect(result.validationIssues).toEqual([]);
  });

  it('keeps deferred mixed cargo at or behind the final pure-SKU block boundary', () => {
    const result = loadContainer(
      { length: 3, width: 1, height: 1, maxPayloadKg: 5000 },
      [
        cargo({ id: 'PRIMARY', name: 'PRIMARY', length: 0.5, width: 0.5, height: 0.5, weightKg: 30, quantity: 4, maxStackLayers: 2, allowRotation: false }),
        cargo({ id: 'TAIL', name: 'TAIL', length: 0.5, width: 0.5, height: 0.5, weightKg: 5, quantity: 1, maxStackLayers: 2, allowRotation: false }),
      ],
    );
    const primary = result.placements.filter((p) => p.cargoId === 'PRIMARY');
    const tail = result.placements.filter((p) => p.cargoId === 'TAIL');
    const pureBoundary = Math.max(...primary.map((p) => p.x + p.length));
    expect(primary).toHaveLength(4);
    expect(tail).toHaveLength(1);
    expect(tail.every((p) => p.x + 1e-9 >= pureBoundary)).toBe(true);
    expect(result.validationIssues).toEqual([]);
  });

  // 대량 혼합 적재는 GitHub hosted runner 편차가 커 기본 5초 제한과 분리한다.
  // correctness는 동일하게 검증하고, 10초 안에 끝나지 못하면 성능 회귀로 실패시킨다.
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
  }, 10000);
});
