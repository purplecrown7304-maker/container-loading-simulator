import { describe, expect, it } from 'vitest';
import { cargoColor, pastelCargoColor, randomUniqueCargoColor } from './cargoColors';

function hsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, lightness = (max + min) / 2;
  if (!delta) return { hue: 0, saturation: 0, lightness };
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation: delta / (1 - Math.abs(2 * lightness - 1)), lightness };
}

describe('cargo color allocation', () => {
  it('shows an explicitly assigned user color as the pastel of the same hue', () => {
    const shown = cargoColor('BOX-001', '#123abc');
    expect(shown).toMatch(/^#[0-9a-f]{6}$/);
    expect(Math.abs(hsl(shown).hue - hsl('#123abc').hue)).toBeLessThan(3);
    expect(hsl(shown).lightness).toBeGreaterThanOrEqual(.69);
    expect(hsl(shown).lightness).toBeLessThanOrEqual(.81);
    // A colour that is already pastel is kept exactly, so repeated calls are stable.
    expect(cargoColor('BOX-001', shown)).toBe(shown);
    expect(pastelCargoColor(shown)).toBe(shown);
  });

  it('keeps different saved colors different after the pastel conversion', () => {
    expect(new Set(['#379a94', '#9a3737', '#37379a', '#9a9a37', '#111111', '#eeeeee'].map(color => cargoColor('X', color))).size).toBe(6);
  });

  it('allocates pastel colors that differ by hue for the first box types', () => {
    const used: string[] = [];
    for (let index = 0; index < 12; index += 1) used.push(randomUniqueCargoColor(used));
    for (const color of used) {
      expect(hsl(color).lightness).toBeGreaterThanOrEqual(.69);
      expect(hsl(color).lightness).toBeLessThanOrEqual(.81);
      expect(hsl(color).saturation).toBeGreaterThanOrEqual(.6);
      expect(cargoColor('X', color)).toBe(color);
    }
    const hues = used.map(color => hsl(color).hue).sort((a, b) => a - b);
    const gaps = hues.map((hue, index) => (index + 1 < hues.length ? hues[index + 1] : hues[0] + 360) - hue);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(15);
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
