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

it('keeps the safe five-pallet plan when full-length spreading defeats CG centering', () => {
  const packed = packOnPallets(container, [box], spec, 'stability');
  const centered = centerPalletPlan(packed, container);
  expect(centered.palletCount).toBe(5);
  expect(centered.placements).toHaveLength(20);
  expect(centered.remaining).toEqual([]);
  expect(centered.optimization.redistributedForLowUtilization).toBe(false);
  const errors = validateOperationalLoading(container, [box], centered.placements, palletSupportBodies(centered))
    .filter(finding => finding.severity === 'error');
  expect(errors).toEqual([]);
  expect(packOnPallets(container, [box], spec, 'stability')).toEqual(packed);
});

it('retains full-length stability spreading when its centered result is valid', () => {
  const cargo = [{ ...box, quantity: 16 }];
  const packed = packOnPallets(container, cargo, spec, 'stability');
  const centered = centerPalletPlan(packed, container);
  expect(centered.palletCount).toBe(4);
  expect(centered.placements).toHaveLength(16);
  expect(centered.optimization.redistributedForLowUtilization).toBe(true);
  expect(Math.max(...centered.pallets.map(load => load.x))).toBeGreaterThan(container.length * .7);
  expect(validateOperationalLoading(container, cargo, centered.placements, palletSupportBodies(centered))
    .filter(finding => finding.severity === 'error')).toEqual([]);
});
