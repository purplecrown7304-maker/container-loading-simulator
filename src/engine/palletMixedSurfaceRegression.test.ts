import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets, type PalletSpec } from './palletOptimization';
import { auditLoading } from './loadingAudit';
import { validatePlacements } from './constraints';
import type { CargoItem, ContainerSpec } from './types';
import { unityPlan } from '../unityProtocol';
import { buildPalletLoadingReportHtml } from '../palletWorkerReportV2';
import type { InertiaCertification } from '../inertiaCertification';

// Synthetic cartons; no customer shipment data. Ten layers is an upper limit.
const container: ContainerSpec = { length: 4, width: 2, height: .6, maxPayloadKg: 5000 };
const spec: PalletSpec = { ...defaultPalletSpec, length: 1, width: 1, height: .15, maxStackLevels: 1 };
const cargo: CargoItem[] = [
  { id: 'wide', name: 'wide', length: .6, width: .6, height: .2, weightKg: 20, quantity: 1, maxStackLayers: 10, maxTopLoadKg: 1000, allowRotation: false },
  { id: 'narrow', name: 'narrow', length: .4, width: .4, height: .2, weightKg: 10, quantity: 1, maxStackLayers: 10, maxTopLoadKg: 1000, allowRotation: false },
];
function verify(result: ReturnType<typeof packOnPallets>, items = cargo, space = container, pallet = spec) {
  expect(validatePlacements(space, result.placements)).toEqual([]);
  expect(result.placements.length + result.remaining.reduce((sum, row) => sum + row.quantity, 0)).toBe(items.reduce((sum, row) => sum + row.quantity, 0));
  for (const item of items) expect(result.placements.filter(p => p.cargoId === item.id).length + result.remaining.filter(row => row.cargoId === item.id).reduce((sum, row) => sum + row.quantity, 0)).toBe(item.quantity);
  expect(new Set(result.placements.map(p => [p.cargoId, p.x, p.y, p.z].join('|'))).size).toBe(result.placements.length);
  expect(result.totalPalletizedWeightKg).toBeLessThanOrEqual(space.maxPayloadKg);
  for (const load of result.pallets) {
    expect(load.cargoWeightKg).toBeLessThanOrEqual(pallet.maxLoadKg);
    expect(load.stackLevel).toBeLessThanOrEqual(pallet.maxStackLevels);
    expect(auditLoading({ ...space, length: load.length, width: load.width, height: space.height - load.z - load.height }, items, load.cargoPlacements.map(p => ({ ...p, x: p.x - load.x, y: p.y - load.y, z: p.z - load.z - load.height })))).toEqual([]);
  }
}
describe('mixed pallet supporting surface regression', () => {
  it('places a smaller carton fully on the larger carton and uses one pallet', () => {
    const result = packOnPallets(container, cargo, spec, 'capacity');
    verify(result);
    expect(result.placements).toHaveLength(2);
    expect(result.remaining).toEqual([]);
    expect(result.palletCount).toBe(1);
    const lower = result.placements.find(p => p.cargoId === 'wide')!;
    const upper = result.placements.find(p => p.cargoId === 'narrow')!;
    expect(upper.z).toBeCloseTo(lower.z + lower.height);
    expect(upper.x).toBeGreaterThanOrEqual(lower.x);
    expect(upper.y).toBeGreaterThanOrEqual(lower.y);
    expect(upper.x + upper.length).toBeLessThanOrEqual(lower.x + lower.length + 1e-9);
    expect(upper.y + upper.width).toBeLessThanOrEqual(lower.y + lower.width + 1e-9);
    expect(packOnPallets(container, cargo, spec, 'capacity')).toEqual(result);
  });
  it.each([
    { name: 'packaging reserve', space: container, items: cargo, pallet: { ...spec, useWrapping: true, wrappingExtraHeightM: .06, minimizePackaging: false } },
    { name: 'ceiling', space: { ...container, height: .4 }, items: cargo, pallet: spec },
    { name: 'one carton layer', space: container, items: cargo.map(p => ({ ...p, maxStackLayers: 1 })), pallet: spec },
    { name: '9kg top load', space: container, items: cargo.map(p => ({ ...p, maxTopLoadKg: 9 })), pallet: spec },
    { name: 'zero top load', space: container, items: cargo.map(p => ({ ...p, maxTopLoadKg: 0 })), pallet: spec },
    { name: 'pallet cargo limit', space: container, items: cargo, pallet: { ...spec, maxLoadKg: 20 } },
  ])('keeps $name restrictions instead of forcing consolidation', ({ space, items, pallet }) => {
    const result = packOnPallets(space, items, pallet, 'capacity');
    verify(result, items, space, pallet);
    expect(result.placements).toHaveLength(2);
    expect(result.palletCount).toBe(2);
  });
  it('consolidates compatible cartons for the same unloading stop', () => {
    const items = cargo.map(p => ({ ...p, unloadPriority: 3 }));
    const result = packOnPallets(container, items, spec, 'unloading');
    verify(result, items);
    expect(result.palletCount).toBe(1);
  });
  it('preserves rejected quantities and reasons when only one restricted floor slot exists', () => {
    const space = { ...container, length: 1, width: 1, height: .4 };
    const result = packOnPallets(space, cargo, spec, 'capacity');
    verify(result, cargo, space);
    expect(result.placements).toHaveLength(1);
    expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'narrow', quantity: 1 })]);
    expect(result.remaining[0].reason).toMatch(/공간|높이|적층|지지/);
  });
  it('keeps different unloading stops on separate pallets', () => {
    const items = cargo.map((p, i) => ({ ...p, unloadPriority: i + 1 }));
    const result = packOnPallets(container, items, spec, 'unloading');
    verify(result, items);
    expect(result.palletCount).toBe(2);
  });
  it('does not invent a disallowed rotation to fit a narrow pallet', () => {
    const pallet = { ...spec, length: 1, width: .6 };
    const items = [{ ...cargo[0], length: .5, width: .8 }];
    const result = packOnPallets(container, items, pallet, 'capacity');
    verify(result, items, container, pallet);
    expect(result.placements).toHaveLength(0);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].reason.length).toBeGreaterThan(0);
  });
  it('uses the same computed placements and counts in Unity and the work order', () => {
    const result = packOnPallets(container, cargo, spec, 'capacity');
    const plan = unityPlan(container, { placements: result.placements, remaining: result.remaining, loadedWeightKg: result.totalPalletizedWeightKg, usedVolumeM3: result.placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0), validationIssues: [] }, 1, cargo);
    expect(plan.placements).toHaveLength(2);
    for (let i = 0; i < result.placements.length; i++) expect(plan.placements[i]).toMatchObject(result.placements[i]);
    // Rendering-only unverified fixture: no simulation success or transport certification is fabricated.
    const certification: InertiaCertification = { status: 'failed', mode: 'pallets', targetSignature: 'render-only', testedAt: '2026-09-24T00:00:00Z', testedScenarios: 0, passedScenarios: 0, failedScenarios: [], maxHorizontalShiftM: 0, maxTiltDeg: 0, results: {}, payloadWithinLimit: true, securing: { level: 0, levelLabel: '미검증 테스트', palletCount: result.palletCount, palletWeightKg: result.palletCount * spec.tareWeightKg, bandingStraps: 0, bandingLengthM: 0, cornerGuards: 0, cornerGuardLengthM: 0, wrappingLengthM: 0, antiSlipMats: 0, dunnageBlocks: 0, loadBars: 0, estimatedAddedWeightKg: 0, estimatedNonCargoWeightKg: result.palletCount * spec.tareWeightKg } };
    const html = buildPalletLoadingReportHtml(container, cargo, { spec, result }, certification);
    expect(html).toContain('<span>팔레트</span><b>1 EA</b>');
    expect(html).toContain('<span>실제 적재 화물</span><b>2 EA</b>');
    expect(html).toContain('wide 1EA');
    expect(html).toContain('narrow 1EA');
  });
});
