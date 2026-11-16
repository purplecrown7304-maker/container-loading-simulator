// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleAdminMembersAction } from '../supabase/functions/_shared/adminMembersAction';

const token = 'a'.repeat(64);
const digest = 'b'.repeat(64);
const memberId = '00000000-0000-4000-8000-000000000001';
const update = { action: 'members', op: 'update', memberId, displayName: 'Synthetic member', status: 'active', expectedUpdatedAt: '2026-11-16T00:00:00.000Z' };
const makeRpc = () => vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: { members: [], total: 0, page: 1, pageSize: 25 }, error: null as { message: string } | null }));

describe('admin member request boundary', () => {
  it.each(['', 'admin', 'a'.repeat(63), 'A'.repeat(64)])('requires a server admin token, not browser role or password: %s', async candidate => {
    const rpc = makeRpc(); const hash = vi.fn(async () => digest);
    const result = await handleAdminMembersAction(candidate, { action: 'members', op: 'list', role: 'admin', adminId: 'admin', adminPassword: 'synthetic', sessionToken: token }, rpc, hash);
    expect(result).toEqual({ status: 401, body: { error: 'admin_auth_required' } });
    expect(rpc).not.toHaveBeenCalled(); expect(hash).not.toHaveBeenCalled();
  });

  it('hashes the trusted token and passes only allowed list fields to the RPC', async () => {
    const rpc = makeRpc(); const hash = vi.fn(async () => digest);
    const result = await handleAdminMembersAction(token, { action: 'members', op: 'list', q: '  Synthetic  ', status: 'suspended', page: 2, p_admin_token_hash: 'spoof', role: 'admin', email: 'do-not-forward@example.test' }, rpc, hash);
    expect(hash).toHaveBeenCalledExactlyOnceWith(token);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('loading_admin_member_action', { p_admin_token_hash: digest, p_op: 'list', p_payload: { q: 'Synthetic', status: 'suspended', page: 2, pageSize: 25 } });
    expect(result).toMatchObject({ status: 200, body: { ok: true, data: { total: 0 } } });
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('provides bounded defaults for list requests', async () => {
    const rpc = makeRpc();
    await handleAdminMembersAction(token, { action: 'members', op: 'list' }, rpc, async () => digest);
    expect(rpc.mock.calls[0][1]).toEqual({ p_admin_token_hash: digest, p_op: 'list', p_payload: { q: '', status: 'all', page: 1, pageSize: 25 } });
  });

  it('forwards a trimmed name and concurrency version without privileged fields', async () => {
    const rpc = makeRpc();
    await handleAdminMembersAction(token, { ...update, displayName: '  Synthetic changed  ', email: 'attacker@example.test', password_hash: 'fake', role: 'admin', appState: { private: true } }, rpc, async () => digest);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('loading_admin_member_action', { p_admin_token_hash: digest, p_op: 'update', p_payload: { memberId, displayName: 'Synthetic changed', status: 'active', expectedUpdatedAt: update.expectedUpdatedAt } });
  });

  it.each([
    { op: 'delete' }, { op: 'list', q: 5 }, { op: 'list', q: 'x'.repeat(101) },
    { op: 'list', q: ' '.repeat(101) }, { op: 'list', status: 'admin' },
    { op: 'list', page: 0 }, { op: 'list', page: 100001 }, { op: 'list', page: 1.5 }, { op: 'list', page: '1' },
    { op: 'list', pageSize: 100 }, { ...update, memberId: 'bad-id' },
    { ...update, displayName: '' }, { ...update, displayName: '   ' }, { ...update, displayName: 'x'.repeat(61) },
    { ...update, displayName: 5 }, { ...update, status: 'deleted' }, { ...update, expectedUpdatedAt: 'yesterday' },
    { ...update, expectedUpdatedAt: '2026-11-16' }, { ...update, expectedUpdatedAt: '2026-99-99T00:00:00Z' },
    { ...update, expectedUpdatedAt: undefined },
  ])('rejects malformed or oversized input before database access: %j', async body => {
    const rpc = makeRpc();
    const error = 'displayName' in body && (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.trim().length > 60)
      ? 'invalid_display_name' : 'memberId' in body && body.memberId === 'bad-id' ? 'invalid_member_id'
        : 'status' in body && ['admin', 'deleted'].includes(String(body.status)) ? 'invalid_member_status' : 'invalid_request';
    expect(await handleAdminMembersAction(token, body, rpc, async () => digest)).toEqual({ status: 400, body: { error } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['admin_auth_required', 401], ['invalid_request', 400], ['invalid_display_name', 400], ['invalid_member_status', 400], ['invalid_member_id', 400], ['admin_member_not_found', 404], ['admin_member_conflict', 409],
    ['relation loading_members does not exist', 503], ['password_hash=private', 503],
  ])('maps safe database failures without exposing internal details: %s', async (message, status) => {
    const rpc = vi.fn(async () => ({ data: null, error: { message } }));
    const result = await handleAdminMembersAction(token, { action: 'members', op: 'list' }, rpc, async () => digest);
    expect(result).toEqual({ status, body: { error: status === 503 ? 'admin_members_unavailable' : message } });
  });

  it('sanitizes thrown transport and hash failures', async () => {
    const rpc = vi.fn(async () => { throw new Error('private database transport'); });
    expect(await handleAdminMembersAction(token, { op: 'list' }, rpc, async () => digest)).toEqual({ status: 503, body: { error: 'admin_members_unavailable' } });
    const untouched = makeRpc();
    expect(await handleAdminMembersAction(token, { op: 'list' }, untouched, async () => { throw new Error('private hash details'); })).toEqual({ status: 503, body: { error: 'admin_members_unavailable' } });
    expect(untouched).not.toHaveBeenCalled();
  });
});
