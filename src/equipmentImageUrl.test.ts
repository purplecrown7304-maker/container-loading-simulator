import { describe, expect, it } from 'vitest';
import { resolveEquipmentImageUrl } from './equipmentImageUrl';

describe('equipment image URL resolver', () => {
  it('falls back to a cache-busted public Supabase storage path before the override map is hydrated', () => {
    const url = resolveEquipmentImageUrl('40-standard');
    expect(url).toContain(
      'https://oyxhaeccuuradutspcik.supabase.co/storage/v1/object/public/equipment-images/equipment/40-standard.webp?sync=',
    );
    expect(url).toMatch(/\?sync=[a-z0-9]+-0$/i);
  });

  it('changes the anonymous fallback URL when the visual revision changes', () => {
    const first = resolveEquipmentImageUrl('20-open-top', 123);
    const second = resolveEquipmentImageUrl('20-open-top', 124);
    expect(first).toContain('/equipment/20-open-top.webp?sync=');
    expect(first).not.toBe(second);
    expect(first).toMatch(/-123$/);
    expect(second).toMatch(/-124$/);
  });
});
