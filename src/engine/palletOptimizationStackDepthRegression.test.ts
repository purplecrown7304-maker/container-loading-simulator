import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = {
  length: 1,
  width: 1,
  height: 2.4,
  maxPayloadKg: 5000,
};

const cargo: CargoItem = {
  id: 'STACK-4',
  name: 'STACK-4',
  length: 1,
  width: 1,
  height: 0.4,
  weightKg: 10,
  quantity: 4,
  maxStackLayers: 1,
  maxTopLoadKg: 1000,
  allowRotation: false,
};

describe('pallet optimization configured stack depth regression', () => {
  it('can select four pallet levels when one floor slot requires it and the configuration allows it', () => {
    const result = packOnPallets(
      container,
      [cargo],
      {
        ...defaultPalletSpec,
        length: 1,
        width: 1,
        height: 0.15,
        tareWeightKg: 25,
        maxLoadKg: 1000,
        maxStackLevels: 4,
        maxSupportedTopWeightKg: 1000,
        useCornerGuards: false,
        useWrapping: false,
      },
    );

    expect(result.placements).toHaveLength(4);
    expect(result.remaining).toHaveLength(0);
    expect(result.palletCount).toBe(4);
    expect(result.maxUsedStackLevel).toBe(4);
    expect(result.optimization.selectedStackTarget).toBe(4);
    expect(result.optimization.candidateCount).toBeGreaterThanOrEqual(4);
  });
});
