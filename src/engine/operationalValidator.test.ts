import { describe, expect, it } from 'vitest';
import { operationalErrors, validateOperationalLoading } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './types';

const box = (patch: Partial<Placement> = {}): Placement => ({
  cargoId: 'A', x: 1.5, y: .5, z: 0, length: 1, width: 1, height: .5, weightKg: 100, ...patch,
});
const item: CargoItem = {
  id: 'A', name: 'A', length: 1, width: 1, height: .5, weightKg: 100, quantity: 10,
  maxTopLoadKg: 500, maxStackLayers: 5, allowRotation: true,
};
const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };

describe('load-sim operational validator adapter', () => {
  it('accepts a centered floor load and reports securing gaps as warnings only', () => {
    const findings = validateOperationalLoading(container, [item], [box()]);
    expect(operationalErrors(findings)).toEqual([]);
    expect(findings.some(finding => finding.code === 'REAR_GAP' && finding.severity === 'warning')).toBe(true);
  });

  it('enforces 80% support and center-of-gravity support', () => {
    const placements = [
      box({ x: 1.5, y: .5, z: 0 }),
      box({ x: 2.05, y: .5, z: .5 }),
    ];
    const codes = operationalErrors(validateOperationalLoading(container, [item], placements)).map(finding => finding.code);
    expect(codes).toContain('INSUFFICIENT_SUPPORT');
  });

  it('uses pallet supports as physical support surfaces', () => {
    const cargo = [{ ...item, length: .5, width: .5, height: .3, weightKg: 20 }];
    const placements = [{ cargoId: 'A', x: 1.75, y: .75, z: .15, length: .5, width: .5, height: .3, weightKg: 20 }];
    const supports = [{ id: 'PALLET-1', x: 1.45, y: .45, z: 0, length: 1.1, width: 1.1, height: .15, weightKg: 25 }];
    const codes = operationalErrors(validateOperationalLoading(container, cargo, placements, supports)).map(finding => finding.code);
    expect(codes).not.toContain('FLOATING');
    expect(codes).not.toContain('INSUFFICIENT_SUPPORT');
  });

  it('flags reversed rear-door unload order', () => {
    const cargo = [
      { ...item, id: 'FIRST', unloadPriority: 1 },
      { ...item, id: 'LATER', unloadPriority: 2 },
    ];
    const placements: Placement[] = [
      { ...box(), cargoId: 'FIRST', x: .5 },
      { ...box(), cargoId: 'LATER', x: 2 },
    ];
    const codes = operationalErrors(validateOperationalLoading(container, cargo, placements)).map(finding => finding.code);
    expect(codes).toContain('UNLOAD_BLOCKED');
  });

  it('flags excessive longitudinal center-of-gravity offset', () => {
    const findings = validateOperationalLoading(container, [item], [box({ x: 0 })]);
    expect(operationalErrors(findings).map(finding => finding.code)).toContain('CG_LONGITUDINAL');
  });

  it('uses known equipment door dimensions when the container matches the catalog', () => {
    const hc: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
    const tallItem: CargoItem = { ...item, id: 'TALL', height: 2.65, width: 1, length: 1, quantity: 1 };
    const placement: Placement = { cargoId: 'TALL', x: 5.5, y: .675, z: 0, length: 1, width: 1, height: 2.65, weightKg: 100 };
    const codes = operationalErrors(validateOperationalLoading(hc, [tallItem], [placement])).map(finding => finding.code);
    expect(codes).toContain('DOOR_NOT_PASSABLE');
  });
});
