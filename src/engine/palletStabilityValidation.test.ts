import { expect, it } from 'vitest';
import { centerPalletPlan } from './palletCentering';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { palletSupportBodies } from './palletPlanValidation';
import { validateOperationalLoading } from './operationalValidator';
import type { CargoItem } from './types';

const container = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  ceilingClearanceM: .05, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };
const spec = { ...defaultPalletSpec, maxStackLevels: 1 };
const box: CargoItem = { id: 'A', name: 'A', length: .55, width: .55, height: .3,
  weightKg: 1, quantity: 20, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true };

// Owner decision 2026-11-18 (LOADING_RULES 7A): pallets stay tight against the inner
// wall. The former stability pass spread the columns over the whole vehicle length.
const rowsOf = (pallets: Array<{ x: number }>) => [...new Set(pallets.map(load => Math.round(load.x * 1e6) / 1e6))].sort((a, b) => a - b);

it('keeps an odd five-pallet plan tight from the inner wall without static errors', () => {
  const packed = packOnPallets(container, [box], spec, 'stability');
  const centered = centerPalletPlan(packed, container);
  expect(centered.palletCount).toBe(5);
  expect(centered.placements).toHaveLength(20);
  expect(centered.remaining).toEqual([]);
  rowsOf(centered.pallets).forEach((x, index) => expect(x).toBeCloseTo(index * spec.length, 6));
  const errors = validateOperationalLoading(container, [box], centered.placements, palletSupportBodies(centered))
    .filter(finding => finding.severity === 'error');
  expect(errors).toEqual([]);
  expect(packOnPallets(container, [box], spec, 'stability')).toEqual(packed);
});

it('lays an even four-pallet stability plan in touching rows instead of spreading it to the door', () => {
  const cargo = [{ ...box, quantity: 16 }];
  const packed = packOnPallets(container, cargo, spec, 'stability');
  const centered = centerPalletPlan(packed, container);
  expect(centered.palletCount).toBe(4);
  expect(centered.placements).toHaveLength(16);
  expect(centered.optimization.redistributedForLowUtilization).toBe(true);
  expect(rowsOf(centered.pallets)).toEqual([0, 1.1]);
  expect(Math.max(...centered.pallets.map(load => load.x + load.length))).toBeLessThan(container.length * .3);
  expect(validateOperationalLoading(container, cargo, centered.placements, palletSupportBodies(centered))
    .filter(finding => finding.severity === 'error')).toEqual([]);
});
