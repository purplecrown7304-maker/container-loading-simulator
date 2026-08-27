import { describe, expect, it } from 'vitest';
import { defaultPalletSpec } from './engine/palletOptimization';
import { sanitizeResultsPalletSpec } from './ResultsOverlay';

describe('results pallet spec regression', () => {
  it('keeps configured stack levels from 4 through 7 instead of collapsing to 3', () => {
    for (const level of [4, 5, 6, 7]) {
      const result = sanitizeResultsPalletSpec({ ...defaultPalletSpec, maxStackLevels: level });
      expect(result.maxStackLevels).toBe(level);
    }
  });

  it('clamps only outside the supported 1 to 7 range', () => {
    expect(sanitizeResultsPalletSpec({ ...defaultPalletSpec, maxStackLevels: 0 }).maxStackLevels).toBe(1);
    expect(sanitizeResultsPalletSpec({ ...defaultPalletSpec, maxStackLevels: 9 }).maxStackLevels).toBe(7);
  });

  it('does not lower stack depth when another pallet field is edited', () => {
    const result = sanitizeResultsPalletSpec({
      ...defaultPalletSpec,
      maxStackLevels: 6,
      length: 1.2,
    });
    expect(result.length).toBe(1.2);
    expect(result.maxStackLevels).toBe(6);
  });
});
