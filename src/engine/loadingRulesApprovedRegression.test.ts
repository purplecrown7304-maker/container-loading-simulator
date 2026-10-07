import { describe, expect, it } from 'vitest';
import { cgCompliantAlternative } from './cgCompliantPlan';
import { gapSecuringPlan } from './gapSecuring';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

const container40: ContainerSpec = {
  length: 12.032,
  width: 2.35,
  height: 2.7,
  maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500,
};

const item = (id: string, weightKg: number, quantity: number, overrides: Partial<CargoItem> = {}): CargoItem => ({
  id,
  name: id,
  length: 0.6,
  width: 0.4,
  height: 0.4,
  weightKg,
  quantity,
  maxStackLayers: 10,
  maxTopLoadKg: 100000,
  ...overrides,
});

const errorCodes = (result: LoadingResult) => [
  ...result.validationIssues.map(issue => issue.type),
  ...(result.operationalFindings ?? []).filter(finding => finding.severity === 'error').map(finding => finding.code),
];
const loaded = (result: LoadingResult) => result.placements.length;
const cgErrors = (result: LoadingResult) => (result.operationalFindings ?? []).filter(
  finding => finding.severity === 'error' && finding.code === 'CG_LONGITUDINAL',
);

describe('2026-10-06 approved direct-box regressions', () => {
  it('loads 660 of 700 20kg cartons without longitudinal CG error', () => {
    const result = loadContainer(container40, [item('A', 20, 700)], { strategy: 'capacity', publish: false });
    expect(loaded(result)).toBe(660);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads all 450 cartons across three strict stops', () => {
    const cargo = [
      item('S1', 20, 150, { unloadPriority: 1 }),
      item('S2', 20, 150, { unloadPriority: 2 }),
      item('S3', 20, 150, { unloadPriority: 3 }),
    ];
    const result = loadContainer({ ...container40, unloadingPolicy: 'strict' }, cargo, { strategy: 'capacity', publish: false });
    expect(loaded(result)).toBe(450);
    expect(errorCodes(result)).toEqual([]);
  });

  it('loads all 600 mixed-weight cartons without longitudinal CG error', () => {
    const result = loadContainer(container40, [item('H', 30, 300), item('L', 5, 300)], { strategy: 'capacity', publish: false });
    expect(loaded(result)).toBe(600);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads all 600 strict two-stop mixed-weight cartons without longitudinal CG error', () => {
    const cargo = [item('H', 30, 300, { unloadPriority: 1 }), item('L', 5, 300, { unloadPriority: 2 })];
    const result = loadContainer({ ...container40, unloadingPolicy: 'strict' }, cargo, { strategy: 'capacity', publish: false });
    expect(loaded(result)).toBe(600);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads a small 40-carton shipment without longitudinal CG error', () => {
    const result = loadContainer(container40, [item('A', 20, 40)], { strategy: 'capacity', publish: false });
    expect(loaded(result)).toBe(40);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads all 800 cartons across three dimensions without errors', () => {
    const cargo = [
      item('H', 30, 200),
      item('M', 15, 200, { length: 0.5, width: 0.4, height: 0.3 }),
      item('L', 6, 400, { length: 0.4, width: 0.3, height: 0.3 }),
    ];
    const result = loadContainer(container40, cargo, { strategy: 'capacity', publish: false });
    expect(loaded(result)).toBe(800);
    expect(errorCodes(result)).toEqual([]);
  });

  it('keeps the full 630-carton strict plan as a CG error and exposes the 545-carton compliant alternative', () => {
    const strict = { ...container40, unloadingPolicy: 'strict' as const };
    const cargo = [item('H', 45, 330, { unloadPriority: 1 }), item('L', 3, 300, { unloadPriority: 2 })];
    const full = loadContainer(strict, cargo, { strategy: 'capacity', publish: false });
    expect(loaded(full)).toBe(630);
    expect(cgErrors(full)).toHaveLength(1);

    const alternative = cgCompliantAlternative(strict, cargo, { strategy: 'capacity', publish: false });
    expect(alternative).not.toBeNull();
    expect(loaded(alternative!.result)).toBe(545);
    expect(alternative!.removed.reduce((sum, row) => sum + row.quantity, 0)).toBe(85);
    expect(alternative!.removed.every(row => row.reasonCode === 'CG_LIMIT')).toBe(true);
    expect(cgErrors(alternative!.result)).toEqual([]);
  });

  it('never places another SKU above a carton whose chain maximum is four layers', () => {
    const space: ContainerSpec = { length: 0.6, width: 0.4, height: 2.4, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 1500 };
    const cargo = [
      item('BASE', 20, 4, { maxStackLayers: 4, maxTopLoadKg: 1000, allowRotation: false }),
      item('OTHER', 5, 2, { maxStackLayers: 10, allowRotation: false }),
    ];
    const result = loadContainer(space, cargo, { strategy: 'capacity', publish: false });
    const bases = result.placements.filter(p => p.cargoId === 'BASE');
    expect(bases).toHaveLength(4);
    const topBase = Math.max(...bases.map(p => p.z + p.height));
    expect(result.placements.some(p => p.cargoId === 'OTHER' && p.z >= topBase - 1e-6)).toBe(false);
  });

  it('does not require void fill when the occupied volume has no gap', () => {
    const space: ContainerSpec = { length: 1.2, width: 0.8, height: 0.4, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 1500 };
    const result = loadContainer(space, [item('FULL', 20, 4, { maxStackLayers: 1 })], { strategy: 'capacity', publish: false });
    expect(result.placements).toHaveLength(4);
    expect(gapSecuringPlan(space, result.placements).fills).toEqual([]);
    expect(result.operationalFindings?.some(f => f.code === 'VOID_FILL_REQUIRED')).toBe(false);
  });

  it('is deterministic for identical input', () => {
    const cargo = [item('H', 30, 300), item('L', 5, 300)];
    const first = loadContainer(container40, cargo, { strategy: 'capacity', publish: false });
    const second = loadContainer(container40, cargo, { strategy: 'capacity', publish: false });
    expect(second).toEqual(first);
  });
});

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function hasPlacementAbove(base: Placement, placement: Placement) {
  return placement.z >= base.z + base.height - 1e-6
    && overlap(base.x, base.x + base.length, placement.x, placement.x + placement.length) > 1e-6
    && overlap(base.y, base.y + base.width, placement.y, placement.y + placement.width) > 1e-6;
}
