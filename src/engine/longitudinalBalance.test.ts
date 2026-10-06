import { describe, expect, it } from 'vitest';
import { balanceLongitudinalWalls, longitudinalMetrics } from './longitudinalBalance';
import { auditLoading } from './loadingAudit';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 8, width: 1, height: 3, maxPayloadKg: 10000, floorLoadLimitKgPerM2: 1500 };
const cargo: CargoItem[] = [100, 10].map((weightKg, i) => ({ id: `sku-${i}`, name: 'synthetic', length: 1, width: 1, height: 1, weightKg, quantity: 8, maxStackLayers: 2, maxTopLoadKg: 200 }));
const layout: Placement[] = Array.from({ length: 16 }, (_, i) => ({ cargoId: i < 8 ? 'sku-0' : 'sku-1', x: Math.floor(i / 2), y: 0, z: i % 2, length: 1, width: 1, height: 1, weightKg: i < 8 ? 100 : 10 }));

describe('whole-wall longitudinal balancing', () => {
  it('mixes heavy and light walls without altering quantity, support or compression', () => {
    expect(longitudinalMetrics(container, layout).halfRatio).toBeGreaterThan(0.9);
    const balanced = balanceLongitudinalWalls(container, cargo, layout);
    const metrics = longitudinalMetrics(container, balanced);
    expect(metrics.deviation).toBeLessThan(0.05);
    expect(metrics.halfRatio).toBeLessThanOrEqual(0.6);
    expect(balanced.map(p => [p.cargoId, p.z, p.weightKg])).toEqual(layout.map(p => [p.cargoId, p.z, p.weightKg]));
    expect(auditLoading(container, cargo, balanced)).toEqual([]);
    expect(balanceLongitudinalWalls(container, cargo, layout)).toEqual(balanced);
  });
  it('preserves exact coordinates without a configured floor limit', () => {
    expect(balanceLongitudinalWalls({ ...container, floorLoadLimitKgPerM2: undefined }, cargo, layout)).toBe(layout);
  });
  it('does not permute walls across different unloading stops', () => {
    expect(balanceLongitudinalWalls(container, cargo.map((p, i) => ({ ...p, unloadPriority: i + 1 })), layout)).toBe(layout);
  });
  it('keeps a bridge and both supporting columns in a single rigid wall', () => {
    const bridgeCargo: CargoItem[] = [
      { id: 'base', name: 'base', length: 1, width: 1, height: 1, weightKg: 20, quantity: 4, maxStackLayers: 2, maxTopLoadKg: 100 },
      { id: 'bridge', name: 'bridge', length: 2, width: 1, height: 1, weightKg: 40, quantity: 1, maxStackLayers: 2 },
    ];
    const ps: Placement[] = [0, 1, 5, 6].map(x => ({ cargoId: 'base', x, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 20 }));
    ps.push({ cargoId: 'bridge', x: 0, y: 0, z: 1, length: 2, width: 1, height: 1, weightKg: 40 });
    const result = balanceLongitudinalWalls(container, bridgeCargo, ps);
    expect(result[4].x - result[0].x).toBeCloseTo(0);
    expect(result[1].x - result[0].x).toBeCloseTo(1);
    expect(auditLoading(container, bridgeCargo, result)).toEqual([]);
  });
});
