import { describe, expect, it } from 'vitest';
import { resolveEquipmentImageUrl } from './equipmentImageUrl';

describe('equipment image URL resolver', () => {
  it('falls back to the canonical public Supabase storage path before the override map is hydrated', () => {
    expect(resolveEquipmentImageUrl('40-standard')).toBe(
      'https://oyxhaeccuuradutspcik.supabase.co/storage/v1/object/public/equipment-images/equipment/40-standard.webp',
    );
  });

  it('adds a cache-busting sync revision without changing the equipment identity', () => {
    expect(resolveEquipmentImageUrl('20-open-top', 123)).toContain('/equipment/20-open-top.webp?sync=123');
  });
});
