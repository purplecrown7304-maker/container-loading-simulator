import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { explainLoading } from './explanation';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 2, width: 1, height: 1, maxPayloadKg: 500 };

const base: CargoItem = {
  id: 'A', name: 'A', length: 0.5, width: 0.5, height: 0.5,
  weightKg: 20, quantity: 5, maxStackLayers: 2, maxTopLoadKg: 100, allowRotation: true,
};

describe('explainLoading', () => {
  it('summarizes loaded quantity, zone and constraints', () => {
    const result = loadContainer(container, [base]);
    const explanation = explainLoading(container, [base], result);
    expect(explanation.cargo).toHaveLength(1);
    expect(explanation.cargo[0].loaded).toBe(result.placements.length);
    expect(explanation.cargo[0].zone).not.toBe('미적재');
    expect(explanation.cargo[0].reasons.some((r) => r.includes('최대 적층단'))).toBe(true);
    expect(explanation.cargo[0].reasons.some((r) => r.includes('상부 허용중량'))).toBe(true);
  });

  it('explains container payload as an unassigned reason when weight becomes the blocker', () => {
    const heavy = { ...base, id: 'HEAVY', weightKg: 120, quantity: 8 };
    const result = loadContainer({ ...container, maxPayloadKg: 250 }, [heavy]);
    const explanation = explainLoading({ ...container, maxPayloadKg: 250 }, [heavy], result);
    expect(explanation.cargo[0].remaining).toBeGreaterThan(0);
    expect(explanation.cargo[0].reasons.some((r) => r.includes('최대 적재 중량'))).toBe(true);
  });

  it('reports rotation when rotation is used', () => {
    const rotating = { ...base, id: 'ROT', length: 0.7, width: 0.4, height: 0.5, quantity: 2 };
    const c = { length: 1.2, width: 0.7, height: 0.5, maxPayloadKg: 500 };
    const result = loadContainer(c, [rotating]);
    const explanation = explainLoading(c, [rotating], result);
    expect(explanation.cargo[0].rotated).toBeGreaterThan(0);
    expect(explanation.cargo[0].reasons.some((r) => r.includes('90도 회전'))).toBe(true);
  });
});
