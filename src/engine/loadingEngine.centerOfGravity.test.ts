import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 6,
  width: 2.4,
  height: 2.6,
  maxPayloadKg: 20000,
};

function horizontalCog(result: ReturnType<typeof loadContainer>) {
  const total = result.placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  return {
    x: result.placements.reduce((sum, placement) => sum + (placement.x + placement.length / 2) * placement.weightKg, 0) / total,
    y: result.placements.reduce((sum, placement) => sum + (placement.y + placement.width / 2) * placement.weightKg, 0) / total,
  };
}

describe('loadContainer center-of-gravity correction', () => {
  it('moves a partial load toward the geometric target center without breaking hard constraints', () => {
    const cargo: CargoItem[] = [{
      id: 'BOX-A',
      name: 'partial load',
      length: 1,
      width: 0.8,
      height: 0.6,
      weightKg: 100,
      quantity: 4,
      maxStackLayers: 1,
      maxTopLoadKg: 0,
      allowRotation: false,
    }];

    const result = loadContainer(container, cargo, { strategy: 'stability', publish: false });
    const cog = horizontalCog(result);

    expect(result.placements).toHaveLength(4);
    expect(result.validationIssues).toEqual([]);
    expect(cog.x).toBeCloseTo(container.length / 2, 5);
    expect(cog.y).toBeCloseTo(container.width / 2, 5);
    expect(Math.min(...result.placements.map(item => item.x))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...result.placements.map(item => item.x + item.length))).toBeLessThanOrEqual(container.length);
  });
});
