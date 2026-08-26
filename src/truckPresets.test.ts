import { describe, expect, it } from 'vitest';
import { TRUCK_PRESETS, matchTruckPreset } from './truckPresets';

describe('truck presets', () => {
  it('contains curtainsider, temperature-controlled and mega transport types', () => {
    expect(TRUCK_PRESETS.map(item => item.id)).toEqual(expect.arrayContaining([
      'tautliner',
      'refrigerated-truck',
      'isotherm-truck',
      'mega-trailer',
      'custom-truck',
    ]));
  });

  it('marks tautliner and mega as non-rigid side-wall models', () => {
    const tautliner = TRUCK_PRESETS.find(item => item.id === 'tautliner')!.spec!;
    const mega = TRUCK_PRESETS.find(item => item.id === 'mega-trailer')!.spec!;
    expect(tautliner.sideWallModel).toBe('curtain');
    expect(tautliner.roofModel).toBe('soft');
    expect(mega.sideWallModel).toBe('curtain');
    expect(mega.roofModel).toBe('soft');
  });

  it('keeps refrigerated and isotherm bodies rigid', () => {
    for (const id of ['refrigerated-truck', 'isotherm-truck'] as const) {
      const spec = TRUCK_PRESETS.find(item => item.id === id)!.spec!;
      expect(spec.sideWallModel).toBe('rigid');
      expect(spec.roofModel).toBe('rigid');
      expect(spec.temperatureControlled).toBe(true);
      expect(matchTruckPreset(spec)).toBe(id);
    }
  });
});
