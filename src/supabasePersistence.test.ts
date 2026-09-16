import { describe, expect, it, vi } from 'vitest';
import { MemoryAppStorage, migrateLegacyAppEntries } from './supabasePersistence';

describe('Supabase-only application persistence', () => {
  it('keeps runtime storage in memory while preserving the Storage contract', () => {
    const changed = vi.fn();
    const storage = new MemoryAppStorage({ 'container-loading-state-v1': '{"a":1}' }, changed);

    expect(storage.length).toBe(1);
    expect(storage.getItem('container-loading-state-v1')).toBe('{"a":1}');

    storage.setItem('container-loading-test', 'value');
    expect(storage.getItem('container-loading-test')).toBe('value');
    expect(changed).toHaveBeenCalledTimes(1);

    storage.removeItem('container-loading-test');
    expect(storage.getItem('container-loading-test')).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('migrates the previous operator-scoped product and box data to the authenticated member UUID', () => {
    const oldId = '박작업자';
    const memberId = '11111111-2222-3333-4444-555555555555';
    const entries: Array<[string, string]> = [
      [`container-loading-product-packaging-v1:${encodeURIComponent(oldId)}`, '{"products":[1]}'],
      [`container-loading-user-box-catalog-v1:${encodeURIComponent(oldId)}`, '[{"id":"BOX-1"}]'],
      [`container-loading:selected-company-products-v1:${encodeURIComponent(oldId)}`, '{"P1":10}'],
      ['container-loading-workspace-vehicles-v1', '[{"id":"truck"}]'],
    ];

    const migrated = migrateLegacyAppEntries(entries, memberId, oldId);
    expect(migrated[`container-loading-product-packaging-v1:${encodeURIComponent(memberId)}`]).toBe('{"products":[1]}');
    expect(migrated[`container-loading-user-box-catalog-v1:${encodeURIComponent(memberId)}`]).toBe('[{"id":"BOX-1"}]');
    expect(migrated[`container-loading:selected-company-products-v1:${encodeURIComponent(memberId)}`]).toBe('{"P1":10}');
    expect(migrated['container-loading-workspace-vehicles-v1']).toBe('[{"id":"truck"}]');
  });

  it('does not mix admin, guest, other-member, or authentication session data into member app state', () => {
    const memberId = 'member-uuid';
    const entries: Array<[string, string]> = [
      ['container-loading-product-packaging-v1:admin', 'admin'],
      ['container-loading-product-packaging-v1:guest', 'guest'],
      ['container-loading-product-packaging-v1:someone-else', 'other'],
      ['container-loading:supabase-member-session:v2', 'secret-token'],
      ['container-loading-local-operator-v1', 'operator-session'],
      ['not-this-app', 'ignore'],
      ['container-loading-workspace-safety-v1', '{"date":"2026-09-16"}'],
    ];

    expect(migrateLegacyAppEntries(entries, memberId)).toEqual({
      'container-loading-workspace-safety-v1': '{"date":"2026-09-16"}',
    });
  });
});
