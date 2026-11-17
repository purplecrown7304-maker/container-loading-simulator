import { describe, expect, it } from 'vitest';
import { buildPalletPackaging, packMixedMode } from './mixedModePacking';
import { defaultPalletSpec, packOnPallets } from './palletOptimization';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

const container: ContainerSpec = { length: 4.8, width: 2.4, height: 2.4, maxPayloadKg: 10000 };
const pallet = { ...defaultPalletSpec, maxStackLevels: 1 };
const box = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'A', name: 'A', length: 0.4, width: 0.3, height: 0.25,
  weightKg: 5, quantity: 1, maxStackLayers: 2, maxTopLoadKg: 100,
  allowRotation: true, mixedLoadingMethod: 'direct', ...overrides,
});

describe('MIXED input preflight regression', () => {
  it.each(['direct', 'pallet'] as const)('merges matching %s rows before route selection without duplicating cartons', mixedLoadingMethod => {
    const result = packMixedMode(container, [box({ quantity: 3, mixedLoadingMethod }), box({ quantity: 5, mixedLoadingMethod })], pallet);
    expect(result.placements.filter(p => p.cargoId === 'A')).toHaveLength(8);
    expect(result.remaining).toEqual([]);
    if (mixedLoadingMethod === 'direct') expect(result.palletCount).toBe(0);
    else expect(result.mixed.directBoxCount).toBe(0);
  });

  it.each([
    { width: 0.35 },
    { weightKg: 7 },
    { maxStackLayers: 5 },
    { maxTopLoadKg: 0 },
  ])('rejects conflicting duplicate physical/stacking rows instead of retaining the last metadata: %j', conflict => {
    const result = packMixedMode(container, [box({ quantity: 3 }), box({ ...conflict, quantity: 5 })], pallet);
    expect(result.placements).toEqual([]);
    expect(result.palletCount).toBe(0);
    expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'A', quantity: 8 })]);
    expect(result.remaining[0].reason).toContain('서로 다른');
  });

  it('retains rejected rows while valid direct and pallet cargo remain loadable', () => {
    const result = packMixedMode(container, [
      box({ id: 'DIRECT', quantity: 4 }),
      box({ id: 'PALLET', quantity: 6, mixedLoadingMethod: 'pallet' }),
      box({ id: 'BAD-DIRECT', width: 0, quantity: 5 }),
      box({ id: 'BAD-PALLET', height: 0, quantity: 7, mixedLoadingMethod: 'pallet' }),
    ], pallet);
    expect(result.placements.filter(p => p.cargoId === 'DIRECT')).toHaveLength(4);
    expect(result.placements.filter(p => p.cargoId === 'PALLET')).toHaveLength(6);
    expect(result.placements.some(p => p.cargoId.startsWith('BAD-'))).toBe(false);
    expect(result.remaining).toEqual([
      expect.objectContaining({ cargoId: 'BAD-DIRECT', quantity: 5 }),
      expect.objectContaining({ cargoId: 'BAD-PALLET', quantity: 7 }),
    ]);
  });

  it('rejects contradictory explicit loading instructions for the same SKU', () => {
    const result = packMixedMode(container, [
      box({ quantity: 3, mixedLoadingMethod: 'pallet' }),
      box({ quantity: 5, mixedLoadingMethod: 'direct' }),
    ], pallet);
    expect(result.placements).toEqual([]);
    expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'A', quantity: 8 })]);
  });

  it.each(['direct', 'pallet'] as const)('enforces actual vehicle floor load before %s-path pallet/direct conversion', mixedLoadingMethod => {
    const cargo = [box({ quantity: 1, length: .5, width: .5, weightKg: 100, mixedLoadingMethod })];
    const constrained = { ...container, floorLoadLimitKgPerM2: 250 };
    const rejected = packMixedMode(constrained, cargo, pallet);
    expect(rejected.placements).toEqual([]);
    expect(rejected.palletCount).toBe(0);
    expect(rejected.remaining).toEqual([expect.objectContaining({ cargoId: 'A', quantity: 1 })]);
    expect(rejected.remaining[0].reason).toContain('바닥');
    const allowed = packMixedMode({ ...constrained, floorLoadLimitKgPerM2: 2500 }, cargo, pallet);
    expect(allowed.placements).toHaveLength(1);
    expect(allowed.remaining).toEqual([]);
    if (mixedLoadingMethod === 'pallet') {
      expect(buildPalletPackaging(constrained, cargo, pallet).placements).toHaveLength(1);
      expect(buildPalletPackaging(constrained, cargo, pallet, 'capacity', { respectVehicleFloorLoad: true }).placements).toEqual([]);
    }
  });

  it('normalizes SKU whitespace before merging and is deterministic for the same original rows', () => {
    const input = [box({ id: ' A ', quantity: 2 }), box({ quantity: 4 })];
    const original = structuredClone(input);
    const first = packMixedMode(container, input, pallet);
    const second = packMixedMode(container, input, pallet);
    expect(first.placements).toHaveLength(6);
    expect(first.placements.every(p => p.cargoId === 'A')).toBe(true);
    expect(first.remaining).toEqual([]);
    expect(second).toEqual(first);
    expect(input).toEqual(original);
  });
});

describe('duplicate strength provenance stays blocking in every loading mode', () => {
  const runners = {
    boxes: (rows: CargoItem[]) => loadContainer(container, rows, { publish: false }),
    pallets: (rows: CargoItem[]) => packOnPallets(container, rows, pallet),
    mixed: (rows: CargoItem[]) => packMixedMode(container, rows, pallet),
  };

  for (const [mode, run] of Object.entries(runners)) {
    it.each([
      [box({ quantity: 3 }), box({ quantity: 5, strengthUnverified: true })],
      [box({ quantity: 3, maxTopLoadKg: 0 }), box({ quantity: 5, maxTopLoadKg: 0, topLoadLimitExplicit: true })],
    ])(`${mode} rejects conflicting verification/explicit-limit flags instead of choosing a row`, (first, second) => {
      const result = run([first, second]);
      expect(result.placements).toEqual([]);
      expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'A', quantity: 8 })]);
    });

    it(`${mode} still merges physically identical rows with omitted/false flags`, () => {
      const result = run([
        box({ quantity: 3 }),
        box({ quantity: 5, strengthUnverified: false, topLoadLimitExplicit: false }),
      ]);
      expect(result.placements).toHaveLength(8);
      expect(result.remaining).toEqual([]);
    });

    if (mode !== 'mixed') {
      it(`${mode} ignores MIXED-only instructions when physically matching SKU rows merge`, () => {
        const result = run([
          box({ quantity: 3, mixedLoadingMethod: 'direct' }),
          box({ quantity: 5, mixedLoadingMethod: 'pallet' }),
        ]);
        expect(result.placements).toHaveLength(8);
        expect(result.remaining).toEqual([]);
      });
    }
  }
});
