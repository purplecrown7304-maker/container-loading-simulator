import { describe, expect, it } from 'vitest';
import { analyzeConstraints } from './constraintAnalysis';
import { loadContainer } from './loadingEngine';
const container = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo = [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }];
const floor = { rows: 1, columns: 1, cells: [], maxKgPerM2: 100, averageKgPerM2: 100, totalProjectedKg: 10 };
describe('A-only constraint display', () => {
  it('uses A validator categories rather than legacy operational heuristics', () => {
    const result = loadContainer(container, cargo, { publish: false });
    const checks = analyzeConstraints(container, cargo, result, floor);
    expect(checks.find(c => c.id === 'cg')?.status).toBe('pass');
    expect(checks.find(c => c.id === 'doorSpace')?.status).toBe('warn');
    expect(checks.find(c => c.id === 'door')?.label).toBe('A 도어·지게차 여유');
  });
  it('does not present unconfigured axle or kg/m data as a passed physical check', () => {
    const result = loadContainer(container, cargo, { publish: false });
    const checks = analyzeConstraints({ ...container, floorLoadLimitKgPerM2: 900 }, cargo, result, floor);
    expect(checks.find(c => c.id === 'floorLoad')?.status).toBe('warn');
    expect(checks.find(c => c.id === 'floorLoad')?.detail).toContain('다른 물리량');
    expect(checks.find(c => c.id === 'axle')?.status).toBe('warn');
  });
});
