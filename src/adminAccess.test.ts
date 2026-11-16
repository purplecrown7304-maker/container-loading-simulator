import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAdminSession, readAdminSessionToken, loginAdmin, logoutAdmin } from './adminAccess';
import { CONTAINER_ADMIN_API_URL } from './supabaseConfig';

const key = 'container-loading-admin-session-v1';
const token = 'a'.repeat(64);
const expiresAt = () => new Date(Date.now() + 60_000).toISOString();
const session = () => ({ role: 'admin', userId: 'admin', loggedInAt: new Date().toISOString(), sessionToken: token, expiresAt: expiresAt() });
const fetchMock = vi.fn();
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function acceptSyntheticPassword() {
  // Stub only the legacy browser precheck; no real administrator password is used.
  const hex = '2bca96f5990a0f640035d39c403e4e7d51b405ec0b51dd5e12543341407d6f15';
  vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(Uint8Array.from(hex.match(/../g)!, value => Number.parseInt(value, 16)).buffer);
}

describe('server-issued administrator session', () => {
  it.each([null, '{invalid', JSON.stringify({ role: 'admin', userId: 'admin' }),
    JSON.stringify({ ...session(), sessionToken: 'forged' }),
    JSON.stringify({ ...session(), expiresAt: 'invalid' }),
    JSON.stringify({ ...session(), expiresAt: new Date(0).toISOString() }),
    JSON.stringify({ ...session(), userId: 'someone-else' }),
  ])('does not trust a legacy, expired or malformed UI flag', value => {
    if (value) sessionStorage.setItem(key, value);
    expect(isAdminSession()).toBe(false); expect(readAdminSessionToken()).toBeNull();
  });
  it('reads a syntactically valid unexpired token without treating it as server authorization', () => {
    sessionStorage.setItem(key, JSON.stringify(session()));
    expect(isAdminSession()).toBe(true); expect(readAdminSessionToken()).toBe(token);
  });
  it('requires a successful server response and never stores the password', async () => {
    acceptSyntheticPassword();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, sessionToken: token, expiresAt: expiresAt() })));
    expect(await loginAdmin(' ADMIN ', 'synthetic-password')).toBe(true);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(CONTAINER_ADMIN_API_URL);
    expect(JSON.parse(request.body)).toEqual({ action: 'session', adminId: 'admin', adminPassword: 'synthetic-password' });
    expect(sessionStorage.getItem(key)).not.toContain('synthetic-password');
    expect(readAdminSessionToken()).toBe(token);
  });
  it('rejects a failed server password check even after the browser precheck', async () => {
    acceptSyntheticPassword(); fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await loginAdmin('admin', 'synthetic-password')).toBe(false); expect(isAdminSession()).toBe(false);
  });
  it.each([{ ok: true }, { ok: true, sessionToken: token, expiresAt: 'invalid' },
    { ok: true, sessionToken: token, expiresAt: new Date(0).toISOString() }])('fails closed on malformed session replies', async reply => {
    acceptSyntheticPassword(); fetchMock.mockResolvedValue(new Response(JSON.stringify(reply)));
    await expect(loginAdmin('admin', 'synthetic-password')).rejects.toThrow('관리자 세션');
    expect(isAdminSession()).toBe(false);
  });
  it('fails closed on network failure with a safe message', async () => {
    acceptSyntheticPassword(); fetchMock.mockRejectedValue(new Error('private upstream detail'));
    await expect(loginAdmin('admin', 'synthetic-password')).rejects.toThrow('관리자 서버에 연결');
    expect(isAdminSession()).toBe(false);
  });
  it('clears the local session immediately and revokes the matching server session', () => {
    sessionStorage.setItem(key, JSON.stringify(session())); fetchMock.mockResolvedValue(new Response('{}'));
    logoutAdmin(); expect(isAdminSession()).toBe(false);
    const request = fetchMock.mock.calls[0][1];
    expect(request.headers['x-admin-session']).toBe(token);
    expect(JSON.parse(request.body)).toEqual({ action: 'logout_session' });
  });
  it('does not restore a late sign-in after the administrator has signed out', async () => {
    acceptSyntheticPassword();
    let reply!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => { reply = resolve; })).mockResolvedValue(new Response('{}'));
    const signingIn = loginAdmin('admin', 'synthetic-password');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    logoutAdmin();
    reply(new Response(JSON.stringify({ ok: true, sessionToken: token, expiresAt: expiresAt() })));
    expect(await signingIn).toBe(false); expect(isAdminSession()).toBe(false);
    expect(fetchMock.mock.calls[1][1].headers['x-admin-session']).toBe(token);
  });
});
