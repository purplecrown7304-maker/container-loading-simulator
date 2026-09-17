import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { packByHybridOptimizer } from './hybridLoadingOptimizer';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = {
  length: 6,
  width: 2.4,
  height: 2.6,
  maxPayloadKg: 20000,
};

function horizontalCog(placements: Placement[]) {
  const total = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  return {
    x: placements.reduce((sum, placement) => sum + (placement.x + placement.length / 2) * placement.weightKg, 0) / total,
    y: placements.reduce((sum, placement) => sum + (placement.y + placement.width / 2) * placement.weightKg, 0) / total,
  };
}

describe('loadContainer center-of-gravity correction', () => {
  it('moves a partial load as close as container bounds permit without breaking hard constraints', () => {
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

    const raw = packByHybridOptimizer(container, cargo, 'stability');
    const before = horizontalCog(raw.placements);
    const result = loadContainer(container, cargo, { strategy: 'stability', publish: false });
    const after = horizontalCog(result.placements);
    const distance = (cog: { x: number; y: number }) => Math.hypot(
      cog.x - container.length / 2,
      cog.y - container.width / 2,
    );

    expect(result.placements).toHaveLength(4);
    expect(result.validationIssues).toEqual([]);
    expect(distance(after)).toBeLessThanOrEqual(distance(before) + 1e-9);
    expect(Math.min(...result.placements.map((item) => item.x))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...result.placements.map((item) => item.x + item.length))).toBeLessThanOrEqual(container.length + 1e-9);
    expect(Math.min(...result.placements.map((item) => item.y))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...result.placements.map((item) => item.y + item.width))).toBeLessThanOrEqual(container.width + 1e-9);
  });
});
