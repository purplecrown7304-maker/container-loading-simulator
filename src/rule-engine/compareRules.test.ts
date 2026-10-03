import { describe, expect, it } from 'vitest';
import { compareRuleEngines } from './compareRules';
import { auditLoading } from '../engine/loadingAudit';
import { validatePlacementsWithLoadSim } from './loadSimEngine';
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


describe('rule-level validation differences', () => {
  it('documents 75% support: legacy 65% passes while A default 80% rejects', () => {
    const container: ContainerSpec = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
    const rows: CargoItem[] = [
      cargo({ id: 'BASE', name: 'BASE', length: .75, width: 1, height: .5, quantity: 1 }),
      cargo({ id: 'TOP', name: 'TOP', length: 1, width: 1, height: .5, quantity: 1 }),
    ];
    const placements = [
      { cargoId: 'BASE', x: 0, y: 0, z: 0, length: .75, width: 1, height: .5, weightKg: 10 },
      { cargoId: 'TOP', x: 0, y: 0, z: .5, length: 1, width: 1, height: .5, weightKg: 10 },
    ];
    expect(auditLoading(container, rows, placements).some(issue => issue.type === 'UNSUPPORTED')).toBe(false);
    const next = validatePlacementsWithLoadSim(container, rows, placements);
    expect(next.violations.some(v => v.code === 'INSUFFICIENT_SUPPORT')).toBe(true);
  });

  it('documents the new mixed-temperature hard rule', () => {
    const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 1000 };
    const result = compareRuleEngines(container, [
      cargo({ id: 'COLD', name: 'COLD', tempZone: 'chilled' }),
      cargo({ id: 'AMBIENT', name: 'AMBIENT', tempZone: 'ambient' }),
    ]);
    expect((result.legacy.operationalFindings ?? []).some(v => v.code === 'MIXED_TEMP_ZONE')).toBe(false);
    expect((result.next.operationalFindings ?? []).some(v => v.code === 'MIXED_TEMP_ZONE')).toBe(true);
  });
});
