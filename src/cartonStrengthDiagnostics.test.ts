import { beforeEach, expect, it } from 'vitest';
import { cartonStrengthChecks, cargoStackRestrictions, stackLimitExplanation } from './cargoStackRestrictions';
import { buildConsistencyReport } from './diagnosticBlackbox';
import type { CargoItem, Placement } from './engine/types';

const container = { length: 12.03, width: 2.35, height: 2.7, maxPayloadKg: 26500 };
const box: CargoItem = { id: 'PKG-PRD-030', boxId: 'REC-235X310X265', name: '범용 추천 235×310×265 (강도확인)', length: .235, width: .31, height: .265, weightKg: 7.2, quantity: 12, maxStackLayers: 1, maxTopLoadKg: 0 };
const placements: Placement[] = Array.from({ length: 12 }, (_, i) => ({ cargoId: box.id, x: (i % 4) * .235, y: Math.floor(i / 4) * .31, z: .15, length: .235, width: .31, height: .265, weightKg: 7.2 }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

it('reports the synthetic PRD-030 legacy restriction and actual height use as warnings', () => {
  const checks = cartonStrengthChecks(container, [box], placements);
  expect(checks.find(item => item.id === `carton-strength-${box.id}`)?.severity).toBe('WARNING');
  const height = checks.find(item => item.id === 'carton-low-height-restrictions');
  expect(height?.detail).toContain('415mm');
  expect(height?.detail).toContain('15.4%');
  const report = buildConsistencyReport(container, [box], { placements, remaining: [], loadedWeightKg: 86.4, usedVolumeM3: .235 * .31 * .265 * 12, validationIssues: [] });
  expect(report.checks).toEqual(expect.arrayContaining(checks));
  expect(report.counts.warning).toBeGreaterThan(0);
});

it('distinguishes explicit zero from unverified strength without changing either restriction', () => {
  const explicit = { ...box, topLoadLimitExplicit: true };
  expect(cartonStrengthChecks(container, [explicit], [])).toEqual([]);
  expect(stackLimitExplanation(explicit)).toContain('사용자가 명시');
  const unverified = { ...explicit, strengthUnverified: true };
  expect(cartonStrengthChecks(container, [unverified], [])).toHaveLength(1);
  expect(stackLimitExplanation(unverified)).toContain('미확인');
  expect(cargoStackRestrictions([box])[0].limits).toContain('상부 허용하중 0 kg');
  expect(box.maxTopLoadKg).toBe(0);
});

it('flags unlike recommendation limits as a review hint, never equal-strength evidence', () => {
  const other = { ...box, id: 'PKG-PRD-001', boxId: 'REC-235X130X265', name: '범용 추천 235×130×265 (강도확인)', maxTopLoadKg: 100, maxStackLayers: 10 };
  const difference = cartonStrengthChecks(container, [box, other], []).find(item => item.id === 'carton-strength-recommendation-difference');
  expect(difference?.detail).toContain('자동 복사하지');
  expect(difference?.severity).toBe('WARNING');
  expect(cartonStrengthChecks(container, [{ ...box, quantity: 0 }, other], [])).toEqual([]);
});

it('does not blame stacking restrictions for every low or tall result', () => {
  expect(cartonStrengthChecks(container, [{ ...box, maxStackLayers: 10, maxTopLoadKg: 100 }], placements)).toEqual([]);
  const high = placements.map(item => ({ ...item, z: 1.4 }));
  expect(cartonStrengthChecks(container, [box], high).some(item => item.id === 'carton-low-height-restrictions')).toBe(false);
});
