import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const container: ContainerSpec = {
  length: 1,
  width: 1,
  height: 2,
  maxPayloadKg: 1000,
};

function overlapArea(a: Placement, b: Placement) {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
  return x * y;
}

function hasCrossSkuSupport(placements: Placement[]) {
  return placements.some((upper) => placements.some((lower) =>
    lower.cargoId !== upper.cargoId
    && Math.abs(lower.z + lower.height - upper.z) <= 0.0015
    && overlapArea(upper, lower) > 1e-9,
  ));
}

describe('mixed carton upper-fill regression', () => {
  it('uses the upper void when different footprint cartons fully support one another', () => {
    const cargo: CargoItem[] = [
      {
        id: 'LARGE',
        name: '대형 박스',
        length: 1,
        width: 1,
        height: 1,
        weightKg: 10,
        quantity: 1,
        maxStackLayers: 2,
        maxTopLoadKg: 100,
        allowRotation: false,
      },
      {
        id: 'SMALL',
        name: '소형 박스',
        length: 0.5,
        width: 0.5,
        height: 1,
        weightKg: 2,
        quantity: 4,
        maxStackLayers: 2,
        maxTopLoadKg: 100,
        allowRotation: false,
      },
    ];

    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });

    expect(result.validationIssues).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.placements).toHaveLength(5);
    expect(hasCrossSkuSupport(result.placements)).toBe(true);
    expect(Math.max(...result.placements.map((placement) => placement.z + placement.height))).toBeCloseTo(2, 6);
  });

  it('does not use upper space when the lower carton explicitly forbids stacking', () => {
    const cargo: CargoItem[] = [
      {
        id: 'NO-STACK-BASE',
        name: '적층 금지 대형 박스',
        length: 1,
        width: 1,
        height: 1,
        weightKg: 10,
        quantity: 1,
        maxStackLayers: 1,
        maxTopLoadKg: 0,
        allowRotation: false,
      },
      {
        id: 'TOP',
        name: '상부 후보',
        length: 0.5,
        width: 0.5,
        height: 1,
        weightKg: 2,
        quantity: 4,
        maxStackLayers: 2,
        maxTopLoadKg: 100,
        allowRotation: false,
      },
    ];

    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });

    expect(result.validationIssues).toEqual([]);
    expect(result.remaining.reduce((sum, item) => sum + item.quantity, 0)).toBeGreaterThan(0);
  });
});
