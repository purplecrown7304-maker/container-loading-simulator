import { describe, expect, it } from 'vitest';
import { hasInspectionTarget, runStaticInspection } from './manualInspection';
import type { PhysicsTarget } from './physicsTarget';

export function inspectionFixture(): PhysicsTarget {
  return { mode: 'pallets', container: { length: 4, width: 2, height: 3, maxPayloadKg: 100 }, cargo: [],
    result: { placements: [{ cargoId: 'A', x: 1, y: .5, z: .2, length: 1, width: 1, height: 1, weightKg: 10 }], loadedWeightKg: 10, usedVolumeM3: 1, remaining: [], validationIssues: [] },
    supports: [{ id: 'P1', x: 1, y: .5, z: 0, length: 1, width: 1, height: .2, weightKg: 20 }] };
}
describe('manual inspection reuses engine calculations', () => {
  it('includes base tare once in total mass and CG', () => {
    expect(runStaticInspection(inspectionFixture(), 'load').summary).toContain('30.0 / 100.0');
    expect(runStaticInspection(inspectionFixture(), 'balance').summary).toContain('X 1.50 · Y 1.00 · Z 0.30');
  });
  it('uses current coordinates rather than cached validation issues', () => {
    const t = inspectionFixture();
    expect(runStaticInspection(t, 'geometry').attention).toBe(false);
    t.result.placements[0].z = .1;
    expect(runStaticInspection(t, 'geometry').attention).toBe(true);
    t.result.placements[0].x = 5;
    expect(runStaticInspection(t, 'geometry').details.join()).toContain('경계');
  });
  it('reports unconfigured floor limit and real overload', () => {
    const t = inspectionFixture(); t.container.maxPayloadKg = 25;
    const r = runStaticInspection(t, 'load');
    expect(r.attention).toBe(true); expect(r.details.join()).toContain('기준 비교 미실행');
    t.container.floorLoadLimitKgPerM2 = 1;
    expect(runStaticInspection(t, 'load').details.join()).toContain('추정치 초과');
  });
  it('rejects empty, non-finite and zero-mass CG inputs', () => {
    const t = inspectionFixture(); t.result.placements = []; t.supports = [];
    expect(hasInspectionTarget(t)).toBe(false);
    expect(() => runStaticInspection(t, 'geometry')).toThrow('적재 결과');
    const invalid = inspectionFixture(); invalid.result.placements[0].x = NaN;
    expect(() => runStaticInspection(invalid, 'geometry')).toThrow('유효하지');
    const zero = inspectionFixture(); zero.result.placements[0].weightKg = 0; zero.supports = [];
    expect(() => runStaticInspection(zero, 'balance')).toThrow('총중량이 0');
  });
});
