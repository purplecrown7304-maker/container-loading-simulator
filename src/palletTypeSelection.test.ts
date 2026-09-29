import { describe, expect, it } from 'vitest';
import { AUTO_PALLET_TYPE, choosePalletType, finishPalletRecommendation, readPalletTypeSelection, resolvePalletType, startPalletRecommendation } from './palletTypeSelection';

describe('pallet type selection', () => {
  it('auto follows the recommendation and falls back to the company default pallet', () => {
    choosePalletType(AUTO_PALLET_TYPE);
    startPalletRecommendation('sig-1');
    expect(resolvePalletType().id).toBe('company-default');
    finishPalletRecommendation('sig-1', 'eur-epal1');
    expect(resolvePalletType().id).toBe('eur-epal1');
  });

  it('an explicit choice wins over the recommendation and ignores unknown ids', () => {
    choosePalletType('t12-wood-epal3');
    expect(resolvePalletType().id).toBe('t12-wood-epal3');
    choosePalletType('not-a-pallet');
    expect(readPalletTypeSelection().selected).toBe('t12-wood-epal3');
  });

  it('ignores a stale recommendation for other cargo', () => {
    choosePalletType(AUTO_PALLET_TYPE);
    startPalletRecommendation('sig-2');
    finishPalletRecommendation('sig-old', 'gma-48x40');
    expect(readPalletTypeSelection().recommendedId).toBeNull();
  });
});
