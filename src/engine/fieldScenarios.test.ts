import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { assessShapeQuality } from './shapeQuality';
import type { CargoItem, ContainerSpec } from './types';

const fortyFt: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };

function item(id: string, length: number, width: number, height: number, weightKg: number, quantity: number, maxStackLayers = 7, maxTopLoadKg = 250, allowRotation = true): CargoItem {
  return { id, name: id, length, width, height, weightKg, quantity, maxStackLayers, maxTopLoadKg, allowRotation };
}

function assertSafe(result: ReturnType<typeof loadContainer>, container = fortyFt) {
  expect(result.validationIssues).toEqual([]);
  expect(result.loadedWeightKg).toBeLessThanOrEqual(container.maxPayloadKg + 1e-9);
  for (const p of result.placements) {
    expect(p.x).toBeGreaterThanOrEqual(-1e-9);
    expect(p.y).toBeGreaterThanOrEqual(-1e-9);
    expect(p.z).toBeGreaterThanOrEqual(-1e-9);
    expect(p.x + p.length).toBeLessThanOrEqual(container.length + 1e-9);
    expect(p.y + p.width).toBeLessThanOrEqual(container.width + 1e-9);
    expect(p.z + p.height).toBeLessThanOrEqual(container.height + 1e-9);
  }
}

describe('field-style loading scenarios', () => {
  it('handles mixed heavy/large/light cargo without invalid placements', () => {
    const cargo = [
      item('HEAVY-L', 0.8, 0.6, 0.45, 32, 48, 5, 260),
      item('MID-M', 0.6, 0.45, 0.35, 18, 70, 6, 220),
      item('LIGHT-S', 0.4, 0.3, 0.25, 7, 96, 7, 120),
    ];
    const result = loadContainer(fortyFt, cargo);
    assertSafe(result);
    expect(result.placements.length).toBeGreaterThan(150);
    const inside = [...result.placements].sort((a, b) => a.x - b.x).slice(0, 20);
    const heavyShare = inside.filter((p) => p.cargoId === 'HEAVY-L').length;
    expect(heavyShare).toBeGreaterThan(0);
  }, 10000);

  it('keeps fragile top-load cargo from becoming an unsafe support base', () => {
    const container: ContainerSpec = { length: 3, width: 1.2, height: 1.8, maxPayloadKg: 5000 };
    const cargo = [
      item('FRAGILE', 0.6, 0.4, 0.3, 8, 24, 5, 20),
      item('DENSE', 0.6, 0.4, 0.4, 24, 18, 4, 200),
    ];
    const result = loadContainer(container, cargo);
    assertSafe(result, container);
    for (const base of result.placements.filter((p) => p.cargoId === 'FRAGILE')) {
      const aboveWeight = result.placements
        .filter((p) => Math.abs(p.z - (base.z + base.height)) < 1e-6)
        .filter((p) => Math.min(p.x + p.length, base.x + base.length) - Math.max(p.x, base.x) > 1e-6)
        .filter((p) => Math.min(p.y + p.width, base.y + base.width) - Math.max(p.y, base.y) > 1e-6)
        .reduce((sum, p) => sum + p.weightKg, 0);
      expect(aboveWeight).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  it('uses rotation for narrow width combinations without crossing walls', () => {
    const container: ContainerSpec = { length: 4, width: 1.15, height: 1.5, maxPayloadKg: 5000 };
    const cargo = [
      item('ROT-A', 0.7, 0.4, 0.3, 12, 30, 5, 160, true),
      item('ROT-B', 0.65, 0.35, 0.3, 10, 30, 5, 150, true),
    ];
    const result = loadContainer(container, cargo);
    assertSafe(result, container);
    expect(result.placements.some((p) => p.rotated)).toBe(true);
  });

  it('keeps shape defects bounded in a ragged multi-SKU remainder case', () => {
    const cargo = [
      item('A', 0.62, 0.42, 0.34, 20, 37, 6, 220),
      item('B', 0.53, 0.37, 0.29, 14, 43, 7, 180),
      item('C', 0.41, 0.31, 0.27, 9, 61, 7, 130),
      item('D', 0.36, 0.28, 0.22, 6, 29, 7, 100),
    ];
    const result = loadContainer(fortyFt, cargo);
    assertSafe(result);
    const shape = assessShapeQuality(fortyFt, result.placements);
    expect(shape.isolatedMiddleBoxes).toBeLessThanOrEqual(4);
    expect(shape.protrudingTowers).toBeLessThanOrEqual(3);
    expect(shape.fragmentedCargoTypes).toBeLessThanOrEqual(2);
    expect(shape.shapePenalty).toBeLessThanOrEqual(35);
  }, 10000);

  it('reports payload-limited remainder explicitly instead of overloading', () => {
    const container: ContainerSpec = { length: 6, width: 2.2, height: 2.2, maxPayloadKg: 500 };
    const cargo = [item('WEIGHT-LIMIT', 0.5, 0.4, 0.3, 55, 30, 6, 300)];
    const result = loadContainer(container, cargo);
    assertSafe(result, container);
    expect(result.placements.length).toBe(9);
    expect(result.remaining[0]?.quantity).toBe(21);
    expect(result.remaining[0]?.reason).toContain('최대 적재 중량');
  });
});
