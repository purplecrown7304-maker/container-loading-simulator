import { describe, expect, it } from 'vitest';
import { addIncompatiblePair, addRecommendedPairs, normalizeIncompatiblePairs, RECOMMENDED_INCOMPATIBLE_PAIRS, removeIncompatiblePair, segregationPreview, SEGREGATION_CLASSES, TEMP_ZONES } from './segregationSettings';
import { operationalErrors, validateOperationalLoading } from './engine/operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';

describe('segregation input settings', () => {
  it('normalizes pairs: trims, drops blanks and self pairs, and treats order as irrelevant', () => {
    expect(normalizeIncompatiblePairs([[' 식품 ', '화학품'], ['화학품', '식품'], ['식품', '식품'], ['', '위험물']])).toEqual([['식품', '화학품']]);
    expect(normalizeIncompatiblePairs(undefined)).toEqual([]);
  });

  it('adds and removes a pair regardless of the order given', () => {
    const added = addIncompatiblePair([['식품', '화학품']], '위험물', '식품');
    expect(added).toEqual([['식품', '화학품'], ['위험물', '식품']]);
    expect(addIncompatiblePair(added, '식품', '위험물')).toEqual(added);
    expect(removeIncompatiblePair(added, '식품', '위험물')).toEqual([['식품', '화학품']]);
  });

  it('adds the recommended pairs only on request and only from the offered classes', () => {
    expect(normalizeIncompatiblePairs([])).toEqual([]);
    const pairs = addRecommendedPairs([['식품', '화학품']]);
    expect(pairs).toHaveLength(RECOMMENDED_INCOMPATIBLE_PAIRS.length);
    for (const [a, b] of pairs) {
      expect(SEGREGATION_CLASSES).toContain(a);
      expect(SEGREGATION_CLASSES).toContain(b);
    }
  });

  it('previews exactly what the validator reports for the same input', () => {
    const container: ContainerSpec = { length: 10, width: 2, height: 2.5, maxPayloadKg: 20000, incompatiblePairs: addRecommendedPairs([]) };
    const item = (id: string, patch: Partial<CargoItem>): CargoItem => ({ id, name: id, length: 1, width: 1, height: 0.5, weightKg: 10, quantity: 1, ...patch });
    const cargo = [item('F', { segregationClass: '식품', tempZone: TEMP_ZONES[1] }), item('C', { segregationClass: '화학품', tempZone: TEMP_ZONES[0] }), item('Z', { segregationClass: '위험물', quantity: 0 })];
    const preview = segregationPreview(container, cargo);
    expect(preview.conflicts).toEqual([['식품', '화학품']]);
    expect(preview.mixedZones).toEqual(['냉장', '상온']);
    const placements: Placement[] = [
      { cargoId: 'F', x: 0, y: 0, z: 0, length: 1, width: 1, height: 0.5, weightKg: 10 },
      { cargoId: 'C', x: 9, y: 1, z: 0, length: 1, width: 1, height: 0.5, weightKg: 10 },
    ];
    const codes = operationalErrors(validateOperationalLoading(container, cargo, placements)).map(f => f.code);
    expect(codes.filter(code => code === 'INCOMPATIBLE_CARGO')).toHaveLength(preview.conflicts.length);
    expect(codes).toContain('MIXED_TEMP_ZONE');
  });

  it('previews nothing when classes are set but no pair is registered', () => {
    const preview = segregationPreview({ incompatiblePairs: [] }, [{ quantity: 1, segregationClass: '식품' }, { quantity: 1, segregationClass: '화학품' }]);
    expect(preview).toEqual({ conflicts: [], mixedZones: [] });
  });
});
