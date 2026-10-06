import { describe, expect, it } from 'vitest';
import { cgCompliantAlternative } from './cgCompliantPlan';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const container: ContainerSpec = {
  length: 12.032,
  width: 2.35,
  height: 2.7,
  maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500,
};

const item = (
  id: string,
  weightKg: number,
  quantity: number,
  patch: Partial<CargoItem> = {},
): CargoItem => ({
  id,
  name: id,
  length: 0.6,
  width: 0.4,
  height: 0.4,
  weightKg,
  quantity,
  maxStackLayers: 10,
  maxTopLoadKg: 1000,
  allowRotation: true,
  ...patch,
});

const count = (result: LoadingResult) => result.placements.length;
const cgErrors = (result: LoadingResult) => (result.operationalFindings ?? [])
  .filter(finding => finding.severity === 'error' && finding.code.startsWith('CG_'));

describe('2026-10-06 owner-approved direct-box regression matrix', () => {
  it('loads 660 of 700 20kg default cartons without a CG error', () => {
    const result = loadContainer(container, [item('A', 20, 700)], { strategy: 'capacity', publish: false });
    expect(count(result)).toBe(660);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads all 450 cartons across three strict unloading stops without errors', () => {
    const cargo = [1, 2, 3].map(stop => item(`STOP-${stop}`, 20, 150, { unloadPriority: stop }));
    const result = loadContainer({ ...container, unloadingPolicy: 'strict' }, cargo, { strategy: 'capacity', publish: false });
    expect(count(result)).toBe(450);
    expect(result.validationIssues).toEqual([]);
    expect((result.operationalFindings ?? []).filter(f => f.severity === 'error')).toEqual([]);
  });

  it('loads all 600 mixed-weight cartons without longitudinal CG error', () => {
    const result = loadContainer(container, [item('HEAVY', 30, 300), item('LIGHT', 5, 300)], { strategy: 'capacity', publish: false });
    expect(count(result)).toBe(600);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads all 600 mixed-weight strict-stop cartons without errors', () => {
    const cargo = [
      item('HEAVY-STOP-1', 30, 300, { unloadPriority: 1 }),
      item('LIGHT-STOP-2', 5, 300, { unloadPriority: 2 }),
    ];
    const result = loadContainer({ ...container, unloadingPolicy: 'strict' }, cargo, { strategy: 'capacity', publish: false });
    expect(count(result)).toBe(600);
    expect(result.validationIssues).toEqual([]);
    expect((result.operationalFindings ?? []).filter(f => f.severity === 'error')).toEqual([]);
  });

  it('loads all 40 cartons in a small shipment without CG error', () => {
    const result = loadContainer(container, [item('SMALL', 20, 40)], { strategy: 'capacity', publish: false });
    expect(count(result)).toBe(40);
    expect(cgErrors(result)).toEqual([]);
  });

  it('loads all 800 cartons with three dimensions without errors', () => {
    const cargo = [
      item('A', 30, 200),
      item('B', 15, 200, { length: 0.5, width: 0.4, height: 0.3 }),
      item('C', 6, 400, { length: 0.4, width: 0.3, height: 0.3 }),
    ];
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(count(result)).toBe(800);
    expect(result.validationIssues).toEqual([]);
    expect((result.operationalFindings ?? []).filter(f => f.severity === 'error')).toEqual([]);
  });

  it('shows the full 630-carton CG failure and a 545-carton compliant alternative', () => {
    const space = { ...container, unloadingPolicy: 'strict' as const };
    const cargo = [
      item('HEAVY-STOP-1', 45, 330, { unloadPriority: 1 }),
      item('LIGHT-STOP-2', 3, 300, { unloadPriority: 2 }),
    ];
    const full = loadContainer(space, cargo, { strategy: 'capacity', publish: false });
    expect(count(full)).toBe(630);
    expect(cgErrors(full).map(f => f.code)).toContain('CG_LONGITUDINAL');

    const alternative = cgCompliantAlternative(space, cargo, { strategy: 'capacity', publish: false });
    expect(alternative).not.toBeNull();
    expect(count(alternative!.result)).toBe(545);
    expect(alternative!.removed.reduce((sum, row) => sum + row.quantity, 0)).toBe(85);
    expect(alternative!.removed.every(row => row.reasonCode === 'CG_LIMIT')).toBe(true);
    expect(cgErrors(alternative!.result)).toEqual([]);
  });

  it('never puts another SKU above an item limited to four layers', () => {
    const base = item('MAX-4', 30, 40, { maxStackLayers: 4, maxTopLoadKg: 500 });
    const light = item('OTHER', 5, 80, { height: 0.2 });
    const result = loadContainer(container, [base, light], { strategy: 'capacity', publish: false });
    for (const lower of result.placements.filter(p => p.cargoId === base.id)) {
      const directlyAbove = result.placements.filter(p =>
        p.cargoId !== base.id
        && Math.abs(p.z - (lower.z + lower.height)) < 1e-6
        && Math.min(p.x + p.length, lower.x + lower.length) - Math.max(p.x, lower.x) > 1e-6
        && Math.min(p.y + p.width, lower.y + lower.width) - Math.max(p.y, lower.y) > 1e-6);
      if (lower.z >= 3 * lower.height - 1e-6) expect(directlyAbove).toEqual([]);
    }
  });

  it('does not emit VOID_FILL_REQUIRED when the actual height map has no void', () => {
    const snug: ContainerSpec = { length: 1.2, width: 0.8, height: 0.4, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 1500 };
    const result = loadContainer(snug, [item('FULL', 20, 4, { maxStackLayers: 1 })], { strategy: 'capacity', publish: false });
    expect(result.placements).toHaveLength(4);
    expect(result.operationalFindings?.some(f => f.code === 'VOID_FILL_REQUIRED')).toBe(false);
  });

  it('is deterministic for identical input', () => {
    const cargo = [item('A', 30, 120), item('B', 8, 240)];
    const first = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    const second = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(second).toEqual(first);
  });
});
