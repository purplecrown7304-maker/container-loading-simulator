import { describe, expect, it } from 'vitest';
import { planMultipleContainers } from './multiContainerPlanner';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5, weightKg: 10, quantity: 12, maxStackLayers: 2, maxTopLoadKg: 100 }];

describe('multi-container planner', () => {
  it('splits cargo across multiple identical containers without losing quantity', () => {
    const plan = planMultipleContainers(container, cargo, 'capacity', 5);
    expect(plan.containers.length).toBe(2);
    expect(plan.totalLoaded).toBe(12);
    expect(plan.totalRemaining).toBe(0);
    expect(plan.complete).toBe(true);
    expect(plan.containers[0].loadedCount).toBe(8);
    expect(plan.containers[1].loadedCount).toBe(4);
  });

  it('stops safely when remaining cargo cannot fit at all', () => {
    const impossible: CargoItem[] = [{ id: 'BIG', name: 'BIG', length: 2, width: 2, height: 2, weightKg: 10, quantity: 2 }];
    const plan = planMultipleContainers(container, impossible, 'capacity', 5);
    expect(plan.complete).toBe(false);
    expect(plan.totalRemaining).toBe(2);
    expect(plan.stoppedReason).toContain('1개도 적재할 수 없는');
  });
});
