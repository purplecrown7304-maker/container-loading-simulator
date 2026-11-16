import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listAdminMembers, updateAdminMember } from './adminMemberApi';
const token = 'a'.repeat(64);
const row = { id: '00000000-0000-4000-8000-000000000001', email: 'qa@example.test', displayName: '합성 회원',
  status: 'active', createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z', lastLoginAt: null };
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
  sessionStorage.setItem('container-loading-admin-session-v1', JSON.stringify({ role: 'admin', userId: 'admin',
    sessionToken: token, expiresAt: new Date(Date.now() + 60_000).toISOString() }));
});
afterEach(() => { sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const query = { q: '', status: 'all' as const, page: 1 };
const reply = (data: unknown) => new Response(JSON.stringify({ ok: true, data }));

it('does not make a network call for a legacy UI-only administrator flag', async () => {
  sessionStorage.setItem('container-loading-admin-session-v1', JSON.stringify({ role: 'admin', userId: 'admin' }));
  await expect(listAdminMembers(query)).rejects.toMatchObject({ code: 'admin_auth_required' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('sends only the header session and whitelisted paginated search fields', async () => {
  fetchMock.mockResolvedValue(reply({ members: [{ ...row, password_hash: 'never-return', app_state: {} }], total: 1, page: 1, pageSize: 25 }));
  const controller = new AbortController();
  const result = await listAdminMembers({ ...query, q: ' qa ' }, controller.signal);
  const request = fetchMock.mock.calls[0][1];
  expect(request.headers['x-admin-session']).toBe(token); expect(request.signal.aborted).toBe(false);
  expect(JSON.parse(request.body)).toEqual({ action: 'members', op: 'list', q: 'qa', status: 'all', page: 1, pageSize: 25 });
  expect(result.members).toEqual([row]); expect(JSON.stringify(result)).not.toContain('password');
});
it('updates only the chosen member and supplies the expected version', async () => {
  fetchMock.mockResolvedValue(reply({ member: { ...row, status: 'suspended' } }));
  await updateAdminMember({ memberId: row.id, displayName: ' 합성 회원 ', status: 'suspended', expectedUpdatedAt: row.updatedAt });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'members', op: 'update', memberId: row.id,
    displayName: row.displayName, status: 'suspended', expectedUpdatedAt: row.updatedAt });
});
it.each([401, 403])('normalizes rejected server authorization (%s)', async status => {
  fetchMock.mockResolvedValue(new Response('{}', { status }));
  await expect(listAdminMembers(query)).rejects.toMatchObject({ code: 'admin_auth_required' });
});
it('preserves concurrency conflicts but hides private infrastructure errors', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'admin_member_conflict' }), { status: 409 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'private table detail' }), { status: 500 }));
  await expect(listAdminMembers(query)).rejects.toMatchObject({ code: 'admin_member_conflict' });
  await expect(listAdminMembers(query)).rejects.toMatchObject({ code: 'admin_members_unavailable' });
});
it.each([
  { members: [row], total: -1, page: 1, pageSize: 25 },
  { members: [row], total: 1, page: 1, pageSize: 1000 },
  { members: [{ ...row, status: 'owner' }], total: 1, page: 1, pageSize: 25 },
  { members: [{ ...row, createdAt: 'bad' }], total: 1, page: 1, pageSize: 25 },
])('rejects malformed member responses', async data => {
  fetchMock.mockResolvedValue(reply(data));
  await expect(listAdminMembers(query)).rejects.toMatchObject({ code: 'admin_members_unavailable' });
});
it('does not translate a cancelled request into a user-visible server failure', async () => {
  const controller = new AbortController(); controller.abort();
  fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
  await expect(listAdminMembers(query, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
it('bounds a stalled save and releases it as a safe retryable failure', async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const promise = updateAdminMember({ memberId: row.id, displayName: row.displayName, status: 'suspended', expectedUpdatedAt: row.updatedAt });
  const assertion = expect(promise).rejects.toMatchObject({ code: 'admin_members_unavailable' });
  await vi.advanceTimersByTimeAsync(15_001);
  await assertion;
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});
