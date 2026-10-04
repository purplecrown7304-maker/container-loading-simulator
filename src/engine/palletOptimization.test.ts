import { expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets, preparePalletsForLoading } from './palletOptimization';

const container = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 5000 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .5, height: .3, weightKg: 10, quantity: 20, maxStackLayers: 2 }];

it('prepares pallet contents without filtering for container footprint or payload', () => {
  const prepared = preparePalletsForLoading({ ...container, length: .3, width: .3, maxPayloadKg: 1 }, cargo);
  expect(prepared.placements).toHaveLength(20);
  expect(prepared.ruleEngineInput).toBeUndefined();
  expect(prepared.pallets.every(p => p.x === 0 && p.y === 0 && p.z === 0)).toBe(true);
});

it.each(['capacity', 'stability', 'unloading'] as const)('%s does not run legacy container strategy retries', strategy => {
  const result = packOnPallets(container, cargo, defaultPalletSpec, strategy);
  expect(result.optimization.candidateCount).toBe(1);
  expect(result.optimization.redistributedForLowUtilization).toBe(false);
  expect(result.ruleEngine).toBe('load-sim');
  expect(result.placements.length + result.remaining.reduce((n, p) => n + p.quantity, 0)).toBe(20);
  expect(packOnPallets(container, cargo, defaultPalletSpec, strategy)).toEqual(result);
});
