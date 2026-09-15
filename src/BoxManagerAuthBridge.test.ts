import { beforeEach, describe, expect, it } from 'vitest';
import { readLocalOperator } from './localOperator';
import { migrateLegacyAdminBoxCatalog, syncBoxManagerIdentity } from './BoxManagerAuthBridge';

const ADMIN_SESSION_KEY = 'container-loading-admin-session-v1';
const MEMBER_SESSION_KEY = 'container-loading:supabase-member-session:v2';
const LEGACY_CATALOG_KEY = 'container-loading-box-catalog-v1';
const ADMIN_CATALOG_KEY = 'container-loading-user-box-catalog-v1:admin';

describe('box manager authentication bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('treats an active admin session as a logged-in box manager', () => {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      role: 'admin',
      userId: 'admin',
      loggedInAt: new Date().toISOString(),
    }));

    syncBoxManagerIdentity();

    expect(readLocalOperator()).toMatchObject({ id: 'admin', name: '관리자' });
  });

  it('uses the active Supabase member as the personal box owner', () => {
    localStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify({
      token: 'test-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      userId: 'member-123',
      email: 'member@example.com',
      displayName: '테스트회원',
    }));

    syncBoxManagerIdentity();

    expect(readLocalOperator()).toEqual({
      id: 'member-123',
      name: '테스트회원',
      email: 'member@example.com',
    });
  });

  it('recovers the legacy registered box list into the admin scoped catalog once', () => {
    const legacy = [{
      id: 'BOX-001',
      name: '기존 등록 박스',
      length: 0.5,
      width: 0.4,
      height: 0.3,
      weightKg: 10,
      quantity: 1,
      allowRotation: true,
    }];
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      role: 'admin',
      userId: 'admin',
      loggedInAt: new Date().toISOString(),
    }));
    localStorage.setItem(LEGACY_CATALOG_KEY, JSON.stringify(legacy));

    expect(migrateLegacyAdminBoxCatalog()).toBe(true);
    expect(JSON.parse(localStorage.getItem(ADMIN_CATALOG_KEY) || '[]')).toEqual(legacy);
    expect(migrateLegacyAdminBoxCatalog()).toBe(false);
  });

  it('removes the compatibility admin operator after admin logout', () => {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
      role: 'admin',
      userId: 'admin',
      loggedInAt: new Date().toISOString(),
    }));
    syncBoxManagerIdentity();
    expect(readLocalOperator()?.id).toBe('admin');

    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    syncBoxManagerIdentity();

    expect(readLocalOperator()).toBeNull();
  });
});
