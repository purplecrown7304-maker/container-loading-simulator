import { describe, expect, it } from 'vitest';
import { compareRuleEngines } from './compareRules';
import type { CargoItem, ContainerSpec } from '../engine/types';

const cargo = (patch: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A',
  name: 'A',
  length: .2,
  width: .2,
  height: .2,
  weightKg: 10,
  quantity: 1,
  allowRotation: true,
  ...patch,
});

describe('legacy vs approved load-sim rule bundle', () => {
  it('records the boundary-margin difference without changing production default', () => {
    const container: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 1000 };
    const result = compareRuleEngines(container, [cargo({ length: 1, width: 1, height: 1 })]);
    expect(result.legacy.placements).toHaveLength(1);
    expect(result.next.placements).toHaveLength(0);
    expect(result.next.remaining[0]?.quantity).toBe(1);
  });

  it('records the six-orientation carton difference', () => {
    const container: ContainerSpec = { length: .7, width: .45, height: .35, maxPayloadKg: 1000 };
    const result = compareRuleEngines(container, [cargo({ length: .5, width: .3, height: .4, loadSimType: 'carton' })]);
    expect(result.legacy.placements).toHaveLength(0);
    expect(result.next.placements).toHaveLength(1);
    expect(result.next.placements[0].loadSimOrientation).not.toBeUndefined();
  });

  it('keeps an ordinary small centered load possible in both engines', () => {
    const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };
    const result = compareRuleEngines(container, [cargo({ quantity: 2 })]);
    expect(result.legacy.placements).toHaveLength(2);
    expect(result.next.placements).toHaveLength(2);
    expect(result.legacy.loadedWeightKg).toBe(20);
    expect(result.next.loadedWeightKg).toBe(20);
  });

  it('marks the new result with the new engine while the explicit legacy run stays legacy', () => {
    const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };
    const result = compareRuleEngines(container, [cargo()]);
    expect(result.legacy.ruleEngine).toBe('legacy');
    expect(result.next.ruleEngine).toBe('load-sim');
  });
});
