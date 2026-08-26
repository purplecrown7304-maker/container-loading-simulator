import { describe, expect, it } from 'vitest';
import { centeredPalletLaneLayout } from './palletLaneLayout';
import { defaultPalletSpec } from './palletPacking';
import type { ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

describe('centeredPalletLaneLayout', () => {
  it('uses two width lanes immediately when two 1.1m pallets fit', () => {
    const layout = centeredPalletLaneLayout(container, defaultPalletSpec, 8);
    expect(layout.rowCapacity).toBe(2);
    expect(layout.laneCount).toBe(2);
    expect(layout.bandCount).toBe(4);
    expect(layout.ySlots).toHaveLength(2);
    expect(layout.ySlots[0]).toBeCloseTo(0.075, 6);
    expect(layout.ySlots[1]).toBeCloseTo(1.175, 6);
  });

  it('keeps a single pallet centered', () => {
    const layout = centeredPalletLaneLayout(container, defaultPalletSpec, 1);
    expect(layout.laneCount).toBe(1);
    expect(layout.ySlots[0]).toBeCloseTo((container.width - defaultPalletSpec.width) / 2, 6);
  });

  it('keeps one lane when the container is too narrow for two pallets', () => {
    const narrow = { ...container, width: 2.0 };
    const layout = centeredPalletLaneLayout(narrow, defaultPalletSpec, 8);
    expect(layout.rowCapacity).toBe(1);
    expect(layout.laneCount).toBe(1);
  });
});
