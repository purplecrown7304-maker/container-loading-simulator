import { describe, expect, it } from 'vitest';
import { buildStackAnalysis } from './diagnosticBlackbox';
import type { PhysicsSupport } from './engine/physicsValidation';
import type { CargoItem, LoadingResult } from './engine/types';

describe('diagnostic pallet support analysis', () => {
  it('recognizes a pallet as valid support for its first carton layer', () => {
    const cargo: CargoItem[] = [{
      id: 'A',
      name: 'A',
      length: 0.5,
      width: 0.5,
      height: 0.25,
      weightKg: 10,
      quantity: 2,
      maxStackLayers: 2,
      maxTopLoadKg: 100,
    }];
    const result: LoadingResult = {
      placements: [
        { cargoId: 'A', x: 0.1, y: 0.1, z: 0.15, length: 0.5, width: 0.5, height: 0.25, weightKg: 10 },
        { cargoId: 'A', x: 0.1, y: 0.1, z: 0.4, length: 0.5, width: 0.5, height: 0.25, weightKg: 10 },
      ],
      remaining: [],
      loadedWeightKg: 45,
      usedVolumeM3: 0.125,
      validationIssues: [],
    };
    const supports: PhysicsSupport[] = [{
      id: 'PALLET-01',
      x: 0,
      y: 0,
      z: 0,
      length: 1.1,
      width: 1.1,
      height: 0.15,
      weightKg: 25,
      dynamic: true,
    }];

    const analysis = buildStackAnalysis(cargo, result, supports);

    expect(analysis[0].supportType).toBe('pallet');
    expect(analysis[0].supportRatioPct).toBeCloseTo(100);
    expect(analysis[0].centerSupported).toBe(true);
    expect(analysis[0].unsupported).toBe(false);
    expect(analysis[0].stackLevel).toBe(1);
    expect(analysis[1].supportType).toBe('cargo');
    expect(analysis[1].stackLevel).toBe(2);
    expect(analysis.every(item => !item.tippingRisk)).toBe(true);
  });

  it('still flags a floating carton when no cargo or pallet supports it', () => {
    const cargo: CargoItem[] = [{
      id: 'A',
      name: 'A',
      length: 0.5,
      width: 0.5,
      height: 0.25,
      weightKg: 10,
      quantity: 1,
    }];
    const result: LoadingResult = {
      placements: [
        { cargoId: 'A', x: 0, y: 0, z: 0.3, length: 0.5, width: 0.5, height: 0.25, weightKg: 10 },
      ],
      remaining: [],
      loadedWeightKg: 10,
      usedVolumeM3: 0.0625,
      validationIssues: [],
    };

    const [analysis] = buildStackAnalysis(cargo, result, []);

    expect(analysis.supportType).toBe('unsupported');
    expect(analysis.unsupported).toBe(true);
    expect(analysis.tippingRisk).toBe(true);
  });
});
