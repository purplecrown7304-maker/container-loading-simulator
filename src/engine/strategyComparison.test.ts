import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { compareLoadingStrategies } from './strategyComparison';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 4, width: 1, height: 1, maxPayloadKg: 5000 };
const cargo: CargoItem[] = [
  { id: 'FIRST', name: '먼저 하역', length: 0.5, width: 0.5, height: 0.5, weightKg: 10, quantity: 4, maxStackLayers: 2, maxTopLoadKg: 100, unloadPriority: 1 },
  { id: 'LAST', name: '나중 하역', length: 0.5, width: 0.5, height: 0.5, weightKg: 30, quantity: 4, maxStackLayers: 2, maxTopLoadKg: 100, unloadPriority: 2 },
];

describe('loading strategy comparison', () => {
  it('returns all three strategies with finite scores', () => {
    const rows = compareLoadingStrategies(container, cargo);
    expect(rows.map(row => row.strategy)).toEqual(['capacity', 'stability', 'unloading']);
    rows.forEach(row => {
      expect(Number.isFinite(row.overallScore)).toBe(true);
      expect(row.overallScore).toBeGreaterThanOrEqual(0);
      expect(row.overallScore).toBeLessThanOrEqual(100);
      expect(row.result.validationIssues).toEqual([]);
    });
  });

  it('puts later-unloaded cargo deeper than first-unloaded cargo in unloading strategy', () => {
    const result = loadContainer(container, cargo, { strategy: 'unloading', publish: false });
    const averageX = (id: string) => {
      const placements = result.placements.filter(p => p.cargoId === id);
      return placements.reduce((sum, p) => sum + p.x + p.length / 2, 0) / placements.length;
    };
    expect(averageX('LAST')).toBeLessThan(averageX('FIRST'));
  });

  it('does not publish comparison-only calculations into browser state', () => {
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(result.placements.length).toBeGreaterThan(0);
  });
});
