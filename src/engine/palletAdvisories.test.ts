import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, packOnPallets, type PalletLoad } from './palletPacking';
import { DEFAULT_PALLET_BOTTOM_COVERAGE_RATIO, palletAdvisoryFindings } from './palletPlanValidation';
import { operationalErrors } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './types';

const box = (x: number, y: number, z: number, length: number, width: number): Placement => ({ cargoId: 'A', x, y, z, length, width, height: 0.3, weightKg: 10 });
const pallet = (patch: Partial<PalletLoad>): PalletLoad => ({
  palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 0, length: 1.1, width: 1.1, height: 0.15,
  cargoPlacements: [], cargoWeightKg: 0, packagingWeightKg: 0, packagingExtraHeightM: 0,
  cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 25, centerOfGravity: { x: 0.55, y: 0.55, z: 0.1 }, ...patch,
});
const domestic = { palletDestination: undefined };
const full = [box(0, 0, 0.15, 1.1, 1.1)];
const codes = (findings: ReturnType<typeof palletAdvisoryFindings>) => findings.map(f => f.code);

describe('LOADING_RULES R-9 pallet advisories', () => {
  it('is silent for a full, single-tier domestic pallet', () => {
    expect(palletAdvisoryFindings(domestic, { pallets: [pallet({ cargoPlacements: full })] })).toEqual([]);
  });

  it('warns when the bottom tier covers less than 90% of the deck', () => {
    // 1.0 × 0.9 on a 1.1 × 1.1 deck = 74.4%; an upper tier does not count.
    const pallets = [pallet({ palletIndex: 3, cargoPlacements: [box(0, 0, 0.15, 1.0, 0.9), box(0, 0, 0.45, 1.0, 0.9)] })];
    const found = palletAdvisoryFindings(domestic, { pallets });
    expect(codes(found)).toEqual(['PALLET_DECK_COVERAGE']);
    expect(found[0].severity).toBe('warning');
    expect(found[0].value).toBeCloseTo(0.9 / 1.21, 6);
    expect(found[0].limit).toBe(DEFAULT_PALLET_BOTTOM_COVERAGE_RATIO);
    expect(found[0].message).toContain('번호 3');
  });

  it('accepts exactly 90%, ignores overhang beyond the deck and exempts the mixed tail', () => {
    const exact = pallet({ cargoPlacements: [box(0, 0, 0.15, 1.1, 0.99)] });
    const overhang = pallet({ palletIndex: 2, cargoPlacements: [box(0.5, 0, 0.15, 1.1, 1.1)] }); // only 0.6 m on deck
    const tail = pallet({ palletIndex: 4, isMixedTail: true, cargoPlacements: [box(0, 0, 0.15, 0.4, 0.4)] });
    const found = palletAdvisoryFindings(domestic, { pallets: [exact, overhang, tail] });
    expect(codes(found)).toEqual(['PALLET_DECK_COVERAGE']);
    expect(found[0].message).toContain('번호 2');
    expect(found[0].message).not.toContain('번호 2, 4');
  });

  it('honours a configured coverage ratio', () => {
    const pallets = [pallet({ cargoPlacements: [box(0, 0, 0.15, 1.0, 0.9)] })];
    expect(palletAdvisoryFindings(domestic, { pallets }, { minBottomLayerCoverageRatio: 0.7 })).toEqual([]);
  });

  it('recommends wrapping for both pallets of a two-high column, only when wrapping is off', () => {
    const lower = pallet({ palletIndex: 1, stackColumn: 5, cargoPlacements: full });
    const upper = pallet({ palletIndex: 2, stackColumn: 5, stackLevel: 2, z: 0.6, cargoPlacements: [box(0, 0, 0.75, 1.1, 1.1)] });
    const single = pallet({ palletIndex: 3, stackColumn: 6, cargoPlacements: full });
    const found = palletAdvisoryFindings(domestic, { pallets: [lower, upper, single] });
    expect(codes(found)).toEqual(['WRAP_RECOMMENDED']);
    expect(found[0].value).toBe(2);
    expect(found[0].message).toContain('번호 1, 2');
    const wrapped = [lower, upper].map(p => ({ ...p, wrappingUsed: true }));
    expect(palletAdvisoryFindings(domestic, { pallets: wrapped })).toEqual([]);
  });

  it('recommends wrapping for every unwrapped export pallet', () => {
    const exportSpec: Pick<ContainerSpec, 'palletDestination'> = { palletDestination: { transport: 'export', region: 'asia', requiredSize: '' } };
    const found = palletAdvisoryFindings(exportSpec, { pallets: [pallet({ cargoPlacements: full }), pallet({ palletIndex: 2, cargoPlacements: full, wrappingUsed: true })] });
    expect(codes(found)).toEqual(['WRAP_RECOMMENDED']);
    expect(found[0].value).toBe(1);
    expect(found[0].message).toContain('수출');
  });

  it('never raises an error and never changes how pallets are built', () => {
    const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
    const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3, weightKg: 12, quantity: 90, maxStackLayers: 4, maxTopLoadKg: 60 }];
    const base = packOnPallets(container, cargo, defaultPalletSpec, 'capacity');
    const tuned = packOnPallets(container, cargo, { ...defaultPalletSpec, minBottomLayerCoverageRatio: 1 }, 'capacity');
    expect(tuned.placements).toEqual(base.placements);
    expect(tuned.palletCount).toBe(base.palletCount);
    expect(operationalErrors(palletAdvisoryFindings(container, tuned, { minBottomLayerCoverageRatio: 1 }))).toEqual([]);
  });
});
