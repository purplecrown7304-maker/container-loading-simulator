import { describe, expect, it } from 'vitest';
import type { LoadingResult } from './engine/types';
import { buildSecuringUsage } from './inertiaCertification';
import type { ViewerSupport } from './viewerSceneProtocol';
import { securingGeometry } from './viewerSecuring';
import { voidFillRows, voidFillTotal } from './voidFillPresentation';

const container = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 1000 };
const shape = ({ x, y, z, length, width, height }: { x: number; y: number; z: number; length: number; width: number; height: number }) => ({ x, y, z, length, width, height });
const box = { cargoId: 'A', x: 1.2, y: .6, z: .15, length: .5, width: .5, height: .5, weightKg: 10 };
const result: LoadingResult = { placements: [box], remaining: [], loadedWeightKg: 35, usedVolumeM3: .125, validationIssues: [] };
const support: ViewerSupport = { id: 'PALLET-1', x: 1, y: .5, z: 0, length: 1.1, width: 1.1, height: .15, weightKg: 25 };
const packaging = { wrapping: true, cornerGuards: true, bandingStraps: 4 };
const cargo = [{ id: 'A', name: 'A', length: .5, width: .5, height: .5, weightKg: 10, quantity: 1 }];
const familyCounts = (geometry: ReturnType<typeof securingGeometry>) => ({
  film: geometry.filter(item => item.wrapping).length,
  guards: geometry.filter(item => item.modelKey === 'corner-guard').length,
  bandSegments: geometry.filter(item => item.color === '#1f2937').length,
});

describe('whole-pallet display packaging', () => {
  it('keeps existing missing/false packaging empty without a securing plan', () => {
    expect(securingGeometry(container, result, [support], null)).toEqual([]);
    expect(securingGeometry(container, result, [{ ...support, visualPackaging: { wrapping: false, cornerGuards: false, bandingStraps: 0 } }], null)).toEqual([]);
  });

  it('shows preserved wrapping, four guards and actual four-strap grid without a current certificate', () => {
    const wrapped = { ...support, visualPackaging: packaging };
    const before = JSON.stringify({ result, wrapped });
    const geometry = securingGeometry(container, result, [wrapped], null);
    expect(familyCounts(geometry)).toEqual({ film: 1, guards: 4, bandSegments: 12 });
    expect(geometry.every(item => item.supportIndex === 0)).toBe(true);
    expect(geometry.find(item => item.wrapping)).toMatchObject({ wire: true, z: .15, height: .5 });
    expect(JSON.stringify({ result, wrapped })).toBe(before);
    expect(result.loadedWeightKg).toBe(35); expect(result.securingBudget).toBeUndefined();
  });

  it('merges preserved packaging with current transport reinforcement without double film, guards or straps', () => {
    const wrapped = { ...support, visualPackaging: packaging };
    const usage = buildSecuringUsage({ mode: 'pallets', container, cargo, result, supports: [support] }, 2);
    const before = JSON.stringify(usage);
    const geometry = securingGeometry(container, result, [wrapped], usage);
    expect(familyCounts(geometry)).toEqual({ film: 1, guards: 4, bandSegments: 12 });
    expect(geometry.filter(item => item.color === '#334155')).toHaveLength(usage.antiSlipMats);
    expect(JSON.stringify(usage)).toBe(before);
    const empty = buildSecuringUsage({ mode: 'pallets', container, cargo, result, supports: [support] }, 0);
    expect(familyCounts(securingGeometry(container, result, [wrapped], empty))).toEqual({ film: 1, guards: 4, bandSegments: 12 });
    const unwrapped = securingGeometry(container, result, [support], usage);
    expect(familyCounts(unwrapped)).toEqual({ film: 1, guards: 4, bandSegments: 9 });
  });

  it('keeps each stacked pallet packaging attached to its own support and cargo height', () => {
    const lower = { ...support, visualPackaging: { ...packaging, cornerGuards: false, bandingStraps: 0 } };
    const upper = { ...lower, id: 'PALLET-2', z: .65 };
    const stacked = { ...result, placements: [box, { ...box, z: .8 }] };
    const geometry = securingGeometry(container, stacked, [lower, upper], null);
    expect(familyCounts(geometry)).toEqual({ film: 2, guards: 0, bandSegments: 0 });
    expect(geometry).toEqual([
      expect.objectContaining({ supportIndex: 0, wrapping: true, z: .15, height: .5 }),
      expect.objectContaining({ supportIndex: 1, wrapping: true, z: .8, height: .5 }),
    ]);
  });

  it('draws the planned fill materials and leaves a void without a material undrawn', () => {
    // Owner decision 2026-11-19: the red wire box of a void with no material is not drawn.
    const base = { gapM: .1, voidVolumeM3: .05, x: 0, y: 0, z: 0, length: .1, width: 1, height: .5 };
    const open = { material: 'unresolved' as const, quantity: 0, weightKg: 0, fixedSupportEligible: false };
    const source: LoadingResult = { ...result, voidFillPlan: { sideGapM: .1, rearGapM: 0, volumeM3: .25, weightKg: 6.29, unresolvedCount: 2, fills: [
      { ...base, ...open, id: 'open-top', kind: 'top-void', z: .8 },
      { ...base, id: 'bag', kind: 'side-gap', material: 'dunnage-airbag', quantity: 1, weightKg: .59, fixedSupportEligible: true, y: 1 },
      { ...base, id: 'honeycomb', kind: 'row-gap', material: 'paper-honeycomb', quantity: 1, weightKg: .6, fixedSupportEligible: true, y: 2 },
      { ...base, id: 'bar', kind: 'door-face', material: 'load-bar', quantity: 1, weightKg: 5.1, fixedSupportEligible: true, x: 2 },
      { ...base, ...open, id: 'open-door', kind: 'door-face', x: 3 },
    ] } };
    const before = JSON.stringify(source);
    const geometry = securingGeometry(container, source, [], null);
    expect(geometry).toEqual([
      { ...shape(base), y: 1, color: '#7dd3fc', supportIndex: -1, wire: false, modelKey: 'dunnage-airbag' },
      { ...shape(base), y: 2, color: '#d6b276', supportIndex: -1, wire: false },
      { ...shape(base), x: 2, color: '#e87924', supportIndex: -1, wire: false },
    ]);
    expect(geometry.some(item => item.wire || item.color === '#dc2626')).toBe(false);
    // Only the drawing is left out: the plan, its list and its totals still hold both voids.
    expect(JSON.stringify(source)).toBe(before);
    expect(voidFillRows(source).filter(row => row.fixedSupportEligible === 'N').map(row => row.id)).toEqual(['open-top', 'open-door']);
    expect(voidFillTotal(source)).toMatchObject({ count: 5, unresolvedCount: 2 });
    // Pallet wrapping is still the one wire decoration.
    const wrapped = securingGeometry(container, source, [{ ...support, visualPackaging: packaging }], null);
    expect(wrapped.filter(item => item.wire)).toEqual([expect.objectContaining({ wrapping: true, supportIndex: 0 })]);
    expect(wrapped.filter(item => !item.wrapping && item.supportIndex === -1)).toEqual(geometry);
  });

  it('does not invent or loop over invalid source strap counts', () => {
    for (const bandingStraps of [-1, 1, 1.5, Infinity, NaN, 1000000000]) {
      expect(securingGeometry(container, result, [{ ...support, visualPackaging: { wrapping: false, cornerGuards: false, bandingStraps } }], null)).toEqual([]);
    }
    expect(securingGeometry(container, [], [{ ...support, visualPackaging: packaging }], null)).toEqual([]);
  });
});
