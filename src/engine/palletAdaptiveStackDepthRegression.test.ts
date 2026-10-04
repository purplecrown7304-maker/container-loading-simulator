import { expect, it } from 'vitest';
import { buildPalletAdaptiveCandidates } from './palletAdaptiveSearch';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { palletResultToLoadingResult } from './palletContainerPlacement';

it('does not create legacy rotation, stack-depth, wall-side, or height-cap retries', () => {
  const container = { length: 5, width: 2.4, height: 2.5, maxPayloadKg: 1000 };
  const cargo = [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 10, quantity: 8 }];
  const result = packOnPallets(container, cargo, defaultPalletSpec);
  const before = structuredClone(result);
  expect(buildPalletAdaptiveCandidates({ mode: 'pallets', container, cargo, result: palletResultToLoadingResult(result) }, { spec: defaultPalletSpec, result })).toEqual([]);
  expect(result).toEqual(before);
});
