import { describe, expect, it } from 'vitest';
import { moveLowRowsToDoorZone } from './rowOptimizer';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 6, width: 2, height: 2.4, maxPayloadKg: 5000 };
const item: CargoItem = { id: 'A', name: 'A', length: 1, width: 1, height: 0.4, weightKg: 10, quantity: 20, maxStackLayers: 6, maxTopLoadKg: 500, allowRotation: true };
const cargoMap = new Map([[item.id, item]]);

const p = (x: number, y: number, z: number): Placement => ({ cargoId: 'A', x, y, z, length: 1, width: 1, height: 0.4, weightKg: 10 });

describe('moveLowRowsToDoorZone', () => {
  it('moves a one-layer interior row to the door-side mixed zone when safe', () => {
    const placements: Placement[] = [
      p(0, 0, 0), p(0, 1, 0), p(0, 0, 0.4), p(0, 1, 0.4), p(0, 0, 0.8), p(0, 1, 0.8),
      p(1, 0, 0), p(1, 1, 0), p(1, 0, 0.4), p(1, 1, 0.4), p(1, 0, 0.8), p(1, 1, 0.8),
      p(2, 0, 0), p(2, 1, 0),
    ];
    const result = moveLowRowsToDoorZone(container, placements, cargoMap);
    expect(result.flaggedRows).toBeGreaterThanOrEqual(1);
    expect(result.movedCount).toBeGreaterThan(0);
    expect(result.placements.some((box) => box.x >= 4 - 1e-6)).toBe(true);
    expect(result.placements).toHaveLength(placements.length);
  });

  it('does not move a box that supports another box', () => {
    const placements: Placement[] = [
      p(0, 0, 0), p(0, 1, 0), p(0, 0, 0.4), p(0, 1, 0.4), p(0, 0, 0.8), p(0, 1, 0.8),
      p(1, 0, 0), p(1, 1, 0), p(1, 0, 0.4), p(1, 1, 0.4), p(1, 0, 0.8), p(1, 1, 0.8),
      p(2, 0, 0), p(2, 0, 0.4),
    ];
    const result = moveLowRowsToDoorZone(container, placements, cargoMap);
    expect(result.placements.some((box) => Math.abs(box.x - 2) < 1e-6 && Math.abs(box.z) < 1e-6)).toBe(true);
  });
});
