import { describe, expect, it } from 'vitest';
import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { operationalQuality, unloadingObstructions } from './operationalQuality';
import { completeResidualPacking } from './residualPacking';
import { auditLoading } from './loadingAudit';
import { validatePlacements } from './constraints';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.4, maxPayloadKg: 10000 };
const item = (id: string, overrides: Partial<CargoItem> = {}): CargoItem => ({ id, name: id, length: .6, width: .4, height: .4, weightKg: 15, quantity: 18, maxStackLayers: 6, maxTopLoadKg: 200, ...overrides });
const strategies: LoadingStrategy[] = ['capacity', 'stability', 'unloading'];

describe('operational strategy regression matrix', () => {
  it('compares all strategies for a partial mixed-stop box shipment, with no thin high wall', () => {
    const cargo = [item('FIRST', { unloadPriority: 1, weightKg: 8 }), item('LAST', { unloadPriority: 2, weightKg: 35 }), item('MID', { unloadPriority: 3, quantity: 12 })];
    const rows = strategies.map(strategy => ({ strategy, result: loadContainer(container, cargo, { strategy, publish: false }) }));
    for (const row of rows) {
      expect(row.result.validationIssues).toEqual([]);
      expect(row.result.placements).toHaveLength(48);
      expect(row.result.remaining).toEqual([]);
      expect(operationalQuality(container, row.result.placements).slenderness).toBe(0);
    }
    expect(unloadingObstructions(cargo, rows[2].result.placements)).toBe(0);
    expect(operationalQuality(container, rows[1].result.placements).cogHeight).toBeLessThanOrEqual(operationalQuality(container, rows[0].result.placements).cogHeight);
    expect(operationalQuality(container, rows[0].result.placements).footprint).toBeLessThan(operationalQuality(container, rows[1].result.placements).footprint);
    expect(operationalQuality(container, rows[2].result.placements).footprint).toBeLessThan(operationalQuality(container, rows[1].result.placements).footprint);
    console.log('BOX STRATEGIES', rows.map(row => ({ strategy: row.strategy, ...operationalQuality(container, row.result.placements), blocked: unloadingObstructions(cargo, row.result.placements) })));
  }, 60000);

  it('applies unloading and low-CG objectives to pallet construction and container positions', () => {
    const cargo = [item('FIRST', { unloadPriority: 1, weightKg: 8, quantity: 24 }), item('LAST', { unloadPriority: 3, weightKg: 35, quantity: 24 }), item('MID', { unloadPriority: 2, quantity: 24 })];
    const rows = strategies.map(strategy => ({ strategy, result: packOnPallets(container, cargo, defaultPalletSpec, strategy) }));
    for (const row of rows) {
      expect(row.result.placements).toHaveLength(72);
      expect(row.result.totalPalletizedWeightKg).toBeLessThanOrEqual(container.maxPayloadKg);
      for (const load of row.result.pallets) for (const box of load.cargoPlacements) {
        expect(box.x).toBeGreaterThanOrEqual(load.x - 1e-6);
        expect(box.y).toBeGreaterThanOrEqual(load.y - 1e-6);
        expect(box.x + box.length).toBeLessThanOrEqual(load.x + load.length + 1e-6);
        expect(box.y + box.width).toBeLessThanOrEqual(load.y + load.width + 1e-6);
      }
    }
    expect(unloadingObstructions(cargo, rows[2].result.placements)).toBe(0);
    expect(operationalQuality(container, rows[1].result.placements).cogHeight).toBeLessThan(operationalQuality(container, rows[0].result.placements).cogHeight);
    expect(rows[0].result.optimization.redistributedForLowUtilization).toBe(false);
    expect(rows[2].result.optimization.redistributedForLowUtilization).toBe(false);
    expect(operationalQuality(container, rows[0].result.placements).footprint).toBeLessThan(operationalQuality(container, rows[1].result.placements).footprint);
    console.log('PALLET STRATEGIES', rows.map(row => ({ strategy: row.strategy, pallets: row.result.palletCount, ...operationalQuality(container, row.result.placements), blocked: unloadingObstructions(cargo, row.result.placements) })));
  }, 60000);

  it('finishes safe insertion after an incomplete search and gives physical remainder reasons', () => {
    const small = { length: 1, width: 1, height: 1, maxPayloadKg: 100 };
    const cargo = [item('FIT', { length: .5, width: .5, height: .5, quantity: 10, weightKg: 1 }), item('BIG', { length: 2, width: 2, quantity: 1 })];
    const result = completeResidualPacking(small, cargo, { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0 }, 'capacity');
    expect(result.placements).toHaveLength(8);
    expect(result.remaining.find(p => p.cargoId === 'FIT')?.reason).toContain('잔여 공간 부족');
    expect(result.remaining.find(p => p.cargoId === 'BIG')?.reason).toContain('박스 크기');
  });

  const scenarios = [
    { name: '40FT partial shipment: 219 mixed cartons', container: { ...container, length: 12.03, width: 2.35, height: 2.7 }, cargo: [item('HEAVY', { quantity: 27, height: .3, unloadPriority: 3, weightKg: 30 }), item('MEDIUM', { length: .4, width: .3, height: .25, quantity: 96, weightKg: 8, unloadPriority: 1 }), item('LIGHT', { length: .3, width: .2, height: .2, quantity: 96, weightKg: 3, unloadPriority: 2 })] },
    { name: 'space exhausted with a known 36-carton optimum', container: { ...container, length: 2.4, width: 1.2, height: 1.2 }, cargo: [item('CUBE', { quantity: 60 })] },
    { name: '500kg payload limit', container: { ...container, maxPayloadKg: 500 }, cargo: [item('MASS', { quantity: 40, weightKg: 80, maxTopLoadKg: 500 })] },
    { name: 'fragile cartons cannot carry upper load', container, cargo: [item('FRAGILE', { quantity: 24, maxTopLoadKg: 0, unloadPriority: 1 }), item('NORMAL', { quantity: 12, unloadPriority: 2 })] },
    { name: 'rotation disabled and oversized freight', container: { ...container, length: 2.4, width: 1.2 }, cargo: [item('LONG', { length: 1.4, width: .4, quantity: 6, allowRotation: false }), item('OVERSIZE', { length: 3, width: 2, quantity: 2 })] },
  ];
  it('an impossible late stop does not stall or block a large otherwise-complete shipment', () => {
    const fixture = scenarios[0];
    const cargo = [...fixture.cargo, item('IMPOSSIBLE', { length: 20, width: 4, height: 4, quantity: 2, unloadPriority: 99 })];
    for (const strategy of strategies) {
      const result = loadContainer(fixture.container, cargo, { strategy, publish: false });
      expect(result.placements).toHaveLength(219);
      expect(result.validationIssues).toEqual([]);
      expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'IMPOSSIBLE', quantity: 2 })]);
      expect(result.remaining[0].reason).toContain('크기');
      if (strategy === 'unloading') expect(unloadingObstructions(cargo, result.placements)).toBe(0);
    }
  }, 15000);
  it.each(scenarios)('$name: validates all three strategies in both loading modes', ({ name, container: space, cargo }) => {
    const metrics = [];
    for (const strategy of strategies) {
      const direct = loadContainer(space, cargo, { strategy, publish: false });
      expect(direct.validationIssues, `${name}: ${strategy}`).toEqual([]);
      expect(direct.placements.length + direct.remaining.reduce((n, row) => n + row.quantity, 0)).toBe(cargo.reduce((n, row) => n + row.quantity, 0));
      expect(direct.remaining.every(row => row.reason.length > 12)).toBe(true);
      if (name.includes('36-carton')) expect(direct.placements).toHaveLength(36);
      if (name.includes('500kg')) expect(direct.placements).toHaveLength(6);
      const pallet = packOnPallets(space, cargo, defaultPalletSpec, strategy);
      expect(validatePlacements(space, pallet.placements)).toEqual([]);
      expect(pallet.totalPalletizedWeightKg).toBeLessThanOrEqual(space.maxPayloadKg + 1e-6);
      expect(pallet.placements.length + pallet.remaining.reduce((n, row) => n + row.quantity, 0)).toBe(cargo.reduce((n, row) => n + row.quantity, 0));
      for (const load of pallet.pallets) {
        expect(load.x + load.length).toBeLessThanOrEqual(space.length + 1e-6);
        expect(load.y + load.width).toBeLessThanOrEqual(space.width + 1e-6);
        expect(load.cargoWeightKg).toBeLessThanOrEqual(defaultPalletSpec.maxLoadKg);
        const local = load.cargoPlacements.map(p => ({ ...p, x: p.x - load.x, y: p.y - load.y, z: p.z - load.z - load.height }));
        expect(auditLoading({ ...space, length: load.length, width: load.width, height: space.height - load.z - load.height }, cargo, local), `${name}: ${strategy} pallet ${load.palletIndex}`).toEqual([]);
      }
      if (strategy === 'unloading') {
        expect(unloadingObstructions(cargo, direct.placements)).toBe(0);
        expect(unloadingObstructions(cargo, pallet.placements)).toBe(0);
      }
      metrics.push({ strategy, direct: { loaded: direct.placements.length, ...operationalQuality(space, direct.placements) }, pallet: { loaded: pallet.placements.length, count: pallet.palletCount, ...operationalQuality(space, pallet.placements) } });
    }
    console.log(name, metrics);
  }, 60000);
});
