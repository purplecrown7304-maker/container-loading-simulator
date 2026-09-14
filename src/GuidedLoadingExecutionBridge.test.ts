import { describe, expect, it } from 'vitest';
import type { CargoItem } from './engine/types';
import { guidedRuntimeCargo } from './GuidedLoadingExecutionBridge';

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'PKG-P-01',
    name: '제품A · 자동설계 박스',
    length: 0.8,
    width: 0.46,
    height: 0.39,
    weightKg: 20,
    quantity: 200,
    maxStackLayers: 1,
    maxTopLoadKg: 0,
    boxId: 'AUTO-P-01-1',
    allowRotation: true,
    ...overrides,
  };
}

describe('guidedRuntimeCargo', () => {
  it('uses all geometrically available vertical layers for AUTO cartons up to seven layers', () => {
    const [item] = guidedRuntimeCargo([cargo()], 2.69);

    expect(item.maxStackLayers).toBe(6);
    expect(item.maxTopLoadKg).toBeUndefined();
    expect(item.quantity).toBe(200);
  });

  it('caps very small AUTO cartons at seven simulation layers', () => {
    const [item] = guidedRuntimeCargo([cargo({ height: 0.2 })], 2.69);
    expect(item.maxStackLayers).toBe(7);
  });

  it('does not weaken verified/catalog carton stack constraints', () => {
    const verified = cargo({ boxId: 'BOX-VERIFIED-01', maxStackLayers: 3, maxTopLoadKg: 40 });
    const [item] = guidedRuntimeCargo([verified], 2.69);

    expect(item.maxStackLayers).toBe(3);
    expect(item.maxTopLoadKg).toBe(40);
  });
});
