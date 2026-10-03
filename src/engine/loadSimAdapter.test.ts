import { describe, expect, it } from 'vitest';
import { packWithLoadSimRules, validateWithLoadSimRules } from './loadSimAdapter';
import type { CargoItem, ContainerSpec, Placement } from './types';

const gp20: ContainerSpec = {
  length: 5.898, width: 2.352, height: 2.393, maxPayloadKg: 28200, floorLineLoadKgPerM: 4500,
};

describe('uploaded load-sim adapter', () => {
  it('packs through the uploaded engine and exposes its exact rule codes', () => {
    const cargo: CargoItem[] = [{
      id: 'C', name: 'carton', loadType: 'carton',
      length: .6, width: .4, height: .4, weightKg: 18, quantity: 8,
      maxTopLoadKg: 90,
    }];
    const result = packWithLoadSimRules(gp20, cargo);
    expect(result.placements).toHaveLength(8);
    expect(result.remaining).toEqual([]);
    expect(result.operationalFindings?.some(f => f.severity === 'error')).toBe(false);
    expect(result.autoCorrections).toEqual([]);
  });

  it('applies the uploaded 80% support rule', () => {
    const cargo: CargoItem[] = [{
      id: 'A', name: 'A', loadType: 'carton',
      length: .6, width: .4, height: .4, weightKg: 10, quantity: 2,
    }];
    const placements: Placement[] = [
      { cargoId: 'A', x: 2, y: .5, z: 0, length: .6, width: .4, height: .4, weightKg: 10, loadSimOrientation: 'LWH' },
      { cargoId: 'A', x: 2.3, y: .5, z: .4, length: .6, width: .4, height: .4, weightKg: 10, loadSimOrientation: 'LWH' },
    ];
    const { findings } = validateWithLoadSimRules(gp20, cargo, placements);
    expect(findings.map(f => f.code)).toContain('INSUFFICIENT_SUPPORT');
  });

  it('uses pallet/forklift door-clearance rules from the uploaded file', () => {
    const gp40: ContainerSpec = {
      length: 12.032, width: 2.352, height: 2.393, maxPayloadKg: 26700, floorLineLoadKgPerM: 3000,
    };
    const cargo: CargoItem[] = [{
      id: 'P', name: 'tall pallet', loadType: 'pallet',
      length: 1.1, width: 1.1, height: 2.25, weightKg: 500, quantity: 1,
    }];
    const placements: Placement[] = [{
      cargoId: 'P', x: 5.4, y: .6, z: 0,
      length: 1.1, width: 1.1, height: 2.25, weightKg: 500, loadSimOrientation: 'LWH',
    }];
    const { findings } = validateWithLoadSimRules(gp40, cargo, placements);
    expect(findings.map(f => f.code)).toContain('DOOR_NOT_PASSABLE');
  });
});
