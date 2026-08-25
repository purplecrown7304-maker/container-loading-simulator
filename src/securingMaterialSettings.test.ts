import { describe, expect, it } from 'vitest';
import { defaultSecuringMaterialSettings, normalizeSecuringMaterialSettings } from './securingMaterialSettings';

describe('securing material settings', () => {
  it('keeps valid field unit weights', () => {
    const settings = normalizeSecuringMaterialSettings({
      bandingKgPerM: 0.04,
      cornerGuardKgPerM: 0.2,
      wrappingKgPerM: 0.03,
      antiSlipKgPerEa: 0.5,
      dunnageKgPerEa: 1.1,
      loadBarKgPerEa: 8,
    });
    expect(settings.loadBarKgPerEa).toBe(8);
    expect(settings.bandingKgPerM).toBe(0.04);
  });

  it('falls back to safe defaults for invalid or negative values', () => {
    const settings = normalizeSecuringMaterialSettings({
      bandingKgPerM: -1,
      cornerGuardKgPerM: Number.NaN,
      loadBarKgPerEa: Number.POSITIVE_INFINITY,
    });
    expect(settings.bandingKgPerM).toBe(defaultSecuringMaterialSettings.bandingKgPerM);
    expect(settings.cornerGuardKgPerM).toBe(defaultSecuringMaterialSettings.cornerGuardKgPerM);
    expect(settings.loadBarKgPerEa).toBe(defaultSecuringMaterialSettings.loadBarKgPerEa);
  });

  it('allows zero when a material has negligible measured weight', () => {
    const settings = normalizeSecuringMaterialSettings({ antiSlipKgPerEa: 0 });
    expect(settings.antiSlipKgPerEa).toBe(0);
  });
});
