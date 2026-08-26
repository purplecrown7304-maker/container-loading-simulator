import { describe, expect, it } from 'vitest';
import { CONTAINER_PRESETS, matchContainerPreset } from './containerPresets';

describe('container presets', () => {
  it('matches 40ft high cube dimensions', () => {
    const preset = CONTAINER_PRESETS.find(item => item.id === '40-high-cube');
    expect(preset?.spec).toBeTruthy();
    expect(matchContainerPreset(preset!.spec!)).toBe('40-high-cube');
  });

  it('falls back to custom for edited dimensions', () => {
    expect(matchContainerPreset({ length: 10, width: 2.2, height: 2.5, maxPayloadKg: 20000 })).toBe('custom');
  });
});
