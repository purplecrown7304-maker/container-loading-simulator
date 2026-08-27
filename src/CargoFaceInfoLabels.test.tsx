import { describe, expect, it } from 'vitest';
import { CARTON_VISUAL_SCALE } from './CargoFaceInfoLabels';

describe('carton face rendering regression', () => {
  it('keeps face labels on the same 98.5% visual envelope as carton bodies', () => {
    expect(CARTON_VISUAL_SCALE).toBe(0.985);
  });
});
