import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { DEFAULT_HALF_WEIGHT_WARNING_RATIO, operationalErrors, validateOperationalLoading } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 10, width: 2, height: 2.5, maxPayloadKg: 20000 };
const cargo = (id: string, weightKg: number, patch: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: 1, width: 1, height: 0.5, weightKg, quantity: 50, maxStackLayers: 5, allowRotation: true, ...patch,
});
const box = (cargoId: string, weightKg: number, x: number, y: number, z = 0): Placement => ({
  cargoId, x, y, z, length: 1, width: 1, height: 0.5, weightKg,
});
const codes = (findings: ReturnType<typeof validateOperationalLoading>, code: string) => findings.filter(f => f.code === code);

describe('LOADING_RULES R-7 half-weight concentration warning', () => {
  it('stays silent for an evenly spread load', () => {
    const placements = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(x => [box('A', 100, x, 0), box('A', 100, x, 1)]);
    expect(codes(validateOperationalLoading(container, [cargo('A', 100)], placements), 'HALF_WEIGHT_CONCENTRATION')).toEqual([]);
  });

  it('warns with the measured share when the inner half carries more than 60%', () => {
    // 7 of 10 equal boxes inside X < 5 m → 70% inner, both width halves equal.
    const xs = [0, 1, 2, 3, 0, 1, 2, 5, 6, 7];
    const placements = xs.map((x, i) => box('A', 100, x, i < 4 || i === 7 || i === 8 ? 0 : 1));
    const found = codes(validateOperationalLoading(container, [cargo('A', 100)], placements), 'HALF_WEIGHT_CONCENTRATION');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warning');
    expect(found[0].value).toBeCloseTo(0.7, 9);
    expect(found[0].limit).toBe(DEFAULT_HALF_WEIGHT_WARNING_RATIO);
    expect(found[0].message).toContain('안쪽');
  });

  it('splits a package that crosses the centre line by its projected footprint', () => {
    // One box from X = 4.5 to 5.5 puts exactly half its weight in each half.
    const placements = [box('A', 100, 4.5, 0), box('A', 100, 4.5, 1)];
    expect(codes(validateOperationalLoading(container, [cargo('A', 100)], placements), 'HALF_WEIGHT_CONCENTRATION')).toEqual([]);
  });

  it('reports the lateral side separately', () => {
    const placements = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => box('A', 100, x, 0));
    const found = codes(validateOperationalLoading(container, [cargo('A', 100)], placements), 'HALF_WEIGHT_CONCENTRATION');
    expect(found).toHaveLength(1);
    expect(found[0].value).toBeCloseTo(1, 9);
    expect(found[0].message).toContain('좌측');
  });

  it('honours a configured ratio and ignores an invalid one', () => {
    const xs = [0, 1, 2, 3, 0, 1, 2, 5, 6, 7];
    const placements = xs.map((x, i) => box('A', 100, x, i < 4 || i === 7 || i === 8 ? 0 : 1));
    const relaxed = validateOperationalLoading({ ...container, halfWeightWarningRatio: 0.75 }, [cargo('A', 100)], placements);
    expect(codes(relaxed, 'HALF_WEIGHT_CONCENTRATION')).toEqual([]);
    const invalid = validateOperationalLoading({ ...container, halfWeightWarningRatio: 0.2 }, [cargo('A', 100)], placements);
    expect(codes(invalid, 'HALF_WEIGHT_CONCENTRATION')[0].limit).toBe(DEFAULT_HALF_WEIGHT_WARNING_RATIO);
  });
});

describe('LOADING_RULES R-8 heavy-on-light warning', () => {
  const items = [cargo('LIGHT', 10), cargo('HEAVY', 40)];

  it('warns once per cargo pair when a heavier package rests on a lighter one', () => {
    const placements = [
      box('LIGHT', 10, 4, 0), box('LIGHT', 10, 5, 0), box('LIGHT', 10, 4, 1), box('LIGHT', 10, 5, 1),
      box('HEAVY', 40, 4, 0, 0.5), box('HEAVY', 40, 5, 1, 0.5),
    ];
    const found = codes(validateOperationalLoading(container, items, placements), 'HEAVY_ON_LIGHT');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warning');
    expect(found[0].value).toBe(40);
    expect(found[0].limit).toBe(10);
    expect([...found[0].placementIndexes].sort((a, b) => a - b)).toEqual([0, 3, 4, 5]);
  });

  it('stays silent for lighter-on-heavier and for same-cargo stacks', () => {
    const placements = [
      box('HEAVY', 40, 4, 0), box('LIGHT', 10, 4, 0, 0.5),
      box('HEAVY', 40, 5, 1), box('HEAVY', 40, 5, 1, 0.5),
    ];
    expect(codes(validateOperationalLoading(container, items, placements), 'HEAVY_ON_LIGHT')).toEqual([]);
  });

  it('does not treat a pallet deck as a lighter package', () => {
    const supports = [{ id: 'PALLET-1', x: 4, y: 0, z: 0, length: 1.1, width: 1.1, height: 0.15, weightKg: 25 }];
    const placements = [{ ...box('HEAVY', 40, 4, 0, 0.15) }];
    expect(codes(validateOperationalLoading(container, items, placements, supports), 'HEAVY_ON_LIGHT')).toEqual([]);
  });
});

describe('disclosure warnings never change the verdict or the layout', () => {
  it('adds no operational error', () => {
    const placements = [box('LIGHT', 10, 0, 0), box('HEAVY', 40, 0, 0, 0.5)];
    const findings = validateOperationalLoading(container, [cargo('LIGHT', 10), cargo('HEAVY', 40)], placements);
    expect(findings.some(f => f.code === 'HEAVY_ON_LIGHT')).toBe(true);
    expect(findings.some(f => f.code === 'HALF_WEIGHT_CONCENTRATION')).toBe(true);
    expect(operationalErrors(findings).filter(f => f.code === 'HEAVY_ON_LIGHT' || f.code === 'HALF_WEIGHT_CONCENTRATION')).toEqual([]);
  });

  it('keeps existing findings first and in their previous order', () => {
    const placements = [box('LIGHT', 10, 0, 0), box('HEAVY', 40, 0, 0, 0.5)];
    const findings = validateOperationalLoading(container, [cargo('LIGHT', 10), cargo('HEAVY', 40)], placements);
    const firstNew = findings.findIndex(f => f.code === 'HALF_WEIGHT_CONCENTRATION' || f.code === 'HEAVY_ON_LIGHT');
    expect(findings.slice(firstNew).every(f => f.code === 'HALF_WEIGHT_CONCENTRATION' || f.code === 'HEAVY_ON_LIGHT')).toBe(true);
  });

  it('leaves placements and waiting cargo identical whatever the warning ratio', () => {
    const spec: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130, floorLoadLimitKgPerM2: 1500 };
    const list = [
      cargo('HEAVY', 30, { length: 0.6, width: 0.4, height: 0.4, quantity: 60, maxTopLoadKg: 200 }),
      cargo('LIGHT', 6, { length: 0.5, width: 0.5, height: 0.5, quantity: 24, maxTopLoadKg: 60 }),
    ];
    const base = loadContainer(spec, list, { publish: false });
    const strict = loadContainer({ ...spec, halfWeightWarningRatio: 0.5 }, list, { publish: false });
    const loose = loadContainer({ ...spec, halfWeightWarningRatio: 0.99 }, list, { publish: false });
    expect(base.placements.length).toBeGreaterThan(0);
    expect(strict.placements).toEqual(base.placements);
    expect(loose.placements).toEqual(base.placements);
    expect(strict.remaining).toEqual(base.remaining);
    expect(loose.remaining).toEqual(base.remaining);
    expect(operationalErrors(strict.operationalFindings ?? [])).toEqual(operationalErrors(base.operationalFindings ?? []));
  });
});

describe('owner decision 2026-10-08: concentration warning scales with load on approved direct-box loading', () => {
  // All weight in the inner half. Payload 20,000 kg.
  const innerOnly = (count: number, weightKg: number) => Array.from({ length: count }, (_, i) => box('A', weightKg, i % 4, Math.floor(i / 4) % 2, Math.floor(i / 8) * 0.5));
  const direct = { approvedDirectBox: true };

  it('stays silent for a light load sequenced from the inner wall', () => {
    const placements = innerOnly(8, 100); // 800 kg = 4% of payload → scaled limit ≥ 100%
    const found = codes(validateOperationalLoading(container, [cargo('A', 100)], placements, [], direct), 'HALF_WEIGHT_CONCENTRATION');
    expect(found.filter(f => f.message.includes('안쪽') || f.message.includes('문 쪽'))).toEqual([]);
  });

  it('still warns at full payload with the base 60% ratio', () => {
    const placements = innerOnly(8, 2500); // 20,000 kg = 100% of payload
    const found = codes(validateOperationalLoading(container, [cargo('A', 2500, { maxStackLayers: 1 })], placements.map(p => ({ ...p, z: 0 })), [], direct), 'HALF_WEIGHT_CONCENTRATION');
    const longitudinal = found.find(f => f.message.includes('안쪽'));
    expect(longitudinal?.limit).toBeCloseTo(0.6, 9);
    expect(longitudinal?.value).toBeCloseTo(1, 9);
  });

  it('uses 50% + 10% × payload ÷ loaded weight in between', () => {
    const placements = innerOnly(8, 1000).map(p => ({ ...p, z: 0 })); // 8,000 kg = 40% → limit 0.75
    const found = codes(validateOperationalLoading(container, [cargo('A', 1000, { maxStackLayers: 1 })], placements, [], direct), 'HALF_WEIGHT_CONCENTRATION');
    expect(found.find(f => f.message.includes('안쪽'))?.limit).toBeCloseTo(0.75, 9);
  });

  it('keeps the fixed ratio for pallet/MIXED callers and for the width direction', () => {
    const placements = innerOnly(8, 100);
    const fixed = codes(validateOperationalLoading(container, [cargo('A', 100)], placements), 'HALF_WEIGHT_CONCENTRATION');
    expect(fixed.find(f => f.message.includes('안쪽'))?.limit).toBe(DEFAULT_HALF_WEIGHT_WARNING_RATIO);
    const oneSide = Array.from({ length: 10 }, (_, x) => box('A', 100, x, 0));
    const lateral = codes(validateOperationalLoading(container, [cargo('A', 100)], oneSide, [], direct), 'HALF_WEIGHT_CONCENTRATION');
    expect(lateral.find(f => f.message.includes('좌측'))?.limit).toBe(DEFAULT_HALF_WEIGHT_WARNING_RATIO);
  });
});

describe('LOADING_RULES R-6 segregation and temperature verdicts', () => {
  const food = cargo('FOOD', 10, { segregationClass: 'food', tempZone: 'ambient' });
  const chem = cargo('CHEM', 10, { segregationClass: 'chemical', tempZone: 'ambient' });
  const cold = cargo('COLD', 10, { tempZone: 'chilled' });
  const spread = [box('FOOD', 10, 0, 0), box('CHEM', 10, 9, 1)];

  it('checks nothing until a forbidden pair is configured', () => {
    expect(codes(validateOperationalLoading(container, [food, chem], spread), 'INCOMPATIBLE_CARGO')).toEqual([]);
  });

  it('reports a configured forbidden pair once as an error, in either order', () => {
    const spec: ContainerSpec = { ...container, incompatiblePairs: [['chemical', 'food'], ['food', 'chemical']] };
    const found = codes(validateOperationalLoading(spec, [food, chem], spread), 'INCOMPATIBLE_CARGO');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
    expect([...found[0].placementIndexes].sort()).toEqual([0, 1]);
    expect(operationalErrors(validateOperationalLoading(spec, [food, chem], spread)).some(f => f.code === 'INCOMPATIBLE_CARGO')).toBe(true);
  });

  it('ignores a pair when only one class is loaded', () => {
    const spec: ContainerSpec = { ...container, incompatiblePairs: [['food', 'chemical']] };
    expect(codes(validateOperationalLoading(spec, [food, chem], [box('FOOD', 10, 0, 0)]), 'INCOMPATIBLE_CARGO')).toEqual([]);
  });

  it('reports mixed temperature zones as an error and ignores cargo without a zone', () => {
    const mixed = validateOperationalLoading(container, [food, cold], [box('FOOD', 10, 0, 0), box('COLD', 10, 9, 1)]);
    expect(codes(mixed, 'MIXED_TEMP_ZONE')).toHaveLength(1);
    expect(codes(mixed, 'MIXED_TEMP_ZONE')[0].severity).toBe('error');
    const untagged = validateOperationalLoading(container, [food, cargo('PLAIN', 10)], [box('FOOD', 10, 0, 0), box('PLAIN', 10, 9, 1)]);
    expect(codes(untagged, 'MIXED_TEMP_ZONE')).toEqual([]);
  });

  it('shows the layout with the error instead of dropping cargo', () => {
    const spec: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130, floorLoadLimitKgPerM2: 1500 };
    const plain = [cargo('A', 20, { length: 0.6, width: 0.4, height: 0.4, quantity: 20 }), cargo('B', 8, { length: 0.5, width: 0.5, height: 0.5, quantity: 12 })];
    const zoned = [{ ...plain[0], tempZone: 'ambient' }, { ...plain[1], tempZone: 'chilled' }];
    const base = loadContainer(spec, plain, { publish: false });
    const result = loadContainer(spec, zoned, { publish: false });
    expect(result.placements.length).toBe(base.placements.length);
    expect(result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(base.remaining.reduce((sum, row) => sum + row.quantity, 0));
    expect((result.operationalFindings ?? []).some(f => f.code === 'MIXED_TEMP_ZONE' && f.severity === 'error')).toBe(true);
  });
});
