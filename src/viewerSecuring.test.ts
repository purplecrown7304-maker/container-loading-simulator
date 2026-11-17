import { describe, expect, it } from 'vitest';
import type { LoadingResult } from './engine/types';
import { buildSecuringUsage } from './inertiaCertification';
import type { ViewerSupport } from './viewerSceneProtocol';
import { securingGeometry } from './viewerSecuring';

const container = { length: 6, width: 2.4, height: 2.5, maxPayloadKg: 1000 };
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

  it('marks only actual wrapping as film while preserving unrelated void-fill wire geometry', () => {
    const source: LoadingResult = { ...result, voidFillPlan: { sideGapM: .1, rearGapM: 0, volumeM3: .05, weightKg: 0, unresolvedCount: 1,
      fills: [{ id: 'unresolved', kind: 'side-gap', material: 'unresolved', quantity: 0, weightKg: 0, fixedSupportEligible: false,
        gapM: .1, voidVolumeM3: .05, x: 0, y: 0, z: 0, length: .1, width: 1, height: .5 }] } };
    const geometry = securingGeometry(container, source, [{ ...support, visualPackaging: packaging }], null);
    expect(geometry[0]).toMatchObject({ wire: true, supportIndex: -1 });
    expect(geometry[0].wrapping).toBeUndefined(); expect(geometry.filter(item => item.wrapping)).toHaveLength(1);
  });

  it('does not invent or loop over invalid source strap counts', () => {
    for (const bandingStraps of [-1, 1, 1.5, Infinity, NaN, 1000000000]) {
      expect(securingGeometry(container, result, [{ ...support, visualPackaging: { wrapping: false, cornerGuards: false, bandingStraps } }], null)).toEqual([]);
    }
    expect(securingGeometry(container, [], [{ ...support, visualPackaging: packaging }], null)).toEqual([]);
  });
});
