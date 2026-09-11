import { describe, expect, it } from 'vitest';
import { equipmentPhotoFallback } from './equipmentPhotoFallback';

describe('equipmentPhotoFallback', () => {
  it('returns bundled photo atlas styling for known container equipment', () => {
    const fallback = equipmentPhotoFallback('40-high-cube');
    expect(fallback).not.toBeNull();
    expect(fallback?.backgroundImage).toContain('data:image/webp;base64,');
    expect(fallback?.backgroundSize).toBe('375% 300%');
  });

  it('does not invent a photo for equipment without an atlas cell', () => {
    expect(equipmentPhotoFallback('truck-1ton')).toBeNull();
  });
});
