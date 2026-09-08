import { describe, expect, it } from 'vitest';
import { EQUIPMENT_PHOTO_ATLAS_DATA_URI } from './equipmentPhotoAtlas';

describe('equipment photo atlas', () => {
  it('reassembles the embedded WebP without corruption', () => {
    const prefix = 'data:image/webp;base64,';
    expect(EQUIPMENT_PHOTO_ATLAS_DATA_URI.startsWith(prefix)).toBe(true);

    const base64 = EQUIPMENT_PHOTO_ATLAS_DATA_URI.slice(prefix.length);
    expect(base64.length).toBe(35036);

    const binary = atob(base64);
    expect(binary.slice(0, 4)).toBe('RIFF');
    expect(binary.slice(8, 12)).toBe('WEBP');
    expect(binary.length).toBe(26276);
  });
});
