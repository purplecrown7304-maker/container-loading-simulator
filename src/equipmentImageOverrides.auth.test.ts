import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEquipmentAdminCredential, setEquipmentAdminCredential } from './equipmentImageOverrides';

describe('equipment image admin authentication', () => {
  afterEach(() => {
    clearEquipmentAdminCredential();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exchanges the login password for a Supabase admin session without another prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionToken: 'server-session-token' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await setEquipmentAdminCredential('admin-password');

    expect(promptSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      action: 'session',
      adminId: 'admin',
      adminPassword: 'admin-password',
    });
  });

  it('reports a server credential mismatch during login instead of asking again during upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'admin_auth_required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(setEquipmentAdminCredential('wrong-password')).rejects.toThrow(
      '사이트 관리자 비밀번호와 Supabase 관리자 인증 정보가 일치하지 않습니다.',
    );
  });
});
