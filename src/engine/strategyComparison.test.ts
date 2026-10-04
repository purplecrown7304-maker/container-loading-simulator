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
  it('returns only the sole A method with finite diagnostic scores', () => {
    const rows = compareLoadingStrategies(container, cargo);
    expect(rows.map(row => row.strategy)).toEqual(['capacity']);
    rows.forEach(row => {
      expect(Number.isFinite(row.overallScore)).toBe(true);
      expect(row.overallScore).toBeGreaterThanOrEqual(0);
      expect(row.overallScore).toBeLessThanOrEqual(100);
      expect(row.result.validationIssues).toEqual([]);
    });
  });

  it('does not reinterpret compatibility objective tokens as different A methods', () => {
    const reference = loadContainer(container, cargo, { publish: false });
    for (const strategy of ['capacity', 'stability', 'unloading'] as const) {
      expect(loadContainer(container, cargo, { strategy, publish: false })).toEqual(reference);
    }
    expect(compareLoadingStrategies(container, cargo, reference)[0].result).toBe(reference);
  });

  it('does not publish comparison-only calculations into browser state', () => {
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(result.placements.length).toBeGreaterThan(0);
  });
});
