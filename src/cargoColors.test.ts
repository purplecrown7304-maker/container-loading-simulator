import { describe, expect, it } from 'vitest';
import { cargoColor, randomUniqueCargoColor } from './cargoColors';

describe('cargo color allocation', () => {
  it('keeps an explicitly assigned user color', () => {
    expect(cargoColor('BOX-001', '#123abc')).toBe('#123abc');
  });

  it('does not reuse colors while allocating a member catalog', () => {
    const used = new Set<string>();
    for (let index = 0; index < 80; index += 1) {
      const color = randomUniqueCargoColor(used);
      expect(used.has(color)).toBe(false);
      used.add(color);
    }
    expect(used.size).toBe(80);
  });
});
