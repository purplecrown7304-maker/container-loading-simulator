import { describe, expect, it } from 'vitest';
import { centerPlacementsWithFallSafety } from './fallSafetyCentering';
import { filterOperationallyUnsafeShape } from './placementStabilityFilter';
import type { CargoItem, ContainerSpec, Placement } from './types';

function cargo(id = 'GREEN', overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id,
    name: id,
    length: 0.5,
    width: 0.4,
    height: 0.4,
    weightKg: 10,
    quantity: 100,
    maxStackLayers: 8,
    maxTopLoadKg: 500,
    allowRotation: false,
    ...overrides,
  };
}

function column(item: CargoItem, x: number, y: number, layers: number): Placement[] {
  return Array.from({ length: layers }, (_, layer) => ({
    cargoId: item.id,
    x,
    y,
    z: layer * item.height,
    length: item.length,
    width: item.width,
    height: item.height,
    weightKg: item.weightKg,
    rotated: false,
  }));
}

function layerCountAt(placements: Placement[], x: number, y: number) {
  return placements.filter((p) => Math.abs(p.x - x) < 0.001 && Math.abs(p.y - y) < 0.001).length;
}

function horizontalCg(placements: Placement[]) {
  const weight = placements.reduce((sum, p) => sum + p.weightKg, 0);
  return {
    x: placements.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weightKg, 0) / weight,
    y: placements.reduce((sum, p) => sum + (p.y + p.width / 2) * p.weightKg, 0) / weight,
  };
}

describe('fall / overturn prevention with fixed container-center target', () => {
  it('turns a tall wall facing a large empty fall zone into a low edge and staircase', () => {
    const container: ContainerSpec = { length: 2.5, width: 1.2, height: 2.4, maxPayloadKg: 10000 };
    const green = cargo('GREEN');
    const brown = cargo('BROWN');
    const placements: Placement[] = [];

    for (const y of [0, 0.4, 0.8]) placements.push(...column(brown, 0.5, y, 2));
    for (const y of [0, 0.4, 0.8]) placements.push(...column(green, 1.5, y, 5));
    for (const y of [0, 0.4, 0.8]) placements.push(...column(green, 2.0, y, 5));

    const result = filterOperationallyUnsafeShape(container, [green, brown], placements);

    for (const y of [0, 0.4, 0.8]) {
      expect(layerCountAt(result.placements, 1.5, y)).toBeLessThanOrEqual(2);
      expect(layerCountAt(result.placements, 2.0, y)).toBeLessThanOrEqual(3);
    }
    expect(result.removedByCargo.get('GREEN')).toBeGreaterThan(0);
  });

  it('keeps a tall compact block when every exposed face is restrained by a wall or equal-height neighbour', () => {
    const container: ContainerSpec = { length: 1, width: 1, height: 2, maxPayloadKg: 10000 };
    const item = cargo('BLOCK', { width: 0.5, height: 0.4 });
    const placements = [
      ...column(item, 0, 0, 4),
      ...column(item, 0, 0.5, 4),
      ...column(item, 0.5, 0, 4),
      ...column(item, 0.5, 0.5, 4),
    ];

    const result = filterOperationallyUnsafeShape(container, [item], placements);
    expect(result.placements).toHaveLength(placements.length);
    expect(result.removedByCargo.size).toBe(0);
  });

  it('does not revert to the inner wall when centering exposes a fall edge', () => {
    const container: ContainerSpec = { length: 4, width: 1, height: 2, maxPayloadKg: 10000 };
    const item = cargo('STAIR', { width: 0.5, height: 0.5 });
    const wallAnchored = [
      ...column(item, 0, 0, 3),
      ...column(item, 0, 0.5, 3),
      ...column(item, 0.5, 0, 2),
      ...column(item, 0.5, 0.5, 2),
    ];

    const result = centerPlacementsWithFallSafety(container, [item], wallAnchored);
    const cg = horizontalCg(result.placements);

    expect(Math.min(...result.placements.map((p) => p.x))).toBeGreaterThan(0);
    expect(result.removedByCargo.get('STAIR')).toBeGreaterThan(0);
    expect(cg.x).toBeCloseTo(container.length / 2, 6);
    expect(cg.y).toBeCloseTo(container.width / 2, 6);
  });

  it('centers a low fall-safe block on the container center without removing cargo', () => {
    const container: ContainerSpec = { length: 4, width: 1, height: 2, maxPayloadKg: 10000 };
    const item = cargo('LOW', { width: 0.5, height: 0.5 });
    const lowBlock = [
      ...column(item, 0, 0, 2),
      ...column(item, 0, 0.5, 2),
    ];

    const result = centerPlacementsWithFallSafety(container, [item], lowBlock);
    const cg = horizontalCg(result.placements);

    expect(result.placements).toHaveLength(lowBlock.length);
    expect(result.removedByCargo.size).toBe(0);
    expect(cg.x).toBeCloseTo(container.length / 2, 6);
    expect(cg.y).toBeCloseTo(container.width / 2, 6);
  });
});
