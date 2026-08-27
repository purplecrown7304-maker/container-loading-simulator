import { describe, expect, it } from 'vitest';
import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const baseContainer: ContainerSpec = {
  length: 4,
  width: 1,
  height: 2,
  maxPayloadKg: 10000,
};

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'A',
    name: 'A',
    length: 0.5,
    width: 1,
    height: 0.5,
    weightKg: 10,
    quantity: 4,
    maxStackLayers: 4,
    maxTopLoadKg: 100,
    allowRotation: false,
    ...overrides,
  };
}

function stackAt(placements: Placement[], cargoId: string, x: number, y: number) {
  return placements
    .filter((placement) =>
      placement.cargoId === cargoId
      && Math.abs(placement.x - x) < 1e-9
      && Math.abs(placement.y - y) < 1e-9)
    .sort((a, b) => a.z - b.z);
}

describe('DIRECT BOX block-first loading discipline', () => {
  it.each<LoadingStrategy>(['capacity', 'stability', 'unloading'])(
    '%s keeps the same maximum safe vertical stack instead of lowering the block for strategy shape',
    (strategy) => {
      const result = loadContainer(baseContainer, [cargo()], { strategy, publish: false });
      const stack = stackAt(result.placements, 'A', 0, 0);

      expect(stack).toHaveLength(4);
      expect(stack.map((placement) => placement.z)).toEqual([0, 0.5, 1, 1.5]);
      expect(result.remaining).toEqual([]);
      expect(result.validationIssues).toEqual([]);
    },
  );

  it('derives the pure-stack height from the actual top-load limit', () => {
    const item = cargo({ quantity: 6, maxStackLayers: 7, maxTopLoadKg: 20 });
    const result = loadContainer(baseContainer, [item], { strategy: 'capacity', publish: false });

    const first = stackAt(result.placements, 'A', 0, 0);
    const second = stackAt(result.placements, 'A', 0.5, 0);

    // 10kg boxes with 20kg allowed above a base safely form 3 layers.
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(first.map((placement) => placement.z)).toEqual([0, 0.5, 1]);
    expect(second.map((placement) => placement.z)).toEqual([0, 0.5, 1]);
    expect(result.remaining).toEqual([]);
    expect(result.validationIssues).toEqual([]);
  });

  it('finishes a deferred mixed-tail stack vertically before opening a new floor position', () => {
    const container: ContainerSpec = {
      length: 3,
      width: 1,
      height: 1.2,
      maxPayloadKg: 10000,
    };
    const pure = cargo({
      id: 'PURE', name: 'PURE', length: 0.5, width: 1, height: 0.4,
      quantity: 3, maxStackLayers: 3, maxTopLoadKg: 100,
    });
    const deferred = cargo({
      id: 'TAIL', name: 'TAIL', length: 0.4, width: 0.4, height: 0.3,
      quantity: 2, maxStackLayers: 3, maxTopLoadKg: 100,
    });

    const result = loadContainer(container, [pure, deferred], { strategy: 'capacity', publish: false });
    const tail = result.placements.filter((placement) => placement.cargoId === 'TAIL').sort((a, b) => a.z - b.z);

    expect(tail).toHaveLength(2);
    expect(tail[0]?.x).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(tail[1]?.x).toBeCloseTo(tail[0]!.x, 9);
    expect(tail[1]?.y).toBeCloseTo(tail[0]!.y, 9);
    expect(tail[0]?.z).toBeCloseTo(0, 9);
    expect(tail[1]?.z).toBeCloseTo(0.3, 9);
    expect(result.validationIssues).toEqual([]);
  });

  it('does not run a post-pass that pushes a deferred tail box farther toward the door', () => {
    const container: ContainerSpec = {
      length: 2,
      width: 1,
      height: 1,
      maxPayloadKg: 5000,
    };
    const item = cargo({
      id: 'RAGGED', name: 'RAGGED', length: 0.5, width: 0.5, height: 0.5,
      quantity: 5, maxStackLayers: 2, maxTopLoadKg: 100,
    });

    const result = loadContainer(container, [item], { strategy: 'capacity', publish: false });
    const tail = result.placements.filter((placement) => placement.x >= 0.5 - 1e-9);

    expect(tail).toHaveLength(1);
    expect(tail[0]?.x).toBeCloseTo(0.5, 9);
    expect(result.autoCorrections ?? []).toEqual([]);
    expect(result.validationIssues).toEqual([]);
  });
});
