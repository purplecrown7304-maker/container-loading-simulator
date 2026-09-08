import { describe, expect, it } from 'vitest';
import { EQUIPMENT_PHOTO_ATLAS_DATA_URI } from './equipmentPhotoAtlas';

describe('equipment photo atlas', () => {
  it('reassembles the embedded WebP without corruption', () => {
    const prefix = 'data:image/webp;base64,';
    expect(EQUIPMENT_PHOTO_ATLAS_DATA_URI.startsWith(prefix)).toBe(true);

    const base64 = EQUIPMENT_PHOTO_ATLAS_DATA_URI.slice(prefix.length);
    expect(base64.length).toBe(35036);

    const bytes = Buffer.from(base64, 'base64');
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(bytes.length).toBe(26276);
  });
});
